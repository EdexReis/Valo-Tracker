import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import type { Connection, GameState } from '@shared/types'
import { POLL_LOCKFILE_MS } from '../constants'
import { log } from '../logger'
import type { AuthService } from './AuthService'

interface Events {
  connection: [Connection]
  gameState: [GameState]
  pregame: []
  coregame: []
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export class WebSocketService extends EventEmitter {
  private ws: WebSocket | null = null
  private timer: NodeJS.Timeout | null = null
  private busy = false
  private lastState: GameState = 'UNKNOWN'
  connection: Connection = 'waiting'

  constructor(private auth: AuthService) {
    super()
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): boolean {
    return super.emit(event, ...args)
  }
  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): this {
    return super.on(event, listener as (...a: any[]) => void)
  }

  /** Watcher: checks for the Riot lockfile every 3s while not connected. */
  start(): void {
    if (this.timer) return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), POLL_LOCKFILE_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.ws?.terminate()
  }

  private setConnection(c: Connection): void {
    if (this.connection === c) return
    this.connection = c
    this.emit('connection', c)
  }

  private setGameState(s: GameState): void {
    if (this.lastState === s) return
    this.lastState = s
    this.emit('gameState', s)
  }

  private async tick(): Promise<void> {
    if (this.busy || this.ws) return
    const lock = this.auth.readLockfile()
    if (!lock) {
      this.setConnection('waiting')
      return
    }
    this.busy = true
    try {
      this.setConnection('connecting')
      if (!(await this.auth.refreshTokens())) {
        // Client is up but the user has not logged in yet.
        return
      }
      this.connect()
    } finally {
      this.busy = false
      if (!this.ws) this.setConnection(this.auth.readLockfile() ? 'connecting' : 'waiting')
    }
  }

  private connect(): void {
    const lock = this.auth.lockfile
    if (!lock) return
    const ws = new WebSocket(`wss://riot:${lock.password}@127.0.0.1:${lock.port}`, { rejectUnauthorized: false })
    this.ws = ws

    ws.on('open', () => {
      ws.send(JSON.stringify([5, 'OnJsonApiEvent']))
      this.setConnection('connected')
      log('WebSocket', 'success', 'Riot Client\'a bağlanıldı')
      void this.fetchInitialState()
    })

    ws.on('message', (data) => this.onMessage(data.toString()))

    const teardown = (): void => {
      if (this.ws !== ws) return
      this.ws = null
      this.auth.clear()
      this.lastState = 'UNKNOWN'
      this.setGameState('UNKNOWN')
      this.setConnection('waiting')
      log('WebSocket', 'info', 'Bağlantı kapandı, oyun bekleniyor…')
    }
    ws.on('close', teardown)
    ws.on('error', () => {
      ws.terminate()
      teardown()
    })
  }

  private onMessage(raw: string): void {
    if (!raw) return
    let msg: any
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    const payload = Array.isArray(msg) ? msg[2] : null
    const uri: string | undefined = payload?.uri
    if (!uri) return

    if (uri.includes('/ares-pregame/pregame/v1/')) {
      this.setGameState('PREGAME')
      this.emit('pregame')
    } else if (uri.includes('/ares-core-game/core-game/v1/')) {
      this.setGameState('INGAME')
      this.emit('coregame')
    } else if (uri.includes('/chat/v4/presences')) {
      this.handlePresences(payload.data)
    }
  }

  private handlePresences(data: any): void {
    const list = data?.presences
    if (!Array.isArray(list)) return
    const mine = list.find((p: any) => p.puuid === this.auth.puuid)
    if (!mine?.private) return
    try {
      const priv = JSON.parse(Buffer.from(mine.private, 'base64').toString('utf8'))
      const state = priv.sessionLoopState ?? priv.matchPresenceData?.sessionLoopState
      if (state === 'MENUS' || state === 'PREGAME' || state === 'INGAME') this.setGameState(state)
    } catch {
      /* ignore malformed presence */
    }
  }

  private async fetchInitialState(): Promise<void> {
    try {
      const { status, body } = await this.auth.localGet('/chat/v4/presences')
      if (status === 200) this.handlePresences(JSON.parse(body))
    } catch {
      /* the next presence event will fill it in */
    }
  }
}
