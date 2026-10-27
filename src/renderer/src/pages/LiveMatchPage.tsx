import { useState } from 'react'
import { Check, Crosshair, EyeOff, Loader2, RefreshCw } from 'lucide-react'
import type { MatchPlayer } from '@shared/types'
import { useApp } from '../store'
import { locale, tr } from '@shared/i18n'
import { PLAYER_STATS_WARNING } from './SettingsPage'

function CrosshairButton({ code }: { code: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button
      onClick={() => void copy()}
      title={copied ? tr('Kopyalandı!') : tr('Nişangah kodunu kopyala: {code}', { code })}
      className={`flex items-center gap-1 rounded p-1 text-xs transition-colors ${copied ? 'text-emerald-400' : 'text-val-mute hover:text-val-text'}`}
    >
      {copied ? <Check size={15} /> : <Crosshair size={15} />}
      {copied && <span>{tr('Kopyalandı!')}</span>}
    </button>
  )
}

function StatsLine({ p, enabled }: { p: MatchPlayer; enabled: boolean }): JSX.Element | null {
  if (!enabled) return null
  if (p.stats === undefined) return <div className="mb-2 text-[11px] text-val-mute/60">{tr('İstatistikler yükleniyor…')}</div>
  if (p.stats === null) {
    return <div className="mb-2 text-[11px] text-val-mute/60">{p.isStreamerMode && !p.isSelf ? tr('Yayıncı modu: istatistik yok') : tr('Yeterli maç verisi yok')}</div>
  }
  const s = p.stats
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]" title={tr('Son {n} maç (derece/derecesiz)', { n: s.games })}>
      <span>
        <span className="text-val-mute">K/D</span> <b className={s.kd >= 1 ? 'text-emerald-400' : 'text-val-red'}>{s.kd.toFixed(2)}</b>
      </span>
      <span>
        <span className="text-val-mute">ACS</span> <b>{s.acs}</b>
      </span>
      <span>
        <span className="text-val-mute">HS</span> <b>{s.hsPercent}%</b>
      </span>
      <span>
        <span className="text-val-mute">{tr('Kazanma')}</span> <b className={s.winRate >= 50 ? 'text-emerald-400' : 'text-val-red'}>{s.winRate}%</b>
      </span>
      <span className="text-val-mute/60">{tr('son {n} maç', { n: s.games })}</span>
    </div>
  )
}

