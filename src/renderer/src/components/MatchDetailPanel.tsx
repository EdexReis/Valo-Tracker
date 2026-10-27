import { useEffect, useState } from 'react'
import { Download, Loader2, Skull } from 'lucide-react'
import type { MatchDetail, RoundInfo, TimelineFormat } from '@shared/types'
import Heatmap from './Heatmap'
import { tr } from '@shared/i18n'

const TYPE_LABEL = { pistol: 'Pistol', eco: 'Eco', force: 'Force', full: 'Full buy' } as const
const TYPE_SHORT = { pistol: 'P', eco: 'E', force: 'F', full: 'B' } as const

function TimelineExport({ matchId }: { matchId: string }): JSX.Element {
  const [format, setFormat] = useState<TimelineFormat>('csv')
  const [offset, setOffset] = useState(0)
  const [pre, setPre] = useState(5)
  const [post, setPost] = useState(3)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (): Promise<void> => {
    setNote(null)
    const r = await window.api.exportTimeline(matchId, format, { offsetSec: offset, preRollSec: pre, postRollSec: post })
    if (r.ok) setNote({ ok: true, text: tr('Kaydedildi: {path}', { path: r.path ?? '' }) })
    else if (!r.canceled) setNote({ ok: false, text: r.error ?? '' })
  }

  const input = 'w-16 rounded border border-val-line bg-val-bg px-1.5 py-1 text-right text-sm outline-none focus:border-val-red'
  return (
    <div>
      <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-val-mute">{tr('Zaman damgalarını dışa aktar')}</h3>
      <p className="mb-2 max-w-xl text-[11px] text-val-mute">
        {tr('Kill ve ölüm anlarını video kaydında işaret olarak kullan. 0:00 maçın başlangıcıdır; kaydın başladığı an farklıysa kaymayı ayarla.')}
      </p>
      <div className="flex flex-wrap items-end gap-3 text-xs text-val-mute">
        <label className="space-y-1">
          <span>{tr('Dosya türü')}</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as TimelineFormat)} className="block rounded border border-val-line bg-val-bg px-2 py-1 text-sm text-val-text outline-none focus:border-val-red">
            <option value="csv">{tr('CSV (tablo)')}</option>
            <option value="txt">{tr('Bölümler (.txt)')}</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <label className="space-y-1">
          <span>{tr('Kayma (sn)')}</span>
          <input type="number" value={offset} onChange={(e) => setOffset(Number(e.target.value) || 0)} className={`block ${input}`} />
        </label>
        <label className="space-y-1">
          <span>{tr('Önce (sn)')}</span>
          <input type="number" min={0} value={pre} onChange={(e) => setPre(Math.max(0, Number(e.target.value) || 0))} className={`block ${input}`} />
        </label>
        <label className="space-y-1">
          <span>{tr('Sonra (sn)')}</span>
          <input type="number" min={0} value={post} onChange={(e) => setPost(Math.max(0, Number(e.target.value) || 0))} className={`block ${input}`} />
        </label>
        <button onClick={() => void run()} className="flex items-center gap-1.5 rounded border border-val-line px-3 py-1.5 text-sm font-semibold text-val-text hover:bg-val-raised">
          <Download size={14} /> {tr('Dışa aktar')}
        </button>
      </div>
      {note && <p className={`mt-2 select-text text-xs ${note.ok ? 'text-emerald-400' : 'text-val-red'}`}>{note.text}</p>}
    </div>
  )
}

