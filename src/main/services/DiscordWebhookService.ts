import type { MatchSummary, WebhookResult } from '@shared/types'
import { buildMatchEmbed, isDiscordWebhookUrl } from '@shared/webhook'
import { log } from '../logger'
import type { SettingsService } from './SettingsService'
import { tr } from '@shared/i18n'

/** Posts match summaries to a Discord channel through a webhook URL the player created. */
export class DiscordWebhookService {
  constructor(private settings: SettingsService) {}

  private async post(url: string, body: unknown): Promise<WebhookResult> {
    if (!isDiscordWebhookUrl(url)) return { ok: false, error: tr('Geçerli bir Discord webhook adresi değil.') }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000)
      })
      if (res.ok) return { ok: true }
      if (res.status === 404) return { ok: false, error: tr('Webhook bulunamadı veya silinmiş.') }
      if (res.status === 429) return { ok: false, error: tr('Discord çok fazla istek aldı, biraz sonra dene.') }
      return { ok: false, error: tr('Discord hata döndürdü ({status}).', { status: res.status }) }
    } catch {
      return { ok: false, error: tr('Discord\'a ulaşılamadı.') }
    }
  }

  /** Tests the typed address; an empty one falls back to the saved webhook. Nothing is persisted. */
  test(input: string): Promise<WebhookResult> {
    const url = input.trim() || this.settings.getDiscordWebhook()
    if (!url) return Promise.resolve({ ok: false, error: tr('Webhook adresi gerekli.') })
    return this.post(url, { username: 'Valo Tracker', content: tr('✅ Valo Tracker: Discord bağlantısı çalışıyor.') })
  }

  /** Sends a match summary. Returns false when no webhook is saved. */
  async sendMatch(m: MatchSummary): Promise<WebhookResult> {
    const url = this.settings.getDiscordWebhook()
    if (!url) return { ok: false, error: tr('Webhook kayıtlı değil.') }
    const r = await this.post(url, { username: 'Valo Tracker', embeds: [buildMatchEmbed(m)] })
    if (r.ok) log('Discord', 'success', tr('Maç özeti kanala gönderildi'))
    else log('Discord', 'error', tr('Maç özeti gönderilemedi: {msg}', { msg: r.error ?? '' }))
    return r
  }
}
