import { REGION } from '../constants'
import { log } from '../logger'
import type { CompWarning, DodgeWarning, RiskyPlayer } from '@shared/types'
import { HttpError, type AuthService } from './AuthService'
import type { MatchService } from './MatchService'
import type { AssetCacheService } from './AssetCacheService'
import type { SettingsService } from './SettingsService'

const MAX_ATTEMPTS = 3
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export class PregameService {
  private attempts = new Map<string, number>() // matchId -> attempts (>= MAX means done)
  private running = false

  constructor(
    private auth: AuthService,
    private assets: AssetCacheService,
    private settings: SettingsService,
    private matches: MatchService,
    private onDodge: (w: DodgeWarning | null) => void,
    private onStage: (s: { mapName: string; agentName: string | null }) => void,
    private onComp: (w: CompWarning | null) => void
  ) {}

  compWarning: CompWarning | null = null

  /**
   * Looks at the agents picked or hovered by the whole team. Re-evaluated on every pregame event;
   * "no controller" only fires once all five players have a pick, so early picks do not false-alarm.
   */
  private evaluateComp(players: Array<{ CharacterID?: string }>): void {
    const roles = players
      .filter((p) => p.CharacterID)
      .map((p) => (this.assets.agent(p.CharacterID!)?.role ?? '').toLowerCase())
    const messages: string[] = []
    if (roles.filter((r) => r === 'duelist').length >= 3) {
      messages.push('Takımda 3 veya daha fazla Düellocu var! Kazanma şansınız düşebilir.')
    }
    if (players.length > 0 && roles.length === players.length && !roles.includes('controller')) {
      messages.push('Takımda görüş engelleyici (Smoke) yok! Kazanma şansınız düşebilir.')
    }
    const next = messages.length ? { messages } : null
    if (JSON.stringify(next) === JSON.stringify(this.compWarning)) return
    this.compWarning = next
    this.onComp(next)
  }

  private scanned = new Set<string>()
  warning: DodgeWarning | null = null

  clearWarning(): void {
    if (this.compWarning) {
      this.compWarning = null
      this.onComp(null)
    }
    if (!this.warning) return
    this.warning = null
    this.onDodge(null)
  }

  /** Flags teammates who lost their last 3 ranked/unrated matches or average below 0.5 K/D. Runs once per match. */
  private async scanTeammates(matchId: string, players: Array<{ Subject: string; PlayerIdentity?: { Incognito?: boolean } }>): Promise<void> {
    if (this.scanned.has(matchId)) return
    this.scanned.add(matchId)
    const me = this.auth.puuid
    const mates = players.map((p) => p.Subject).filter((id) => id !== me)
    const risky: RiskyPlayer[] = []
    await Promise.all(
      mates.map(async (puuid) => {
        try {
          const recent = await this.matches.getMatchHistory(puuid, 3, ['competitive', 'unrated'])
          if (recent.length < 3) return
          const reasons: string[] = []
          if (recent.every((m) => m.result === 'loss')) reasons.push("Son 3 maçın 3'ünü kaybetti")
          const kills = recent.reduce((a, m) => a + m.kills, 0)
          const deaths = recent.reduce((a, m) => a + m.deaths, 0)
          const kd = kills / Math.max(1, deaths)
          if (kd < 0.5) reasons.push(`Son 3 maçta ort. K/D ${kd.toFixed(2)}`)
          if (reasons.length) risky.push({ puuid, reasons })
        } catch {
          /* history may be hidden or unavailable: do not flag */
        }
      })
    )
    if (risky.length) {
      const names = await this.auth
        .remote<Array<{ Subject: string; GameName: string; TagLine: string }>>(
          'PUT',
          `${REGION.pd}/name-service/v2/players`,
          risky.map((r) => r.puuid)
        )
        .catch(() => [])
      for (const r of risky) {
        const n = names.find((x) => x.Subject === r.puuid)
        // Streamer-mode players hide their identity on purpose: never reveal it.
        const hidden = players.find((x) => x.Subject === r.puuid)?.PlayerIdentity?.Incognito === true
        if (hidden) r.name = 'Gizli Oyuncu'
        else if (n?.GameName) r.name = `${n.GameName}#${n.TagLine}`
      }
    }
    this.warning = risky.length ? { matchId, players: risky } : null
    this.onDodge(this.warning)
    if (risky.length) log('Dodge', 'error', `${risky.length} riskli takım arkadaşı bulundu`)
  }

  /** Triggered by the pregame WebSocket event or manually. `manual` bypasses the "already handled" guard. */
  async handle(manual = false): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.run(manual)
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) {
        if (manual) log('Instalocker', 'info', 'Şu an ajan seçiminde değilsin')
      } else {
        log('Instalocker', 'error', `Hata: ${(e as Error).message}`)
      }
    } finally {
      this.running = false
    }
  }

  private async run(manual: boolean): Promise<void> {
    const cfg = { ...this.settings.get(), ...this.settings.getApp() }
    const puuid = this.auth.puuid
    if (!puuid) return

    const player = await this.auth.remote<{ MatchID: string }>('GET', `${REGION.glz}/pregame/v1/players/${puuid}`)
    const matchId = player.MatchID

    const match = await this.auth.remote<{
      MapID: string
      AllyTeam?: { Players: Array<{ Subject: string; CharacterID?: string; CharacterSelectionState: string; PlayerIdentity?: { Incognito?: boolean } }> }
    }>('GET', `${REGION.glz}/pregame/v1/matches/${matchId}`)

    // Teammate scan does not wait for, and does not delay, the lock below.
    if (cfg.dodgeAssistant) void this.scanTeammates(matchId, match.AllyTeam?.Players ?? [])

    await this.assets.load()
    const map = this.assets.mapByMapUrl(match.MapID)
    const me = match.AllyTeam?.Players.find((p) => p.Subject === puuid)
    const locked = me?.CharacterSelectionState === 'locked'
    this.onStage({
      mapName: map?.name ?? 'Bilinmeyen Harita',
      agentName: locked && me?.CharacterID ? (this.assets.agent(me.CharacterID)?.name ?? null) : null
    })

    this.evaluateComp(match.AllyTeam?.Players ?? [])

    if (!cfg.enabled && !manual) return
    if (!cfg.instalockRiskAck) return // the user has not accepted the ban-risk warning
    if (!manual && (this.attempts.get(matchId) ?? 0) >= MAX_ATTEMPTS) return
    if (locked) {
      this.attempts.set(matchId, MAX_ATTEMPTS)
      return
    }
    const agentId = (map && cfg.agentByMap[map.uuid]) || cfg.defaultAgent
    if (!agentId) {
      log('Instalocker', 'info', `${map?.name ?? 'Bu harita'} için ajan seçili değil`)
      this.attempts.set(matchId, MAX_ATTEMPTS)
      return
    }

    // Count the attempt up front so repeated socket events cannot re-fire the lock.
    this.attempts.set(matchId, (this.attempts.get(matchId) ?? 0) + 1)
    const agentName = this.assets.agent(agentId)?.name ?? agentId
    try {
      await this.auth.remote('POST', `${REGION.glz}/pregame/v1/matches/${matchId}/select/${agentId}`)
      await sleep(80)
      await this.auth.remote('POST', `${REGION.glz}/pregame/v1/matches/${matchId}/lock/${agentId}`)
      this.attempts.set(matchId, MAX_ATTEMPTS)
      log('Instalocker', 'success', `${map?.name ?? 'Harita'}: ${agentName} kilitlendi`)
      this.onStage({ mapName: map?.name ?? 'Bilinmeyen Harita', agentName })
      this.evaluateComp([...(match.AllyTeam?.Players ?? []).filter((x) => x.Subject !== puuid), { CharacterID: agentId }])
    } catch (e) {
      log('Instalocker', 'error', `${agentName} kilitlenemedi: ${(e as Error).message}`)
    }
  }
}
