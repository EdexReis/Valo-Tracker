export type Connection = 'waiting' | 'connecting' | 'connected'
export type GameState = 'MENUS' | 'PREGAME' | 'INGAME' | 'UNKNOWN'

export interface AppStatus {
  connection: Connection
  gameState: GameState
  puuid: string | null
}

export interface AgentInfo {
  uuid: string
  name: string
  icon: string
}

export interface MapInfo {
  uuid: string
  mapUrl: string
  name: string
  splash: string | null
  icon: string | null
}

export interface AssetsPayload {
  agents: AgentInfo[]
  maps: MapInfo[]
}

export interface InstalockSettings {
  enabled: boolean
  /** Agent used on maps without a specific selection (null = do nothing). */
  defaultAgent: string | null
  /** mapUuid -> agentUuid */
  agentByMap: Record<string, string>
}

export interface WeaponLoadout {
  weaponId: string
  weaponName: string
  skinName: string
  skinIcon: string | null
  buddyName: string | null
  buddyIcon: string | null
}

export interface PlayerMmr {
  currentTier: number
  currentRR: number
  peakTier: number
  currentTierName: string
  currentTierIcon: string | null
  peakTierName: string
  peakTierIcon: string | null
}

export interface MatchPlayer {
  mmr: PlayerMmr | null
  puuid: string
  name: string
  tag: string
  teamId: string
  isSelf: boolean
  agentId: string
  agentName: string
  agentIcon: string | null
  weapons: WeaponLoadout[]
}

export interface MatchSnapshot {
  matchId: string
  mapName: string
  mapSplash: string | null
  players: MatchPlayer[]
  scannedAt: number
}

export interface StoreSkin {
  id: string
  name: string
  icon: string | null
  discountPercent?: number
  cost?: number | null
  discountedCost?: number | null
}

export interface StorefrontData {
  dailyOffers: StoreSkin[]
  dailyRemainingSec: number
  nightMarket: { isActive: boolean; remainingSec: number; offers: StoreSkin[] } | null
}

export interface MatchSummary {
  matchId: string
  startMillis: number
  queue: string
  mapName: string
  agentName: string
  agentIcon: string | null
  kills: number
  deaths: number
  assists: number
  result: 'win' | 'loss' | 'draw'
  roundsWon: number
  roundsLost: number
}

export interface SessionRR {
  /** false until the starting RR has been captured */
  ready: boolean
  delta: number
  initialRR: number
  currentRR: number
}

export interface RiskyPlayer {
  puuid: string
  /** GameName#TagLine when it could be resolved */
  name?: string
  reasons: string[]
}

export interface DodgeWarning {
  matchId: string
  players: RiskyPlayer[]
}

export interface TelegramInput {
  botToken: string
  chatId: string
}

export interface TelegramSettingsView {
  configured: boolean
  chatId: string
  /** masked token, e.g. 1234…abcd */
  tokenHint: string
}

export interface TelegramResult {
  ok: boolean
  error?: string
}

export interface LogEntry {
  time: number
  level: 'info' | 'success' | 'error'
  source: string
  message: string
}

export type WindowAction = 'minimize' | 'maximize' | 'close'

export interface ValoApi {
  getStatus(): Promise<AppStatus>
  getAssets(): Promise<AssetsPayload>
  getSettings(): Promise<InstalockSettings>
  saveSettings(settings: InstalockSettings): Promise<InstalockSettings>
  getMatch(): Promise<MatchSnapshot | null>
  scanMatch(): Promise<MatchSnapshot | null>
  triggerPregame(): Promise<void>
  getStorefront(): Promise<StorefrontData>
  getMatchHistory(): Promise<MatchSummary[]>
  getSessionRR(): Promise<SessionRR>
  getTelegram(): Promise<TelegramSettingsView>
  saveTelegram(input: TelegramInput): Promise<TelegramSettingsView>
  testTelegram(input: TelegramInput): Promise<TelegramResult>
  getDodgeWarning(): Promise<DodgeWarning | null>
  onDodgeWarning(cb: (w: DodgeWarning | null) => void): () => void
  onSessionRR(cb: (s: SessionRR) => void): () => void
  getLogs(): Promise<LogEntry[]>
  windowAction(action: WindowAction): void
  onStatus(cb: (status: AppStatus) => void): () => void
  onMatch(cb: (match: MatchSnapshot | null) => void): () => void
  onLog(cb: (entry: LogEntry) => void): () => void
}
