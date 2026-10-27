import { useEffect, useState } from 'react'
import { Bell, Loader2, Plus, Search, X } from 'lucide-react'
import type { SkinHit, WishlistHit } from '@shared/types'
import { tr } from '@shared/i18n'

export default function WishlistPanel(): JSX.Element {
  const [list, setList] = useState<SkinHit[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SkinHit[]>([])
  const [checking, setChecking] = useState(false)
  const [hits, setHits] = useState<WishlistHit[] | null>(null)

  useEffect(() => {
    void window.api.getWishlist().then(setList)
  }, [])

  // Debounced search over the skin catalogue.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const id = setTimeout(() => void window.api.searchSkins(query).then(setResults), 200)
    return () => clearTimeout(id)
  }, [query])

  const check = async (): Promise<void> => {
    setChecking(true)
    try {
      setHits(await window.api.checkWishlist())
    } catch {
      setHits([])
    } finally {
      setChecking(false)
    }
  }

  const wished = new Set(list.map((s) => s.uuid))

  return (
    <section className="space-y-4 rounded border border-val-line bg-val-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Bell size={16} className="text-val-red" /> {tr('Skin Wishlist')}
          </h2>
          <p className="text-sm text-val-mute">
            {tr('İstediğin skin günlük mağazana veya Gece Pazarı\'na düşünce Windows bildirimi (ve Telegram kuruluysa mesaj) alırsın. Uygulama açıkken yarım saatte bir kontrol edilir.')}
          </p>
        </div>
        <button
          onClick={() => void check()}
          disabled={checking || list.length === 0}
          className="flex shrink-0 items-center gap-2 rounded border border-val-line px-3 py-2 text-sm font-semibold hover:bg-val-raised disabled:opacity-40"
        >
          {checking && <Loader2 size={14} className="animate-spin" />} {tr('Şimdi kontrol et')}
        </button>
      </div>

      {hits && (
        <p className={`text-sm font-semibold ${hits.length ? 'text-emerald-400' : 'text-val-mute'}`}>
          {hits.length
            ? tr('{skins} mağazada!', {
                skins: hits.map((h) => `${h.name} (${h.where === 'night' ? tr('Gece Pazarı') : tr('günlük mağaza')})`).join(', ')
              })
            : tr('Wishlist skinlerin şu an mağazada değil.')}
        </p>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-val-mute" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr('Skin ara (örn. Reaver, Prime, Elderflame)…')}
          className="w-full rounded border border-val-line bg-val-bg py-2 pl-9 pr-3 text-sm outline-none focus:border-val-red select-text"
        />
      </div>

      {results.length > 0 && (
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto md:grid-cols-3">
          {results.map((s) => (
            <button
              key={s.uuid}
              disabled={wished.has(s.uuid)}
              onClick={() => void window.api.addWish(s.uuid).then(setList)}
              className="flex items-center gap-2 rounded border border-val-line bg-val-bg p-2 text-left text-xs hover:border-val-red disabled:opacity-40"
            >
              {s.icon && <img src={s.icon} alt="" loading="lazy" className="h-8 w-14 object-contain" />}
              <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
              {!wished.has(s.uuid) && <Plus size={14} />}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {list.length === 0 && <span className="text-sm text-val-mute">{tr('Wishlist boş.')}</span>}
        {list.map((s) => (
          <span key={s.uuid} className="flex items-center gap-2 rounded border border-val-line bg-val-bg px-2 py-1 text-xs font-semibold">
            {s.icon && <img src={s.icon} alt="" className="h-5 w-9 object-contain" />}
            {s.name}
            <button onClick={() => void window.api.removeWish(s.uuid).then(setList)} aria-label={tr('Kaldır')} className="text-val-mute hover:text-val-red">
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
    </section>
  )
}
