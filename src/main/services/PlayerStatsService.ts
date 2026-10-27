import type { PlayerStats } from '@shared/types'
import { summarizePlayerStats } from '@shared/stats'
import type { MatchService } from './MatchService'

const TTL_MS = 15 * 60 * 1000
const FAILED_TTL_MS = 2 * 60 * 1000
const MATCHES = 5

/**
 * Recent form (K/D, ACS, HS%, win rate) of other players, from their last ranked/unrated matches.
 * Results are cached so re-scans of the same lobby, and the next lobby with the same people, stay cheap.
 */
export class PlayerStatsService {
  private cache = new Map<string, { at: number; ttl: number; value: PlayerStats | null }>()

  constructor(private matches: MatchService) {}

  /** The cached value, or undefined when it has to be loaded. */
  peek(puuid: string): PlayerStats | null | undefined {
    const hit = this.cache.get(puuid)
    return hit && Date.now() - hit.at < hit.ttl ? hit.value : undefined
  }

  async load(puuid: string): Promise<PlayerStats | null> {
    const cached = this.peek(puuid)
    if (cached !== undefined) return cached
    try {
      const recent = await this.matches.getMatchHistory(puuid, MATCHES, ['competitive', 'unrated'])
      const value = summarizePlayerStats(recent)
      this.cache.set(puuid, { at: Date.now(), ttl: value ? TTL_MS : FAILED_TTL_MS, value })
      return value
    } catch {
      this.cache.set(puuid, { at: Date.now(), ttl: FAILED_TTL_MS, value: null })
      return null
    }
  }
}
