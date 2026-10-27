import type { MatchPlayer, MatchSnapshot, WeaponLoadout } from '@shared/types'
import { REGION, SOCKETS, WEAPONS } from '../constants'
import { log } from '../logger'
import { HttpError, type AuthService } from './AuthService'
import type { AssetCacheService } from './AssetCacheService'
import type { MmrService } from './MmrService'
import type { PlayerStatsService } from './PlayerStatsService'
import { tr } from '@shared/i18n'

/* eslint-disable @typescript-eslint/no-explicit-any */
const SCAN_COOLDOWN_MS = 8000
const STATS_WORKERS = 3

/** Finds a crosshair share code anywhere in a loadout entry (the field name is not documented). */
function findCrosshair(node: any, depth = 0): string | null {
  if (!node || typeof node !== 'object' || depth > 4) return null
  for (const [k, v] of Object.entries(node)) {
    if (/crosshair|profilecode/i.test(k) && typeof v === 'string' && v.trim()) return v.trim()
    const nested = findCrosshair(v, depth + 1)
    if (nested) return nested
  }
  return null
}

export class CoreGameService {
  private last: MatchSnapshot | null = null
  private scanning: Promise<MatchSnapshot | null> | null = null
  private lastScanAt = 0
  private crosshairLogged = false

  constructor(
    private auth: AuthService,
    private assets: AssetCacheService,
    private mmr: MmrService,
    private onUpdate: (match: MatchSnapshot | null) => void,
    /** true while light mode is on: socket events then no longer trigger re-scans of a known match */
    private isLight: () => boolean = () => false,
    private playerStats: PlayerStatsService | null = null,
    /** the user opted in to loading other players' recent stats */
    private statsEnabled: () => boolean = () => false
  ) {}

  get current(): MatchSnapshot | null {
    return this.last
  }

  clear(): void {
    if (!this.last) return
    this.last = null
    this.onUpdate(null)
  }

  /** Socket events arrive in bursts: skip when a scan ran recently. Manual scans always run. */
  async scan(manual = false): Promise<MatchSnapshot | null> {
    if (this.scanning) return this.scanning
    if (!manual && this.last && this.isLight()) return this.last // loadouts do not change during a match
    if (!manual && this.last && Date.now() - this.lastScanAt < SCAN_COOLDOWN_MS) return this.last
    this.scanning = this.doScan(manual).finally(() => (this.scanning = null))
    return this.scanning
  }

