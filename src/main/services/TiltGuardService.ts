import type { SessionRR } from '@shared/types'
import { log } from '../logger'
import type { AuthService } from './AuthService'
import type { MmrService } from './MmrService'

const RECHECK_DELAY_MS = 5000

/** Tier-aware rating so rank-ups/downs do not break the delta (each tier spans 100 RR). */
const absoluteRR = (tier: number, rr: number): number => (tier > 0 ? tier * 100 + rr : 0)

export class TiltGuardService {
  private puuid: string | null = null
  private baseline: number | null = null
  private current = 0
  private checking = false

  constructor(
    private auth: AuthService,
    private mmr: MmrService,
    private onUpdate: (s: SessionRR) => void
  ) {}

  get state(): SessionRR {
    return {
      ready: this.baseline !== null,
      delta: this.baseline === null ? 0 : this.current - this.baseline,
      initialRR: this.baseline ?? 0,
      currentRR: this.current
    }
  }

  private async fetchRating(): Promise<{ puuid: string; value: number } | null> {
    const puuid = this.auth.puuid
    if (!puuid) return null
    const m = (await this.mmr.getMany([puuid]))[puuid]
    return m ? { puuid, value: absoluteRR(m.currentTier, m.currentRR) } : null
  }

  /** Captures the starting RR once per app session (and again if the account changes). */
  async init(): Promise<void> {
    if (this.checking) return
    this.checking = true
    try {
      const r = await this.fetchRating()
      if (!r || (this.baseline !== null && r.puuid === this.puuid)) return
      this.puuid = r.puuid
      this.baseline = this.current = r.value
      log('TiltGuard', 'info', 'Oturum RR takibi başladı')
      this.onUpdate(this.state)
    } catch {
      /* retried on the next connection */
    } finally {
      this.checking = false
    }
  }

  /** Called when the player returns to MENUS after a match. */
  onMatchEnd(): void {
    setTimeout(() => void this.refresh(), RECHECK_DELAY_MS) // MMR updates a moment after the match ends
  }

  private async refresh(): Promise<void> {
    if (this.baseline === null) return void this.init()
    if (this.checking) return
    this.checking = true
    try {
      const r = await this.fetchRating()
      if (!r || r.puuid !== this.puuid) return
      this.current = r.value
      const d = this.state.delta
      log('TiltGuard', d <= -50 ? 'error' : 'info', `Oturum RR: ${d > 0 ? '+' : ''}${d}`)
      this.onUpdate(this.state)
    } catch (e) {
      log('TiltGuard', 'error', `RR alınamadı: ${(e as Error).message}`)
    } finally {
      this.checking = false
    }
  }
}
