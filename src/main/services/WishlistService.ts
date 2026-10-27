import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import type { SkinHit, WishlistHit } from '@shared/types'
import { log } from '../logger'
import type { AssetCacheService } from './AssetCacheService'
import type { NotifyService } from './NotifyService'
import type { StorefrontService } from './StorefrontService'

interface Stored {
  wishlist: string[]
  /** `${skinUuid}:${where}:${rotation}` keys that were already announced */
  notified: string[]
}

export class WishlistService {
  private file = path.join(app.getPath('userData'), 'wishlist.json')
  private data: Stored = { wishlist: [], notified: [] }

  constructor(
    private assets: AssetCacheService,
    private storefront: StorefrontService,
    private notify: NotifyService
  ) {
    try {
      this.data = { ...this.data, ...JSON.parse(readFileSync(this.file, 'utf8')) }
    } catch {
      /* first run */
    }
  }

  private save(): void {
    try {
      writeFileSync(this.file, JSON.stringify(this.data))
    } catch {
      /* non-fatal */
    }
  }

  /** Raw skin uuids, for backups. */
  uuids(): string[] {
    return [...this.data.wishlist]
  }

  replace(uuids: string[]): void {
    this.data.wishlist = uuids.filter((u) => typeof u === 'string')
    this.save()
  }

  list(): SkinHit[] {
    return this.data.wishlist
      .map((id) => this.assets.skinOf(id))
      .filter((s): s is SkinHit => !!s)
  }

  add(uuid: string): SkinHit[] {
    if (!this.data.wishlist.includes(uuid)) {
      this.data.wishlist.push(uuid)
      this.save()
    }
    return this.list()
  }

  remove(uuid: string): SkinHit[] {
    this.data.wishlist = this.data.wishlist.filter((id) => id !== uuid)
    this.save()
    return this.list()
  }

  /** Looks at today's store and the night market for wishlisted skins. */
  async check(): Promise<WishlistHit[]> {
    if (!this.data.wishlist.length) return []
    const store = await this.storefront.get()
    const wished = new Set(this.data.wishlist)
    const hits: WishlistHit[] = []
    const scan = (offers: typeof store.dailyOffers, where: WishlistHit['where']): void => {
      for (const o of offers) {
        const skin = this.assets.skinOf(o.id)
        if (skin && wished.has(skin.uuid)) {
          hits.push({
            ...skin,
            where,
            cost: o.cost ?? null,
            discountedCost: o.discountedCost ?? null,
            discountPercent: o.discountPercent ?? null
          })
        }
      }
    }
    scan(store.dailyOffers, 'daily')
    if (store.nightMarket) scan(store.nightMarket.offers, 'night')

    // Rotation id: the store's end time rounded to the hour, stable across re-checks.
    const rotation = (sec: number): number => Math.round((Date.now() + sec * 1000) / 3_600_000)
    this.lastRotation = { daily: rotation(store.dailyRemainingSec), night: rotation(store.nightMarket?.remainingSec ?? 0) }
    return hits
  }

  private lastRotation = { daily: 0, night: 0 }

  /** Same as check(), but announces new hits once per store rotation. */
  async checkAndNotify(): Promise<void> {
    const hits = await this.check()
    let changed = false
    for (const h of hits) {
      const key = `${h.uuid}:${h.where}:${this.lastRotation[h.where]}`
      if (this.data.notified.includes(key)) continue
      this.data.notified.push(key)
      changed = true
      const price = h.discountedCost ?? h.cost
      const where = h.where === 'night' ? 'Gece Pazarı' : 'günlük mağaza'
      log('Wishlist', 'success', `${h.name} ${where}nda!`)
      await this.notify.push('🎁 Wishlist skin mağazada!', `${h.name} — ${where}${price ? ` (${price} VP)` : ''}`)
    }
    if (changed) {
      this.data.notified = this.data.notified.slice(-200)
      this.save()
    }
  }
}
