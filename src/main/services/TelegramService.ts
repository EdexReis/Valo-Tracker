import TelegramBot from 'node-telegram-bot-api'
import type { TelegramInput, TelegramResult } from '@shared/types'
import { log } from '../logger'
import type { SettingsService } from './SettingsService'
import { tr } from '@shared/i18n'

const MATCH_FOUND = '🚨 VALORANT: Maç bulundu! Hemen bilgisayar başına dön!'
const TEST_MESSAGE = '✅ Valo Tracker: Telegram bağlantısı çalışıyor.'

export class TelegramService {
  private bot: TelegramBot | null = null
  private botToken = ''

  private listener: TelegramBot | null = null
  private listenerToken = ''
  private handlers: Record<string, () => Promise<string>> = {}
  private lastPollError = 0

  constructor(private settings: SettingsService) {}

  private menu: () => Array<{ command: string; description: string }> = () => []

  setHandlers(handlers: Record<string, () => Promise<string>>, menu: () => Array<{ command: string; description: string }>): void {
    this.handlers = handlers
    this.menu = menu
  }

  /** Re-registers the command list in the bot menu (the language may have changed). */
  refreshMenu(): void {
    this.listener?.setMyCommands(this.menu()).catch(() => undefined)
  }

  /**
   * (Re)starts command polling. Only messages from the saved chat id are answered, so strangers
   * who find the bot cannot read the player's data.
   */
  refreshListener(): void {
    const { botToken, chatId } = this.settings.getTelegram()
    const want = this.settings.getApp().telegramCommands && !!botToken && !!chatId
    if (this.listener && (!want || this.listenerToken !== botToken)) this.stop()
    if (!want || this.listener) return

    const bot = new TelegramBot(botToken, { polling: true })
    this.listener = bot
    this.listenerToken = botToken
    bot.setMyCommands(this.menu()).catch(() => undefined)
    bot.on('polling_error', (e) => {
      // Throttle: a missing network would otherwise flood the log.
      if (Date.now() - this.lastPollError < 60_000) return
      this.lastPollError = Date.now()
      log('Telegram', 'error', tr('Komut dinleyici hatası: {msg}', { msg: String(e.message).split(botToken).join('***') }))
    })
    bot.on('message', (msg) => {
      if (String(msg.chat.id) !== chatId || !msg.text?.startsWith('/')) return
      const cmd = msg.text.slice(1).split(/[\s@]/)[0].toLowerCase()
      const handler = this.handlers[cmd]
      if (!handler) return
      handler()
        .catch(() => tr('Bu bilgi şu an alınamadı. Valorant açık ve giriş yapılmış mı?'))
        .then((text) => bot.sendMessage(chatId, text))
        .catch(() => undefined)
    })
  }

  stop(): void {
    const bot = this.listener
    this.listener = null
    this.listenerToken = ''
    if (bot) void bot.stopPolling().catch(() => undefined)
  }

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
    if (!token || !chatId) return Promise.resolve({ ok: false, error: tr('Bot token ve Chat ID gerekli') })
    return this.send(token, chatId, tr(TEST_MESSAGE))
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
    const r = await this.send(botToken, chatId, tr(MATCH_FOUND))
    if (r.ok) log('Telegram', 'success', tr('Maç bildirimi gönderildi'))
    else log('Telegram', 'error', tr('Bildirim gönderilemedi: {msg}', { msg: r.error ?? '' }))
  }
}
