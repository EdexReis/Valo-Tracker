import type { PlayerMmr } from '@shared/types'
import { REGION } from '../constants'
import type { AuthService } from './AuthService'
import type { AssetCacheService } from './AssetCacheService'

interface MmrResponse {
  QueueSkills?: {
    competitive?: {
      SeasonalInfoBySeasonID?: Record<string, { CompetitiveTier?: number; RankedRating?: number }> | null
    }
  }
}

export class MmrService {
  constructor(
    private auth: AuthService,
    private assets: AssetCacheService
  ) {}

  /** Fetches rank data for every puuid in parallel. A failed lookup yields an unranked entry. */
  async getMany(puuids: string[]): Promise<Record<string, PlayerMmr>> {
    await this.assets.load()
    const entries = await Promise.all(puuids.map(async (id) => [id, await this.getOne(id)] as const))
    return Object.fromEntries(entries)
  }

  private async getOne(puuid: string): Promise<PlayerMmr> {
    let seasons: NonNullable<NonNullable<MmrResponse['QueueSkills']>['competitive']>['SeasonalInfoBySeasonID'] = null
    try {
      const res = await this.auth.remote<MmrResponse>('GET', `${REGION.pd}/mmr/v1/players/${puuid}`)
      seasons = res.QueueSkills?.competitive?.SeasonalInfoBySeasonID
    } catch {
      /* treat as unranked */
    }

    const active = this.assets.activeSeasonId ? seasons?.[this.assets.activeSeasonId] : undefined
    const currentTier = active?.CompetitiveTier ?? 0
    const currentRR = currentTier > 0 ? (active?.RankedRating ?? 0) : 0

    let peakTier = 0
    for (const s of Object.values(seasons ?? {})) peakTier = Math.max(peakTier, s?.CompetitiveTier ?? 0)
    peakTier = Math.max(peakTier, currentTier)

    const cur = this.assets.tier(currentTier)
    const peak = this.assets.tier(peakTier)
    return {
      currentTier,
      currentRR,
      peakTier,
      currentTierName: cur.name,
      currentTierIcon: cur.icon,
      peakTierName: peak.name,
      peakTierIcon: peak.icon
    }
  }
}
