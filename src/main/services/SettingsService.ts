import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { app, safeStorage } from 'electron'
import type { InstalockSettings, TelegramInput, TelegramSettingsView } from '@shared/types'

const DEFAULTS: InstalockSettings = { enabled: false, defaultAgent: null, agentByMap: {} }

interface TelegramStored {
  /** base64 of the safeStorage-encrypted token (or plain text when encryption is unavailable) */
  token: string
  encrypted: boolean
  chatId: string
}

export class SettingsService {
  private file = path.join(app.getPath('userData'), 'settings.json')
  private telegramFile = path.join(app.getPath('userData'), 'telegram.json')
  private settings: InstalockSettings
  private telegram: { botToken: string; chatId: string } = { botToken: '', chatId: '' }

  constructor() {
    try {
      this.settings = { ...DEFAULTS, ...JSON.parse(readFileSync(this.file, 'utf8')) }
    } catch {
      this.settings = { ...DEFAULTS }
    }
    try {
      const t = JSON.parse(readFileSync(this.telegramFile, 'utf8')) as TelegramStored
      const botToken = t.encrypted ? safeStorage.decryptString(Buffer.from(t.token, 'base64')) : t.token
      this.telegram = { botToken, chatId: t.chatId }
    } catch {
      /* not configured, or the encrypted blob cannot be read */
    }
  }

  get(): InstalockSettings {
    return this.settings
  }

  save(next: InstalockSettings): InstalockSettings {
    this.settings = { ...DEFAULTS, ...next }
    try {
      writeFileSync(this.file, JSON.stringify(this.settings, null, 2))
    } catch {
      /* non-fatal */
    }
    return this.settings
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
    try {
      writeFileSync(this.telegramFile, JSON.stringify(stored))
    } catch {
      /* non-fatal */
    }
    return this.getTelegramView()
  }
}
