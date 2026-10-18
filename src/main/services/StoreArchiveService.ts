import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import type { StoreDay, StoreSkinDay, StorefrontData } from '@shared/types'
import type { AssetCacheService } from './AssetCacheService'

interface StoredSkin {
  uuid: string
  cost: number | null
  discountedCost: number | null
  discountPercent: number | null
}

interface StoredDay {
  daily: StoredSkin[]
  night: StoredSkin[]
}

const KEEP_DAYS = 120

/** Keeps a daily log of the player's store so past rotations stay searchable. Starts when the app is installed. */
export class StoreArchiveService {
  private file = path.join(app.getPath('userData'), 'store-archive.json')
  private data: Record<string, Record<string, StoredDay>> = {}

  constructor(private assets: AssetCacheService) {
    try {
      this.data = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      this.data = {}
    }
  }

  /** Records a fetched storefront. The key is the UTC date the current daily rotation started. */
  record(puuid: string | null, store: StorefrontData): void {
    if (!puuid || !store.dailyOffers.length) return
    const date = new Date(Date.now() + store.dailyRemainingSec * 1000 - 24 * 3_600_000).toISOString().slice(0, 10)
    const pack = (list: StorefrontData['dailyOffers']): StoredSkin[] =>
      list.flatMap((o) => {
        const skin = this.assets.skinOf(o.id)
        return skin
          ? [{ uuid: skin.uuid, cost: o.cost ?? null, discountedCost: o.discountedCost ?? null, discountPercent: o.discountPercent ?? null }]
          : []
      })
    const days = (this.data[puuid] ??= {})
    days[date] = { daily: pack(store.dailyOffers), night: store.nightMarket ? pack(store.nightMarket.offers) : [] }
    const keep = Object.keys(days).sort().slice(-KEEP_DAYS)
    this.data[puuid] = Object.fromEntries(keep.map((k) => [k, days[k]]))
    try {
      writeFileSync(this.file, JSON.stringify(this.data))
    } catch {
      /* non-fatal */
    }
  }

  /** Newest day first, with skin names and icons resolved. */
  list(puuid: string | null): StoreDay[] {
    if (!puuid) return []
    const resolve = (s: StoredSkin): StoreSkinDay | null => {
      const skin = this.assets.skinOf(s.uuid)
      return skin ? { ...skin, cost: s.cost, discountedCost: s.discountedCost, discountPercent: s.discountPercent } : null
    }
    return Object.entries(this.data[puuid] ?? {})
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, d]) => ({
        date,
        daily: d.daily.map(resolve).filter((s): s is StoreSkinDay => !!s),
        night: d.night.map(resolve).filter((s): s is StoreSkinDay => !!s)
      }))
  }
}
