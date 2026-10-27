import type { PlayerMmr, SeasonRank } from '@shared/types'
import { REGION } from '../constants'
import type { AuthService } from './AuthService'
import type { AssetCacheService } from './AssetCacheService'
import { tr } from '@shared/i18n'
import { analyzeSeasons, shortSeasonName, type SeasonEntry } from '@shared/ranks'

interface MmrResponse {
  QueueSkills?: {
    competitive?: {
      SeasonalInfoBySeasonID?: Record<string, SeasonEntry> | null
    }
  }
}

export class MmrService {
  constructor(
    private auth: AuthService,
    private assets: AssetCacheService
  ) {}

  /** Final rank and games for every past competitive act, newest first. */
  async getSeasonHistory(puuid: string): Promise<SeasonRank[]> {
    await this.assets.load()
    const res = await this.auth.remote<{
      QueueSkills?: { competitive?: { SeasonalInfoBySeasonID?: Record<string, { CompetitiveTier?: number; Rank?: number; NumberOfGames?: number; NumberOfWins?: number }> | null } }
    }>('GET', `${REGION.pd}/mmr/v1/players/${puuid}`)
    const seasons = res.QueueSkills?.competitive?.SeasonalInfoBySeasonID ?? {}
    return Object.entries(seasons)
      .map(([id, s]) => {
        const tier = s.CompetitiveTier || s.Rank || 0
        const info = this.assets.tier(tier)
        return {
          seasonId: id,
          name: this.assets.season(id)?.name ?? tr('Bilinmeyen sezon'),
          start: this.assets.season(id)?.start ?? 0,
          tier,
          tierName: info.name,
          tierIcon: info.icon,
          games: s.NumberOfGames ?? 0,
          wins: s.NumberOfWins ?? 0
        }
      })
      .filter((s) => s.tier > 0 && s.games > 0)
      .sort((a, b) => b.start - a.start)
      .map(({ start: _start, ...rest }) => rest)
  }

  /** Fetches rank data for every puuid in parallel. A failed lookup yields an unranked entry. */
  async getMany(puuids: string[]): Promise<Record<string, PlayerMmr>> {
    await this.assets.load()
    const entries = await Promise.all(puuids.map(async (id) => [id, await this.getOne(id)] as const))
    return Object.fromEntries(entries)
  }

  private async getOne(puuid: string): Promise<PlayerMmr> {
    let seasons: Record<string, SeasonEntry> | null | undefined = null
    try {
      const res = await this.auth.remote<MmrResponse>('GET', `${REGION.pd}/mmr/v1/players/${puuid}`)
      seasons = res.QueueSkills?.competitive?.SeasonalInfoBySeasonID
    } catch {
      /* treat as unranked */
    }

    const a = analyzeSeasons(seasons, this.assets.activeSeasonId, (id) => this.assets.season(id)?.start ?? 0)
    const seasonLabel = (id: string | null): string | null => {
      const name = id ? this.assets.season(id)?.name : null
      return name ? shortSeasonName(name) : null
    }

    const cur = this.assets.tier(a.currentTier)
    const peak = this.assets.tier(a.peakTier)
    return {
      currentTier: a.currentTier,
      currentRR: a.currentRR,
      peakTier: a.peakTier,
      currentTierName: cur.name,
      currentTierIcon: cur.icon,
      peakTierName: peak.name,
      peakTierIcon: peak.icon,
      peakSeason: seasonLabel(a.peakSeasonId),
      pastRanks: a.past.map((p) => {
        const info = this.assets.tier(p.tier)
        return { season: seasonLabel(p.seasonId) ?? '?', tier: p.tier, tierName: info.name, tierIcon: info.icon }
      })
    }
  }
}
