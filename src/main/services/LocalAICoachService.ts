import type { CoachResult } from '@shared/types'
import { LM_STUDIO_URL } from '../constants'
import { log } from '../logger'
import type { CoachData } from './MatchService'

const SYSTEM_PROMPT =
  'Sen sert, profesyonel ve disiplinli bir Valorant espor koçusun. Oyuncunun maç istatistiklerini inceleyip ona Türkçe olarak 3 maddeden oluşan, doğrudan hatasını yüzüne vuran ve nasıl gelişmesi gerektiğini söyleyen sert ama yapıcı bir koçluk tavsiyesi ver. Asla kibar olma, profesyonel bir koç gibi konuş.'

const UNREACHABLE = 'AI Koç sunucusuna (LM Studio) ulaşılamadı. Lütfen yerel sunucuyu başlatın.'
const TIMEOUT_MS = 180_000 // local models can be slow

export class LocalAICoachService {
  /** Sends the match stats to the local LM Studio server and returns the coaching text. Never throws. */
  async getAICoaching(matchData: CoachData): Promise<CoachResult> {
    const matchLabel = `${matchData.map} · ${matchData.agent} · ${matchData.kills}/${matchData.deaths}/${matchData.assists}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const model = await this.loadedModel(ctrl.signal)
      const res = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 800,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Maç verilerim (JSON):\n${JSON.stringify(matchData)}` }
          ]
        })
      })
      if (!res.ok) {
        return { ok: false, error: `LM Studio hata döndürdü (${res.status}). Sunucuda bir model yüklü mü?` }
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const text = json.choices?.[0]?.message?.content?.trim()
      if (!text) return { ok: false, error: 'Model boş yanıt döndürdü.' }
      return { ok: true, text, matchLabel }
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError') return { ok: false, error: 'AI Koç yanıt vermedi (zaman aşımı). Model çok yavaş olabilir.' }
      log('AI Koç', 'error', err.message)
      return { ok: false, error: UNREACHABLE }
    } finally {
      clearTimeout(timer)
    }
  }

  /** LM Studio answers with whatever model is loaded; use its id when the list is available. */
  private async loadedModel(signal: AbortSignal): Promise<string> {
    const res = await fetch(`${LM_STUDIO_URL}/models`, { signal })
    if (!res.ok) return 'local-model'
    const json = (await res.json()) as { data?: Array<{ id: string }> }
    // The list can include embedding models; pick a chat model.
    return json.data?.find((m) => !/embed/i.test(m.id))?.id ?? 'local-model'
  }
}
