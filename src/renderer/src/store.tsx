import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppSettings, CoachEvent, PregameStage, CompWarning, DodgeWarning, SessionRR, AppStatus, AssetsPayload, InstalockSettings, LogEntry, MatchSnapshot } from '@shared/types'

interface AppState {
  status: AppStatus
  assets: AssetsPayload
  settings: InstalockSettings
  match: MatchSnapshot | null
  sessionRR: SessionRR
  dodge: DodgeWarning | null
  comp: CompWarning | null
  appSettings: AppSettings
  updateApp: (patch: Partial<AppSettings>) => void
  lastCoach: CoachEvent | null
  stage: PregameStage | null
  logs: LogEntry[]
  scanning: boolean
  updateSettings: (patch: Partial<InstalockSettings>) => void
  scanMatch: () => Promise<void>
  triggerPregame: () => Promise<void>
}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<AppStatus>({ connection: 'waiting', gameState: 'UNKNOWN', puuid: null })
  const [assets, setAssets] = useState<AssetsPayload>({ agents: [], maps: [] })
  const [settings, setSettings] = useState<InstalockSettings>({ enabled: false, defaultAgent: null, agentByMap: {} })
  const [match, setMatch] = useState<MatchSnapshot | null>(null)
  const [sessionRR, setSessionRR] = useState<SessionRR>({ ready: false, delta: 0, initialRR: 0, currentRR: 0 })
  const [dodge, setDodge] = useState<DodgeWarning | null>(null)
  const [comp, setComp] = useState<CompWarning | null>(null)
  const [appSettings, setAppSettings] = useState<AppSettings>({
    startWithWindows: false,
    minimizeToTray: false,
    discordRpc: true,
    overlayEnabled: true,
    overlayShortcut: 'CommandOrControl+Tab',
    dodgeAssistant: true,
    region: 'eu',
    autoCoach: false,
    breakReminders: true,
    breakAfterHours: 3,
    nativeNotifications: true,
    instalockRiskAck: false,
    telegramCommands: true,
    weeklyReport: true,
    goalWeeklyMatches: 10,
    goalWeeklyWins: 5,
    goalAvgVts: 500,
    goalHsPercent: 25
  })
  const [lastCoach, setLastCoach] = useState<CoachEvent | null>(null)
  const [stage, setStage] = useState<PregameStage | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    const api = window.api
    void api.getStatus().then(setStatus)
    void api.getSettings().then(setSettings)
    void api.getMatch().then(setMatch)
    void api.getSessionRR().then(setSessionRR)
    void api.getDodgeWarning().then(setDodge)
    void api.getCompWarning().then(setComp)
    void api.getAppSettings().then(setAppSettings)
    void api.getLogs().then(setLogs)
    // Assets may need a network fetch; retry until available.
    let cancelled = false
    const loadAssets = (): void => {
      api.getAssets().then(
        (a) => !cancelled && setAssets(a),
        () => !cancelled && setTimeout(loadAssets, 5000)
      )
    }
    loadAssets()

    const offs = [
      api.onStatus(setStatus),
      api.onMatch(setMatch),
      api.onSessionRR(setSessionRR),
      api.onDodgeWarning(setDodge),
      api.onCompWarning(setComp),
      api.onCoach(setLastCoach),
      api.onStage(setStage),
      api.onLog((e) => setLogs((l) => [...l.slice(-199), e]))
    ]
    return () => {
      cancelled = true
      offs.forEach((off) => off())
    }
  }, [])

  const updateSettings = useCallback((patch: Partial<InstalockSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      void window.api.saveSettings(next)
      return next
    })
  }, [])

  const updateApp = useCallback((patch: Partial<AppSettings>) => {
    setAppSettings((prev) => {
      const next = { ...prev, ...patch }
      void window.api.saveAppSettings(next).then(setAppSettings)
      return next
    })
  }, [])

  const scanMatch = useCallback(async () => {
    setScanning(true)
    try {
      setMatch(await window.api.scanMatch())
    } finally {
      setScanning(false)
    }
  }, [])

  const triggerPregame = useCallback(() => window.api.triggerPregame(), [])

  const value = useMemo(
    () => ({ status, assets, settings, match, sessionRR, dodge, comp, appSettings, updateApp, lastCoach, stage, logs, scanning, updateSettings, scanMatch, triggerPregame }),
    [status, assets, settings, match, sessionRR, dodge, comp, appSettings, updateApp, lastCoach, stage, logs, scanning, updateSettings, scanMatch, triggerPregame]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
