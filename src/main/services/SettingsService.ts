import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { app, safeStorage } from 'electron'
import type { AppSettings, InstalockSettings, TelegramInput, TelegramSettingsView } from '@shared/types'

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
  aiModel: ''
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
  private settings: InstalockSettings
  private appSettings: AppSettings
  private telegram: { botToken: string; chatId: string } = { botToken: '', chatId: '' }

  constructor() {
    this.settings = { ...DEFAULTS, ...readJson<InstalockSettings>(this.file) }
    this.appSettings = { ...APP_DEFAULTS, ...readJson<AppSettings>(this.appFile) }
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
