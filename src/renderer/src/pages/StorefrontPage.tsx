import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { StoreSkin, StorefrontData } from '@shared/types'
import { useApp } from '../store'
import WishlistPanel from '../components/WishlistPanel'
import StoreArchivePanel from '../components/StoreArchivePanel'

function formatRemaining(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return d > 0 ? `${d}g ${h}s` : `${h}s ${m}dk`
}

function SkinCard({ s }: { s: StoreSkin }): JSX.Element {
  return (
    <div className="relative rounded border border-val-line bg-val-panel p-3">
      {s.discountPercent !== undefined && (
        <span className="absolute right-2 top-2 rounded bg-val-red px-1.5 py-0.5 text-xs font-bold">-{s.discountPercent}%</span>
      )}
      <div className="flex h-28 items-center justify-center rounded bg-val-bg p-2">
        {s.icon && <img src={s.icon} alt={s.name} className="max-h-full max-w-full object-contain" />}
      </div>
      <div className="mt-2 truncate text-sm font-semibold" title={s.name}>
        {s.name}
      </div>
      {s.discountedCost == null && s.cost != null && (
        <div className="text-xs font-bold">{s.cost} VP</div>
      )}
      {s.discountedCost != null && (
        <div className="text-xs text-val-mute">
          <span className="font-bold text-val-text">{s.discountedCost} VP</span>
          {s.cost != null && <span className="ml-2 line-through">{s.cost}</span>}
        </div>
      )}
    </div>
  )
}

export default function StorefrontPage(): JSX.Element {
  const { status } = useApp()
  const [data, setData] = useState<StorefrontData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connected = status.connection === 'connected'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await window.api.getStorefront())
    } catch (e) {
      setError('Mağaza alınamadı. Valorant açık ve giriş yapılmış olmalı.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (connected) void load()
  }, [connected, load])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Mağaza</h1>
          <p className="text-sm text-val-mute">
            {data ? `Günlük mağaza yenilenmesine ${formatRemaining(data.dailyRemainingSec)}` : 'Günlük skin teklifleri'}
          </p>
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

      {data && (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-val-mute">Günlük Mağaza</h2>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {data.dailyOffers.map((s) => (
                <SkinCard key={s.id} s={s} />
              ))}
            </div>
          </section>

          {data.nightMarket?.isActive && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-widest text-val-red">
                Gece Pazarı · {formatRemaining(data.nightMarket.remainingSec)} kaldı
              </h2>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {data.nightMarket.offers.map((s) => (
                  <SkinCard key={s.id} s={s} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <WishlistPanel />
      <StoreArchivePanel />
    </div>
  )
}
