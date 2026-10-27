import { useState } from 'react'
import { Download } from 'lucide-react'
import { useApp } from '../store'

const COLORS = { info: 'text-val-mute', success: 'text-emerald-400', error: 'text-val-red' } as const

export default function LogPage(): JSX.Element {
  const { logs } = useApp()
  const [note, setNote] = useState<string | null>(null)

  const exportLogs = async (): Promise<void> => {
    const r = await window.api.exportLogs()
    setNote(r.ok ? `Kaydedildi: ${r.path}` : r.error === 'İptal edildi.' ? null : `Hata: ${r.error}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Günlük</h1>
        <button
          onClick={() => void exportLogs()}
          className="flex items-center gap-1.5 rounded border border-val-line px-3 py-1.5 text-sm font-semibold hover:bg-val-raised"
        >
          <Download size={14} /> Dışa aktar
        </button>
      </div>
      {note && <p className="select-text text-sm text-val-mute">{note}</p>}
      <div className="select-text space-y-1 rounded border border-val-line bg-val-panel p-4 font-mono text-xs">
        {logs.length === 0 && <div className="text-val-mute">Henüz kayıt yok.</div>}
        {[...logs].reverse().map((l, i) => (
          <div key={i} className={COLORS[l.level]}>
            <span className="text-val-mute">{new Date(l.time).toLocaleTimeString('tr-TR')}</span> [{l.source}] {l.message}
          </div>
        ))}
      </div>
    </div>
  )
}
