import { tr } from '@shared/i18n'

export interface LightModeDeps {
  /** process ids of the app (main, GPU, renderers) */
  pids: () => number[]
  setPriority: (pid: number, level: 'low' | 'normal') => void
  /** tells the windows to drop animations while the game runs */
  broadcast: (on: boolean) => void
  log: (message: string) => void
}

/**
 * In-game light mode. While a match runs the app lowers the priority of all its processes so the
 * game always wins the CPU, freezes UI animations, and other services check `active` to hold back
 * optional background work (store checks, reports, break reminders) until the match is over.
 */
export class LightModeService {
  private enabled = true
  private on = false

  constructor(private deps: LightModeDeps) {}

  get active(): boolean {
    return this.on
  }

  configure(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled && this.on) this.exit()
  }

  enter(): void {
    if (!this.enabled || this.on) return
    this.on = true
    this.apply('low')
    this.deps.broadcast(true)
    this.deps.log(tr('Hafiflik modu açık: arka plan işleri kısıldı'))
  }

  exit(): void {
    if (!this.on) return
    this.on = false
    this.apply('normal')
    this.deps.broadcast(false)
    this.deps.log(tr('Hafiflik modu kapandı'))
  }

  private apply(level: 'low' | 'normal'): void {
    for (const pid of this.deps.pids()) {
      try {
        this.deps.setPriority(pid, level)
      } catch {
        /* the process ended or may not be adjusted: not worth failing over */
      }
    }
  }
}
