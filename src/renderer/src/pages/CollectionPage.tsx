import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { CollectionData } from '@shared/types'
import { useApp } from '../store'

export default function CollectionPage(): JSX.Element {
  const { status } = useApp()
  const [data, setData] = useState<CollectionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const connected = status.connection === 'connected'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await window.api.getCollection())
    } catch {
      setError('Koleksiyon alınamadı. Valorant açık ve giriş yapılmış olmalı.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (connected) void load()
  }, [connected, load])

  const items = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    return (data?.items ?? []).filter((i) => !q || i.name.toLocaleLowerCase('tr-TR').includes(q))
  }, [data, query])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Koleksiyon</h1>
          <p className="text-sm text-val-mute">
            {data ? `${data.count} skin · tahmini değer ${data.totalVP.toLocaleString('tr-TR')} VP (sadece mağaza fiyatı bilinenler)` : 'Sahip olduğun skinler'}
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
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Skin ara…"
            className="w-full max-w-sm rounded border border-val-line bg-val-bg px-3 py-2 text-sm outline-none focus:border-val-red select-text"
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {items.map((i) => (
              <div key={i.uuid} className="rounded border border-val-line bg-val-panel p-2">
                <div className="flex h-16 items-center justify-center rounded bg-val-bg p-1">
                  {i.icon && <img src={i.icon} alt={i.name} loading="lazy" className="max-h-full max-w-full object-contain" />}
                </div>
                <div className="mt-1.5 truncate text-xs font-semibold" title={i.name}>
                  {i.name}
                </div>
                <div className="text-[11px] text-val-mute">{i.cost ? `${i.cost} VP` : '—'}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
