import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react'
import type { MatchSummary, VtsResult } from '@shared/types'
import { useApp } from '../store'
import MatchDetailPanel from '../components/MatchDetailPanel'
import { locale, tr } from '@shared/i18n'

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

/** Points color: below average red, around average blue, above average green. */
const barColor = (p: number): string => (p >= 65 ? 'bg-emerald-400' : p >= 40 ? 'bg-sky-400' : 'bg-val-red')

function Breakdown({ vts }: { vts: VtsResult }): JSX.Element {
  return (
    <div className="rounded-b border border-t-0 border-val-line bg-val-bg/60 p-4">
      <div className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
        {vts.components?.map((c) => (
          <div key={c.key}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold">
                {tr(c.label)} <span className="font-normal text-val-mute">· %{Math.round(c.weight * 100)}</span>
              </span>
              <span className="text-val-mute">{c.value}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-val-raised">
              <div className={`h-full ${barColor(c.points)}`} style={{ width: `${c.points}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-val-mute">
        {tr('Çubuklar 0-100 puan, 50 = ortalama oyuncu. ACS, ajan rolüne göre değerlendirilir.')}
        {typeof vts.kast === 'number' && ` KAST %${vts.kast}.`}
        {!!vts.opponentAdjust && ` ${tr('Rakip rank düzeltmesi: {adj}.', { adj: `${vts.opponentAdjust > 0 ? '+' : ''}${vts.opponentAdjust}` })}`}
      </p>
    </div>
  )
}

export default function HistoryPage(): JSX.Element {
  const { status } = useApp()
  const [list, setList] = useState<MatchSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const connected = status.connection === 'connected'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setList(await window.api.getOwnHistory())
    } catch {
      setError(tr('Maç geçmişi alınamadı. Valorant açık ve giriş yapılmış olmalı.'))
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
          <h1 className="text-xl font-bold">{tr('Kariyer / Geçmiş')}</h1>
          <p className="text-sm text-val-mute">{tr('Son 30 maç (yerel kayıttan). VTS rozetine tıklayınca puanın dökümü açılır.')}</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading || !connected}
          className="flex items-center gap-2 rounded bg-val-red px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-40"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {tr('Yenile')}
        </button>
      </div>

      {error && <p className="text-sm text-val-red">{error}</p>}
      {!connected && <p className="text-sm text-val-mute">{tr('Valorant bekleniyor…')}</p>}

      <div className="space-y-2">
        {list?.map((m) => {
          const s = STYLE[m.result]
          const expanded = open === m.matchId && !!m.vts?.components
          const showDetail = detail === m.matchId
          return (
            <div key={m.matchId}>
              <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 border border-l-4 border-val-line bg-val-panel p-3 ${s.bar} ${expanded || showDetail ? 'rounded-t' : 'rounded'}`}>
                {m.agentIcon ? (
                  <img src={m.agentIcon} alt={m.agentName} className="h-11 w-11 rounded bg-val-raised" />
                ) : (
                  <div className="h-11 w-11 rounded bg-val-raised" />
                )}
                <div className="w-36 shrink-0">
                  <div className={`text-sm font-bold ${s.text}`}>{tr(s.label)}</div>
                  <div className="text-xs text-val-mute">
                    {m.mapName} · {tr(m.queue)}
                  </div>
                </div>
                <div className="w-20 shrink-0 text-center text-lg font-bold tabular-nums">
                  {m.roundsWon} : {m.roundsLost}
                </div>
                <div className="shrink-0 whitespace-nowrap text-sm tabular-nums">
                  <span className="font-bold">
                    {m.kills} / {m.deaths} / {m.assists}
                  </span>
                  <span className="ml-2 text-xs text-val-mute">
                    K/D {(m.kills / Math.max(1, m.deaths)).toFixed(2)} · ACS {m.acs}
                  </span>
                </div>
                {m.vts && (
                  <button
                    onClick={() => setOpen(expanded ? null : m.matchId)}
                    disabled={!m.vts.components}
                    className={`ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs font-bold tabular-nums ${GRADE_COLOR[m.vts.grade]}`}
                    title={tr('Valo Tracker Skoru (0-1000)')}
                  >
                    {tr('VTS: {score} ({grade} Sınıfı)', { score: m.vts.score, grade: m.vts.grade })}
                    {m.vts.components && <ChevronDown size={13} className={expanded ? 'rotate-180' : ''} />}
                  </button>
                )}
                {typeof m.rrChange === 'number' && m.queueId === 'competitive' && (
                  <span className={`shrink-0 whitespace-nowrap text-xs font-bold tabular-nums ${m.rrChange >= 0 ? 'text-emerald-400' : 'text-val-red'}`}>
                    {m.rrChange > 0 ? '+' : ''}
                    {m.rrChange} RR
                  </span>
                )}
                <button
                  onClick={() => setDetail(showDetail ? null : m.matchId)}
                  className="shrink-0 rounded border border-val-line px-2 py-1 text-xs font-semibold text-val-mute hover:bg-val-raised hover:text-val-text"
                >
                  {tr('Detay')}
                </button>
                <div className={`${m.vts ? '' : 'ml-auto '}shrink-0 whitespace-nowrap text-xs text-val-mute`}>
                  {new Date(m.startMillis).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
              {expanded && m.vts && <Breakdown vts={m.vts} />}
              {showDetail && <MatchDetailPanel matchId={m.matchId} />}
            </div>
          )
        })}
        {list?.length === 0 && <p className="text-sm text-val-mute">{tr('Maç bulunamadı.')}</p>}
      </div>
    </div>
  )
}