  private async doScan(manual: boolean): Promise<MatchSnapshot | null> {
    const puuid = this.auth.puuid
    if (!puuid) return this.last
    try {
      await this.assets.load()
      const player = await this.auth.remote<{ MatchID: string }>('GET', `${REGION.glz}/core-game/v1/players/${puuid}`)
      const matchId = player.MatchID

      const [match, loadouts] = await Promise.all([
        this.auth.remote<{ MapID: string; Players: any[] }>('GET', `${REGION.glz}/core-game/v1/matches/${matchId}`),
        this.auth
          .remote<{ Loadouts: any[] }>('GET', `${REGION.glz}/core-game/v1/matches/${matchId}/loadouts`)
          .catch(() => ({ Loadouts: [] as any[] }))
      ])

      const puuids = match.Players.map((p) => p.Subject as string)
      const names = await this.auth
        .remote<Array<{ Subject: string; GameName: string; TagLine: string }>>('PUT', `${REGION.pd}/name-service/v2/players`, puuids)
        .catch(() => [])
      const nameById = new Map(names.map((n) => [n.Subject, n]))

      const mmrById = await this.mmr.getMany(puuids).catch(() => ({}) as Record<string, MatchPlayer['mmr'] & object>)

      const loadoutById = new Map<string, any>()
      for (const entry of loadouts.Loadouts ?? []) {
        const l = entry.Loadout ?? entry
        if (l?.Subject) loadoutById.set(l.Subject, entry)
      }

      const players: MatchPlayer[] = match.Players.map((p) => {
        const id = p.Subject as string
        const agent = this.assets.agent(p.CharacterID ?? '')
        const nm = nameById.get(id)
        return {
          puuid: id,
          // Players in streamer mode hide their identity on purpose: never reveal it.
          name: p.PlayerIdentity?.Incognito && id !== puuid ? tr('Gizli Oyuncu') : nm?.GameName || tr('Bilinmiyor'),
          tag: p.PlayerIdentity?.Incognito && id !== puuid ? '' : (nm?.TagLine ?? ''),
          teamId: p.TeamID ?? '',
          isSelf: id === puuid,
          isStreamerMode: p.PlayerIdentity?.Incognito === true,
          agentId: p.CharacterID ?? '',
          agentName: agent?.name ?? '?',
          agentIcon: agent?.icon ?? null,
          mmr: mmrById[id] ?? null,
          stats: this.statsFor(id, id === puuid, p.PlayerIdentity?.Incognito === true),
          crosshairCode: findCrosshair(loadoutById.get(id)),
          weapons: this.resolveWeapons(loadoutById.get(id)?.Loadout ?? loadoutById.get(id))
        }
      }).sort((a, b) => a.teamId.localeCompare(b.teamId))

      const map = this.assets.mapByMapUrl(match.MapID)
      const snapshot: MatchSnapshot = {
        matchId,
        mapName: map?.name ?? tr('Bilinmeyen Harita'),
        mapSplash: map?.splash ?? null,
        players,
        scannedAt: Date.now()
      }
      if (!this.crosshairLogged) {
        this.crosshairLogged = true
        const n = players.filter((p) => p.crosshairCode).length
        log('CoreGame', 'info', n ? tr('Nişangah kodu {n} oyuncuda bulundu', { n }) : tr('Loadout verisinde nişangah kodu yok (Riot bu alanı vermiyor olabilir)'))
      }
      this.last = snapshot
      this.lastScanAt = Date.now()
      this.onUpdate(snapshot)
      void this.fillStats(snapshot)
      log('CoreGame', 'success', tr('Maç tarandı: {map} ({n} oyuncu)', { map: snapshot.mapName, n: players.length }))
      return snapshot
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) {
        if (manual) log('CoreGame', 'info', tr('Şu an aktif bir maçta değilsin'))
        return this.last
      }
      log('CoreGame', 'error', tr('Tarama hatası: {msg}', { msg: (e as Error).message }))
      return this.last
    }
  }

  /** Applies a change of the stats setting to the match that is already on screen. */
  refreshStats(): void {
    const cur = this.last
    if (!cur) return
    const players = cur.players.map((p) => ({ ...p, stats: this.statsFor(p.puuid, p.isSelf, p.isStreamerMode) }))
    this.last = { ...cur, players }
    this.onUpdate(this.last)
    void this.fillStats(this.last)
  }

  /** null = not available, undefined = still to load. Players in streamer mode never get stats (except oneself). */
  private statsFor(puuid: string, isSelf: boolean, incognito: boolean): MatchPlayer['stats'] {
    if (!this.playerStats || !this.statsEnabled() || (incognito && !isSelf)) return null
    return this.playerStats.peek(puuid)
  }

  private async fillStats(snapshot: MatchSnapshot): Promise<void> {
    const svc = this.playerStats
    if (!svc || !this.statsEnabled()) return
    const queue = snapshot.players.filter((p) => p.stats === undefined).map((p) => p.puuid)
    const worker = async (): Promise<void> => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const stats = await svc.load(id)
        const cur = this.last
        if (!cur || cur.matchId !== snapshot.matchId || !this.statsEnabled()) return // match ended or setting turned off
        this.last = { ...cur, players: cur.players.map((p) => (p.puuid === id ? { ...p, stats } : p)) }
        this.onUpdate(this.last)
      }
    }
    await Promise.all(Array.from({ length: STATS_WORKERS }, worker))
  }

  private resolveWeapons(loadout: any): WeaponLoadout[] {
    const items = loadout?.Items ?? {}
    return WEAPONS.map((w) => {
      const sockets = items[w.id]?.Sockets ?? {}
      const skin = this.assets.resolveSkin(sockets[SOCKETS.skin]?.Item?.ID, sockets[SOCKETS.chroma]?.Item?.ID)
      const buddy = this.assets.resolveBuddy(sockets[SOCKETS.buddy]?.Item?.ID)
      return {
        weaponId: w.id,
        weaponName: w.name,
        skinName: skin.name,
        skinIcon: skin.icon,
        buddyName: buddy?.name ?? null,
        buddyIcon: buddy?.icon ?? null
      }
    })
  }
}
