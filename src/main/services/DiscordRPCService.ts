import RPC from 'discord-rpc'
import { log } from '../logger'

const CLIENT_ID = '1561313318864560229'
const RECONNECT_MS = 10_000
const MIN_UPDATE_GAP_MS = 2_000 // Discord rate-limits activity updates

export interface PresenceInput {
  details?: string
  state?: string
  startTimestamp?: number
  largeImageKey?: string
  largeImageText?: string
}

/** Discord Rich Presence. Silently retries while Discord is not running and never throws. */
export class DiscordRPCService {
  private client: RPC.Client | null = null
  private ready = false
  private connecting = false
  private timer: NodeJS.Timeout | null = null
  private pending: PresenceInput | null = null
  private lastSent = ''
  private lastSentAt = 0
  private flushTimer: NodeJS.Timeout | null = null
  private destroyed = false
  private loggedConnected = false
  private enabled = true

  start(): void {
    if (this.timer || this.destroyed) return
    void this.connect()
    this.timer = setInterval(() => void this.connect(), RECONNECT_MS)
  }

  private async connect(): Promise<void> {
    if (this.ready || this.connecting || this.destroyed) return
    this.connecting = true
    const client = new RPC.Client({ transport: 'ipc' })
    client.on('ready', () => {
      this.client = client
      this.ready = true
      if (!this.loggedConnected) log('Discord', 'success', 'Discord Rich Presence bağlandı')
      this.loggedConnected = true
      this.lastSent = ''
      this.flush()
    })
    client.on('disconnected', () => this.onLost(client))
    try {
      await client.login({ clientId: CLIENT_ID })
    } catch {
      // Discord is not running (or refused): try again on the next tick.
      this.discard(client)
    } finally {
      this.connecting = false
    }
  }

  private onLost(client: RPC.Client): void {
    if (this.client === client) {
      this.client = null
      this.ready = false
      this.loggedConnected = false
    }
    this.discard(client)
  }

  private discard(client: RPC.Client): void {
    try {
      void client.destroy().catch(() => undefined)
    } catch {
      /* already closed */
    }
  }

  /** Turns Rich Presence on or off without dropping the Discord connection. */
  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) {
      if (this.flushTimer) clearTimeout(this.flushTimer)
      this.flushTimer = null
      this.lastSent = ''
      if (this.ready && this.client) void this.client.clearActivity().catch(() => undefined)
    } else {
      this.flush()
    }
  }

  /** Sets the activity. Keeps the latest value and applies it once Discord is connected. */
  updatePresence(p: PresenceInput): void {
    this.pending = { largeImageKey: 'valorant', largeImageText: 'Valo Tracker', ...p }
    this.flush()
  }

  private flush(): void {
    if (!this.enabled || !this.ready || !this.client || !this.pending) return
    const key = JSON.stringify(this.pending)
    if (key === this.lastSent) return

    const wait = this.lastSentAt + MIN_UPDATE_GAP_MS - Date.now()
    if (wait > 0) {
      this.flushTimer ??= setTimeout(() => {
        this.flushTimer = null
        this.flush()
      }, wait)
      return
    }
    this.lastSent = key
    this.lastSentAt = Date.now()
    this.client.setActivity(this.pending).catch(() => {
      this.lastSent = '' // retry on next update
    })
  }

  /** Removes the activity from the Discord profile (e.g. Valorant closed). */
  clear(): void {
    this.pending = null
    this.lastSent = ''
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    if (this.ready && this.client) void this.client.clearActivity().catch(() => undefined)
  }

  destroy(): void {
    this.destroyed = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.clear()
    if (this.client) this.discard(this.client)
    this.client = null
    this.ready = false
  }
}
