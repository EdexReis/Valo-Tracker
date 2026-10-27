import { TriangleAlert } from 'lucide-react'
import { useApp } from '../store'
import { tr } from '@shared/i18n'

export default function CompBanner(): JSX.Element | null {
  const { comp, status } = useApp()
  if (!comp || status.gameState !== 'PREGAME') return null

  return (
    <div role="alert" className="mb-5 rounded border border-yellow-500/50 bg-yellow-500/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 shrink-0 text-yellow-400" size={20} />
        <div className="space-y-1">
          {comp.messages.map((m) => (
            <p key={m} className="text-sm font-semibold">
              {tr('⚠️ Taktiksel Uyarı: {message}', { message: m })}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}
