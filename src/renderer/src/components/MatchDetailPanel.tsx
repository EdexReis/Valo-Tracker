import { useEffect, useState } from 'react'
import { Loader2, Skull } from 'lucide-react'
import type { MatchDetail, RoundInfo } from '@shared/types'
import Heatmap from './Heatmap'

const TYPE_LABEL = { pistol: 'Pistol', eco: 'Eco', force: 'Force', full: 'Full buy' } as const
const TYPE_SHORT = { pistol: 'P', eco: 'E', force: 'F', full: 'B' } as const

function RoundChip({ r }: { r: RoundInfo }): JSX.Element {
  const tip = [
    `Raund ${r.round}: ${r.won ? 'kazandın' : 'kaybettin'}`,
    r.kills ? `${r.kills} kill` : null,
    r.deathSec !== null ? `${r.deathSec}. saniyede öldün${r.killerAgent ? ` (${r.killerAgent})` : ''}` : 'hayatta kaldın',
    r.econ ? `${TYPE_LABEL[r.econ.type]}: ${r.econ.value} (takım ort. ${r.econ.teamAvg})` : null,
    r.flag === 'underbuy' ? 'Takım full alırken sen az aldın' : r.flag === 'overbuy' ? 'Takım eco iken sen full aldın' : null
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

  if (error) return <p className="rounded border border-val-line p-4 text-sm text-val-red">Maç detayı alınamadı (Riot bu maçı artık vermiyor olabilir).</p>
  if (!detail) {
    return (
      <p className="flex items-center gap-2 rounded border border-val-line p-4 text-sm text-val-mute">
        <Loader2 size={15} className="animate-spin" /> Detay yükleniyor…
      </p>
    )
  }

  const e = detail.econ
  const pct = (x: { rounds: number; won: number }): string => (x.rounds ? `%${Math.round((x.won / x.rounds) * 100)}` : '—')

  return (
    <div className="grid gap-5 rounded-b border border-t-0 border-val-line bg-val-bg/60 p-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-val-mute">Raund akışı</h3>
          <div className="flex flex-wrap gap-1.5">
            {detail.rounds.map((r) => (
              <RoundChip key={r.round} r={r} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-val-mute">K = kill, kafatası = öldün, P/E/F/B = pistol / eco / force / full buy, turuncu halka = buy uyumsuzluğu.</p>
        </div>

        {e && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-val-mute">Ekonomi</h3>
            <table className="w-full max-w-md text-sm tabular-nums">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-val-mute">
                  <th className="pb-1">Buy</th>
                  <th>Raund</th>
                  <th>Kazanma</th>
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
                {e.underbuys > 0 && `${e.underbuys} raundda takım full alırken sen az aldın. `}
                {e.overbuys > 0 && `${e.overbuys} raundda takım eco iken sen full aldın.`}
              </p>
            )}
          </div>
        )}
      </div>

      <Heatmap minimap={detail.mapIcon} deaths={detail.deaths} kills={detail.kills} />
    </div>
  )
}
