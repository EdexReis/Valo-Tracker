import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import type { RRPoint, StatsPayload } from '@shared/types'
import { groupStats, isRankedLike, totals, type GroupStat } from '@shared/stats'

type Filter = 'ranked' | 'all'

function Kpi({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="rounded border border-val-line bg-val-panel p-3">
      <div className="text-[11px] font-bold uppercase tracking-widest text-val-mute">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  )
}

function GroupTable({ title, rows, label }: { title: string; rows: GroupStat[]; label: string }): JSX.Element {
  return (
    <section className="rounded border border-val-line bg-val-panel p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-val-mute">{title}</h2>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-widest text-val-mute">
            <th className="pb-2">{label}</th>
            <th>Maç</th>
            <th>Win %</th>
            <th>K/D</th>
            <th>ACS</th>
            <th>VTS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-val-line">
              <td className="flex items-center gap-2 py-1.5 font-semibold">
                {r.icon && <img src={r.icon} alt="" className="h-6 w-6 rounded bg-val-raised" />}
                {r.key}
              </td>
              <td>{r.games}</td>
              <td className={r.winRate >= 50 ? 'text-emerald-400' : 'text-val-red'}>{r.winRate}</td>
              <td>{r.kd.toFixed(2)}</td>
              <td>{r.acs}</td>
              <td>{r.vts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** Rating as one number so rank-ups show as a continuous line. */
const absolute = (p: RRPoint): number => (p.tier > 0 ? p.tier * 100 + p.rr : 0)

function RRChart({ points }: { points: RRPoint[] }): JSX.Element {
  const pts = points.filter((p) => p.tier > 0)
  if (pts.length < 2) return <p className="text-sm text-val-mute">RR grafiği için en az 2 kayıt gerekir; maç oynadıkça dolar.</p>
  const W = 640
  const H = 160
  const ys = pts.map(absolute)
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const span = Math.max(1, max - min)
  const line = pts.map((p, i) => `${(i / (pts.length - 1)) * W},${H - ((absolute(p) - min) / span) * (H - 16) - 8}`).join(' ')
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label="RR grafiği">
        <polyline points={line} fill="none" stroke="#ff4655" strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-xs text-val-mute">
        <span>{new Date(pts[0].t).toLocaleDateString('tr-TR')}</span>
        <span>
          Düşük {min % 100} RR · Yüksek {max % 100} RR (kademe değişimleri dahil)
        </span>
        <span>{new Date(pts[pts.length - 1].t).toLocaleDateString('tr-TR')}</span>
      </div>
    </div>
  )
}

export default function StatsPage(): JSX.Element {
  const [data, setData] = useState<StatsPayload | null>(null)
  const [filter, setFilter] = useState<Filter>('ranked')
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(() => void window.api.getStats().then(setData), [])
  useEffect(load, [load])

  const matches = useMemo(() => (data ? (filter === 'ranked' ? data.matches.filter(isRankedLike) : data.matches) : []), [data, filter])
  const t = useMemo(() => totals(matches), [matches])
  const agents = useMemo(() => groupStats(matches, (m) => m.agentName, (m) => m.agentIcon), [matches])
  const maps = useMemo(() => groupStats(matches, (m) => m.mapName), [matches])

  const doExport = async (format: 'csv' | 'json'): Promise<void> => {
    const r = await window.api.exportHistory(format)
    setNote(r.ok ? `Kaydedildi: ${r.path}` : r.error === 'İptal edildi.' ? null : `Hata: ${r.error}`)
  }

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-val-mute">
        <Loader2 size={15} className="animate-spin" /> Yükleniyor…
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">İstatistik</h1>
          <p className="text-sm text-val-mute">Bu bilgisayarda biriken {data.matches.length} maç. Veriler dışarı gönderilmez.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded border border-val-line bg-val-bg px-2 py-1.5 text-sm outline-none focus:border-val-red"
          >
            <option value="ranked">Rekabetçi + Derecesiz</option>
            <option value="all">Tüm modlar</option>
          </select>
          <button onClick={() => void doExport('csv')} className="flex items-center gap-1.5 rounded border border-val-line px-3 py-1.5 text-sm font-semibold hover:bg-val-raised">
            <Download size={14} /> CSV
          </button>
          <button onClick={() => void doExport('json')} className="flex items-center gap-1.5 rounded border border-val-line px-3 py-1.5 text-sm font-semibold hover:bg-val-raised">
            <Download size={14} /> JSON
          </button>
        </div>
      </div>
      {note && <p className="select-text text-sm text-val-mute">{note}</p>}

      {matches.length === 0 ? (
        <p className="rounded border border-dashed border-val-line p-10 text-center text-sm text-val-mute">
          Henüz kayıtlı maç yok. Valorant'a bağlanınca son 20 maçın otomatik kaydedilir, sonrası her maçtan sonra eklenir.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Kpi label="Maç" value={t.games} />
            <Kpi label="Win %" value={t.winRate} />
            <Kpi label="K/D" value={t.kd.toFixed(2)} />
            <Kpi label="ACS" value={t.acs} />
            <Kpi label="ADR" value={t.adr} />
            <Kpi label="HS %" value={t.hsPercent} />
            <Kpi label="VTS" value={t.vts} />
            <Kpi label="FB/FD raund" value={`${t.firstBloodRate}/${t.firstDeathRate}`} />
          </div>

          <section className="rounded border border-val-line bg-val-panel p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-val-mute">RR geçmişi</h2>
            <RRChart points={data.rr} />
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <GroupTable title="Ajanlar" rows={agents} label="Ajan" />
            <GroupTable title="Haritalar" rows={maps} label="Harita" />
          </div>
        </>
      )}
    </div>
  )
}
