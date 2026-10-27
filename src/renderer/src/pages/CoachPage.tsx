import { useEffect, useState } from 'react'
import { Bot, Loader2, ServerOff, TrendingUp } from 'lucide-react'
import type { CoachMode, CoachResult } from '@shared/types'
import { useApp } from '../store'
import { tr } from '@shared/i18n'

const CHARS_PER_TICK = 2
const TICK_MS = 16

export default function CoachPage(): JSX.Element {
  const { status, lastCoach, appSettings, updateApp } = useApp()
  const [loading, setLoading] = useState<CoachMode | null>(null)
  const [manual, setManual] = useState<CoachResult | null>(null)
  const [shown, setShown] = useState(0)
  const connected = status.connection === 'connected'

  // Show the newest result: a manual run, or the automatic one that arrived after a match.
  const result = manual ?? lastCoach?.result ?? null

  const analyze = async (mode: CoachMode): Promise<void> => {
    setLoading(mode)
    setManual(null)
    setShown(0)
    try {
      setManual(await window.api.getAICoaching(mode))
    } catch {
      setManual({ ok: false, error: tr('Analiz başlatılamadı.') })
    } finally {
      setLoading(null)
    }
  }

  // A new automatic result replaces the manual one and restarts the typewriter.
  useEffect(() => {
    if (lastCoach) {
      setManual(null)
      setShown(0)
    }
  }, [lastCoach])

  const text = result?.ok ? (result.text ?? '') : ''
  useEffect(() => {
    if (!text || shown >= text.length) return
    const id = setTimeout(() => setShown((n) => Math.min(text.length, n + CHARS_PER_TICK)), TICK_MS)
    return () => clearTimeout(id)
  }, [text, shown])

  const btn = 'flex items-center gap-2 rounded px-4 py-2 text-sm font-bold disabled:opacity-40'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{tr('AI Koç')}</h1>
        <p className="text-sm text-val-mute">{tr('Maç verilerin yerel yapay zekaya (LM Studio) gönderilir; veriler bilgisayarından çıkmaz.')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => void analyze('last')} disabled={loading !== null || !connected} className={`${btn} bg-val-red hover:opacity-90`}>
          {loading === 'last' ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
          {tr('Son Maçımı Yapay Zekaya Analiz Ettir')}
        </button>
        <button onClick={() => void analyze('trend')} disabled={loading !== null} className={`${btn} border border-val-line hover:bg-val-raised`}>
          {loading === 'trend' ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
          {tr('Son 20 Maçımın Trendini Analiz Et')}
        </button>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-val-mute">
          <input type="checkbox" checked={appSettings.autoCoach} onChange={(e) => updateApp({ autoCoach: e.target.checked })} />
          {tr('Maç bitince otomatik analiz et')}
        </label>
      </div>

      {!connected && <p className="text-sm text-val-mute">{tr('Son maç analizi için Valorant bekleniyor. Trend analizi kayıtlı geçmişle çalışır.')}</p>}

      {loading && (
        <div className="flex items-center gap-3 rounded border border-val-line bg-val-panel p-5 text-sm text-val-mute">
          <Loader2 size={16} className="animate-spin" /> {tr('Koç inceliyor… (yerel modele göre dakikalar sürebilir)')}
        </div>
      )}

      {!loading && result && !result.ok && (
        <div className="flex items-start gap-3 rounded border border-val-red/60 bg-val-red/10 p-5">
          <ServerOff className="mt-0.5 shrink-0 text-val-red" size={20} />
          <p className="select-text text-sm font-semibold">{result.error}</p>
        </div>
      )}

      {!loading && result?.ok && (
        <article className="rounded border border-val-line bg-val-panel p-5" onClick={() => setShown(text.length)} title={tr('Tamamını göstermek için tıkla')}>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-val-red">
            <Bot size={14} /> {tr('Koçun yorumu')} · <span className="text-val-mute">{result.matchLabel}</span>
          </div>
          <p className="select-text whitespace-pre-wrap text-sm leading-relaxed">
            {text.slice(0, shown)}
            {shown < text.length && <span className="animate-pulse text-val-red">▍</span>}
          </p>
        </article>
      )}
    </div>
  )
}
