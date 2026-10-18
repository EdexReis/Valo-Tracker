import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import type { AgentInfo, AssetsPayload, MapInfo } from '@shared/types'
import { log } from '../logger'

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

interface CacheFile {
  savedAt: number
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
  private chromaById = new Map<string, { uuid: string; icon: string | null }>()
  private buddyByLevel = new Map<string, SlimBuddy>()
  private tierByNum = new Map<number, TierInfo>()
  private activeSeason: string | null = null
  private loading: Promise<void> | null = null
  private ready = false

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
    if (!cache || !cache.tiers || Date.now() - cache.savedAt > TTL_MS) {
      try {
        cache = await this.fetchAll()
        try {
          writeFileSync(this.file, JSON.stringify(cache))
        } catch {
          /* non-fatal */
        }
        log('Assets', 'success', `Varlıklar yüklendi (${cache.agents.length} ajan, ${cache.maps.length} harita, ${cache.skins.length} skin)`)
      } catch (e) {
        if (!cache) {
          log('Assets', 'error', `Varlıklar yüklenemedi: ${(e as Error).message}`)
          throw e
        }
        log('Assets', 'info', 'Çevrimdışı, eski önbellek kullanılıyor')
      }
    }
    this.index(cache)
    this.ready = true
  }

  private async fetchAll(): Promise<CacheFile> {
    const [agents, maps, skins, buddies, seasons, tierSets] = await Promise.all([
      getData('/agents?isPlayableCharacter=true'),
      getData('/maps'),
      getData('/weapons/skins'),
      getData('/buddies'),
      getData('/seasons'),
      getData('/competitivetiers?language=tr-TR')
    ])
    const activeAct = seasons.find((s) => s.type === 'EAresSeasonType::Act' && s.isActive)
    const latestTiers: any[] = tierSets[tierSets.length - 1]?.tiers ?? []
    return {
      savedAt: Date.now(),
      activeSeasonId: activeAct?.uuid ?? null,
      tiers: latestTiers.map((t) => ({ tier: t.tier, name: t.tierName, icon: t.largeIcon ?? t.smallIcon ?? null })),
      agents: agents.map((a) => ({ uuid: a.uuid, name: a.displayName, icon: a.displayIcon })),
      maps: maps.map((m) => ({
        uuid: m.uuid,
        mapUrl: m.mapUrl,
        name: m.displayName,
        splash: m.splash ?? null,
        icon: m.listViewIcon ?? m.displayIcon ?? null
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
    this.activeSeason = c.activeSeasonId
    this.tierByNum = new Map(c.tiers.map((t) => [t.tier, t]))
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
      agents: this.agents,
      // playable maps only (those with a map URL under /Game/Maps and a splash)
      maps: this.maps.filter((m) => m.splash && m.mapUrl.startsWith('/Game/Maps/')).sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  get activeSeasonId(): string | null {
    return this.activeSeason
  }

  tier(num: number): TierInfo {
    return this.tierByNum.get(num) ?? { tier: num, name: num === 0 ? 'Derecesiz' : `Tier ${num}`, icon: null }
  }

  agent(uuid: string): AgentInfo | undefined {
    return this.agentById.get(uuid.toLowerCase())
  }

  mapByMapUrl(mapUrl: string): MapInfo | undefined {
    return this.mapByUrl.get(mapUrl)
  }

  resolveSkin(skinId?: string, chromaId?: string): { name: string; icon: string | null } {
    const skin = skinId ? this.skinByKey.get(skinId.toLowerCase()) : undefined
    const chroma = chromaId ? this.chromaById.get(chromaId.toLowerCase()) : undefined
    return { name: skin?.name ?? 'Bilinmiyor', icon: chroma?.icon ?? skin?.icon ?? null }
  }

  resolveBuddy(buddyId?: string): { name: string; icon: string | null } | null {
    const b = buddyId ? this.buddyByLevel.get(buddyId.toLowerCase()) : undefined
    return b ? { name: b.name, icon: b.icon } : null
  }
}
