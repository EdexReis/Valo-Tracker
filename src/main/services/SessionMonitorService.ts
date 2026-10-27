import { isRankedLike, losingStreak } from '@shared/stats'
import { log } from '../logger'
import type { AuthService } from './AuthService'
import type { HistoryStore } from './HistoryStore'
import type { NotifyService } from './NotifyService'
import type { SettingsService } from './SettingsService'
import type { TiltGuardService } from './TiltGuardService'
import { tr } from '@shared/i18n'

const CHECK_INTERVAL_MS = 10 * 60 * 1000

/** Break reminders: losing streak, big RR loss and long sessions. Each condition fires once. */
export class SessionMonitorService {
  private startedAt = Date.now()
  private sent = new Set<string>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private auth: AuthService,
    private history: HistoryStore,
    private notify: NotifyService,
    private settings: SettingsService,
    private tilt: TiltGuardService
  ) {}

  private started = false

  /** The session begins at the first Riot Client connection. */
  markStart(): void {
    if (this.started) return
    this.started = true
    this.startedAt = Date.now()
  }

  sessionHours(): number {
    return (Date.now() - this.startedAt) / 3_600_000
  }

  start(): void {
    this.timer ??= setInterval(() => void this.evaluate(), CHECK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Call after a finished match has been synced into the history. */
  /** While it returns true (a match is running) no reminder is sent. */
  gate: (() => boolean) | null = null

  async evaluate(): Promise<void> {
    if (this.gate?.()) return
    const cfg = this.settings.getApp()
    const puuid = this.auth.puuid
    if (!cfg.breakReminders || !puuid) return

    const session = this.history
      .matches(puuid)
      .filter((m) => isRankedLike(m) && m.startMillis >= this.startedAt - 30 * 60 * 1000)
    const streak = losingStreak(session)
    if (streak >= 3) await this.once(`streak:${session[0]?.matchId}`, tr('🛑 Mola zamanı'), tr('Üst üste {n} maç kaybettin. Biraz ara ver, tilt olmadan dön.', { n: streak }))

    const delta = this.tilt.state.delta
    if (this.tilt.state.ready && delta <= -50) {
      await this.once(`rr:${Math.floor(delta / 50)}`, '⚠️ Tilt Guard', tr('Bu oturumda {delta} RR kaybettin. Durup bir mola vermeni öneririm.', { delta }))
    }

    const hours = (Date.now() - this.startedAt) / 3_600_000
    if (hours >= cfg.breakAfterHours) {
      const block = Math.floor(hours / cfg.breakAfterHours)
      await this.once(`time:${block}`, tr('⏱️ Uzun oturum'), tr('{h} saattir oynuyorsun. Su iç, gözlerini dinlendir.', { h: Math.floor(hours) }))
    }
  }

  private async once(key: string, title: string, body: string): Promise<void> {
    if (this.sent.has(key)) return
    this.sent.add(key)
    log(tr('Mola'), 'info', `${title}: ${body}`)
    await this.notify.push(title, body)
  }
}
