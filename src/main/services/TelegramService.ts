import TelegramBot from 'node-telegram-bot-api'
import type { TelegramInput, TelegramResult } from '@shared/types'
import { log } from '../logger'
import type { SettingsService } from './SettingsService'

const MATCH_FOUND = '🚨 VALORANT: Maç bulundu! Hemen bilgisayar başına dön!'
const TEST_MESSAGE = '✅ Valo Tracker: Telegram bağlantısı çalışıyor.'

export class TelegramService {
  private bot: TelegramBot | null = null
  private botToken = ''

  constructor(private settings: SettingsService) {}

  private getBot(token: string): TelegramBot {
    // No polling: we only send messages.
    if (!this.bot || this.botToken !== token) {
      this.bot = new TelegramBot(token, { polling: false })
      this.botToken = token
    }
    return this.bot
  }

  private async send(token: string, chatId: string, text: string): Promise<TelegramResult> {
    try {
      await this.getBot(token).sendMessage(chatId, text)
      return { ok: true }
    } catch (e) {
      // Error messages can contain the request URL, which embeds the token.
      const msg = String((e as Error).message ?? e).split(token).join('***')
      return { ok: false, error: msg }
    }
  }

  /** Tests with the typed values; a blank token/chat id falls back to the saved one. Nothing is persisted. */
  test(input: TelegramInput): Promise<TelegramResult> {
    const saved = this.settings.getTelegram()
    const token = input.botToken.trim() || saved.botToken
    const chatId = input.chatId.trim() || saved.chatId
    if (!token || !chatId) return Promise.resolve({ ok: false, error: 'Bot token ve Chat ID gerekli' })
    return this.send(token, chatId, TEST_MESSAGE)
  }

  /** Sends a plain message to the saved chat. Returns false when Telegram is not configured or fails. */
  async sendText(text: string): Promise<boolean> {
    const { botToken, chatId } = this.settings.getTelegram()
    if (!botToken || !chatId) return false
    return (await this.send(botToken, chatId, text)).ok
  }

  /** Called when a match is found (agent select). No-op when Telegram is not configured. */
  async notifyMatchFound(): Promise<void> {
    const { botToken, chatId } = this.settings.getTelegram()
    if (!botToken || !chatId) return
    const r = await this.send(botToken, chatId, MATCH_FOUND)
    if (r.ok) log('Telegram', 'success', 'Maç bildirimi gönderildi')
    else log('Telegram', 'error', `Bildirim gönderilemedi: ${r.error}`)
  }
}
