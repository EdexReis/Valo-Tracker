import { useEffect, useState } from 'react'
import { Bot, Loader2, ServerOff } from 'lucide-react'
import type { CoachResult } from '@shared/types'
import { useApp } from '../store'

const CHARS_PER_TICK = 2
const TICK_MS = 16

export default function CoachPage(): JSX.Element {
  const { status } = useApp()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CoachResult | null>(null)
  const [shown, setShown] = useState(0)
  const connected = status.connection === 'connected'

  const analyze = async (): Promise<void> => {
    setLoading(true)
    setResult(null)
    setShown(0)
    try {
      setResult(await window.api.getAICoaching())
    } catch {
      setResult({ ok: false, error: 'Analiz başlatılamadı.' })
    } finally {
      setLoading(false)
    }
  }

  // Typewriter effect over the finished text.
  const text = result?.ok ? (result.text ?? '') : ''
  useEffect(() => {
    if (!text || shown >= text.length) return
    const id = setTimeout(() => setShown((n) => Math.min(text.length, n + CHARS_PER_TICK)), TICK_MS)
    return () => clearTimeout(id)
  }, [text, shown])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">AI Koç</h1>
          <p className="text-sm text-val-mute">Son maçın yerel yapay zekaya (LM Studio) gönderilir; veriler bilgisayarından çıkmaz.</p>
        </div>
        <button
          onClick={() => void analyze()}
          disabled={loading || !connected}
          className="flex items-center gap-2 rounded bg-val-red px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-40"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
          Son Maçımı Yapay Zekaya Analiz Ettir
        </button>
      </div>

      {!connected && <p className="text-sm text-val-mute">Valorant bekleniyor…</p>}

      {loading && (
        <div className="flex items-center gap-3 rounded border border-val-line bg-val-panel p-5 text-sm text-val-mute">
          <Loader2 size={16} className="animate-spin" /> Koç maçını inceliyor… (yerel modele göre dakikalar sürebilir)
        </div>
      )}

      {result && !result.ok && (
        <div className="flex items-start gap-3 rounded border border-val-red/60 bg-val-red/10 p-5">
          <ServerOff className="mt-0.5 shrink-0 text-val-red" size={20} />
          <p className="select-text text-sm font-semibold">{result.error}</p>
        </div>
      )}

      {result?.ok && (
        <article className="rounded border border-val-line bg-val-panel p-5" onClick={() => setShown(text.length)} title="Tamamını göstermek için tıkla">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-val-red">
            <Bot size={14} /> Koçun yorumu · <span className="text-val-mute">{result.matchLabel}</span>
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
