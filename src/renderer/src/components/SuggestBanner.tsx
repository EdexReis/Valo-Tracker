import { useEffect, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { bestAgentOnMap, type GroupStat } from '@shared/stats'
import { useApp } from '../store'
import { tr } from '@shared/i18n'

/** During agent select: suggests the agent with the best win rate on this map from the player's own history. */
export default function SuggestBanner(): JSX.Element | null {
  const { stage, status } = useApp()
  const [best, setBest] = useState<GroupStat | null>(null)
  const map = stage?.mapName
  const inPregame = status.gameState === 'PREGAME'

  useEffect(() => {
    if (!map || !inPregame) {
      setBest(null)
      return
    }
    let cancelled = false
    void window.api.getStats().then((s) => !cancelled && setBest(bestAgentOnMap(s.matches, map)))
    return () => {
      cancelled = true
    }
  }, [map, inPregame])

  if (!inPregame || !best || !map) return null
  return (
    <div className="mb-5 flex items-center gap-3 rounded border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
      <Lightbulb className="shrink-0 text-emerald-400" size={20} />
      {best.icon && <img src={best.icon} alt="" className="h-8 w-8 rounded bg-val-raised" />}
      <p>
        {tr('{map} haritasında en iyi ajanın {agent} (%{rate} galibiyet, {n} maç).', { map, agent: best.key, rate: best.winRate, n: best.games })}
      </p>
    </div>
  )
}
