import type { MatchSummary, VtsResult } from '@shared/types'
import { buildTrend, isRankedLike } from '@shared/stats'
import { REGION } from '../constants'
import type { AuthService } from './AuthService'
import type { AssetCacheService } from './AssetCacheService'
import type { HistoryStore } from './HistoryStore'
import { computeVTS, openingDuels, VTS_VERSION } from './vts'

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
      vts: computeVTS(d, puuid, agent?.role ?? ''),
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

  private staleFailed = new Set<string>()

  /**
   * Pulls the player's latest 20 matches into the local store. Matches saved with an older VTS formula
   * are recalculated while Riot still serves their details. Returns how many matches were new.
   */
  async syncHistory(): Promise<number> {
    const puuid = this.auth.puuid
    if (!puuid) return 0
    await this.assets.load()
    const stored = new Map(this.history.matches(puuid).map((m) => [m.matchId, m]))
    const ids = (await this.getHistoryIds(puuid, 20)).filter((h) => {
      const old = stored.get(h.matchId)
      return !old || (old.vts?.version !== VTS_VERSION && !this.staleFailed.has(h.matchId))
    })
    const settled = await Promise.allSettled(ids.map((h) => this.getMatchDetails(h.matchId, puuid, h.queueId)))
    const ok: MatchSummary[] = []
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') ok.push(r.value)
      else this.staleFailed.add(ids[i].matchId)
    })
    return this.history.upsert(puuid, ok)
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
