import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import type {
  AppSettings,
  AppStatus,
  CoachMode,
  CoachResult,
  ExportResult,
  InstalockSettings,
  StatsPayload,
  TelegramInput,
  WindowAction
} from '@shared/types'
import { IPC } from '@shared/ipc'
import { REGION_OPTIONS, SHORTCUT_OPTIONS } from '@shared/options'
import { setRegion } from './constants'
import { getLogHistory, log, logBus } from './logger'
import { AuthService } from './services/AuthService'
import { AssetCacheService } from './services/AssetCacheService'
import { SettingsService } from './services/SettingsService'
import { WebSocketService } from './services/WebSocketService'
import { PregameService } from './services/PregameService'
import { StorefrontService } from './services/StorefrontService'
import { HistoryStore } from './services/HistoryStore'
import { MatchService } from './services/MatchService'
import { TiltGuardService } from './services/TiltGuardService'
import { TelegramService } from './services/TelegramService'
import { NotifyService } from './services/NotifyService'
import { WishlistService } from './services/WishlistService'
import { CrosshairService } from './services/CrosshairService'
import { StoreArchiveService } from './services/StoreArchiveService'
import { WeeklyReportService } from './services/WeeklyReportService'
import { SessionMonitorService } from './services/SessionMonitorService'
import { DiscordRPCService } from './services/DiscordRPCService'
import { OverlayWindowManager } from './overlayWindowManager'
import { LocalAICoachService } from './services/LocalAICoachService'
import { startUpdater } from './services/UpdateService'
import { MmrService } from './services/MmrService'
import { CoreGameService } from './services/CoreGameService'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let minimizeToTray = false

