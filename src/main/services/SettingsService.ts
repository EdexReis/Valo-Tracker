import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { app, safeStorage } from 'electron'
import type { AppSettings, DiscordWebhookView, InstalockSettings, TelegramInput, TelegramSettingsView } from '@shared/types'
import { isDiscordWebhookUrl } from '@shared/webhook'
import { tr } from '@shared/i18n'

const DEFAULTS: InstalockSettings = { enabled: false, defaultAgent: null, agentByMap: {} }

export const APP_DEFAULTS: AppSettings = {
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
  goalHsPercent: 25,
  musicControl: false,
  onboardingDone: false,
  overlayCorner: 'tr',
  overlayOpacity: 1,
  aiUrl: 'http://127.0.0.1:1234/v1',
  aiModel: '',
  discordMatchSummary: true,
  language: 'tr',
  lightMode: true,
  overlayMode: 'players'
}

interface TelegramStored {
  /** base64 of the safeStorage-encrypted token (or plain text when encryption is unavailable) */
  token: string
  encrypted: boolean
  chatId: string
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

function writeJson(file: string, data: unknown): void {
  try {
    writeFileSync(file, JSON.stringify(data, null, 2))
  } catch {
    /* non-fatal */
  }
}

export class SettingsService {
  private dir = app.getPath('userData')
  private file = path.join(this.dir, 'settings.json')
  private appFile = path.join(this.dir, 'app-settings.json')
  private telegramFile = path.join(this.dir, 'telegram.json')
  private webhookFile = path.join(this.dir, 'discord-webhook.json')
  private discordWebhook = ''
  private settings: InstalockSettings
  private appSettings: AppSettings
  private telegram: { botToken: string; chatId: string } = { botToken: '', chatId: '' }

  constructor() {
    this.settings = { ...DEFAULTS, ...readJson<InstalockSettings>(this.file) }
    // First run: pick the language from the OS locale. Existing users (a settings file without a language) stay on Turkish.
    const saved = readJson<AppSettings>(this.appFile)
    const firstRunLanguage = app.getLocale().toLowerCase().startsWith('tr') ? 'tr' : 'en'
    this.appSettings = { ...APP_DEFAULTS, language: saved ? 'tr' : firstRunLanguage, ...saved }
    this.loadWebhook()
    try {
      const t = readJson<TelegramStored>(this.telegramFile)
      if (t) {
        const botToken = t.encrypted ? safeStorage.decryptString(Buffer.from(t.token, 'base64')) : t.token
        this.telegram = { botToken, chatId: t.chatId }
      }
    } catch {
      /* the encrypted blob cannot be read */
    }
  }

  /** The webhook address is a secret (anyone holding it can post to the channel): stored encrypted like the Telegram token. */
  private loadWebhook(): void {
    try {
      const w = readJson<{ url: string; encrypted: boolean }>(this.webhookFile)
      if (w) this.discordWebhook = w.encrypted ? safeStorage.decryptString(Buffer.from(w.url, 'base64')) : w.url
    } catch {
      /* the encrypted blob cannot be read */
    }
  }

  /** Full address. Main process only. */
  getDiscordWebhook(): string {
    return this.discordWebhook
  }

  getDiscordWebhookView(): DiscordWebhookView {
    const u = this.discordWebhook
    return { configured: !!u, hint: u ? `…${u.slice(-6)}` : '' }
  }

  /** An empty string removes the webhook. Anything that is not a Discord webhook address is rejected. */
  saveDiscordWebhook(url: string): DiscordWebhookView {
    const clean = url.trim()
    if (clean && !isDiscordWebhookUrl(clean)) throw new Error(tr('Geçerli bir Discord webhook adresi değil.'))
    this.discordWebhook = clean
    const encrypted = safeStorage.isEncryptionAvailable()
    writeJson(this.webhookFile, { url: encrypted ? safeStorage.encryptString(clean).toString('base64') : clean, encrypted })
    return this.getDiscordWebhookView()
  }

  get(): InstalockSettings {
    return this.settings
  }

  save(next: InstalockSettings): InstalockSettings {
    this.settings = { ...DEFAULTS, ...next }
    writeJson(this.file, this.settings)
    return this.settings
  }

  getApp(): AppSettings {
    return this.appSettings
  }

  saveApp(next: AppSettings): AppSettings {
    this.appSettings = { ...APP_DEFAULTS, ...next }
    writeJson(this.appFile, this.appSettings)
    return this.appSettings
  }

  /** Full credentials. Main process only: never sent to the renderer. */
  getTelegram(): { botToken: string; chatId: string } {
    return this.telegram
  }

  /** What the renderer may see: the token is masked. */
  getTelegramView(): TelegramSettingsView {
    const { botToken, chatId } = this.telegram
    return { configured: !!botToken && !!chatId, chatId, tokenHint: botToken ? `${botToken.slice(0, 4)}…${botToken.slice(-4)}` : '' }
  }

  /** A blank token keeps the saved one. */
  saveTelegram(input: TelegramInput): TelegramSettingsView {
    const botToken = input.botToken.trim() || this.telegram.botToken
    this.telegram = { botToken, chatId: input.chatId.trim() }
    const encrypted = safeStorage.isEncryptionAvailable()
    const stored: TelegramStored = {
      token: encrypted ? safeStorage.encryptString(botToken).toString('base64') : botToken,
      encrypted,
      chatId: this.telegram.chatId
    }
    writeJson(this.telegramFile, stored)
    return this.getTelegramView()
  }
}
