import type { Pt } from '@shared/types'

interface Props {
  minimap: string | null
  deaths: Pt[]
  kills: Pt[]
}

/** Top-down map with death (red) and kill (green) positions. Overlapping dots build up into hot spots. */
export default function Heatmap({ minimap, deaths, kills }: Props): JSX.Element {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded border border-val-line bg-val-bg">
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Isı haritası">
        {minimap && <image href={minimap} x="0" y="0" width="100" height="100" opacity="0.55" preserveAspectRatio="xMidYMid slice" />}
        {kills.map((p, i) => (
          <circle key={`k${i}`} cx={p.x * 100} cy={p.y * 100} r="2.2" fill="#34d399" fillOpacity="0.28" />
        ))}
        {deaths.map((p, i) => (
          <circle key={`d${i}`} cx={p.x * 100} cy={p.y * 100} r="2.2" fill="#ff4655" fillOpacity="0.4" />
        ))}
      </svg>
      <div className="absolute bottom-1 left-1 flex gap-3 rounded bg-black/50 px-2 py-0.5 text-[10px] font-semibold">
        <span className="text-val-red">● Ölüm ({deaths.length})</span>
        <span className="text-emerald-400">● Kill ({kills.length})</span>
      </div>
    </div>
  )
}
