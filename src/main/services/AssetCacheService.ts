import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import type { AgentInfo, AssetsPayload, MapInfo, Pt, WeaponInfo } from '@shared/types'
import { log } from '../logger'
import { getLanguage, tr } from '@shared/i18n'

interface SlimSkin {
  uuid: string
  name: string
  icon: string | null
  levels: string[]
  chromas: Array<{ uuid: string; icon: string | null }>
}

interface SlimBuddy {
  name: string
  icon: string | null
  levels: string[]
}

export interface TierInfo {
  tier: number
  name: string
  icon: string | null
}

export interface SeasonInfo {
  uuid: string
  name: string
  start: number
}

interface CacheFile {
  savedAt: number
  /** language of the tier names */
  lang: string
  weapons: WeaponInfo[]
  seasons: SeasonInfo[]
  activeSeasonId: string | null
  tiers: TierInfo[]
  agents: AgentInfo[]
  maps: MapInfo[]
  skins: SlimSkin[]
  buddies: SlimBuddy[]
}

const TTL_MS = 12 * 60 * 60 * 1000
const API = 'https://valorant-api.com/v1'

/* eslint-disable @typescript-eslint/no-explicit-any */
async function getData(endpoint: string): Promise<any[]> {
  const res = await fetch(`${API}${endpoint}`)
  if (!res.ok) throw new Error(`valorant-api ${endpoint}: ${res.status}`)
  return ((await res.json()) as { data: any[] }).data
}

export class AssetCacheService {
  private file = path.join(app.getPath('userData'), 'asset-cache.json')
  private agents: AgentInfo[] = []
  private maps: MapInfo[] = []
  private agentById = new Map<string, AgentInfo>()
  private mapByUrl = new Map<string, MapInfo>()
  private skinByKey = new Map<string, SlimSkin>() // skin uuid + level uuids
  private skinList: SlimSkin[] = []
  private chromaById = new Map<string, { uuid: string; icon: string | null }>()
  private buddyByLevel = new Map<string, SlimBuddy>()
  private tierByNum = new Map<number, TierInfo>()
  private activeSeason: string | null = null
  private seasonById = new Map<string, SeasonInfo>()
  private weapons: WeaponInfo[] = []
  private loading: Promise<void> | null = null
  private ready = false

  /** Forces a reload (e.g. the interface language changed and tier names must be fetched again). */
  invalidate(): void {
    this.ready = false
    void this.load().catch(() => undefined)
  }

  /** Loads from disk cache when fresh, otherwise from valorant-api.com. Safe to call repeatedly. */
  load(): Promise<void> {
    if (this.ready) return Promise.resolve()
    this.loading ??= this.doLoad().finally(() => (this.loading = null))
    return this.loading
  }

  private async doLoad(): Promise<void> {
    let cache: CacheFile | null = null
    try {
      cache = JSON.parse(readFileSync(this.file, 'utf8')) as CacheFile
    } catch {
      /* no cache */
    }
    if (!cache || !cache.tiers || cache.agents.some((a) => a.role === undefined) || !cache.seasons || !cache.weapons || cache.lang !== getLanguage() || cache.maps.some((m) => m.calib === undefined) || Date.now() - cache.savedAt > TTL_MS) {
      try {
        cache = await this.fetchAll()
        try {
          writeFileSync(this.file, JSON.stringify(cache))
        } catch {
          /* non-fatal */
        }
        log('Assets', 'success', tr('Varlıklar yüklendi ({agents} ajan, {maps} harita, {skins} skin)', { agents: cache.agents.length, maps: cache.maps.length, skins: cache.skins.length }))
      } catch (e) {
        if (!cache) {
          log('Assets', 'error', tr('Varlıklar yüklenemedi: {msg}', { msg: (e as Error).message }))
          throw e
        }
        log('Assets', 'info', tr('Çevrimdışı, eski önbellek kullanılıyor'))
      }
    }
    this.index(cache)
    this.ready = true
  }

  private async fetchAll(): Promise<CacheFile> {
    const [agents, maps, skins, buddies, seasons, tierSets, weapons] = await Promise.all([
      getData('/agents?isPlayableCharacter=true'),
      getData('/maps'),
      getData('/weapons/skins'),
      getData('/buddies'),
      getData('/seasons'),
      getData(`/competitivetiers?language=${getLanguage() === 'en' ? 'en-US' : 'tr-TR'}`),
      getData('/weapons')
    ])
    const activeAct = seasons.find((s) => s.type === 'EAresSeasonType::Act' && s.isActive)
    const latestTiers: any[] = tierSets[tierSets.length - 1]?.tiers ?? []
    return {
      savedAt: Date.now(),
      lang: getLanguage(),
      weapons: weapons.map((w) => ({ uuid: w.uuid as string, name: w.displayName as string, icon: (w.displayIcon as string) ?? null })),
      seasons: seasons
        .filter((s) => s.type === 'EAresSeasonType::Act')
        .map((s) => {
          const episode = seasons.find((e) => e.uuid === s.parentUuid)
          return {
            uuid: s.uuid as string,
            name: `${episode?.displayName ?? ''} ${s.displayName}`.trim(),
            start: Date.parse(s.startTime) || 0
          }
        }),
      activeSeasonId: activeAct?.uuid ?? null,
      tiers: latestTiers.map((t) => ({ tier: t.tier, name: t.tierName, icon: t.largeIcon ?? t.smallIcon ?? null })),
      agents: agents.map((a) => ({ uuid: a.uuid, name: a.displayName, icon: a.displayIcon, role: a.role?.displayName ?? '' })),
      maps: maps.map((m) => ({
        uuid: m.uuid,
        mapUrl: m.mapUrl,
        name: m.displayName,
        splash: m.splash ?? null,
        icon: m.listViewIcon ?? m.displayIcon ?? null,
        minimap: m.displayIcon ?? null,
        calib:
          typeof m.xMultiplier === 'number'
            ? { xm: m.xMultiplier, ym: m.yMultiplier, xa: m.xScalarToAdd, ya: m.yScalarToAdd }
            : null
      })),
      skins: skins.map((s) => ({
        uuid: s.uuid,
        name: s.displayName,
        icon: s.displayIcon ?? s.chromas?.[0]?.fullRender ?? s.levels?.[0]?.displayIcon ?? null,
        levels: (s.levels ?? []).map((l: any) => l.uuid),
        chromas: (s.chromas ?? []).map((c: any) => ({ uuid: c.uuid, icon: c.fullRender ?? c.displayIcon ?? null }))
      })),
      buddies: buddies.map((b) => ({
        name: b.displayName,
        icon: b.displayIcon ?? null,
        levels: (b.levels ?? []).map((l: any) => l.uuid)
      }))
    }
  }

