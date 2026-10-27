import os from 'node:os'
import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import type {
  AiTestResult,
  AppSettings,
  BackupResult,
  AppStatus,
  CoachMode,
  CoachResult,
  CoPlayerRow,
  ExportResult,
  InstalockSettings,
  TimelineExportOptions,
  TimelineFormat,
  OverlayMeStats,
  StatsPayload,
  TelegramInput,
  WindowAction
} from '@shared/types'
import { IPC } from '@shared/ipc'
import { REGION_OPTIONS, SHORTCUT_OPTIONS } from '@shared/options'
import { buildOverlayMe, coPlayerStats, isRankedLike } from '@shared/stats'
import { buildMarkers, markersToChapters, markersToCsv } from '@shared/timeline'
import { setRegion } from './constants'
import { getLogHistory, log, logBus } from './logger'
import { AuthService } from './services/AuthService'
import { AssetCacheService } from './services/AssetCacheService'
import { APP_DEFAULTS, SettingsService } from './services/SettingsService'
import { WebSocketService } from './services/WebSocketService'
import { PregameService } from './services/PregameService'
import { StorefrontService } from './services/StorefrontService'
import { HistoryStore } from './services/HistoryStore'
import { MatchService } from './services/MatchService'
import { TiltGuardService } from './services/TiltGuardService'
import { TelegramService } from './services/TelegramService'
import { DiscordWebhookService } from './services/DiscordWebhookService'
import { NotifyService } from './services/NotifyService'
import { WishlistService } from './services/WishlistService'
import { CrosshairService } from './services/CrosshairService'
import { StoreArchiveService } from './services/StoreArchiveService'
import { WeeklyReportService } from './services/WeeklyReportService'
import { SessionMonitorService } from './services/SessionMonitorService'
import { LightModeService } from './services/LightModeService'
import { MusicControlService } from './services/MusicControlService'
import { DiscordRPCService } from './services/DiscordRPCService'
import { OverlayWindowManager } from './overlayWindowManager'
import { LocalAICoachService } from './services/LocalAICoachService'
import { startUpdater } from './services/UpdateService'
import { MmrService } from './services/MmrService'
import { CoreGameService } from './services/CoreGameService'
import { PlayerStatsService } from './services/PlayerStatsService'
import { getLanguage, locale, setLanguage, tr } from '@shared/i18n'

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
      { label: tr('Valo Tracker\'ı Aç'), click: showWindow },
      { type: 'separator' },
      { label: tr('Çıkış'), click: () => app.quit() }
    ])
  )
  tray.on('click', showWindow)
}

