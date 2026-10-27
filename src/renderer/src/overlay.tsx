import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { MatchPlayer, MatchSnapshot } from '@shared/types'
import './index.css'
import { setLanguage, tr } from '@shared/i18n'

// The page itself stays fully transparent; only the panel is drawn.
document.documentElement.style.background = 'transparent'
document.body.style.background = 'transparent'

function Row({ p }: { p: MatchPlayer }): JSX.Element {
  return (
    <div className={`flex items-center gap-2 rounded px-2 py-1 ${p.isSelf ? 'bg-white/10' : ''}`}>
      {p.agentIcon ? <img src={p.agentIcon} alt="" className="h-6 w-6 rounded bg-black/30" /> : <div className="h-6 w-6" />}
      <div className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight">
        {p.name}
        {p.tag && <span className="font-normal text-val-mute"> #{p.tag}</span>}
      </div>
      {p.mmr?.currentTierIcon && <img src={p.mmr.currentTierIcon} alt="" className="h-6 w-6" />}
      <div className="w-14 text-right text-[11px] leading-tight text-val-text/90">
        {p.mmr && p.mmr.currentTier > 0 ? `${p.mmr.currentRR} RR` : '—'}
      </div>
    </div>
  )
}

function Team({ title, color, players }: { title: string; color: string; players: MatchPlayer[] }): JSX.Element {
  return (
    <div>
      <div className={`px-2 pb-0.5 text-[10px] font-bold uppercase tracking-widest ${color}`}>{title}</div>
      {players.map((p) => (
        <Row key={p.puuid} p={p} />
      ))}
    </div>
  )
}

function Overlay(): JSX.Element {
  const [match, setMatch] = useState<MatchSnapshot | null>(null)
  const [, setLang] = useState('')

  useEffect(() => {
    void window.api.getAppSettings().then((s) => {
      setLanguage(s.language)
      setLang(s.language) // re-render in the saved language
      document.documentElement.lang = s.language
    })
    void window.api.getMatch().then(setMatch)
    return window.api.onMatch(setMatch)
  }, [])

  return (
    <div className="p-1">
      <div className="space-y-2 rounded-md border border-white/10 bg-val-bg/85 p-2 text-val-text shadow-xl">
        {match ? (
          <>
            <div className="px-2 text-[11px] font-bold uppercase tracking-widest text-val-mute">{match.mapName}</div>
            <Team title={tr('Mavi Takım')} color="text-val-blue" players={match.players.filter((p) => p.teamId === 'Blue')} />
            <Team title={tr('Kırmızı Takım')} color="text-val-red" players={match.players.filter((p) => p.teamId === 'Red')} />
          </>
        ) : (
          <div className="px-2 py-3 text-xs text-val-mute">{tr('Maç verisi henüz yok')}</div>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>
)
