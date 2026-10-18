import { useEffect, useMemo, useState } from 'react'
import { Archive } from 'lucide-react'
import type { StoreDay, StoreSkinDay } from '@shared/types'

function Mini({ s, night }: { s: StoreSkinDay; night?: boolean }): JSX.Element {
  const price = s.discountedCost ?? s.cost
  return (
    <div className={`flex items-center gap-2 rounded border bg-val-bg p-1.5 ${night ? 'border-purple-400/50' : 'border-val-line'}`} title={s.name}>
      {s.icon && <img src={s.icon} alt="" loading="lazy" className="h-8 w-14 object-contain" />}
      <div className="min-w-0 text-[11px] leading-tight">
        <div className="truncate font-semibold">{s.name}</div>
        <div className="text-val-mute">
          {price ? `${price} VP` : '—'}
          {s.discountPercent ? ` · -%${s.discountPercent}` : ''}
        </div>
      </div>
    </div>
  )
}

export default function StoreArchivePanel(): JSX.Element {
  const [days, setDays] = useState<StoreDay[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    void window.api.getStoreArchive().then(setDays)
  }, [])

  const q = query.trim().toLocaleLowerCase('tr-TR')
  const shown = useMemo(() => {
    const has = (l: StoreSkinDay[]): boolean => l.some((s) => s.name.toLocaleLowerCase('tr-TR').includes(q))
    return (q ? days.filter((d) => has(d.daily) || has(d.night)) : days).slice(0, 30)
  }, [days, q])

  return (
    <section className="space-y-4 rounded border border-val-line bg-val-panel p-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Archive size={16} className="text-val-red" /> Mağaza Arşivi
        </h2>
        <p className="text-sm text-val-mute">Mağazanı her açışında günlük teklifler kaydedilir. Geçmiş günlere bakabilir, bir skinin son ne zaman düştüğünü arayabilirsin. Arşiv kurulumdan itibaren birikir.</p>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Skin ara (son ne zaman düştü?)…"
        className="w-full max-w-sm rounded border border-val-line bg-val-bg px-3 py-2 text-sm outline-none focus:border-val-red select-text"
      />
      {shown.length === 0 && <p className="text-sm text-val-mute">{days.length ? 'Eşleşen gün yok.' : 'Henüz arşivlenmiş gün yok. Mağaza sekmesi açıldıkça dolar.'}</p>}
      <div className="space-y-3">
        {shown.map((d) => (
          <div key={d.date}>
            <div className="mb-1 text-xs font-bold text-val-mute">{new Date(d.date).toLocaleDateString('tr-TR', { dateStyle: 'long' })}</div>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {d.daily.map((s) => (
                <Mini key={s.uuid} s={s} />
              ))}
              {d.night.map((s) => (
                <Mini key={`n${s.uuid}`} s={s} night />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