/** The AI endpoint must stay on this machine, so match data never leaves it. */
function safeAiUrl(u: string): string {
  try {
    const url = new URL(u)
    if (/^https?:$/.test(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return u.replace(/\/+$/, '')
  } catch {
    /* fall through */
  }
  return APP_DEFAULTS.aiUrl
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
  const music = new MusicControlService()
  const light = new LightModeService({
    pids: () => app.getAppMetrics().map((m) => m.pid),
    setPriority: (pid, level) => os.setPriority(pid, level === 'low' ? os.constants.priority.PRIORITY_BELOW_NORMAL : os.constants.priority.PRIORITY_NORMAL),
    broadcast: (on) => {
      send(IPC.evLight, on)
      overlay.send(IPC.evLight, on)
    },
    log: (message) => log('App', 'info', message)
  })
  const title = (s: string): string =>
    s.toLocaleLowerCase(locale()).replace(/(^|\s)(\S)/g, (_m, sp: string, c: string) => sp + c.toLocaleUpperCase(locale()))
  let matchStart: { id: string; ts: number } | null = null
  const mmr = new MmrService(auth, assets)
  const matches = new MatchService(auth, assets, history)
  const playerStats = new PlayerStatsService(matches)
  const pregame = new PregameService(
    auth,
    assets,
    settings,
    matches,
    (w) => send(IPC.evDodge, w),
    (s) => {
      send(IPC.evStage, s)
      rpc.updatePresence({ details: tr('Ajan Seçimi: {map}', { map: s.mapName }), state: s.agentName ?? tr('Ajan kilitleniyor...') })
    },
    (c) => send(IPC.evComp, c)
  )
  const core = new CoreGameService(auth, assets, mmr, (m) => {
    send(IPC.evMatch, m)
    overlay.send(IPC.evMatch, m)
    if (!m) return
    // Remember teammates for the "played together" stats. Players in streamer mode are never recorded.
    const self = m.players.find((p) => p.isSelf)
    if (self && auth.puuid) {
      history.recordMates(
        auth.puuid,
        m.matchId,
        m.players.filter((p) => !p.isSelf && p.teamId === self.teamId && !p.isStreamerMode).map((p) => p.puuid)
      )
    }
    // Keep the start time stable across re-scans of the same match.
    if (matchStart?.id !== m.matchId) matchStart = { id: m.matchId, ts: Date.now() }
    const me = m.players.find((p) => p.isSelf)
    rpc.updatePresence({
      details: tr('Şu an {map} oynuyor', { map: m.mapName }),
      state: me ? `${me.agentName}${me.mmr ? ` (${title(me.mmr.currentTierName)})` : ''}` : tr('Maçta'),
      startTimestamp: matchStart.ts
    })
  }, () => light.active, playerStats, () => settings.getApp().playerStats)

  const storefront = new StorefrontService(auth, assets)
  const telegram = new TelegramService(settings)
  const notify = new NotifyService(settings, telegram)
  const webhook = new DiscordWebhookService(settings)
  const wishlist = new WishlistService(assets, storefront, notify)
  const crosshairs = new CrosshairService()
  const archive = new StoreArchiveService(assets)
  storefront.onFetched = (d) => archive.record(auth.puuid, d)
  const coach = new LocalAICoachService(() => ({ url: settings.getApp().aiUrl, model: settings.getApp().aiModel }))
  const tilt = new TiltGuardService(
    auth,
    mmr,
    (s) => send(IPC.evSession, s),
    (puuid, tier, rr) => history.addRR(puuid, tier, rr)
  )
  const monitor = new SessionMonitorService(auth, history, notify, settings, tilt)
  monitor.gate = () => light.active
  const weekly = new WeeklyReportService(auth, history, notify, settings)
  weekly.gate = () => light.active
  const status = (): AppStatus => ({ connection: ws.connection, gameState: currentState, puuid: auth.puuid })
  let currentState: AppStatus['gameState'] = 'UNKNOWN'
  const pushStatus = (): void => send(IPC.evStatus, status())

  // ---- Telegram commands (answered only for the saved chat)
  const stateLabel = (): Record<AppStatus['gameState'], string> => ({
    MENUS: tr('Lobide'),
    PREGAME: tr('Ajan seçiminde'),
    INGAME: tr('Maçta'),
    UNKNOWN: tr('Bilinmiyor')
  })
  const requireAccount = (): string => {
    if (!auth.puuid) throw new Error(tr('Valorant kapalı'))
    return auth.puuid
  }
  const commands = {
    help: async () => tr('Komutlar:\n/durum · /rank · /magaza · /son · /oturum · /hafta'),
    status: async () =>
      ws.connection === 'connected'
        ? tr('Durum: {state}\nOturum RR: {rr}', { state: stateLabel()[currentState], rr: tilt.state.ready ? tilt.state.delta : '—' })
        : tr('Valorant kapalı veya giriş yapılmamış.'),
    rank: async () => {
      const id = requireAccount()
      const m = (await mmr.getMany([id]))[id]
      return tr('Rank: {rank}\nTepe: {peak}', {
        rank: `${title(m.currentTierName)}${m.currentTier > 0 ? ` - ${m.currentRR} RR` : ''}`,
        peak: title(m.peakTierName)
      })
    },
    store: async () => {
      requireAccount()
      const s = await storefront.get()
      const line = (o: (typeof s.dailyOffers)[number]): string => {
        const price = o.discountedCost ?? o.cost
        return `• ${o.name}${price ? ` — ${price} VP` : ''}${o.discountPercent ? ` (-%${o.discountPercent})` : ''}`
      }
      const parts = [tr('🛒 Günlük mağaza'), ...s.dailyOffers.map(line)]
      if (s.nightMarket) parts.push('', tr('🌙 Gece Pazarı'), ...s.nightMarket.offers.map(line))
      return parts.join('\n')
    },
    last: async () => {
      const id = auth.puuid ?? history.lastPuuid
      const last = id ? history.matches(id)[0] : undefined
      if (!last) return tr('Kayıtlı maç yok.')
      const res = { win: tr('Galibiyet'), loss: tr('Mağlubiyet'), draw: tr('Berabere') }[last.result]
      const lines = [
        tr('Son maç: {map} · {agent}', { map: last.mapName, agent: last.agentName }),
        `${res} ${last.roundsWon}-${last.roundsLost} · ${last.kills}/${last.deaths}/${last.assists} · ACS ${last.acs}`
      ]
      if (last.vts) lines.push(`VTS ${last.vts.score} (${last.vts.grade})`)
      if (typeof last.rrChange === 'number') lines.push(`RR: ${last.rrChange > 0 ? '+' : ''}${last.rrChange}`)
      return lines.join('\n')
    },
    session: async () =>
      tr('Oturum RR: {rr}\nSüre: {h} saat', { rr: tilt.state.ready ? tilt.state.delta : '—', h: monitor.sessionHours().toFixed(1) }),
    week: async () => weekly.report(false)
  }
  // Both the Turkish and the English names work; the Telegram menu lists the ones for the current language.
  telegram.setHandlers(
    {
      yardim: commands.help, help: commands.help,
      durum: commands.status, status: commands.status,
      rank: commands.rank,
      magaza: commands.store, store: commands.store,
      son: commands.last, last: commands.last,
      oturum: commands.session, session: commands.session,
      hafta: commands.week, week: commands.week
    },
    () => {
      const en = getLanguage() === 'en'
      const menu: Array<[string, string, string]> = [
        ['yardim', 'help', tr('Komutları göster')],
        ['durum', 'status', tr('Oyun durumu ve oturum RR')],
        ['rank', 'rank', tr('Güncel ve tepe rank')],
        ['magaza', 'store', tr('Günlük mağaza ve Gece Pazarı')],
        ['son', 'last', tr('Son maç')],
        ['oturum', 'session', tr('Oturum RR ve süre')],
        ['hafta', 'week', tr('Haftalık rapor')]
      ]
      return menu.map(([trName, enName, description]) => ({ command: en ? enName : trName, description }))
    }
  )

  // ---- user settings -> runtime
  const sanitizeApp = (s: AppSettings): AppSettings => ({
    ...s,
    overlayShortcut: SHORTCUT_OPTIONS.some((o) => o.value === s.overlayShortcut) ? s.overlayShortcut : SHORTCUT_OPTIONS[0].value,
    region: REGION_OPTIONS.some((o) => o.value === s.region) ? s.region : 'eu',
    breakAfterHours: Math.min(12, Math.max(1, Math.round(Number(s.breakAfterHours) || 3))),
    overlayCorner: ['tr', 'tl', 'br', 'bl'].includes(s.overlayCorner) ? s.overlayCorner : 'tr',
    overlayOpacity: Math.min(1, Math.max(0.4, Number(s.overlayOpacity) || 1)),
    aiUrl: safeAiUrl(String(s.aiUrl || APP_DEFAULTS.aiUrl)),
    aiModel: String(s.aiModel ?? '').slice(0, 120),
    overlayMode: ['players', 'me', 'both'].includes(s.overlayMode) ? s.overlayMode : 'players',
    playerStats: s.playerStats === true
  })
  let statsWas = false
  const applyApp = (cfg: AppSettings): void => {
    const languageChanged = getLanguage() !== cfg.language
    setLanguage(cfg.language)
    if (languageChanged) {
      assets.invalidate() // rank names come from valorant-api in the interface language
      telegram.refreshMenu()
    }
    setRegion(cfg.region)
    minimizeToTray = cfg.minimizeToTray
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: cfg.startWithWindows })
    rpc.setEnabled(cfg.discordRpc)
    light.configure(cfg.lightMode)
    if (!cfg.musicControl && music.isHoldingPause) void music.resume() // switched off mid-match: give the music back
    overlay.configure(cfg.overlayEnabled, cfg.overlayShortcut, cfg.overlayCorner, cfg.overlayOpacity, cfg.overlayMode)
    if (cfg.playerStats !== statsWas) {
      statsWas = cfg.playerStats
      core.refreshStats()
    }
  }
  applyApp(settings.getApp())

  // ---- AI coach (manual and automatic)
  const runCoach = async (mode: CoachMode): Promise<CoachResult> => {
    try {
      if (mode === 'trend') {
        await matches.syncHistory().catch(() => 0)
        const trend = matches.getTrendData()
        if (!trend) return { ok: false, error: tr('Trend analizi için yeterli Rekabetçi/Derecesiz maç kaydı yok.') }
        return await coach.getTrendCoaching(trend)
      }
      const data = await matches.getCoachData()
      if (!data) return { ok: false, error: tr('Analiz edilecek maç bulunamadı.') }
      return await coach.getAICoaching(data)
    } catch (e) {
      return { ok: false, error: tr('Maç verisi alınamadı: {msg}', { msg: (e as Error).message }) }
    }
  }

  /** After a match: wait for Riot to publish it, store it, then run reminders and the auto coach. */
  const afterMatch = async (attempt = 0): Promise<void> => {
    await sleep(attempt === 0 ? 15_000 : 30_000) // match details appear with a delay
    const added = await matches.syncHistory().catch(() => 0)
    if (!added && attempt < 2) return afterMatch(attempt + 1)
    if (!added) return
    // Post the newest ranked/unrated match; skip old ones that were only backfilled.
    const id = auth.puuid
    const latest = id ? history.matches(id)[0] : undefined
    if (latest && settings.getApp().discordMatchSummary && isRankedLike(latest) && Date.now() - latest.startMillis < 3 * 3_600_000) {
      void webhook.sendMatch(latest)
    }
    await monitor.evaluate()
    if (settings.getApp().autoCoach) {
      const result = await runCoach('last')
      send(IPC.evCoach, { mode: 'last', result })
      if (result.ok) await notify.push(tr('🤖 AI Koç analizin hazır'), tr('Koç sekmesinden oku.'))
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
    if (settings.getApp().musicControl) {
      // Match found -> pause. Back in the lobby (or Valorant closed) -> resume what we paused.
      // Modes without agent select (Deathmatch...) go straight to INGAME; pause() ignores a second call.
      if ((s === 'PREGAME' && prev !== 'PREGAME') || (s === 'INGAME' && prev !== 'INGAME')) void music.pause()
      else if ((s === 'MENUS' || s === 'UNKNOWN') && (prev === 'PREGAME' || prev === 'INGAME')) void music.resume()
    }
    if (s === 'PREGAME' && prev !== 'PREGAME') void telegram.notifyMatchFound()
    if (s === 'MENUS') rpc.updatePresence({ details: tr('Lobide Bekliyor'), state: tr('Ana menüde') })
    else if (s === 'PREGAME') rpc.updatePresence({ details: tr('Ajan Seçimi'), state: tr('Ajan kilitleniyor...') })
    else if (s === 'INGAME') rpc.updatePresence({ details: tr('Maçta'), state: tr('Maç yükleniyor...') })
    else rpc.clear()
    overlay.setGameActive(s === 'INGAME')
    if (s === 'INGAME') light.enter()
    else light.exit()
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
    if (!id) return { ok: false, error: tr('Dışa aktarılacak veri yok.') }
    const stamp = new Date().toISOString().slice(0, 10)
    const pick = await dialog.showSaveDialog(win!, {
      defaultPath: `valo-tracker-${stamp}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    })
    if (pick.canceled || !pick.filePath) return { ok: false, canceled: true }
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
  ipcMain.handle(IPC.exportLogs, async (): Promise<ExportResult> => {
    const pick = await dialog.showSaveDialog(win!, { defaultPath: `valo-tracker-log-${new Date().toISOString().slice(0, 10)}.txt` })
    if (pick.canceled || !pick.filePath) return { ok: false, canceled: true }
    try {
      const text = getLogHistory()
        .map((l) => `${new Date(l.time).toISOString()} [${l.level}] [${l.source}] ${l.message}`)
        .join('\r\n')
      await writeFile(pick.filePath, text, 'utf8')
      return { ok: true, path: pick.filePath }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
  // Backup holds preferences only: no Telegram token, no match history.
  ipcMain.handle(IPC.exportBackup, async (): Promise<BackupResult> => {
    const pick = await dialog.showSaveDialog(win!, {
      defaultPath: `valo-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (pick.canceled || !pick.filePath) return { ok: false, canceled: true }
    try {
      const body = { version: 1, app: settings.getApp(), instalock: settings.get(), crosshairs: crosshairs.list(), wishlist: wishlist.uuids() }
      await writeFile(pick.filePath, JSON.stringify(body, null, 2), 'utf8')
      return { ok: true, path: pick.filePath }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
  ipcMain.handle(IPC.importBackup, async (): Promise<BackupResult> => {
    const pick = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (pick.canceled || !pick.filePaths[0]) return { ok: false, canceled: true }
    try {
      const data = JSON.parse(await readFile(pick.filePaths[0], 'utf8')) as {
        app?: AppSettings
        instalock?: InstalockSettings
        crosshairs?: Array<{ id: string; name: string; code: string }>
        wishlist?: string[]
      }
      if (!data || typeof data !== 'object' || data.app === undefined) return { ok: false, error: tr('Bu bir Valo Tracker yedeği değil.') }
      // A file from elsewhere must not switch the risky features on: the risk acknowledgement is always asked again.
      const saved = settings.saveApp(sanitizeApp({ ...APP_DEFAULTS, ...data.app, instalockRiskAck: false, playerStats: false, onboardingDone: true }))
      if (data.instalock) settings.save(data.instalock)
      if (Array.isArray(data.crosshairs)) crosshairs.replace(data.crosshairs)
      if (Array.isArray(data.wishlist)) wishlist.replace(data.wishlist)
      applyApp(saved)
      telegram.refreshListener()
      return { ok: true, path: pick.filePaths[0] }
    } catch {
      return { ok: false, error: tr('Dosya okunamadı veya geçersiz.') }
    }
  })
  ipcMain.handle(IPC.getDiscordWebhook, () => settings.getDiscordWebhookView())
  ipcMain.handle(IPC.saveDiscordWebhook, (_e, url: string) => settings.saveDiscordWebhook(String(url)))
  ipcMain.handle(IPC.testDiscordWebhook, (_e, url: string) => webhook.test(String(url)))
  ipcMain.handle(IPC.sendLastMatchToDiscord, async () => {
    const id = account()
    const latest = id ? history.matches(id)[0] : undefined
    return latest ? webhook.sendMatch(latest) : { ok: false, error: tr('Kayıtlı maç yok.') }
  })
  ipcMain.handle(IPC.exportTimeline, async (_e, matchId: string, format: TimelineFormat, raw: TimelineExportOptions): Promise<ExportResult> => {
    const num = (v: unknown, lo: number, hi: number, fallback: number): number => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : fallback))
    const opts = { offsetSec: num(raw?.offsetSec, -3600, 3600, 0), preRollSec: num(raw?.preRollSec, 0, 120, 5), postRollSec: num(raw?.postRollSec, 0, 120, 3) }
    try {
      const timeline = await matches.getTimeline(String(matchId))
      if (!timeline.events.length) return { ok: false, error: tr('Bu maçta işaretlenecek kill veya ölüm bulunamadı.') }
      const markers = buildMarkers(timeline, opts)
      const ext = format === 'json' ? 'json' : format === 'txt' ? 'txt' : 'csv'
      const pick = await dialog.showSaveDialog(win!, { defaultPath: `valo-tracker-${timeline.mapName.toLowerCase()}-${new Date(timeline.startMillis || Date.now()).toISOString().slice(0, 10)}.${ext}` })
      if (pick.canceled || !pick.filePath) return { ok: false, canceled: true }
      const body =
        ext === 'json'
          ? JSON.stringify({ match: { id: timeline.matchId, map: timeline.mapName, agent: timeline.agentName, start: new Date(timeline.startMillis).toISOString() }, options: opts, markers }, null, 2)
          : ext === 'txt'
            ? markersToChapters(markers)
            : '\uFEFF' + markersToCsv(markers)
      await writeFile(pick.filePath, body, 'utf8')
      return { ok: true, path: pick.filePath }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
  ipcMain.handle(IPC.getOverlayMe, (): OverlayMeStats => {
    const id = account()
    const live = core.current
    const self = live?.players.find((p) => p.isSelf)
    const base = buildOverlayMe(id ? history.matches(id) : [], { sessionStart: monitor.sessionStartMs, map: live?.mapName, agent: self?.agentName })
    const last = id ? history.rr(id).at(-1) : undefined
    const rank = self?.mmr
      ? { tier: self.mmr.currentTier, rr: self.mmr.currentRR, name: self.mmr.currentTierName, icon: self.mmr.currentTierIcon }
      : last
        ? { tier: last.tier, rr: last.rr, name: assets.tier(last.tier).name, icon: assets.tier(last.tier).icon }
        : null
    return { ...base, rank, sessionRR: tilt.state.ready ? tilt.state.delta : null, hours: monitor.sessionHours() }
  })
  ipcMain.handle(IPC.getCoPlayers, async (): Promise<CoPlayerRow[]> => {
    const id = account()
    if (!id) return []
    const rows = coPlayerStats(history.matches(id), history.matesByMatch(id)).slice(0, 20)
    const names = await matches.resolveNames(rows.map((r) => r.puuid)).catch(() => new Map<string, string>())
    return rows.map((r) => ({ ...r, name: names.get(r.puuid) ?? null }))
  })
  ipcMain.handle(IPC.testAI, (): Promise<AiTestResult> => coach.ping())
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
    if (ws.connection === 'connected' && !light.active) void wishlist.checkAndNotify().catch(() => undefined)
  }, 30 * 60 * 1000)
  log('App', 'info', tr('Valorant bekleniyor…'))
  app.on('before-quit', () => {
    quitting = true
    ws.stop()
    monitor.stop()
    weekly.stop()
    telegram.stop()
    light.exit()
    if (music.isHoldingPause) void music.resume()
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
