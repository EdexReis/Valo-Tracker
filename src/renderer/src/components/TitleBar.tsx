import { Minus, Square, X } from 'lucide-react'
import StatusBadge from './StatusBadge'
import SessionCounter from './SessionCounter'

export default function TitleBar(): JSX.Element {
  const btn = 'no-drag flex h-8 w-11 items-center justify-center text-val-mute transition-colors hover:text-val-text'
  return (
    <header className="drag flex h-8 shrink-0 items-center justify-between border-b border-val-line bg-val-panel">
      <div className="flex items-center gap-3 pl-3">
        <span className="h-2.5 w-2.5 rotate-45 bg-val-red" />
        <span className="text-xs font-bold uppercase tracking-[0.2em]">Valo Companion</span>
      </div>
      <div className="no-drag flex items-center gap-2">
        <StatusBadge />
        <SessionCounter />
      </div>
      <div className="flex">
        <button className={`${btn} hover:bg-val-raised`} onClick={() => window.api.windowAction('minimize')} aria-label="Küçült">
          <Minus size={14} />
        </button>
        <button className={`${btn} hover:bg-val-raised`} onClick={() => window.api.windowAction('maximize')} aria-label="Büyüt">
          <Square size={11} />
        </button>
        <button className={`${btn} hover:bg-val-red hover:text-white`} onClick={() => window.api.windowAction('close')} aria-label="Kapat">
          <X size={15} />
        </button>
      </div>
    </header>
  )
}