function RoundChip({ r }: { r: RoundInfo }): JSX.Element {
  const tip = [
    tr(r.won ? 'Raund {n}: kazandın' : 'Raund {n}: kaybettin', { n: r.round }),
    r.kills ? tr('{n} kill', { n: r.kills }) : null,
    r.deathSec !== null
      ? r.killerAgent
        ? tr('{s}. saniyede öldün ({agent})', { s: r.deathSec, agent: r.killerAgent })
        : tr('{s}. saniyede öldün', { s: r.deathSec })
      : tr('hayatta kaldın'),
    r.econ ? tr('{type}: {value} (takım ort. {avg})', { type: TYPE_LABEL[r.econ.type], value: r.econ.value, avg: r.econ.teamAvg }) : null,
    r.flag === 'underbuy' ? tr('Takım full alırken sen az aldın') : r.flag === 'overbuy' ? tr('Takım eco iken sen full aldın') : null
  ]
    .filter(Boolean)
    .join('\n')
  return (
    <div
      title={tip}
      className={`flex h-14 w-11 flex-col items-center justify-between rounded border py-1 text-[10px] font-bold ${
        r.won ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-val-red/60 bg-val-red/10'
      } ${r.flag ? 'ring-1 ring-orange-400' : ''}`}
    >
      <span className="text-val-mute">{r.round}</span>
      <span className="flex items-center gap-0.5">
        {r.kills > 0 && <span className="text-emerald-300">{r.kills}K</span>}
        {r.deathSec !== null && <Skull size={11} className="text-val-red" />}
      </span>
      <span className={r.flag ? 'text-orange-300' : 'text-val-mute'}>{r.econ ? TYPE_SHORT[r.econ.type] : '·'}</span>
    </div>
  )
}

export default function MatchDetailPanel({ matchId }: { matchId: string }): JSX.Element {
  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.getMatchDetail(matchId).then(
      (d) => !cancelled && setDetail(d),
      () => !cancelled && setError(true)
    )
    return () => {
      cancelled = true
    }
  }, [matchId])

  if (error) return <p className="rounded border border-val-line p-4 text-sm text-val-red">{tr('Maç detayı alınamadı (Riot bu maçı artık vermiyor olabilir).')}</p>
  if (!detail) {
    return (
      <p className="flex items-center gap-2 rounded border border-val-line p-4 text-sm text-val-mute">
        <Loader2 size={15} className="animate-spin" /> {tr('Detay yükleniyor…')}
      </p>
    )
  }

  const e = detail.econ
  const pct = (x: { rounds: number; won: number }): string => (x.rounds ? `%${Math.round((x.won / x.rounds) * 100)}` : '—')

  return (
    <div className="grid gap-5 rounded-b border border-t-0 border-val-line bg-val-bg/60 p-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-val-mute">{tr('Raund akışı')}</h3>
          <div className="flex flex-wrap gap-1.5">
            {detail.rounds.map((r) => (
              <RoundChip key={r.round} r={r} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-val-mute">{tr('K = kill, kafatası = öldün, P/E/F/B = pistol / eco / force / full buy, turuncu halka = buy uyumsuzluğu.')}</p>
        </div>

        {e && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-val-mute">{tr('Ekonomi')}</h3>
            <table className="w-full max-w-md text-sm tabular-nums">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-val-mute">
                  <th className="pb-1">{tr('Buy')}</th>
                  <th>{tr('Raund')}</th>
                  <th>{tr('Kazanma')}</th>
                </tr>
              </thead>
              <tbody>
                {(['pistol', 'eco', 'force', 'full'] as const).map((k) => (
                  <tr key={k} className="border-t border-val-line">
                    <td className="py-1 font-semibold">{TYPE_LABEL[k]}</td>
                    <td>{e[k].rounds}</td>
                    <td>{pct(e[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(e.underbuys > 0 || e.overbuys > 0) && (
              <p className="mt-2 text-xs text-orange-300">
                {e.underbuys > 0 && `${tr('{n} raundda takım full alırken sen az aldın.', { n: e.underbuys })} `}
                {e.overbuys > 0 && tr('{n} raundda takım eco iken sen full aldın.', { n: e.overbuys })}
              </p>
            )}
          </div>
        )}

        <TimelineExport matchId={matchId} />
      </div>

      <Heatmap minimap={detail.mapIcon} deaths={detail.deaths} kills={detail.kills} />
    </div>
  )
}