const iconPath = (): string => path.join(app.getAppPath(), 'resources/icon.png')
const send = (channel: string, payload: unknown): void => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function showWindow(): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 980,
    minHeight: 620,
    frame: false,
    backgroundColor: '#0f1923',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.on('close', (e) => {
    if (minimizeToTray && !quitting) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.on('closed', () => app.quit()) // the hidden overlay window must not keep the app alive
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }))
  tray.setToolTip('Valo Tracker')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Valo Tracker\'ı Aç', click: showWindow },
      { type: 'separator' },
      { label: 'Çıkış', click: () => app.quit() }
    ])
  )
  tray.on('click', showWindow)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function wire(): void {
  const auth = new AuthService()
  const assets = new AssetCacheService()
  const settings = new SettingsService()
  const history = new HistoryStore()
  const ws = new WebSocketService(auth)
  const overlay = new OverlayWindowManager()
  overlay.create(path.join(__dirname, '../preload/index.js'))
  const rpc = new DiscordRPCService()
  const title = (s: string): string =>
    s.toLocaleLowerCase('tr-TR').replace(/(^|\s)(\S)/g, (_m, sp: string, c: string) => sp + c.toLocaleUpperCase('tr-TR'))
  let matchStart: { id: string; ts: number } | null = null
  const mmr = new MmrService(auth, assets)
  const matches = new MatchService(auth, assets, history)
  const pregame = new PregameService(
    auth,
    assets,
    settings,
    matches,
    (w) => send(IPC.evDodge, w),
    (s) => {
      send(IPC.evStage, s)
      rpc.updatePresence({ details: `Ajan Seçimi: ${s.mapName}`, state: s.agentName ?? 'Ajan kilitleniyor...' })
    },
    (c) => send(IPC.evComp, c)
  )
  const core = new CoreGameService(auth, assets, mmr, (m) => {
    send(IPC.evMatch, m)
    overlay.send(IPC.evMatch, m)
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
  const notify = new NotifyService(settings, telegram)
  const wishlist = new WishlistService(assets, storefront, notify)
  const crosshairs = new CrosshairService()
  const archive = new StoreArchiveService(assets)
  storefront.onFetched = (d) => archive.record(auth.puuid, d)
  const coach = new LocalAICoachService()
  const tilt = new TiltGuardService(
    auth,
    mmr,
    (s) => send(IPC.evSession, s),
    (puuid, tier, rr) => history.addRR(puuid, tier, rr)
  )
  const monitor = new SessionMonitorService(auth, history, notify, settings, tilt)
  const weekly = new WeeklyReportService(auth, history, notify, settings)
  const status = (): AppStatus => ({ connection: ws.connection, gameState: currentState, puuid: auth.puuid })
  let currentState: AppStatus['gameState'] = 'UNKNOWN'
  const pushStatus = (): void => send(IPC.evStatus, status())

  // ---- Telegram commands (answered only for the saved chat)
  const stateLabel: Record<AppStatus['gameState'], string> = {
    MENUS: 'Lobide',
    PREGAME: 'Ajan seçiminde',
    INGAME: 'Maçta',
    UNKNOWN: 'Bilinmiyor'
  }
  const requireAccount = (): string => {
    if (!auth.puuid) throw new Error('Valorant kapalı')
    return auth.puuid
  }
  telegram.setHandlers({
    yardim: async () => 'Komutlar:\n/durum · /rank · /magaza · /son · /oturum · /hafta',
    durum: async () =>
      ws.connection === 'connected' ? `Durum: ${stateLabel[currentState]}\nOturum RR: ${tilt.state.ready ? tilt.state.delta : '—'}` : 'Valorant kapalı veya giriş yapılmamış.',
    rank: async () => {
      const id = requireAccount()
      const m = (await mmr.getMany([id]))[id]
      return `Rank: ${title(m.currentTierName)}${m.currentTier > 0 ? ` - ${m.currentRR} RR` : ''}\nTepe: ${title(m.peakTierName)}`
    },
    magaza: async () => {
      requireAccount()
      const s = await storefront.get()
      const line = (o: (typeof s.dailyOffers)[number]): string => {
        const price = o.discountedCost ?? o.cost
        return `• ${o.name}${price ? ` — ${price} VP` : ''}${o.discountPercent ? ` (-%${o.discountPercent})` : ''}`
      }
      const parts = ['🛒 Günlük mağaza', ...s.dailyOffers.map(line)]
      if (s.nightMarket) parts.push('', '🌙 Gece Pazarı', ...s.nightMarket.offers.map(line))
      return parts.join('\n')
    },
    son: async () => {
      const id = auth.puuid ?? history.lastPuuid
      const last = id ? history.matches(id)[0] : undefined
      if (!last) return 'Kayıtlı maç yok.'
      const res = { win: 'Galibiyet', loss: 'Mağlubiyet', draw: 'Berabere' }[last.result]
      return `Son maç: ${last.mapName} · ${last.agentName}\n${res} ${last.roundsWon}-${last.roundsLost} · ${last.kills}/${last.deaths}/${last.assists} · ACS ${last.acs}${
        last.vts ? `\nVTS ${last.vts.score} (${last.vts.grade})` : ''
      }${typeof last.rrChange === 'number' ? `\nRR: ${last.rrChange > 0 ? '+' : ''}${last.rrChange}` : ''}`
    },
    oturum: async () => `Oturum RR: ${tilt.state.ready ? tilt.state.delta : '—'}\nSüre: ${monitor.sessionHours().toFixed(1)} saat`,
    hafta: async () => weekly.report(false)
  })

  // ---- user settings -> runtime
  const sanitizeApp = (s: AppSettings): AppSettings => ({
    ...s,
    overlayShortcut: SHORTCUT_OPTIONS.some((o) => o.value === s.overlayShortcut) ? s.overlayShortcut : SHORTCUT_OPTIONS[0].value,
    region: REGION_OPTIONS.some((o) => o.value === s.region) ? s.region : 'eu',
    breakAfterHours: Math.min(12, Math.max(1, Math.round(Number(s.breakAfterHours) || 3)))
  })
  const applyApp = (cfg: AppSettings): void => {
    setRegion(cfg.region)
    minimizeToTray = cfg.minimizeToTray
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: cfg.startWithWindows })
    rpc.setEnabled(cfg.discordRpc)
    overlay.configure(cfg.overlayEnabled, cfg.overlayShortcut)
  }
  applyApp(settings.getApp())

  // ---- AI coach (manual and automatic)
  const runCoach = async (mode: CoachMode): Promise<CoachResult> => {
    try {
      if (mode === 'trend') {
        await matches.syncHistory().catch(() => 0)
        const trend = matches.getTrendData()
        if (!trend) return { ok: false, error: 'Trend analizi için yeterli Rekabetçi/Derecesiz maç kaydı yok.' }
        return await coach.getTrendCoaching(trend)
      }
      const data = await matches.getCoachData()
      if (!data) return { ok: false, error: 'Analiz edilecek maç bulunamadı.' }
      return await coach.getAICoaching(data)
    } catch (e) {
      return { ok: false, error: `Maç verisi alınamadı: ${(e as Error).message}` }
    }
  }

  /** After a match: wait for Riot to publish it, store it, then run reminders and the auto coach. */
  const afterMatch = async (attempt = 0): Promise<void> => {
    await sleep(attempt === 0 ? 15_000 : 30_000) // match details appear with a delay
    const added = await matches.syncHistory().catch(() => 0)
    if (!added && attempt < 2) return afterMatch(attempt + 1)
    if (!added) return
    await monitor.evaluate()
    if (settings.getApp().autoCoach) {
      const result = await runCoach('last')
      send(IPC.evCoach, { mode: 'last', result })
      if (result.ok) await notify.push('🤖 AI Koç analizin hazır', 'Koç sekmesinden oku.')
    }
  }

  logBus.on('log', (e) => send(IPC.evLog, e))

  ws.on('connection', (c) => {
    if (c === 'connected') {
      void assets.load().catch(() => undefined)
      if (auth.puuid) history.setLast(auth.puuid)
      monitor.markStart()
      void tilt.init()
      void matches.syncHistory().catch(() => 0)
      void wishlist.checkAndNotify().catch(() => undefined)
    }
    pushStatus()
  })
  ws.on('gameState', (s) => {
    const prev = currentState
    currentState = s
    if (s === 'MENUS' && (prev === 'PREGAME' || prev === 'INGAME')) {
      void tilt.refreshAfterMatch()
      void afterMatch()
    }
    pushStatus()
    if (s === 'PREGAME' && prev !== 'PREGAME') void telegram.notifyMatchFound()
    if (s === 'MENUS') rpc.updatePresence({ details: 'Lobide Bekliyor', state: 'Ana menüde' })
    else if (s === 'PREGAME') rpc.updatePresence({ details: 'Ajan Seçimi', state: 'Ajan kilitleniyor...' })
    else if (s === 'INGAME') rpc.updatePresence({ details: 'Maçta', state: 'Maç yükleniyor...' })
    else rpc.clear()
    overlay.setGameActive(s === 'INGAME')
    if (s !== 'PREGAME') pregame.clearWarning()
    if (s === 'PREGAME') void pregame.handle()
    else if (s === 'INGAME') void core.scan()
    else if (s === 'MENUS' || s === 'UNKNOWN') core.clear()
  })
  ws.on('pregame', () => void pregame.handle())
  ws.on('coregame', () => void core.scan())

  const account = (): string | null => auth.puuid ?? history.lastPuuid

  ipcMain.handle(IPC.getStatus, status)
  ipcMain.handle(IPC.getAssets, async () => {
    await assets.load()
    return assets.getAssets()
  })
  ipcMain.handle(IPC.getSettings, () => settings.get())
  ipcMain.handle(IPC.saveSettings, (_e, s: InstalockSettings) => settings.save(s))
  ipcMain.handle(IPC.getAppSettings, () => settings.getApp())
  ipcMain.handle(IPC.saveAppSettings, (_e, s: AppSettings) => {
    const saved = settings.saveApp(sanitizeApp(s))
    applyApp(saved)
    telegram.refreshListener()
    return saved
  })
  ipcMain.handle(IPC.getMatch, () => core.current)
  ipcMain.handle(IPC.scanMatch, () => core.scan(true))
  ipcMain.handle(IPC.triggerPregame, () => pregame.handle(true))
  ipcMain.handle(IPC.getStorefront, () => storefront.get())
  ipcMain.handle(IPC.getCollection, () => storefront.getCollection())
  ipcMain.handle(IPC.getWishlist, async () => {
    await assets.load().catch(() => undefined)
    return wishlist.list()
  })
  ipcMain.handle(IPC.searchSkins, async (_e, q: string) => {
    await assets.load().catch(() => undefined)
    return assets.searchSkins(String(q))
  })
  ipcMain.handle(IPC.addWish, (_e, uuid: string) => wishlist.add(String(uuid)))
  ipcMain.handle(IPC.removeWish, (_e, uuid: string) => wishlist.remove(String(uuid)))
  ipcMain.handle(IPC.checkWishlist, () => wishlist.check())
  ipcMain.handle(IPC.getOwnHistory, () => matches.getOwnHistory())
  ipcMain.handle(IPC.getStats, (): StatsPayload => {
    const id = account()
    return id ? { matches: history.matches(id), rr: history.rr(id) } : { matches: [], rr: [] }
  })
  ipcMain.handle(IPC.exportHistory, async (_e, format: 'csv' | 'json'): Promise<ExportResult> => {
    const id = account()
    if (!id) return { ok: false, error: 'Dışa aktarılacak veri yok.' }
    const stamp = new Date().toISOString().slice(0, 10)
    const pick = await dialog.showSaveDialog(win!, {
      defaultPath: `valo-tracker-${stamp}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    })
    if (pick.canceled || !pick.filePath) return { ok: false, error: 'İptal edildi.' }
    try {
      const body = format === 'csv' ? '﻿' + history.toCsv(id) : JSON.stringify({ matches: history.matches(id), rr: history.rr(id) }, null, 2)
      await writeFile(pick.filePath, body, 'utf8')
      return { ok: true, path: pick.filePath }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
  ipcMain.handle(IPC.getSeasonHistory, () => mmr.getSeasonHistory(requireAccount()))
  ipcMain.handle(IPC.getStoreArchive, () => archive.list(account()))
  ipcMain.handle(IPC.getMatchDetail, (_e, id: string) => matches.getMatchDetail(String(id)))
  ipcMain.handle(IPC.getWeeklyReport, (_e, send: boolean) => weekly.report(!!send))
  ipcMain.handle(IPC.getTelegram, () => settings.getTelegramView())
  ipcMain.handle(IPC.saveTelegram, (_e, input: TelegramInput) => {
    const view = settings.saveTelegram(input)
    telegram.refreshListener()
    return view
  })
  ipcMain.handle(IPC.testTelegram, (_e, input: TelegramInput) => telegram.test(input))
  ipcMain.handle(IPC.getAICoaching, (_e, mode: CoachMode) => runCoach(mode === 'trend' ? 'trend' : 'last'))
  ipcMain.handle(IPC.getCompWarning, () => pregame.compWarning)
  ipcMain.handle(IPC.getDodgeWarning, () => pregame.warning)
  ipcMain.handle(IPC.getCrosshairs, () => crosshairs.list())
  ipcMain.handle(IPC.addCrosshair, (_e, input: { name: string; code: string }) => crosshairs.add(input))
  ipcMain.handle(IPC.removeCrosshair, (_e, id: string) => crosshairs.remove(String(id)))
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
  monitor.start()
  weekly.start()
  telegram.refreshListener()
  // Store rotates daily: re-check the wishlist twice an hour while connected.
  setInterval(() => {
    if (ws.connection === 'connected') void wishlist.checkAndNotify().catch(() => undefined)
  }, 30 * 60 * 1000)
  log('App', 'info', 'Valorant bekleniyor…')
  app.on('before-quit', () => {
    quitting = true
    ws.stop()
    monitor.stop()
    weekly.stop()
    telegram.stop()
    rpc.destroy()
    overlay.destroy()
    globalShortcut.unregisterAll()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  void app.whenReady().then(() => {
    wire()
    createWindow()
    createTray()
    startUpdater()
  })
  app.on('window-all-closed', () => app.quit())
}