function PlayerCard({ p }: { p: MatchPlayer }): JSX.Element {
  const { appSettings } = useApp()
  return (
    <div className={`rounded border bg-val-panel p-3 ${p.isSelf ? 'border-val-red' : 'border-val-line'}`}>
      <div className="mb-2 flex items-center gap-3">
        {p.agentIcon ? (
          <img src={p.agentIcon} alt={p.agentName} className="h-10 w-10 rounded bg-val-raised" />
        ) : (
          <div className="h-10 w-10 rounded bg-val-raised" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">
            {p.name}
            {p.tag && <span className="font-normal text-val-mute"> #{p.tag}</span>}
            {p.isStreamerMode && (
              <span title={tr('Yayıncı modu: bu oyuncu kimliğini gizliyor')} className="ml-2 inline-flex items-center gap-1 rounded bg-purple-500/20 px-1.5 py-0.5 align-middle text-[10px] font-bold text-purple-300">
                <EyeOff size={11} /> {tr('TTV / Gizli')}
              </span>
            )}
          </div>
          <div className="text-xs text-val-mute">{p.agentName}</div>
        </div>
        {p.crosshairCode && <CrosshairButton code={p.crosshairCode} />}
        {p.mmr && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="text-right leading-tight">
              <div className="text-xs font-semibold">
                {p.mmr.currentTierName}
                {p.mmr.currentTier > 0 && ` - ${p.mmr.currentRR} RR`}
              </div>
              <div className="text-[11px] text-val-mute/70">
                {tr('Tepe: {rank}', { rank: p.mmr.peakTierName })}
                {p.mmr.peakSeason && ` · ${p.mmr.peakSeason}`}
              </div>
            </div>
            {p.mmr.currentTierIcon && <img src={p.mmr.currentTierIcon} alt="" width={24} height={24} className="h-6 w-6" />}
          </div>
        )}
      </div>
      {p.mmr && p.mmr.pastRanks.length > 0 && (
        <div className="mb-2 flex items-center gap-2 text-[10px] text-val-mute/70">
          <span>{tr('Önceki sezonlar')}</span>
          {p.mmr.pastRanks.map((r) => (
            <span key={r.season} title={`${r.season}: ${r.tierName}`} className="flex items-center gap-0.5">
              {r.tierIcon && <img src={r.tierIcon} alt="" width={16} height={16} className="h-4 w-4" />}
              {r.season}
            </span>
          ))}
        </div>
      )}
      <StatsLine p={p} enabled={appSettings.playerStats} />
      <div className="grid grid-cols-4 gap-1.5">
        {p.weapons.map((w) => (
          <div
            key={w.weaponId}
            title={`${w.weaponName}: ${w.skinName}${w.buddyName ? ` · ${w.buddyName}` : ''}`}
            className="relative flex h-12 items-center justify-center rounded bg-val-bg p-1"
          >
            {w.skinIcon ? (
              <img src={w.skinIcon} alt={w.skinName} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[10px] text-val-mute">{w.weaponName}</span>
            )}
            {w.buddyIcon && <img src={w.buddyIcon} alt="" className="absolute bottom-0 right-0 h-4 w-4" />}
          </div>
        ))}
      </div>
    </div>
  )
}

function Team({ title, color, players }: { title: string; color: string; players: MatchPlayer[] }): JSX.Element {
  return (
    <section className="min-w-0 flex-1 space-y-3">
      <h3 className={`text-sm font-bold uppercase tracking-widest ${color}`}>{title}</h3>
      {players.map((p) => (
        <PlayerCard key={p.puuid} p={p} />
      ))}
    </section>
  )
}

export default function LiveMatchPage(): JSX.Element {
  const { match, scanMatch, scanning, status, appSettings, updateApp } = useApp()
  const blue = match?.players.filter((p) => p.teamId === 'Blue') ?? []
  const red = match?.players.filter((p) => p.teamId === 'Red') ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{tr('Canlı Maç')}</h1>
          <p className="text-sm text-val-mute">
            {match ? `${match.mapName} · ${new Date(match.scannedAt).toLocaleTimeString(locale())}` : tr('Aktif maç yok')}
          </p>
        </div>
        <button
          onClick={() => void scanMatch()}
          disabled={scanning || status.connection !== 'connected'}
          className="flex items-center gap-2 rounded bg-val-red px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {scanning ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {tr('Durumu Yenile / Maçı Tara')}
        </button>
      </div>

      {match && !appSettings.playerStats && (
        <div className="flex items-center justify-between gap-4 rounded border border-val-line bg-val-panel px-4 py-2 text-xs text-val-mute">
          <span>{tr('Oyuncuların K/D, ACS, HS% ve kazanma oranını da görmek ister misin? (Ek istek yapar, riskli olabilir)')}</span>
          <button
            onClick={() => {
              if (window.confirm(PLAYER_STATS_WARNING())) updateApp({ playerStats: true })
            }}
            className="shrink-0 rounded bg-val-raised px-3 py-1 font-semibold text-val-text hover:opacity-90"
          >
            {tr('Etkinleştir')}
          </button>
        </div>
      )}

      {match ? (
        <div className="flex gap-5">
          <Team title={tr('Mavi Takım')} color="text-val-blue" players={blue} />
          <Team title={tr('Kırmızı Takım')} color="text-val-red" players={red} />
        </div>
      ) : (
        <div className="rounded border border-dashed border-val-line p-12 text-center text-val-mute">
          {tr('Bir maça girdiğinde oyuncular ve skinler otomatik olarak burada görünür.')}
        </div>
      )}
    </div>
  )
}
