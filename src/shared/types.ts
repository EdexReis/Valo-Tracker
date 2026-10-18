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
  /** valorant-api role name, e.g. Duelist, Controller */
  role: string
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
  /** Crosshair share code when the loadout response carries one */
  crosshairCode: string | null
  puuid: string
  name: string
  tag: string
  teamId: string
  isSelf: boolean
  /** PlayerIdentity.Incognito: the player hides their identity (streamer mode) */
  isStreamerMode: boolean
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

export type VtsGrade = 'S' | 'A' | 'B' | 'C' | 'D'

export interface VtsComponent {
  key: string
  label: string
  /** human readable raw value, e.g. "245 (beklenen 230)" */
  value: string
  /** 0-100, 50 = average player */
  points: number
  /** share of the final score, 0-1 */
  weight: number
}

export interface VtsResult {
  /** 0-1000 */
  score: number
  grade: VtsGrade
  /** formula version; older stored matches are recalculated */
  version?: number
  components?: VtsComponent[]
  /** % of rounds with a kill, assist, survival or trade */
  kast?: number
  clutches?: number
  multiKills?: { k3: number; k4: number; k5: number }
  /** rank adjustment applied to the score (competitive only) */
  opponentAdjust?: number
}

export interface CompWarning {
  messages: string[]
}

export interface MatchSummary {
  vts: VtsResult | null
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
  /** raw queue id, e.g. competitive / unrated */
  queueId: string
  rounds: number
  acs: number
  /** average damage per round */
  adr: number
  hsPercent: number
  firstBloods: number
  firstDeaths: number
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

export interface CoachResult {
  ok: boolean
  text?: string
  error?: string
  /** e.g. "Ascent · Jett · 18/12/4" */
  matchLabel?: string
}

export interface LogEntry {
  time: number
  level: 'info' | 'success' | 'error'
  source: string
  message: string
}

export type RegionKey = 'eu' | 'na' | 'latam' | 'br' | 'ap' | 'kr'

export interface AppSettings {
  startWithWindows: boolean
  minimizeToTray: boolean
  discordRpc: boolean
  overlayEnabled: boolean
  /** Electron accelerator, e.g. CommandOrControl+Tab */
  overlayShortcut: string
  dodgeAssistant: boolean
  region: RegionKey
  autoCoach: boolean
  breakReminders: boolean
  breakAfterHours: number
  nativeNotifications: boolean
  /** the user confirmed the ban-risk warning for the instalocker */
  instalockRiskAck: boolean
}

export interface RRPoint {
  t: number
  tier: number
  rr: number
}

export interface StatsPayload {
  matches: MatchSummary[]
  rr: RRPoint[]
}

export interface ExportResult {
  ok: boolean
  path?: string
  error?: string
}

export interface SkinHit {
  uuid: string
  name: string
  icon: string | null
}

export interface WishlistHit extends SkinHit {
  where: 'daily' | 'night'
  cost: number | null
  discountedCost: number | null
  discountPercent: number | null
}

export interface CollectionItem extends SkinHit {
  cost: number | null
}

export interface CollectionData {
  count: number
  /** sum of known store prices (VP): an estimate, older skins have no price */
  totalVP: number
  items: CollectionItem[]
}

export interface SavedCrosshair {
  id: string
  name: string
  code: string
}

export interface PregameStage {
  mapName: string
  agentName: string | null
}

export type CoachMode = 'last' | 'trend'

export interface CoachEvent {
  mode: CoachMode
  result: CoachResult
}

export type WindowAction = 'minimize' | 'maximize' | 'close'

export interface ValoApi {
  getStatus(): Promise<AppStatus>
  getAssets(): Promise<AssetsPayload>
  getSettings(): Promise<InstalockSettings>
  saveSettings(settings: InstalockSettings): Promise<InstalockSettings>
  getAppSettings(): Promise<AppSettings>
  saveAppSettings(settings: AppSettings): Promise<AppSettings>
  getMatch(): Promise<MatchSnapshot | null>
  scanMatch(): Promise<MatchSnapshot | null>
  triggerPregame(): Promise<void>
  getStorefront(): Promise<StorefrontData>
  getCollection(): Promise<CollectionData>
  getWishlist(): Promise<SkinHit[]>
  searchSkins(query: string): Promise<SkinHit[]>
  addWish(uuid: string): Promise<SkinHit[]>
  removeWish(uuid: string): Promise<SkinHit[]>
  checkWishlist(): Promise<WishlistHit[]>
  getOwnHistory(): Promise<MatchSummary[]>
  getStats(): Promise<StatsPayload>
  exportHistory(format: 'csv' | 'json'): Promise<ExportResult>
  getSessionRR(): Promise<SessionRR>
  getTelegram(): Promise<TelegramSettingsView>
  saveTelegram(input: TelegramInput): Promise<TelegramSettingsView>
  testTelegram(input: TelegramInput): Promise<TelegramResult>
  getCompWarning(): Promise<CompWarning | null>
  onCompWarning(cb: (w: CompWarning | null) => void): () => void
  getAICoaching(mode: CoachMode): Promise<CoachResult>
  onCoach(cb: (e: CoachEvent) => void): () => void
  getDodgeWarning(): Promise<DodgeWarning | null>
  onDodgeWarning(cb: (w: DodgeWarning | null) => void): () => void
  onStage(cb: (s: PregameStage) => void): () => void
  getCrosshairs(): Promise<SavedCrosshair[]>
  addCrosshair(input: { name: string; code: string }): Promise<SavedCrosshair[]>
  removeCrosshair(id: string): Promise<SavedCrosshair[]>
  onSessionRR(cb: (s: SessionRR) => void): () => void
  getLogs(): Promise<LogEntry[]>
  windowAction(action: WindowAction): void
  onStatus(cb: (status: AppStatus) => void): () => void
  onMatch(cb: (match: MatchSnapshot | null) => void): () => void
  onLog(cb: (entry: LogEntry) => void): () => void
}
