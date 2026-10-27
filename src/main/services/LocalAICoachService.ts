import type { AiTestResult, CoachResult } from '@shared/types'
import { log } from '../logger'
import type { CoachData } from './MatchService'
import { tr } from '@shared/i18n'

const SYSTEM_PROMPT =
  'Sen sert, profesyonel ve disiplinli bir Valorant espor koçusun. Oyuncunun maç istatistiklerini inceleyip ona Türkçe olarak 3 maddeden oluşan, doğrudan hatasını yüzüne vuran ve nasıl gelişmesi gerektiğini söyleyen sert ama yapıcı bir koçluk tavsiyesi ver. Asla kibar olma, profesyonel bir koç gibi konuş.'

const UNREACHABLE = 'AI Koç sunucusuna (LM Studio / Ollama) ulaşılamadı. Lütfen yerel sunucuyu başlatın.'
const TIMEOUT_MS = 180_000 // local models can be slow

export interface AiConfig {
  /** OpenAI-compatible base URL, e.g. http://127.0.0.1:1234/v1 */
  url: string
  /** empty = use whichever chat model the server reports first */
  model: string
}

/** Talks to a local OpenAI-compatible server (LM Studio, Ollama...). The URL is restricted to this machine. */
export class LocalAICoachService {
  constructor(private config: () => AiConfig) {}

  /** Single-match coaching. Never throws. */
  getAICoaching(matchData: CoachData): Promise<CoachResult> {
    const label = `${matchData.map} · ${matchData.agent} · ${matchData.kills}/${matchData.deaths}/${matchData.assists}`
    return this.ask(
      tr('Maç verilerim (JSON). "economy" alanı buy türlerine göre raund sayısı ve kazanılan raundları verir:\n{json}', { json: JSON.stringify(matchData) }),
      label
    )
  }

  /** Coaching over the last ~20 ranked/unrated matches. Never throws. */
  getTrendCoaching(trend: Record<string, unknown>): Promise<CoachResult> {
    return this.ask(
      tr('Son {n} maçımın özeti (JSON). Tekil maçlara değil, tekrar eden alışkanlıklarıma ve trende odaklan:\n{json}', { n: String(trend.matches), json: JSON.stringify(trend) }),
      tr('Son {n} maç · trend analizi', { n: String(trend.matches) })
    )
  }

  /** Checks that the server answers and reports which model would be used. */
  async ping(): Promise<AiTestResult> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const model = await this.loadedModel(ctrl.signal, true)
      return { ok: true, model }
    } catch (e) {
      const err = e as Error
      return { ok: false, error: err.name === 'AbortError' ? tr('Sunucu yanıt vermedi.') : tr(UNREACHABLE) }
    } finally {
      clearTimeout(timer)
    }
  }

  private async ask(userContent: string, matchLabel: string): Promise<CoachResult> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const model = await this.loadedModel(ctrl.signal)
      const res = await fetch(`${this.config().url}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 800,
          messages: [
            { role: 'system', content: tr(SYSTEM_PROMPT) },
            { role: 'user', content: userContent }
          ]
        })
      })
      if (!res.ok) {
        return { ok: false, error: tr('AI sunucusu hata döndürdü ({status}). Bir model yüklü mü?', { status: res.status }) }
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const text = json.choices?.[0]?.message?.content?.trim()
      if (!text) return { ok: false, error: tr('Model boş yanıt döndürdü.') }
      return { ok: true, text, matchLabel }
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError') return { ok: false, error: tr('AI Koç yanıt vermedi (zaman aşımı). Model çok yavaş olabilir.') }
      log(tr('AI Koç'), 'error', err.message)
      return { ok: false, error: tr(UNREACHABLE) }
    } finally {
      clearTimeout(timer)
    }
  }

  /** The configured model, or the server's first chat model when none is set. */
  private async loadedModel(signal: AbortSignal, strict = false): Promise<string> {
    const { url, model } = this.config()
    if (model && !strict) return model
    const res = await fetch(`${url}/models`, { signal })
    if (!res.ok) {
      if (strict) throw new Error(`HTTP ${res.status}`)
      return model || 'local-model'
    }
    const json = (await res.json()) as { data?: Array<{ id: string }> }
    // The list can include embedding models; pick a chat model.
    return model || json.data?.find((m) => !/embed/i.test(m.id))?.id || 'local-model'
  }
}
