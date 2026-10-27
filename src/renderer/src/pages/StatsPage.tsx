import { useCallback, useEffect, useMemo, useState } from 'react'
import { Award, Download, Loader2, Send, Target, TrendingUp } from 'lucide-react'
import type { CoPlayerRow, RRPoint, SeasonRank, StatsPayload } from '@shared/types'
import {
  computeBadges,
  groupStats,
  isRankedLike,
  projectRank,
  totals,
  weaponStats,
  weeklyProgress,
  type GroupStat
} from '@shared/stats'
import { useApp } from '../store'
import Heatmap from '../components/Heatmap'
import { locale, tr } from '@shared/i18n'

type Filter = 'ranked' | 'all'

function Kpi({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="rounded border border-val-line bg-val-panel p-3">
      <div className="text-[11px] font-bold uppercase tracking-widest text-val-mute">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  )
}

function Card({ title, icon, children }: { title: string; icon?: JSX.Element; children: React.ReactNode }): JSX.Element {
  return (
    <section className="rounded border border-val-line bg-val-panel p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-val-mute">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function GroupTable({ title, rows, label }: { title: string; rows: GroupStat[]; label: string }): JSX.Element {
  return (
    <Card title={title}>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-widest text-val-mute">
            <th className="pb-2">{label}</th>
            <th>{tr('Maç')}</th>
            <th>{tr('Win %')}</th>
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
    </Card>
  )
}

/** Rating as one number so rank-ups show as a continuous line. */
const absolute = (p: RRPoint): number => (p.tier > 0 ? p.tier * 100 + p.rr : 0)

function RRChart({ points }: { points: RRPoint[] }): JSX.Element {
  const pts = points.filter((p) => p.tier > 0)
  if (pts.length < 2) return <p className="text-sm text-val-mute">{tr('RR grafiği için en az 2 kayıt gerekir; maç oynadıkça dolar.')}</p>
  const W = 640
  const H = 160
  const ys = pts.map(absolute)
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const span = Math.max(1, max - min)
  const line = pts.map((p, i) => `${(i / (pts.length - 1)) * W},${H - ((absolute(p) - min) / span) * (H - 16) - 8}`).join(' ')
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label={tr('RR grafiği')}>
        <polyline points={line} fill="none" stroke="#ff4655" strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-xs text-val-mute">
        <span>{new Date(pts[0].t).toLocaleDateString(locale())}</span>
        <span>{tr('Düşük {low} RR · Yüksek {high} RR (kademe değişimleri dahil)', { low: min % 100, high: max % 100 })}</span>
        <span>{new Date(pts[pts.length - 1].t).toLocaleDateString(locale())}</span>
      </div>
    </div>
  )
}

function GoalsCard({ matches }: { matches: StatsPayload['matches'] }): JSX.Element {
  const { appSettings: s, updateApp } = useApp()
  const goals = { weeklyMatches: s.goalWeeklyMatches, weeklyWins: s.goalWeeklyWins, avgVts: s.goalAvgVts, hsPercent: s.goalHsPercent }
  const progress = weeklyProgress(matches, goals)
  const setters: Record<string, (n: number) => void> = {
    matches: (n) => updateApp({ goalWeeklyMatches: n }),
    wins: (n) => updateApp({ goalWeeklyWins: n }),
    vts: (n) => updateApp({ goalAvgVts: n }),
    hs: (n) => updateApp({ goalHsPercent: n })
  }
  return (
    <Card title={tr('Haftalık hedefler (son 7 gün)')} icon={<Target size={15} />}>
      <div className="grid gap-4 md:grid-cols-2">
        {progress.map((g) => (
          <div key={g.key}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                {g.label} {g.done && <span className="text-emerald-400">✓</span>}
              </span>
              <span className="flex items-center gap-1.5 tabular-nums text-val-mute">
                {g.current} /
                <input
                  type="number"
                  min={1}
                  value={g.target}
                  onChange={(e) => setters[g.key](Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 rounded border border-val-line bg-val-bg px-1.5 py-0.5 text-right text-sm outline-none focus:border-val-red"
                  aria-label={tr('{label} hedefi', { label: g.label })}
                />
                {g.unit}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-val-raised">
              <div className={`h-full ${g.done ? 'bg-emerald-400' : 'bg-val-red'}`} style={{ width: `${Math.min(100, (g.current / g.target) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function BadgesCard({ matches }: { matches: StatsPayload['matches'] }): JSX.Element {
  const badges = useMemo(() => computeBadges(matches), [matches])
  return (
    <Card title={tr('Rozetler')} icon={<Award size={15} />}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {badges.map((b) => (
          <div key={b.key} className={`rounded border p-3 ${b.unlocked ? 'border-amber-400/60 bg-amber-400/10' : 'border-val-line opacity-50'}`}>
            <div className="text-sm font-bold">{b.unlocked ? '🏅' : '🔒'} {b.label}</div>
            <div className="text-[11px] text-val-mute">{b.description}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ProjectionCard({ matches, rr }: { matches: StatsPayload['matches']; rr: RRPoint[] }): JSX.Element {
  const current = rr[rr.length - 1]
  const p = current && current.tier > 0 ? projectRank(matches, current.rr) : null
  return (
    <Card title={tr('Rank tahmini')} icon={<TrendingUp size={15} />}>
      {!p || !current ? (
        <p className="text-sm text-val-mute">{tr('Tahmin için en az 5 Rekabetçi maç ve hem galibiyet hem mağlubiyet kaydı gerekir.')}</p>
      ) : (
        <div className="space-y-1.5 text-sm">
          <p>
            {tr('Son {n} Rekabetçi maç: galibiyette ort. +{win}, mağlubiyette ort. {loss} RR, kazanma %{rate}.', {
              n: p.sample,
              win: p.avgWin,
              loss: p.avgLoss,
              rate: p.winRate
            })}
          </p>
          <p>{tr('Maç başına beklenen: {rr} RR.', { rr: `${p.expectedPerMatch > 0 ? '+' : ''}${p.expectedPerMatch}` })}</p>
          <p className="font-semibold">
            {p.matchesToNext !== null
              ? tr('Bu gidişle bir üst kademeye yaklaşık {n} maç (şu an {rr} RR).', { n: p.matchesToNext, rr: current.rr })
              : tr('Mevcut trend RR kaybettiriyor; kademe atlamak için kazanma oranını yükseltmek gerek.')}
          </p>
          <p className="text-[11px] text-val-mute">{tr('Basit bir tahmindir; Immortal ve üstü kademelerde RR kuralları farklı olabilir.')}</p>
        </div>
      )}
    </Card>
  )
}

const SPECIAL_WEAPONS: Record<string, string> = { ability: 'Yetenek', spike: 'Spike', fall: 'Düşme', other: 'Diğer' }

function WeaponsCard({ matches }: { matches: StatsPayload['matches'] }): JSX.Element {
  const { assets } = useApp()
  const rows = useMemo(() => weaponStats(matches), [matches])
  const info = useMemo(() => new Map(assets.weapons.map((w) => [w.uuid, w])), [assets.weapons])
  const games = matches.filter((m) => m.weaponKills || m.weaponDeaths).length
  return (
    <Card title={tr('Silahlar')}>
      {rows.length === 0 ? (
        <p className="text-sm text-val-mute">{tr('Silah verisi son 20 maçtan itibaren birikir (Valorant\'a bağlanınca otomatik eklenir).')}</p>
      ) : (
        <>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-val-mute">
                <th className="pb-2">{tr('Silah')}</th>
                <th>{tr('Kill')}</th>
                <th>{tr('Pay %')}</th>
                <th>{tr('Maç başı')}</th>
                <th>{tr('Öldüren')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((r) => {
                const w = info.get(r.key)
                return (
                  <tr key={r.key} className="border-t border-val-line">
                    <td className="flex items-center gap-2 py-1.5 font-semibold">
                      {w?.icon && <img src={w.icon} alt="" className="h-6 w-12 object-contain" />}
                      {w?.name ?? (SPECIAL_WEAPONS[r.key] ? tr(SPECIAL_WEAPONS[r.key]) : undefined) ?? tr('Bilinmeyen')}
                    </td>
                    <td>{r.kills}</td>
                    <td>{r.share}</td>
                    <td>{r.killsPerMatch}</td>
                    <td className="text-val-mute">{r.deaths}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-val-mute">{tr('{n} maçın verisi. "Öldüren": seni bu silahla öldürenlerin sayısı.', { n: games })}</p>
        </>
      )}
    </Card>
  )
}

function CoPlayersCard(): JSX.Element {
  const [rows, setRows] = useState<CoPlayerRow[] | null>(null)
  useEffect(() => {
    window.api.getCoPlayers().then(setRows, () => setRows([]))
  }, [])
  return (
    <Card title={tr('Birlikte oynadıkların')}>
      {!rows && <p className="text-sm text-val-mute">{tr('Yükleniyor…')}</p>}
      {rows && rows.length === 0 && (
        <p className="text-sm text-val-mute">
          {tr('Uygulama açıkken oynadığın maçlardaki takım arkadaşların kaydedilir; aynı oyuncuyla 2 maç oynayınca burada görünür. Yayıncı modundaki oyuncular hiç kaydedilmez.')}
        </p>
      )}
      {rows && rows.length > 0 && (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-val-mute">
              <th className="pb-2">{tr('Oyuncu')}</th>
              <th>{tr('Maç')}</th>
              <th>{tr('G-M')}</th>
              <th>{tr('Win %')}</th>
              <th>{tr('Ort. VTS')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.puuid} className="border-t border-val-line">
                <td className="select-text py-1.5 font-semibold">{r.name ?? <span className="font-normal text-val-mute">{tr('Valorant açıkken görünür')}</span>}</td>
                <td>{r.games}</td>
                <td>
                  {r.wins}-{r.losses}
                </td>
                <td className={r.winRate >= 50 ? 'text-emerald-400' : 'text-val-red'}>{r.winRate}</td>
                <td>{r.avgVts || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function SeasonCard(): JSX.Element {
  const [rows, setRows] = useState<SeasonRank[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    window.api.getSeasonHistory().then(setRows, () => setFailed(true))
  }, [])
  return (
    <Card title={tr('Sezon geçmişi')}>
      {failed && <p className="text-sm text-val-mute">{tr('Sezon verisi için Valorant\'a bağlı olmalısın.')}</p>}
      {!failed && !rows && <p className="text-sm text-val-mute">{tr('Yükleniyor…')}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-val-mute">{tr('Kayıtlı sezon yok.')}</p>}
      {rows && rows.length > 0 && (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-val-mute">
              <th className="pb-2">{tr('Sezon')}</th>
              <th>{tr('Rank')}</th>
              <th>{tr('Maç')}</th>
              <th>{tr('Win %')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.seasonId} className="border-t border-val-line">
                <td className="py-1.5 font-semibold">{s.name}</td>
                <td className="flex items-center gap-2 py-1.5">
                  {s.tierIcon && <img src={s.tierIcon} alt="" className="h-6 w-6" />}
                  {s.tierName}
                </td>
                <td>{s.games}</td>
                <td>{s.games ? Math.round((s.wins / s.games) * 100) : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function HeatmapCard({ matches }: { matches: StatsPayload['matches'] }): JSX.Element {
  const { assets } = useApp()
  const names = useMemo(() => [...new Set(matches.filter((m) => m.deathPts?.length || m.killPts?.length).map((m) => m.mapName))].sort(), [matches])
  const [map, setMap] = useState('')
  const current = map && names.includes(map) ? map : (names[0] ?? '')
  const onMap = matches.filter((m) => m.mapName === current)
  const deaths = onMap.flatMap((m) => m.deathPts ?? [])
  const kills = onMap.flatMap((m) => m.killPts ?? [])
  const minimap = assets.maps.find((m) => m.name === current)?.minimap ?? null
  return (
    <Card title={tr('Isı haritası (tüm maçların)')}>
      {names.length === 0 ? (
        <p className="text-sm text-val-mute">{tr('Konum verisi yeni maçlardan itibaren birikir (son 20 maç bağlanınca otomatik eklenir).')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <select
              value={current}
              onChange={(e) => setMap(e.target.value)}
              className="w-full rounded border border-val-line bg-val-bg px-2 py-1.5 text-sm outline-none focus:border-val-red"
            >
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="text-xs text-val-mute">{tr('{n} maç. Kırmızı yoğunlukların, en sık öldüğün noktalar.', { n: onMap.length })}</p>
          </div>
          <div className="max-w-md">
            <Heatmap minimap={minimap} deaths={deaths} kills={kills} />
          </div>
        </div>
      )}
    </Card>
  )
}

export default function StatsPage(): JSX.Element {
  const [data, setData] = useState<StatsPayload | null>(null)
  const [filter, setFilter] = useState<Filter>('ranked')
  const [note, setNote] = useState<string | null>(null)
  const [report, setReport] = useState<string | null>(null)

  const load = useCallback(() => void window.api.getStats().then(setData), [])
  useEffect(load, [load])

  const matches = useMemo(() => (data ? (filter === 'ranked' ? data.matches.filter(isRankedLike) : data.matches) : []), [data, filter])
  const t = useMemo(() => totals(matches), [matches])
  const agents = useMemo(() => groupStats(matches, (m) => m.agentName, (m) => m.agentIcon), [matches])
  const maps = useMemo(() => groupStats(matches, (m) => m.mapName), [matches])

  const doExport = async (format: 'csv' | 'json'): Promise<void> => {
    const r = await window.api.exportHistory(format)
    setNote(r.ok ? tr('Kaydedildi: {path}', { path: r.path ?? '' }) : r.canceled ? null : tr('Hata: {msg}', { msg: r.error ?? '' }))
  }

  const showReport = async (send: boolean): Promise<void> => {
    setReport(await window.api.getWeeklyReport(send))
    if (send) setNote(tr('Rapor bildirim olarak gönderildi.'))
  }

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-val-mute">
        <Loader2 size={15} className="animate-spin" /> {tr('Yükleniyor…')}
      </p>
    )
  }

  const btn = 'flex items-center gap-1.5 rounded border border-val-line px-3 py-1.5 text-sm font-semibold hover:bg-val-raised'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{tr('İstatistik')}</h1>
          <p className="text-sm text-val-mute">{tr('Bu bilgisayarda biriken {n} maç. Veriler dışarı gönderilmez.', { n: data.matches.length })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded border border-val-line bg-val-bg px-2 py-1.5 text-sm outline-none focus:border-val-red"
          >
            <option value="ranked">{tr('Rekabetçi + Derecesiz')}</option>
            <option value="all">{tr('Tüm modlar')}</option>
          </select>
          <button onClick={() => void showReport(false)} className={btn}>
            {tr('Haftalık rapor')}
          </button>
          <button onClick={() => void showReport(true)} className={btn}>
            <Send size={14} /> {tr('Bildirim olarak gönder')}
          </button>
          <button onClick={() => void doExport('csv')} className={btn}>
            <Download size={14} /> CSV
          </button>
          <button onClick={() => void doExport('json')} className={btn}>
            <Download size={14} /> JSON
          </button>
        </div>
      </div>
      {note && <p className="select-text text-sm text-val-mute">{note}</p>}
      {report && <pre className="select-text whitespace-pre-wrap rounded border border-val-line bg-val-panel p-4 text-sm">{report}</pre>}

      {matches.length === 0 ? (
        <p className="rounded border border-dashed border-val-line p-10 text-center text-sm text-val-mute">
          {tr('Henüz kayıtlı maç yok. Valorant\'a bağlanınca son 20 maçın otomatik kaydedilir, sonrası her maçtan sonra eklenir.')}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Kpi label={tr('Maç')} value={t.games} />
            <Kpi label={tr('Win %')} value={t.winRate} />
            <Kpi label="K/D" value={t.kd.toFixed(2)} />
            <Kpi label="ACS" value={t.acs} />
            <Kpi label="ADR" value={t.adr} />
            <Kpi label={tr('HS %')} value={t.hsPercent} />
            <Kpi label="VTS" value={t.vts} />
            <Kpi label={tr('FB/FD raund')} value={`${t.firstBloodRate}/${t.firstDeathRate}`} />
          </div>

          <GoalsCard matches={data.matches} />

          <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
            <Card title={tr('RR geçmişi')}>
              <RRChart points={data.rr} />
            </Card>
            <ProjectionCard matches={data.matches} rr={data.rr} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <GroupTable title={tr('Ajanlar')} rows={agents} label={tr('Ajan')} />
            <GroupTable title={tr('Haritalar')} rows={maps} label={tr('Harita')} />
          </div>

          <WeaponsCard matches={matches} />
          <HeatmapCard matches={matches} />
          <CoPlayersCard />
          <SeasonCard />
          <BadgesCard matches={data.matches} />
        </>
      )}
    </div>
  )
}
