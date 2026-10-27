import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { MatchPlayer, MatchSnapshot, OverlayMeStats, OverlayMode } from '@shared/types'
import './index.css'
import { setLanguage, tr } from '@shared/i18n'

// The page itself stays fully transparent; only the panel is drawn.
document.documentElement.style.background = 'transparent'
document.body.style.background = 'transparent'

const PANEL = 'space-y-2 rounded-md border border-white/10 bg-val-bg/85 p-2 text-val-text shadow-xl'

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

function Players({ match }: { match: MatchSnapshot | null }): JSX.Element {
  return (
    <div className={PANEL}>
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
  )
}

const signed = (n: number): string => `${n > 0 ? '+' : ''}${n}`

function Me({ me }: { me: OverlayMeStats | null }): JSX.Element {
  if (!me) return <div className={PANEL} />
  const hasData = me.recent.length > 0 || me.rank
  return (
    <div className={PANEL}>
      <div className="px-2 text-[11px] font-bold uppercase tracking-widest text-val-mute">{tr('Benim istatistiklerim')}</div>
      {!hasData && <div className="px-2 py-2 text-xs text-val-mute">{tr('Henüz kayıtlı maç yok')}</div>}

      {me.rank && me.rank.tier > 0 && (
        <div className="flex items-center gap-2 px-2">
          {me.rank.icon && <img src={me.rank.icon} alt="" className="h-9 w-9" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold leading-tight">{me.rank.name}</div>
            <div className="text-xs text-val-mute">{me.rank.rr} RR</div>
          </div>
          {me.sessionRR !== null && (
            <div className={`text-lg font-bold tabular-nums ${me.sessionRR > 0 ? 'text-emerald-400' : me.sessionRR < 0 ? 'text-val-red' : 'text-val-text'}`}>
              {signed(me.sessionRR)}
            </div>
          )}
        </div>
      )}

      <div className="px-2 text-xs text-val-mute">
        {tr('Oturum: {w}G - {l}M · {h} sa', { w: me.sessionWins, l: me.sessionLosses, h: me.hours.toFixed(1) })}
      </div>

      {me.recent.length > 0 && (
        <div className="px-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-val-mute">{tr('Son maçlar')}</div>
          <div className="flex gap-1.5">
            {me.recent.map((r, i) => (
              <div
                key={i}
                className={`flex h-9 w-12 flex-col items-center justify-center rounded text-[10px] font-bold ${
                  r.result === 'win' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-val-red/20 text-val-red'
                }`}
              >
                <span>{r.result === 'win' ? 'W' : 'L'}</span>
                <span className="font-normal tabular-nums text-val-text/80">{r.vts ?? '—'}</span>
              </div>
            ))}
          </div>
          {me.recentAvg && (
            <div className="mt-1 text-[11px] tabular-nums text-val-text/90">
              K/D {me.recentAvg.kd.toFixed(2)} · ACS {me.recentAvg.acs} · VTS {me.recentAvg.vts}
            </div>
          )}
        </div>
      )}

      {(me.onMap || me.withAgent) && (
        <div className="space-y-0.5 px-2 text-xs">
          {me.onMap && (
            <div className="flex justify-between">
              <span className="text-val-mute">{tr('Bu haritada ({map})', { map: me.onMap.map })}</span>
              <span className="tabular-nums">{tr('%{rate} · {n} maç', { rate: me.onMap.winRate, n: me.onMap.games })}</span>
            </div>
          )}
          {me.withAgent && (
            <div className="flex justify-between">
              <span className="text-val-mute">{tr('{agent} ile', { agent: me.withAgent.agent })}</span>
              <span className="tabular-nums">{tr('%{rate} · {n} maç', { rate: me.withAgent.winRate, n: me.withAgent.games })}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Overlay(): JSX.Element {
  const [match, setMatch] = useState<MatchSnapshot | null>(null)
  const [mode, setMode] = useState<OverlayMode>('players')
  const [me, setMe] = useState<OverlayMeStats | null>(null)

  // The window lives hidden for the whole session: refresh settings and personal stats every time it is shown.
  const refresh = useCallback(() => {
    void window.api.getAppSettings().then((s) => {
      setLanguage(s.language)
      document.documentElement.lang = s.language
      setMode(s.overlayMode)
    })
    void window.api.getOverlayMe().then(setMe)
  }, [])

  useEffect(() => {
    refresh()
    void window.api.getMatch().then(setMatch)
    const off = window.api.onMatch(setMatch)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      off()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return (
    <div className="space-y-2 p-1">
      {(mode === 'me' || mode === 'both') && <Me me={me} />}
      {(mode === 'players' || mode === 'both') && <Players match={match} />}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>
)