  private index(c: CacheFile): void {
    this.agents = c.agents.sort((a, b) => a.name.localeCompare(b.name))
    this.maps = c.maps
    this.agentById = new Map(c.agents.map((a) => [a.uuid, a]))
    this.mapByUrl = new Map(c.maps.map((m) => [m.mapUrl, m]))
    this.weapons = c.weapons
    this.activeSeason = c.activeSeasonId
    this.seasonById = new Map(c.seasons.map((s) => [s.uuid, s]))
    this.tierByNum = new Map(c.tiers.map((t) => [t.tier, t]))
    this.skinList = c.skins
    this.skinByKey.clear()
    this.chromaById.clear()
    for (const s of c.skins) {
      this.skinByKey.set(s.uuid, s)
      s.levels.forEach((l) => this.skinByKey.set(l, s))
      s.chromas.forEach((ch) => this.chromaById.set(ch.uuid, ch))
    }
    this.buddyByLevel.clear()
    for (const b of c.buddies) b.levels.forEach((l) => this.buddyByLevel.set(l, b))
  }

  getAssets(): AssetsPayload {
    return {
      weapons: this.weapons,
      agents: this.agents,
      // playable maps only (those with a map URL under /Game/Maps and a splash)
      maps: this.maps.filter((m) => m.splash && m.mapUrl.startsWith('/Game/Maps/')).sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  season(uuid: string): SeasonInfo | undefined {
    return this.seasonById.get(uuid)
  }

  /** Game coordinates -> minimap fractions (0-1). Null when the map has no calibration. */
  toMinimap(mapUrl: string, gx: number, gy: number): Pt | null {
    const c = this.mapByUrl.get(mapUrl)?.calib
    if (!c || typeof gx !== 'number' || typeof gy !== 'number') return null
    const x = gy * c.xm + c.xa
    const y = gx * c.ym + c.ya
    if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) return null
    return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }
  }

  get activeSeasonId(): string | null {
    return this.activeSeason
  }

  tier(num: number): TierInfo {
    return this.tierByNum.get(num) ?? { tier: num, name: num === 0 ? tr('Derecesiz') : `Tier ${num}`, icon: null }
  }

  agent(uuid: string): AgentInfo | undefined {
    return this.agentById.get(uuid.toLowerCase())
  }

  mapByMapUrl(mapUrl: string): MapInfo | undefined {
    return this.mapByUrl.get(mapUrl)
  }

  /** Skin for any of its ids (skin uuid or one of its level uuids). */
  skinOf(id: string): { uuid: string; name: string; icon: string | null } | undefined {
    const s = this.skinByKey.get(id.toLowerCase())
    return s && { uuid: s.uuid, name: s.name, icon: s.icon }
  }

  /** True when `id` is the first level of a skin, which is the unit that is bought and owned. */
  isBaseLevel(id: string): boolean {
    const s = this.skinByKey.get(id.toLowerCase())
    return !!s && s.levels[0] === id.toLowerCase()
  }

  searchSkins(query: string, limit = 30): Array<{ uuid: string; name: string; icon: string | null }> {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    if (q.length < 2) return []
    return this.skinList
      .filter((s) => !/^(standard|random favorite)/i.test(s.name) && s.name.toLocaleLowerCase('tr-TR').includes(q))
      .slice(0, limit)
      .map((s) => ({ uuid: s.uuid, name: s.name, icon: s.icon }))
  }

  resolveSkin(skinId?: string, chromaId?: string): { name: string; icon: string | null } {
    const skin = skinId ? this.skinByKey.get(skinId.toLowerCase()) : undefined
    const chroma = chromaId ? this.chromaById.get(chromaId.toLowerCase()) : undefined
    return { name: skin?.name ?? tr('Bilinmiyor'), icon: chroma?.icon ?? skin?.icon ?? null }
  }

  resolveBuddy(buddyId?: string): { name: string; icon: string | null } | null {
    const b = buddyId ? this.buddyByLevel.get(buddyId.toLowerCase()) : undefined
    return b ? { name: b.name, icon: b.icon } : null
  }
}
