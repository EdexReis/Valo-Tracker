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

/** Converts game coordinates to minimap fractions: x = gameY * xm + xa, y = gameX * ym + ya. */
export interface MapCalib {
  xm: number
  ym: number
  xa: number
  ya: number
}

export interface MapInfo {
  uuid: string
  mapUrl: string
  name: string
  splash: string | null
  icon: string | null
  /** top-down minimap image */
  minimap: string | null
  calib: MapCalib | null
}

export interface WeaponInfo {
  uuid: string
  name: string
  icon: string | null
}

export interface AssetsPayload {
  agents: AgentInfo[]
  maps: MapInfo[]
  weapons: WeaponInfo[]
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
  /** RR gained or lost in this match (competitive only) */
  rrChange?: number | null
  /** where the player died / got kills, as minimap fractions 0-1 */
  deathPts?: Pt[]
  killPts?: Pt[]
  /** kills / deaths by finishing weapon: a weapon uuid, or ability / spike / fall / other */
  weaponKills?: Record<string, number>
  weaponDeaths?: Record<string, number>
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

export interface Pt {
  x: number
  y: number
}

export interface RoundInfo {
  /** 1-based */
  round: number
  won: boolean
  kills: number
  deathSec: number | null
  killerAgent: string | null
  econ: { value: number; teamAvg: number; type: 'pistol' | 'eco' | 'force' | 'full' } | null
  flag: 'underbuy' | 'overbuy' | null
}

export interface EconSummary {
  pistol: { rounds: number; won: number }
  eco: { rounds: number; won: number }
  force: { rounds: number; won: number }
  full: { rounds: number; won: number }
  underbuys: number
  overbuys: number
}

export interface MatchDetail {
  matchId: string
  mapName: string
  mapIcon: string | null
  rounds: RoundInfo[]
  deaths: Pt[]
  kills: Pt[]
  econ: EconSummary | null
}

export interface SeasonRank {
  seasonId: string
  name: string
  tier: number
  tierName: string
  tierIcon: string | null
  games: number
  wins: number
}

export interface StoreSkinDay extends SkinHit {
  cost: number | null
  discountedCost: number | null
  discountPercent: number | null
}

export interface StoreDay {
  /** YYYY-MM-DD (UTC) of the rotation start */
  date: string
  daily: StoreSkinDay[]
  night: StoreSkinDay[]
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
  /** answer /rank, /magaza... commands sent from the saved Telegram chat */
  telegramCommands: boolean
  /** send a weekly summary on Sunday evening */
  weeklyReport: boolean
  goalWeeklyMatches: number
  goalWeeklyWins: number
  goalAvgVts: number
  goalHsPercent: number
  /** pause music when a match is found and resume it when back in the lobby */
  musicControl: boolean
  /** first-run wizard finished */
  onboardingDone: boolean
  overlayCorner: OverlayCorner
  /** 0.4-1 */
  overlayOpacity: number
  /** local OpenAI-compatible server for the AI coach (loopback addresses only) */
  aiUrl: string
  /** empty = first chat model the server reports */
  aiModel: string
  /** post a summary to the Discord webhook after each ranked/unrated match */
  discordMatchSummary: boolean
  /** interface language */
  language: 'tr' | 'en'
  /** lower priority and hold back optional background work while a match runs */
  lightMode: boolean
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
  /** the user closed the save dialog */
  canceled?: boolean
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

export interface DiscordWebhookView {
  configured: boolean
  /** masked address, e.g. ...a1b2c3 */
  hint: string
}

export interface WebhookResult {
  ok: boolean
  error?: string
}

export interface CoPlayerRow {
  puuid: string
  /** resolved at view time; null when Valorant is closed */
  name: string | null
  games: number
  wins: number
  losses: number
  /** 0-100 */
  winRate: number
  /** my average VTS in these games */
  avgVts: number
}

export type OverlayCorner = 'tr' | 'tl' | 'br' | 'bl'

export interface BackupResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export interface AiTestResult {
  ok: boolean
  model?: string
  error?: string
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
  getSeasonHistory(): Promise<SeasonRank[]>
  getStoreArchive(): Promise<StoreDay[]>
  getMatchDetail(matchId: string): Promise<MatchDetail>
  /** Builds the weekly report text; with send=true it is also pushed to notifications. */
  getWeeklyReport(send: boolean): Promise<string>
  exportLogs(): Promise<ExportResult>
  exportBackup(): Promise<BackupResult>
  importBackup(): Promise<BackupResult>
  testAI(): Promise<AiTestResult>
  getDiscordWebhook(): Promise<DiscordWebhookView>
  saveDiscordWebhook(url: string): Promise<DiscordWebhookView>
  testDiscordWebhook(url: string): Promise<WebhookResult>
  sendLastMatchToDiscord(): Promise<WebhookResult>
  getCoPlayers(): Promise<CoPlayerRow[]>
  getSessionRR(): Promise<SessionRR>
  getTelegram(): Promise<TelegramSettingsView>
  saveTelegram(input: TelegramInput): Promise<TelegramSettingsView>
  testTelegram(input: TelegramInput): Promise<TelegramResult>
  getCompWarning(): Promise<CompWarning | null>
  onCompWarning(cb: (w: CompWarning | null) => void): () => void
  onLightMode(cb: (on: boolean) => void): () => void
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
