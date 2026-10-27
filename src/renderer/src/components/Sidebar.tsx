import type { TabDef } from '../tabs'
import { tr } from '@shared/i18n'

interface Props {
  tabs: TabDef[]
  active: string
  onSelect: (id: string) => void
}

export default function Sidebar({ tabs, active, onSelect }: Props): JSX.Element {
  return (
    <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-val-line bg-val-panel p-3">
      {tabs.map(({ id, label, icon: Icon }) => {
        const on = id === active
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`flex items-center gap-3 rounded px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
              on ? 'bg-val-red text-white' : 'text-val-mute hover:bg-val-raised hover:text-val-text'
            }`}
          >
            <Icon size={18} />
            {tr(label)}
          </button>
        )
      })}
    </nav>
  )
}
