import { useApp } from '../store'

const COLORS = { info: 'text-val-mute', success: 'text-emerald-400', error: 'text-val-red' } as const

export default function LogPage(): JSX.Element {
  const { logs } = useApp()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Günlük</h1>
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
