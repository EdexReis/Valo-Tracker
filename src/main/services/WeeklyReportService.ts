import { buildWeeklyReport, isoWeekKey } from '@shared/stats'
import { log } from '../logger'
import type { AuthService } from './AuthService'
import type { HistoryStore } from './HistoryStore'
import type { NotifyService } from './NotifyService'
import type { SettingsService } from './SettingsService'

const CHECK_INTERVAL_MS = 30 * 60 * 1000
const SEND_AFTER_HOUR = 20 // Sunday 20:00 local time

export class WeeklyReportService {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private auth: AuthService,
    private history: HistoryStore,
    private notify: NotifyService,
    private settings: SettingsService
  ) {}

  /** Report text for the stored history; with send=true it is also pushed to notifications. */
  async report(send: boolean): Promise<string> {
    const id = this.auth.puuid ?? this.history.lastPuuid
    const text = id ? buildWeeklyReport(this.history.matches(id)) : 'Rapor için kayıtlı maç yok.'
    if (send) await this.notify.push('Valo Tracker', text)
    return text
  }

  start(): void {
    this.timer ??= setInterval(() => void this.tick(), CHECK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    if (!this.settings.getApp().weeklyReport) return
    const now = new Date()
    if (now.getDay() !== 0 || now.getHours() < SEND_AFTER_HOUR) return
    const week = isoWeekKey(now)
    if (this.history.reportWeek === week) return
    this.history.setReportWeek(week)
    log('Rapor', 'info', 'Haftalık rapor gönderiliyor')
    await this.report(true)
  }
}
