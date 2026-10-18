import { useApp } from '../store'

export default function StatusBadge(): JSX.Element {
  const { status } = useApp()

  let label = 'Valorant Bekleniyor'
  let color = 'bg-val-mute'
  if (status.connection === 'connecting') {
    label = 'Bağlanılıyor…'
    color = 'bg-yellow-400'
  } else if (status.connection === 'connected') {
    switch (status.gameState) {
      case 'MENUS':
        label = 'Lobide'
        color = 'bg-emerald-400'
        break
      case 'PREGAME':
        label = 'Ajan Seçiminde'
        color = 'bg-val-red'
        break
      case 'INGAME':
        label = 'Maçta'
        color = 'bg-val-blue'
        break
      default:
        label = 'Bağlı'
        color = 'bg-emerald-400'
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-val-line bg-val-bg px-3 py-0.5 text-xs font-medium">
      <span className={`h-2 w-2 rounded-full ${color} ${status.connection !== 'waiting' ? 'animate-pulse' : ''}`} />
      {label}
    </div>
  )
}
