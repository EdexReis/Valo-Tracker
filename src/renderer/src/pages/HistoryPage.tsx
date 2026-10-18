import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { MatchSummary } from '@shared/types'
import { useApp } from '../store'

const GRADE_COLOR = {
  S: 'bg-amber-400/20 text-amber-300',
  A: 'bg-emerald-400/20 text-emerald-300',
  B: 'bg-sky-400/20 text-sky-300',
  C: 'bg-val-mute/20 text-val-mute',
  D: 'bg-val-red/20 text-val-red'
} as const

const STYLE = {
  win: { bar: 'border-l-emerald-400', text: 'text-emerald-400', label: 'Galibiyet' },
  loss: { bar: 'border-l-val-red', text: 'text-val-red', label: 'Mağlubiyet' },
  draw: { bar: 'border-l-val-mute', text: 'text-val-mute', label: 'Berabere' }
} as const

export default function HistoryPage(): JSX.Element {
  const { status } = useApp()
  const [list, setList] = useState<MatchSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connected = status.connection === 'connected'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setList(await window.api.getMatchHistory())
    } catch {
      setError('Maç geçmişi alınamadı. Valorant açık ve giriş yapılmış olmalı.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (connected) void load()
  }, [connected, load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Kariyer / Geçmiş</h1>
          <p className="text-sm text-val-mute">Son 10 maç</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading || !connected}
          className="flex items-center gap-2 rounded bg-val-red px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-40"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Yenile
        </button>
      </div>

      {error && <p className="text-sm text-val-red">{error}</p>}
      {!connected && <p className="text-sm text-val-mute">Valorant bekleniyor…</p>}

      <div className="space-y-2">
        {list?.map((m) => {
          const s = STYLE[m.result]
          return (
            <div key={m.matchId} className={`flex items-center gap-4 rounded border border-l-4 border-val-line bg-val-panel p-3 ${s.bar}`}>
              {m.agentIcon ? (
                <img src={m.agentIcon} alt={m.agentName} className="h-11 w-11 rounded bg-val-raised" />
              ) : (
                <div className="h-11 w-11 rounded bg-val-raised" />
              )}
              <div className="w-40">
                <div className={`text-sm font-bold ${s.text}`}>{s.label}</div>
                <div className="text-xs text-val-mute">
                  {m.mapName} · {m.queue}
                </div>
              </div>
              <div className="w-24 text-center text-lg font-bold tabular-nums">
                {m.roundsWon} : {m.roundsLost}
              </div>
              <div className="text-sm tabular-nums">
                <span className="font-bold">
                  {m.kills} / {m.deaths} / {m.assists}
                </span>
                <span className="ml-2 text-xs text-val-mute">K/D {(m.kills / Math.max(1, m.deaths)).toFixed(2)}</span>
              </div>
              {m.vts && (
                <div className={`ml-auto rounded px-2 py-1 text-xs font-bold tabular-nums ${GRADE_COLOR[m.vts.grade]}`} title="Valo Tracker Skoru (0-1000)">
                  VTS: {m.vts.score} ({m.vts.grade} Sınıfı)
                </div>
              )}
              <div className={`${m.vts ? '' : 'ml-auto '}text-xs text-val-mute`}>
                {new Date(m.startMillis).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
              </div>
            </div>
          )
        })}
        {list?.length === 0 && <p className="text-sm text-val-mute">Maç bulunamadı.</p>}
      </div>
    </div>
  )
}
