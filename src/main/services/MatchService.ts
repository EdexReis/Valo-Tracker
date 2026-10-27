import type { EconSummary, MatchDetail, MatchSummary, Pt, RoundInfo, RRPoint, VtsResult } from '@shared/types'
import { buildTrend, isRankedLike } from '@shared/stats'
import { REGION } from '../constants'
import type { AuthService } from './AuthService'
import type { AssetCacheService } from './AssetCacheService'
import type { HistoryStore } from './HistoryStore'
import { computeVTS, openingDuels, VTS_VERSION } from './vts'
import { weaponKey, weaponTally } from './weapons'
import type { MatchTimeline, TimelineEvent } from '@shared/timeline'
import { tr } from '@shared/i18n'

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
  /** rounds and wins per buy type, plus mismatched buys */
  economy: EconSummary | null
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
    if (!me) throw new Error(tr('Oyuncu maç verisinde yok'))
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
    const weapons = weaponTally(d, puuid)

    // Where I died / got kills, as minimap fractions (for the heatmaps).
    const mapUrl: string = d.matchInfo?.mapId ?? ''
    const deathPts: Pt[] = []
    const killPts: Pt[] = []
    for (const k of Array.isArray(d.kills) ? d.kills : []) {
      if (k.victim === puuid && k.victimLocation) {
        const p = this.assets.toMinimap(mapUrl, k.victimLocation.x, k.victimLocation.y)
        if (p) deathPts.push(p)
      } else if (k.killer === puuid) {
        const loc = (k.playerLocations ?? []).find((pl: any) => pl.subject === puuid)?.location
        const p = loc ? this.assets.toMinimap(mapUrl, loc.x, loc.y) : null
        if (p) killPts.push(p)
      }
    }

    return {
      vts: computeVTS(d, puuid, agent?.role ?? ''),
      matchId,
      startMillis: d.matchInfo?.gameStartMillis ?? 0,
      queue: QUEUES[queue] ?? queue,
      queueId: queue,
      mapName: this.assets.mapByMapUrl(d.matchInfo?.mapId ?? '')?.name ?? tr('Bilinmeyen Harita'),
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
      firstDeaths: duels.firstDeaths,
      deathPts: deathPts.slice(0, 40),
      killPts: killPts.slice(0, 60),
      weaponKills: weapons.kills,
      weaponDeaths: weapons.deaths
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
    const added = this.history.upsert(puuid, ok)
    await this.syncRR(puuid).catch(() => undefined)
    return added
  }

  /** RR gained or lost per competitive match, plus a backfilled rank timeline. */
  private async syncRR(puuid: string): Promise<void> {
    const res = await this.auth.remote<{ Matches?: any[] }>(
      'GET',
      `${REGION.pd}/mmr/v1/players/${puuid}/competitiveupdates?startIndex=0&endIndex=20&queue=competitive`
    )
    const changes = new Map<string, number>()
    const points: RRPoint[] = []
    for (const u of res.Matches ?? []) {
      const earned =
        typeof u.RankedRatingEarned === 'number' ? u.RankedRatingEarned : (u.RankedRatingAfterUpdate ?? 0) - (u.RankedRatingBeforeUpdate ?? 0)
      changes.set(u.MatchID, earned)
      if (u.MatchStartTime && u.TierAfterUpdate > 0) {
        points.push({ t: u.MatchStartTime, tier: u.TierAfterUpdate, rr: u.RankedRatingAfterUpdate ?? 0 })
      }
    }
    this.history.patchRR(puuid, changes)
    this.history.mergeRR(puuid, points)
  }

  /** Round-by-round view of one finished match: kills, deaths, economy and heatmap points. */
  async getMatchDetail(matchId: string): Promise<MatchDetail> {
    const puuid = this.auth.puuid
    if (!puuid) throw new Error(tr('Riot Client oturumu yok'))
    await this.assets.load()
    const d = await this.rawDetails(matchId)
    const players: any[] = d.players ?? []
    const me = players.find((p) => p.subject === puuid)
    if (!me) throw new Error(tr('Oyuncu maç verisinde yok'))
    const mapUrl: string = d.matchInfo?.mapId ?? ''
    const map = this.assets.mapByMapUrl(mapUrl)
    const mateIds = players.filter((p) => p.teamId === me.teamId).map((p) => p.subject as string)
    const kills: any[] = Array.isArray(d.kills) ? d.kills : []
    const agentOf = (id: string): string | null => this.assets.agent(players.find((p) => p.subject === id)?.characterId ?? '')?.name ?? null

    const empty = (): { rounds: number; won: number } => ({ rounds: 0, won: 0 })
    const econ: EconSummary = { pistol: empty(), eco: empty(), force: empty(), full: empty(), underbuys: 0, overbuys: 0 }
    let hasEcon = false

    const rounds: RoundInfo[] = (d.roundResults ?? []).map((rr: any): RoundInfo => {
      const n: number = rr.roundNum
      const ks = kills.filter((k) => k.round === n)
      const death = ks.find((k) => k.victim === puuid)
      const won = rr.winningTeam === me.teamId
      const mine = (rr.playerStats ?? []).find((x: any) => x.subject === puuid)
      const value: number | undefined = mine?.economy?.loadoutValue
      let info: RoundInfo['econ'] = null
      let flag: RoundInfo['flag'] = null
      if (typeof value === 'number') {
        const teamVals = (rr.playerStats ?? [])
          .filter((x: any) => mateIds.includes(x.subject))
          .map((x: any) => x.economy?.loadoutValue)
          .filter((v: unknown): v is number => typeof v === 'number')
        const teamAvg = teamVals.length ? Math.round(teamVals.reduce((a: number, b: number) => a + b, 0) / teamVals.length) : value
        // Rough buy classes from the loadout value at round start.
        const type = n === 0 || n === 12 ? 'pistol' : value < 1500 ? 'eco' : value < 3400 ? 'force' : 'full'
        info = { value, teamAvg, type }
        if (type !== 'pistol') {
          if (teamAvg >= 3400 && value < 2500) flag = 'underbuy'
          else if (teamAvg < 1500 && value >= 3400) flag = 'overbuy'
        }
        hasEcon = true
        econ[type].rounds++
        if (won) econ[type].won++
        if (flag === 'underbuy') econ.underbuys++
        if (flag === 'overbuy') econ.overbuys++
      }
      return {
        round: n + 1,
        won,
        kills: ks.filter((k) => k.killer === puuid).length,
        deathSec: death ? Math.round((death.roundTime ?? 0) / 1000) : null,
        killerAgent: death ? agentOf(death.killer) : null,
        econ: info,
        flag
      }
    })

    const deaths: Pt[] = []
    const killPts: Pt[] = []
    for (const k of kills) {
      if (k.victim === puuid && k.victimLocation) {
        const p = this.assets.toMinimap(mapUrl, k.victimLocation.x, k.victimLocation.y)
        if (p) deaths.push(p)
      } else if (k.killer === puuid) {
        const loc = (k.playerLocations ?? []).find((pl: any) => pl.subject === puuid)?.location
        const p = loc ? this.assets.toMinimap(mapUrl, loc.x, loc.y) : null
        if (p) killPts.push(p)
      }
    }
    return {
      matchId,
      mapName: map?.name ?? tr('Bilinmeyen Harita'),
      mapIcon: map?.minimap ?? null,
      rounds,
      deaths,
      kills: killPts,
      econ: hasEcon ? econ : null
    }
  }

  /** GameName#TagLine for the given puuids. Used only for teammates who are not hiding their identity. */
  async resolveNames(puuids: string[]): Promise<Map<string, string>> {
    if (!puuids.length) return new Map()
    const res = await this.auth.remote<Array<{ Subject: string; GameName: string; TagLine: string }>>(
      'PUT',
      `${REGION.pd}/name-service/v2/players`,
      puuids
    )
    return new Map(res.filter((n) => n.GameName).map((n) => [n.Subject, `${n.GameName}#${n.TagLine}`]))
  }

  /** My kills and deaths of a finished match with their game time, for the timestamp export. */
  async getTimeline(matchId: string): Promise<MatchTimeline> {
    const puuid = this.auth.puuid
    if (!puuid) throw new Error(tr('Riot Client oturumu yok'))
    await this.assets.load()
    const d = await this.rawDetails(matchId)
    const players: any[] = d.players ?? []
    const me = players.find((p) => p.subject === puuid)
    if (!me) throw new Error(tr('Oyuncu maç verisinde yok'))
    const agentOf = (id: string): string | null => this.assets.agent(players.find((p) => p.subject === id)?.characterId ?? '')?.name ?? null
    const special: Record<string, string> = { ability: tr('Yetenek'), spike: 'Spike', fall: tr('Düşme') }
    const weaponOf = (fd: any): string | null => {
      const key = weaponKey(fd)
      return this.assets.weaponName(key) ?? special[key] ?? null
    }

    const kills: any[] = (Array.isArray(d.kills) ? d.kills : []).slice().sort((a: any, b: any) => (a.gameTime ?? 0) - (b.gameTime ?? 0))
    const roundKills = new Map<number, number>()
    for (const k of kills) if (k.killer === puuid && k.victim !== puuid) roundKills.set(k.round, (roundKills.get(k.round) ?? 0) + 1)
    const seen = new Map<number, number>()

    const events: TimelineEvent[] = []
    for (const k of kills) {
      if (k.killer === puuid && k.victim !== puuid) {
        const index = (seen.get(k.round) ?? 0) + 1
        seen.set(k.round, index)
        events.push({
          type: 'kill', round: (k.round ?? 0) + 1, gameTimeMs: k.gameTime ?? 0, roundTimeMs: k.roundTime ?? 0,
          weapon: weaponOf(k.finishingDamage), other: agentOf(k.victim), killIndex: index, roundKills: roundKills.get(k.round) ?? 1
        })
      } else if (k.victim === puuid) {
        events.push({
          type: 'death', round: (k.round ?? 0) + 1, gameTimeMs: k.gameTime ?? 0, roundTimeMs: k.roundTime ?? 0,
          weapon: weaponOf(k.finishingDamage), other: k.killer === puuid ? null : agentOf(k.killer), killIndex: 0, roundKills: 0
        })
      }
    }
    return {
      matchId,
      mapName: this.assets.mapByMapUrl(d.matchInfo?.mapId ?? '')?.name ?? tr('Bilinmeyen Harita'),
      agentName: this.assets.agent(me.characterId ?? '')?.name ?? '?',
      startMillis: d.matchInfo?.gameStartMillis ?? 0,
      events
    }
  }

  /** Synced local history, newest first. */
  async getOwnHistory(): Promise<MatchSummary[]> {
    const puuid = this.auth.puuid
    if (!puuid) throw new Error(tr('Riot Client oturumu yok'))
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
    if (!puuid) throw new Error(tr('Riot Client oturumu yok'))
    await this.assets.load()
    const latest = (await this.getHistoryIds(puuid, 10)).find((h) => h.queueId !== 'deathmatch')
    if (!latest) return null

    const [d, s] = await Promise.all([this.rawDetails(latest.matchId), this.getMatchDetails(latest.matchId, puuid, latest.queueId)])
    const detail = await this.getMatchDetail(latest.matchId).catch(() => null)
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
      queue: tr(s.queue),
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
      deathLocations,
      economy: detail?.econ ?? null
    }
  }
}
