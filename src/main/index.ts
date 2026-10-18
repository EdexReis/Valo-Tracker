import path from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import type { AppStatus, InstalockSettings, TelegramInput, WindowAction } from '@shared/types'
import { IPC } from '@shared/ipc'
import { getLogHistory, log, logBus } from './logger'
import { AuthService } from './services/AuthService'
import { AssetCacheService } from './services/AssetCacheService'
import { SettingsService } from './services/SettingsService'
import { WebSocketService } from './services/WebSocketService'
import { PregameService } from './services/PregameService'
import { StorefrontService } from './services/StorefrontService'
import { MatchService } from './services/MatchService'
import { TiltGuardService } from './services/TiltGuardService'
import { TelegramService } from './services/TelegramService'
import { DiscordRPCService } from './services/DiscordRPCService'
import { startUpdater } from './services/UpdateService'
import { MmrService } from './services/MmrService'
import { CoreGameService } from './services/CoreGameService'

let win: BrowserWindow | null = null
const send = (channel: string, payload: unknown): void => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 980,
    minHeight: 620,
    frame: false,
    backgroundColor: '#0f1923',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function wire(): void {
  const auth = new AuthService()
  const assets = new AssetCacheService()
  const settings = new SettingsService()
  const ws = new WebSocketService(auth)
  const rpc = new DiscordRPCService()
  const title = (s: string): string =>
    s.toLocaleLowerCase('tr-TR').replace(/(^|\s)(\S)/g, (_m, sp: string, c: string) => sp + c.toLocaleUpperCase('tr-TR'))
  let matchStart: { id: string; ts: number } | null = null
  const mmr = new MmrService(auth, assets)
  const matches = new MatchService(auth, assets)
  const pregame = new PregameService(auth, assets, settings, matches, (w) => send(IPC.evDodge, w), (s) =>
    rpc.updatePresence({ details: `Ajan Seçimi: ${s.mapName}`, state: s.agentName ?? 'Ajan kilitleniyor...' })
  )
  const core = new CoreGameService(auth, assets, mmr, (m) => {
    send(IPC.evMatch, m)
    if (!m) return
    // Keep the start time stable across re-scans of the same match.
    if (matchStart?.id !== m.matchId) matchStart = { id: m.matchId, ts: Date.now() }
    const me = m.players.find((p) => p.isSelf)
    rpc.updatePresence({
      details: `Şu an ${m.mapName} oynuyor`,
      state: me ? `${me.agentName}${me.mmr ? ` (${title(me.mmr.currentTierName)})` : ''}` : 'Maçta',
      startTimestamp: matchStart.ts
    })
  })

  const storefront = new StorefrontService(auth, assets)
  const telegram = new TelegramService(settings)
  const tilt = new TiltGuardService(auth, mmr, (s) => send(IPC.evSession, s))
  const status = (): AppStatus => ({ connection: ws.connection, gameState: currentState, puuid: auth.puuid })
  let currentState: AppStatus['gameState'] = 'UNKNOWN'
  const pushStatus = (): void => send(IPC.evStatus, status())

  logBus.on('log', (e) => send(IPC.evLog, e))

  ws.on('connection', (c) => {
    if (c === 'connected') {
      void assets.load().catch(() => undefined)
      void tilt.init()
    }
    pushStatus()
  })
  ws.on('gameState', (s) => {
    const prev = currentState
    currentState = s
    if (s === 'MENUS' && (prev === 'PREGAME' || prev === 'INGAME')) tilt.onMatchEnd()
    pushStatus()
    if (s === 'PREGAME' && prev !== 'PREGAME') void telegram.notifyMatchFound()
    if (s === 'MENUS') rpc.updatePresence({ details: 'Lobide Bekliyor', state: 'Ana menüde' })
    else if (s === 'PREGAME') rpc.updatePresence({ details: 'Ajan Seçimi', state: 'Ajan kilitleniyor...' })
    else if (s === 'INGAME') rpc.updatePresence({ details: 'Maçta', state: 'Maç yükleniyor...' })
    else rpc.clear()
    if (s !== 'PREGAME') pregame.clearWarning()
    if (s === 'PREGAME') void pregame.handle()
    else if (s === 'INGAME') void core.scan()
    else if (s === 'MENUS' || s === 'UNKNOWN') core.clear()
  })
  ws.on('pregame', () => void pregame.handle())
  ws.on('coregame', () => void core.scan())

  ipcMain.handle(IPC.getStatus, status)
  ipcMain.handle(IPC.getAssets, async () => {
    await assets.load()
    return assets.getAssets()
  })
  ipcMain.handle(IPC.getSettings, () => settings.get())
  ipcMain.handle(IPC.saveSettings, (_e, s: InstalockSettings) => settings.save(s))
  ipcMain.handle(IPC.getMatch, () => core.current)
  ipcMain.handle(IPC.scanMatch, () => core.scan(true))
  ipcMain.handle(IPC.triggerPregame, () => pregame.handle(true))
  ipcMain.handle(IPC.getStorefront, () => storefront.get())
  ipcMain.handle(IPC.getMatchHistory, () => matches.getMatchHistory())
  ipcMain.handle(IPC.getTelegram, () => settings.getTelegramView())
  ipcMain.handle(IPC.saveTelegram, (_e, input: TelegramInput) => settings.saveTelegram(input))
  ipcMain.handle(IPC.testTelegram, (_e, input: TelegramInput) => telegram.test(input))
  ipcMain.handle(IPC.getDodgeWarning, () => pregame.warning)
  ipcMain.handle(IPC.getSessionRR, () => tilt.state)
  ipcMain.handle(IPC.getLogs, () => getLogHistory())
  ipcMain.on(IPC.windowAction, (_e, action: WindowAction) => {
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else win.close()
  })

  // Pre-warm asset cache (also serves the UI before Valorant is running).
  void assets.load().catch(() => undefined)
  ws.start()
  rpc.start()
  log('App', 'info', 'Valorant bekleniyor…')
  app.on('before-quit', () => {
    ws.stop()
    rpc.destroy()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore()
    win?.focus()
  })
  void app.whenReady().then(() => {
    wire()
    createWindow()
    startUpdater()
  })
  app.on('window-all-closed', () => app.quit())
}
