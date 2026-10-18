import path from 'node:path'
import { BrowserWindow, globalShortcut, screen } from 'electron'
import { log } from './logger'

const WIDTH = 340
const HEIGHT = 560
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

  /** Creates the always-hidden, click-through overlay window. */
  create(preloadPath: string): void {
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
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
  configure(enabled: boolean, shortcut: string): void {
    this.enabled = enabled
    this.shortcut = shortcut
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
      if (!this.registered) log('Overlay', 'error', `${this.shortcut} kısayolu kaydedilemedi (başka uygulama kullanıyor olabilir)`)
    } else {
      this.unregister()
      this.hide()
    }
  }

  private onShortcut(): void {
    const win = this.win
    if (!win || win.isDestroyed()) return
    if (!win.isVisible()) {
      const { x, y, width } = screen.getPrimaryDisplay().bounds
      win.setPosition(x + width - WIDTH - MARGIN, y + MARGIN)
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
