import type { MatchSummary, VtsGrade, VtsResult } from '@shared/types'
import { REGION } from '../constants'
import type { AuthService } from './AuthService'
import type { AssetCacheService } from './AssetCacheService'

/* eslint-disable @typescript-eslint/no-explicit-any */
const QUEUES: Record<string, string> = {
  competitive: 'Rekabetçi',
  unrated: 'Derecesiz',
  spikerush: 'Spike Rush',
  deathmatch: 'Deathmatch',
  ggteam: 'Escalation',
  onefa: 'Replication',
  swiftplay: 'Swiftplay',
  hurm: 'Team Deathmatch',
  premier: 'Premier',
  snowball: 'Snowball Fight',
  '': 'Özel'
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function vtsGrade(score: number): VtsGrade {
  if (score >= 800) return 'S'
  if (score >= 650) return 'A'
  if (score >= 500) return 'B'
  if (score >= 350) return 'C'
  return 'D'
}

/** First-blood count: the earliest kill of every round, credited to its killer. */
function countFirstBloods(d: any, puuid: string): number {
  const kills: Array<{ round: number; time: number; killer: string }> = []
  if (Array.isArray(d.kills)) {
    for (const k of d.kills) kills.push({ round: k.round, time: k.roundTime ?? 0, killer: k.killer })
  } else {
    for (const r of d.roundResults ?? [])
      for (const ps of r.playerStats ?? [])
        for (const k of ps.kills ?? []) kills.push({ round: r.roundNum, time: k.timeSinceRoundStartMillis ?? 0, killer: k.killer })
  }
  const first = new Map<number, { time: number; killer: string }>()
  for (const k of kills) {
    const cur = first.get(k.round)
    if (!cur || k.time < cur.time) first.set(k.round, { time: k.time, killer: k.killer })
  }
  let n = 0
  first.forEach((f) => {
    if (f.killer === puuid) n++
  })
  return n
}

export interface CoachData {
  map: string
  agent: string
  queue: string
  result: 'win' | 'loss' | 'draw'
  roundsWon: number
  roundsLost: number
  kills: number
  deaths: number
  assists: number
  kd: number
  acs: number
  /** average damage per round */
  adr: number
  headshotPercent: number
  firstBloods: number
  firstDeaths: number
  firstBloodRate: number
  firstDeathRate: number
  vts: VtsResult | null
  /** where and when the player died: round, seconds into the round, world coordinates */
  deathLocations: Array<{ round: number; secondsIntoRound: number; x: number | null; y: number | null }>
}

export class MatchService {
  // Finished matches never change, so details are cached per match.
  private details = new Map<string, any>()

  constructor(
    private auth: AuthService,
    private assets: AssetCacheService
  ) {}

  /** Last 10 match IDs (newest first). */
  async getHistoryIds(puuid: string, end = 10): Promise<Array<{ matchId: string; queueId: string }>> {
    const res = await this.auth.remote<{ History?: Array<{ MatchID: string; QueueID?: string }> }>(
      'GET',
      `${REGION.pd}/match-history/v1/history/${puuid}?startIndex=0&endIndex=${end}`
    )
    return (res.History ?? []).map((h) => ({ matchId: h.MatchID, queueId: h.QueueID ?? '' }))
  }

  /**
   * Valo Tracker Score, 0-1000: K/D 40% (max 400), ACS 40% (max 400), assists + first bloods 20% (max 200).
   * K/D 1.0 = 200 and 1.5+ = 400; ACS 200 = 200 and 300+ = 400.
   */
  calculateVTS(matchDetails: any, puuid: string): VtsResult | null {
    const me = (matchDetails.players ?? []).find((p: any) => p.subject === puuid)
    const s = me?.stats
    if (!s) return null
    const rounds = s.roundsPlayed || (matchDetails.roundResults ?? []).length
    if (!rounds) return null

    const kd = s.kills / Math.max(1, s.deaths)
    const kdPts = kd <= 1 ? 200 * kd : clamp(200 + (kd - 1) * 400, 0, 400)

    const acs = s.score / rounds
    const acsPts = acs <= 200 ? acs : clamp(200 + (acs - 200) * 2, 0, 400)

    // ~0.3 assists/round and ~0.15 first bloods/round earn the full 100 points each.
    const assistPts = clamp((s.assists / rounds / 0.3) * 100, 0, 100)
    const fbPts = clamp((countFirstBloods(matchDetails, puuid) / rounds / 0.15) * 100, 0, 100)

    const score = Math.round(clamp(kdPts + acsPts + assistPts + fbPts, 0, 1000))
    return { score, grade: vtsGrade(score) }
  }

  private async rawDetails(matchId: string): Promise<any> {
    let d = this.details.get(matchId)
    if (!d) {
      d = await this.auth.remote('GET', `${REGION.pd}/match-details/v1/matches/${matchId}`)
      this.details.set(matchId, d)
    }
    return d
  }

  /** Detailed stats of the player's most recent non-deathmatch game, for the AI coach. */
  async getCoachData(): Promise<CoachData | null> {
    const puuid = this.auth.puuid
    if (!puuid) throw new Error('Riot Client oturumu yok')
    await this.assets.load()
    const latest = (await this.getHistoryIds(puuid, 10)).find((h) => h.queueId !== 'deathmatch')
    if (!latest) return null

    const [d, summary] = await Promise.all([
      this.rawDetails(latest.matchId),
      this.getMatchDetails(latest.matchId, puuid, latest.queueId)
    ])
    const me = (d.players ?? []).find((p: any) => p.subject === puuid)
    const rounds: number = me?.stats?.roundsPlayed || (d.roundResults ?? []).length || 1

    // Opening duels: the earliest kill of each round decides first blood / first death.
    const kills: any[] = Array.isArray(d.kills) ? d.kills : []
    const firstKillByRound = new Map<number, any>()
    for (const k of kills) {
      const cur = firstKillByRound.get(k.round)
      if (!cur || (k.roundTime ?? 0) < (cur.roundTime ?? 0)) firstKillByRound.set(k.round, k)
    }
    let firstBloods = 0
    let firstDeaths = 0
    firstKillByRound.forEach((k) => {
      if (k.killer === puuid) firstBloods++
      if (k.victim === puuid) firstDeaths++
    })

    let head = 0
    let total = 0
    let damage = 0
    for (const r of d.roundResults ?? []) {
      const ps = (r.playerStats ?? []).find((x: any) => x.subject === puuid)
      for (const dm of ps?.damage ?? []) {
        head += dm.headshots ?? 0
        total += (dm.headshots ?? 0) + (dm.bodyshots ?? 0) + (dm.legshots ?? 0)
        damage += dm.damage ?? 0
      }
    }

    const deathLocations = kills
      .filter((k) => k.victim === puuid)
      .slice(0, 25)
      .map((k) => ({
        round: (k.round ?? 0) + 1,
        secondsIntoRound: Math.round((k.roundTime ?? 0) / 1000),
        x: k.victimLocation?.x ?? null,
        y: k.victimLocation?.y ?? null
      }))

    const r2 = (n: number): number => Math.round(n * 100) / 100
    return {
      map: summary.mapName,
      agent: summary.agentName,
      queue: summary.queue,
      result: summary.result,
      roundsWon: summary.roundsWon,
      roundsLost: summary.roundsLost,
      kills: summary.kills,
      deaths: summary.deaths,
      assists: summary.assists,
      kd: r2(summary.kills / Math.max(1, summary.deaths)),
      acs: Math.round((me?.stats?.score ?? 0) / rounds),
      adr: Math.round(damage / rounds),
      headshotPercent: total ? Math.round((head / total) * 100) : 0,
      firstBloods,
      firstDeaths,
      firstBloodRate: r2(firstBloods / rounds),
      firstDeathRate: r2(firstDeaths / rounds),
      vts: summary.vts,
      deathLocations
    }
  }

  /** Parses K/D/A, agent and win/loss for the given player from one match. */
  async getMatchDetails(matchId: string, puuid: string, queueId = ''): Promise<MatchSummary> {
    const d = await this.rawDetails(matchId)
    const me = (d.players ?? []).find((p: any) => p.subject === puuid)
    if (!me) throw new Error('Oyuncu maç verisinde yok')
    const teams: any[] = d.teams ?? []
    const myTeam = teams.find((t) => t.teamId === me.teamId)
    const other = teams.find((t) => t.teamId !== me.teamId)
    const result: MatchSummary['result'] = !myTeam || (myTeam.won === false && other?.won === false) ? 'draw' : myTeam.won ? 'win' : 'loss'
    const agent = this.assets.agent(me.characterId ?? '')
    const queue = d.matchInfo?.queueID ?? queueId
    return {
      vts: this.calculateVTS(d, puuid),
      matchId,
      startMillis: d.matchInfo?.gameStartMillis ?? 0,
      queue: QUEUES[queue] ?? queue,
      mapName: this.assets.mapByMapUrl(d.matchInfo?.mapId ?? '')?.name ?? 'Bilinmeyen Harita',
      agentName: agent?.name ?? '?',
      agentIcon: agent?.icon ?? null,
      kills: me.stats?.kills ?? 0,
      deaths: me.stats?.deaths ?? 0,
      assists: me.stats?.assists ?? 0,
      result,
      roundsWon: myTeam?.roundsWon ?? 0,
      roundsLost: other?.roundsWon ?? 0
    }
  }

  /** Recent matches (newest first) for the signed-in player, or for `puuid` when given. */
  async getMatchHistory(playerPuuid?: string, count = 10, queues?: string[]): Promise<MatchSummary[]> {
    const puuid = playerPuuid ?? this.auth.puuid
    if (!puuid) throw new Error('Riot Client oturumu yok')
    await this.assets.load()
    // With a queue filter, look further back so `count` matching games can be found.
    const all = await this.getHistoryIds(puuid, queues ? 20 : count)
    const ids = (queues ? all.filter((h) => queues.includes(h.queueId)) : all).slice(0, count)
    const settled = await Promise.allSettled(ids.map((h) => this.getMatchDetails(h.matchId, puuid, h.queueId)))
    return settled
      .filter((r): r is PromiseFulfilledResult<MatchSummary> => r.status === 'fulfilled')
      .map((r) => r.value)
      .sort((a, b) => b.startMillis - a.startMillis)
  }
}
