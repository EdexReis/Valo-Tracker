import { TriangleAlert } from 'lucide-react'
import { useApp } from '../store'
import { tr } from '@shared/i18n'

export default function SessionCounter(): JSX.Element | null {
  const { sessionRR } = useApp()
  if (!sessionRR.ready) return null
  const d = sessionRR.delta
  const tilt = d <= -50
  const color = tilt ? 'border-val-red text-val-red' : d > 0 ? 'border-val-line text-emerald-400' : 'border-val-line text-val-text'
  return (
    <div className={`flex items-center gap-1.5 rounded-full border bg-val-bg px-3 py-0.5 text-xs font-bold ${color}`}>
      {tilt && <TriangleAlert size={13} />}
      <span>{tr('Oturum: {rr} RR', { rr: `${d > 0 ? '+' : ''}${d}` })}</span>
      {tilt && <span>!</span>}
    </div>
  )
}
