import type { CollectionData, StoreSkin, StorefrontData } from '@shared/types'
import { REGION } from '../constants'
import { HttpError, type AuthService } from './AuthService'
import type { AssetCacheService } from './AssetCacheService'

/** Clean shape returned by `fetchRaw` (skin level UUIDs only). */
export interface StorefrontRaw {
  dailyOffers: string[]
  dailyRemainingSec: number
  nightMarket: {
    isActive: boolean
    remainingSec: number
    offers: Array<{ id: string; discountPercent: number; cost: number | null; discountedCost: number | null }>
  } | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const firstValue = (o: Record<string, number> | undefined): number | null => {
  const v = o ? Object.values(o)[0] : undefined
  return typeof v === 'number' ? v : null
}

export class StorefrontService {
  private priceCache: { at: number; map: Map<string, number> } | null = null

  constructor(
    private auth: AuthService,
    private assets: AssetCacheService
  ) {}

  async fetchRaw(): Promise<StorefrontRaw> {
    const puuid = this.auth.puuid
    if (!puuid) throw new Error('Riot Client oturumu yok')

    let data: any
    try {
      data = await this.auth.remote('GET', `${REGION.pd}/store/v2/storefront/${puuid}`)
    } catch (e) {
      // Riot has retired v2 on some shards; v3 returns the same structure via POST.
      if (e instanceof HttpError && [404, 405, 410].includes(e.status)) {
        data = await this.auth.remote('POST', `${REGION.pd}/store/v3/storefront/${puuid}`, {})
      } else throw e
    }

    const panel = data?.SkinsPanelLayout
    const bonus = data?.BonusStore
    return {
      dailyOffers: panel?.SingleItemOffers ?? [],
      dailyRemainingSec: panel?.SingleItemOffersRemainingDurationInSeconds ?? 0,
      nightMarket: bonus
        ? {
            isActive: true,
            remainingSec: bonus.BonusStoreRemainingDurationInSeconds ?? 0,
            offers: (bonus.BonusStoreOffers ?? []).map((o: any) => ({
              id: o.Offer?.OfferID,
              discountPercent: o.DiscountPercent ?? 0,
              cost: firstValue(o.Offer?.Cost),
              discountedCost: firstValue(o.DiscountCosts)
            }))
          }
        : null
    }
  }

  /** Raw offers joined with skin names and icons for the UI. */
  /** offerId -> VP price. Prices rarely change, so cache for an hour. */
  async prices(): Promise<Map<string, number>> {
    if (this.priceCache && Date.now() - this.priceCache.at < 3600_000) return this.priceCache.map
    const res = await this.auth.remote<{ Offers?: any[] }>('GET', `${REGION.pd}/store/v1/offers/`)
    const map = new Map<string, number>()
    for (const o of res.Offers ?? []) {
      const c = firstValue(o.Cost)
      if (c !== null) map.set(o.OfferID, c)
    }
    this.priceCache = { at: Date.now(), map }
    return map
  }

  /** Owned skins (first levels) with their store price when one is known. */
  async getCollection(): Promise<CollectionData> {
    const puuid = this.auth.puuid
    if (!puuid) throw new Error('Riot Client oturumu yok')
    const SKIN_LEVEL_TYPE = 'e7c63390-eda7-46e0-bb7a-a6abdacd2433'
    const [ent, prices] = await Promise.all([
      this.auth.remote<{ Entitlements?: Array<{ ItemID: string }> }>('GET', `${REGION.pd}/store/v1/entitlements/${puuid}/${SKIN_LEVEL_TYPE}`),
      this.prices().catch(() => new Map<string, number>()),
      this.assets.load()
    ])
    const items = (ent.Entitlements ?? [])
      .map((e) => e.ItemID.toLowerCase())
      .filter((id) => this.assets.isBaseLevel(id))
      .map((id) => {
        const s = this.assets.skinOf(id)!
        return { ...s, cost: prices.get(id) ?? null }
      })
      .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || a.name.localeCompare(b.name))
    return { count: items.length, totalVP: items.reduce((n, i) => n + (i.cost ?? 0), 0), items }
  }

  async get(): Promise<StorefrontData> {
    const [raw, prices] = await Promise.all([
      this.fetchRaw(),
      this.prices().catch(() => new Map<string, number>()),
      this.assets.load()
    ])
    const skin = (id: string): StoreSkin => {
      const s = this.assets.resolveSkin(id)
      return { id, name: s.name, icon: s.icon }
    }
    return {
      dailyOffers: raw.dailyOffers.map((id) => ({ ...skin(id), cost: prices.get(id) ?? null })),
      dailyRemainingSec: raw.dailyRemainingSec,
      nightMarket: raw.nightMarket && {
        isActive: true,
        remainingSec: raw.nightMarket.remainingSec,
        offers: raw.nightMarket.offers.map((o) => ({
          ...skin(o.id),
          discountPercent: o.discountPercent,
          cost: o.cost,
          discountedCost: o.discountedCost
        }))
      }
    }
  }
}
