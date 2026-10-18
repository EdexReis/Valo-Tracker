import { TriangleAlert } from 'lucide-react'
import { useApp } from '../store'

export default function DodgeBanner(): JSX.Element | null {
  const { dodge, status } = useApp()
  if (!dodge || status.gameState !== 'PREGAME') return null
  const n = dodge.players.length

  return (
    <div role="alert" className="mb-5 rounded border border-orange-500/60 bg-gradient-to-r from-val-red/25 to-orange-500/15 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 shrink-0 text-orange-400" size={20} />
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">
            Dikkat: Takımınızda son maçlarında ağır kaybetme serisi veya çok düşük K/D oranı olan {n} oyuncu var. Bu maçı oynamak istemeyebilirsiniz (Dodge).
          </p>
          <ul className="select-text space-y-0.5 text-xs text-val-text/80">
            {dodge.players.map((p, i) => (
              <li key={p.puuid}>
                <span className="font-semibold">{p.name ?? `Oyuncu ${i + 1}`}</span>: {p.reasons.join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
