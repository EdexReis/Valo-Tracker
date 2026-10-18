import type { MatchSummary, VtsGrade, VtsResult } from '@shared/types'
import { buildTrend, isRankedLike } from '@shared/stats'
import { REGION } from '../constants'
import type { AuthService } from './AuthService'
import type { AssetCacheService } from './AssetCacheService'
import type { HistoryStore } from './HistoryStore'

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

/** First blood / first death: the earliest kill of every round decides both. */
function openingDuels(d: any, puuid: string): { firstBloods: number; firstDeaths: number } {
  const kills: Array<{ round: number; time: number; killer: string; victim: string }> = []
  if (Array.isArray(d.kills)) {
    for (const k of d.kills) kills.push({ round: k.round, time: k.roundTime ?? 0, killer: k.killer, victim: k.victim })
  } else {
    for (const r of d.roundResults ?? [])
      for (const ps of r.playerStats ?? [])
        for (const k of ps.kills ?? [])
          kills.push({ round: r.roundNum, time: k.timeSinceRoundStartMillis ?? 0, killer: k.killer, victim: k.victim })
  }
  const first = new Map<number, (typeof kills)[number]>()
  for (const k of kills) {
    const cur = first.get(k.round)
    if (!cur || k.time < cur.time) first.set(k.round, k)
  }
  let firstBloods = 0
  let firstDeaths = 0
  first.forEach((k) => {
    if (k.killer === puuid) firstBloods++
    if (k.victim === puuid) firstDeaths++
  })
  return { firstBloods, firstDeaths }
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
    private assets: AssetCacheService,
    private history: HistoryStore
  ) {}

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
    const fbPts = clamp((openingDuels(matchDetails, puuid).firstBloods / rounds / 0.15) * 100, 0, 100)

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

  /** Parses K/D/A, agent, win/loss and detailed stats for the given player from one match. */
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
    const rounds: number = me.stats?.roundsPlayed || (d.roundResults ?? []).length || 1

    let head = 0
    let shots = 0
    let damage = 0
    for (const r of d.roundResults ?? []) {
      const ps = (r.playerStats ?? []).find((x: any) => x.subject === puuid)
      for (const dm of ps?.damage ?? []) {
        head += dm.headshots ?? 0
        shots += (dm.headshots ?? 0) + (dm.bodyshots ?? 0) + (dm.legshots ?? 0)
        damage += dm.damage ?? 0
      }
    }
    const duels = openingDuels(d, puuid)

    return {
      vts: this.calculateVTS(d, puuid),
      matchId,
      startMillis: d.matchInfo?.gameStartMillis ?? 0,
      queue: QUEUES[queue] ?? queue,
      queueId: queue,
      mapName: this.assets.mapByMapUrl(d.matchInfo?.mapId ?? '')?.name ?? 'Bilinmeyen Harita',
      agentName: agent?.name ?? '?',
      agentIcon: agent?.icon ?? null,
      kills: me.stats?.kills ?? 0,
      deaths: me.stats?.deaths ?? 0,
      assists: me.stats?.assists ?? 0,
      result,
      roundsWon: myTeam?.roundsWon ?? 0,
      roundsLost: other?.roundsWon ?? 0,
      rounds,
      acs: Math.round((me.stats?.score ?? 0) / rounds),
      adr: Math.round(damage / rounds),
      hsPercent: shots ? Math.round((head / shots) * 100) : 0,
      firstBloods: duels.firstBloods,
      firstDeaths: duels.firstDeaths
    }
  }

  /** Recent matches (newest first) of any player. Used for teammates; nothing is stored. */
  async getMatchHistory(playerPuuid: string, count = 10, queues?: string[]): Promise<MatchSummary[]> {
    await this.assets.load()
    // With a queue filter, look further back so `count` matching games can be found.
    const all = await this.getHistoryIds(playerPuuid, queues ? 20 : count)
    const ids = (queues ? all.filter((h) => queues.includes(h.queueId)) : all).slice(0, count)
    const settled = await Promise.allSettled(ids.map((h) => this.getMatchDetails(h.matchId, playerPuuid, h.queueId)))
    return settled
      .filter((r): r is PromiseFulfilledResult<MatchSummary> => r.status === 'fulfilled')
      .map((r) => r.value)
      .sort((a, b) => b.startMillis - a.startMillis)
  }

  /** Pulls the player's latest 20 matches into the local store. Returns how many were new. */
  async syncHistory(): Promise<number> {
    const puuid = this.auth.puuid
    if (!puuid) return 0
    await this.assets.load()
    const ids = (await this.getHistoryIds(puuid, 20)).filter((h) => !this.history.has(puuid, h.matchId))
    const settled = await Promise.allSettled(ids.map((h) => this.getMatchDetails(h.matchId, puuid, h.queueId)))
    const ok = settled.filter((r): r is PromiseFulfilledResult<MatchSummary> => r.status === 'fulfilled').map((r) => r.value)
    return this.history.add(puuid, ok)
  }

  /** Synced local history, newest first. */
  async getOwnHistory(): Promise<MatchSummary[]> {
    const puuid = this.auth.puuid
    if (!puuid) throw new Error('Riot Client oturumu yok')
    await this.syncHistory().catch(() => 0)
    return this.history.matches(puuid).slice(0, 30)
  }

  /** Aggregate of the last 20 ranked/unrated matches, for the AI trend report. */
  getTrendData(): Record<string, unknown> | null {
    const puuid = this.auth.puuid
    if (!puuid) return null
    const recent = this.history.matches(puuid).filter(isRankedLike).slice(0, 20)
    return recent.length ? buildTrend(recent) : null
  }

  /** Detailed stats of the player's most recent non-deathmatch game, for the AI coach. */
  async getCoachData(): Promise<CoachData | null> {
    const puuid = this.auth.puuid
    if (!puuid) throw new Error('Riot Client oturumu yok')
    await this.assets.load()
    const latest = (await this.getHistoryIds(puuid, 10)).find((h) => h.queueId !== 'deathmatch')
    if (!latest) return null

    const [d, s] = await Promise.all([this.rawDetails(latest.matchId), this.getMatchDetails(latest.matchId, puuid, latest.queueId)])
    const kills: any[] = Array.isArray(d.kills) ? d.kills : []
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
      map: s.mapName,
      agent: s.agentName,
      queue: s.queue,
      result: s.result,
      roundsWon: s.roundsWon,
      roundsLost: s.roundsLost,
      kills: s.kills,
      deaths: s.deaths,
      assists: s.assists,
      kd: r2(s.kills / Math.max(1, s.deaths)),
      acs: s.acs,
      adr: s.adr,
      headshotPercent: s.hsPercent,
      firstBloods: s.firstBloods,
      firstDeaths: s.firstDeaths,
      firstBloodRate: r2(s.firstBloods / s.rounds),
      firstDeathRate: r2(s.firstDeaths / s.rounds),
      vts: s.vts,
      deathLocations
    }
  }
}
