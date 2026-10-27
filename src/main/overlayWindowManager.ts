import path from 'node:path'
import { BrowserWindow, globalShortcut, screen } from 'electron'
import type { OverlayCorner, OverlayMode } from '@shared/types'
import { log } from './logger'
import { tr } from '@shared/i18n'

const WIDTH = 340
/** Window height per content: player list, personal panel, both stacked. */
const HEIGHTS: Record<OverlayMode, number> = { players: 380, me: 220, both: 580 }
const MARGIN = 16
/**
 * globalShortcut only reports key-down, never key-up. While the keys stay held the OS auto-repeats
 * the shortcut, so each repeat extends the visibility; once repeats stop the overlay hides.
 * Must be longer than the system key-repeat delay (Windows default ~500 ms, max ~1 s).
 */
const HOLD_LINGER_MS = 1100

export class OverlayWindowManager {
  private win: BrowserWindow | null = null
  private hideTimer: NodeJS.Timeout | null = null
  private registered = false
  private shortcut = 'CommandOrControl+Tab'
  private enabled = true
  private gameActive = false
  private corner: OverlayCorner = 'tr'
  private opacity = 1
  private height = HEIGHTS.players

  /** Creates the always-hidden, click-through overlay window. */
  create(preloadPath: string): void {
    const win = new BrowserWindow({
      width: WIDTH,
      height: this.height,
      show: false,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      resizable: false,
      focusable: false, // never steal focus from the game
      hasShadow: false,
      webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    win.setAlwaysOnTop(true, 'screen-saver') // above borderless/fullscreen games
    win.setIgnoreMouseEvents(true) // clicks fall through to the game
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
    else void win.loadFile(path.join(__dirname, '../renderer/overlay.html'))
    this.win = win
  }

  send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  /** Applies user settings: on/off and the accelerator. */
  configure(enabled: boolean, shortcut: string, corner: OverlayCorner, opacity: number, mode: OverlayMode): void {
    this.enabled = enabled
    this.shortcut = shortcut
    this.corner = corner
    this.opacity = opacity
    this.height = HEIGHTS[mode] ?? HEIGHTS.players
    if (this.win && !this.win.isDestroyed()) this.win.setSize(WIDTH, this.height)
    this.unregister()
    this.refresh()
  }

  /**
   * The shortcut is only registered while a match is running, so it keeps working
   * in every other application the rest of the time.
   */
  setGameActive(active: boolean): void {
    this.gameActive = active
    this.refresh()
  }

  private unregister(): void {
    if (this.registered) globalShortcut.unregister(this.shortcut)
    this.registered = false
  }

  private refresh(): void {
    if (this.gameActive && this.enabled) {
      if (this.registered) return
      try {
        this.registered = globalShortcut.register(this.shortcut, () => this.onShortcut())
      } catch {
        this.registered = false
      }
      if (!this.registered) log('Overlay', 'error', tr('{shortcut} kısayolu kaydedilemedi (başka uygulama kullanıyor olabilir)', { shortcut: this.shortcut }))
    } else {
      this.unregister()
      this.hide()
    }
  }

  private onShortcut(): void {
    const win = this.win
    if (!win || win.isDestroyed()) return
    if (!win.isVisible()) {
      const { x, y, width, height } = screen.getPrimaryDisplay().bounds
      const left = this.corner.endsWith('l')
      const top = this.corner.startsWith('t')
      win.setPosition(left ? x + MARGIN : x + width - WIDTH - MARGIN, top ? y + MARGIN : y + height - this.height - MARGIN)
      win.setOpacity(this.opacity)
      win.showInactive()
    }
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => this.hide(), HOLD_LINGER_MS)
  }

  private hide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = null
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.win.hide()
  }

  destroy(): void {
    this.gameActive = false
    this.unregister()
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }
}
