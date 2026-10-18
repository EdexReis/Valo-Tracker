import type { MatchSummary } from '@shared/types'
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

  /** Parses K/D/A, agent and win/loss for the given player from one match. */
  async getMatchDetails(matchId: string, puuid: string, queueId = ''): Promise<MatchSummary> {
    let d = this.details.get(matchId)
    if (!d) {
      d = await this.auth.remote('GET', `${REGION.pd}/match-details/v1/matches/${matchId}`)
      this.details.set(matchId, d)
    }
    const me = (d.players ?? []).find((p: any) => p.subject === puuid)
    if (!me) throw new Error('Oyuncu maç verisinde yok')
    const teams: any[] = d.teams ?? []
    const myTeam = teams.find((t) => t.teamId === me.teamId)
    const other = teams.find((t) => t.teamId !== me.teamId)
    const result: MatchSummary['result'] = !myTeam || (myTeam.won === false && other?.won === false) ? 'draw' : myTeam.won ? 'win' : 'loss'
    const agent = this.assets.agent(me.characterId ?? '')
    const queue = d.matchInfo?.queueID ?? queueId
    return {
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
