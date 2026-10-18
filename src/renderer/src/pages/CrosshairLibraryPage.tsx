import { useEffect, useState } from 'react'
import { Check, Copy, Plus, Trash2 } from 'lucide-react'
import type { SavedCrosshair } from '@shared/types'

export default function CrosshairLibraryPage(): JSX.Element {
  const [items, setItems] = useState<SavedCrosshair[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    void window.api.getCrosshairs().then(setItems)
  }, [])

  const add = async (): Promise<void> => {
    if (!name.trim() || !code.trim()) return
    setItems(await window.api.addCrosshair({ name, code }))
    setName('')
    setCode('')
  }

  const copy = async (c: SavedCrosshair): Promise<void> => {
    try {
      await navigator.clipboard.writeText(c.code)
      setCopied(c.id)
      setTimeout(() => setCopied((cur) => (cur === c.id ? null : cur)), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  const input = 'rounded border border-val-line bg-val-bg px-3 py-2 text-sm outline-none focus:border-val-red select-text'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Nişangahlar</h1>
        <p className="text-sm text-val-mute">
          Kendi nişangah kodlarını sakla. Kopyala, Valorant'ta Ayarlar → Nişangah → Profil İçe Aktar alanına yapıştır.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded border border-val-line bg-val-panel p-4">
        <input className={`${input} w-48`} placeholder="Ad (örn. Yeşil nokta)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={`${input} min-w-0 flex-1`} placeholder="0;P;c;5;h;0;m;1;..." value={code} onChange={(e) => setCode(e.target.value)} />
        <button
          onClick={() => void add()}
          disabled={!name.trim() || !code.trim()}
          className="flex items-center gap-1.5 rounded bg-val-red px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-40"
        >
          <Plus size={15} /> Ekle
        </button>
      </div>

      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-val-mute">Henüz kayıtlı nişangah yok.</p>}
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded border border-val-line bg-val-panel p-3">
            <div className="w-44 truncate text-sm font-bold">{c.name}</div>
            <code className="min-w-0 flex-1 select-text truncate text-xs text-val-mute" title={c.code}>
              {c.code}
            </code>
            <button
              onClick={() => void copy(c)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${copied === c.id ? 'text-emerald-400' : 'text-val-mute hover:text-val-text'}`}
            >
              {copied === c.id ? <Check size={14} /> : <Copy size={14} />}
              {copied === c.id ? 'Kopyalandı!' : 'Kopyala'}
            </button>
            <button
              onClick={() => void window.api.removeCrosshair(c.id).then(setItems)}
              aria-label="Sil"
              className="rounded p-1 text-val-mute hover:text-val-red"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
