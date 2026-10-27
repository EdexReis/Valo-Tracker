import { useApp } from '../store'
import { tr } from '@shared/i18n'

export default function StatusBadge(): JSX.Element {
  const { status } = useApp()

  let label = tr('Valorant Bekleniyor')
  let color = 'bg-val-mute'
  if (status.connection === 'connecting') {
    label = tr('Bağlanılıyor…')
    color = 'bg-yellow-400'
  } else if (status.connection === 'connected') {
    switch (status.gameState) {
      case 'MENUS':
        label = tr('Lobide')
        color = 'bg-emerald-400'
        break
      case 'PREGAME':
        label = tr('Ajan Seçiminde')
        color = 'bg-val-red'
        break
      case 'INGAME':
        label = tr('Maçta')
        color = 'bg-val-blue'
        break
      default:
        label = tr('Bağlı')
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
