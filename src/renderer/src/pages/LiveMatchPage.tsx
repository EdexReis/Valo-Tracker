import { Loader2, RefreshCw } from 'lucide-react'
import type { MatchPlayer } from '@shared/types'
import { useApp } from '../store'

function PlayerCard({ p }: { p: MatchPlayer }): JSX.Element {
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
          </div>
          <div className="text-xs text-val-mute">{p.agentName}</div>
        </div>
        {p.mmr && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="text-right leading-tight">
              <div className="text-xs font-semibold">
                {p.mmr.currentTierName}
                {p.mmr.currentTier > 0 && ` - ${p.mmr.currentRR} RR`}
              </div>
              <div className="text-[11px] text-val-mute/70">Tepe: {p.mmr.peakTierName}</div>
            </div>
            {p.mmr.currentTierIcon && <img src={p.mmr.currentTierIcon} alt="" width={24} height={24} className="h-6 w-6" />}
          </div>
        )}
      </div>
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
  const { match, scanMatch, scanning, status } = useApp()
  const blue = match?.players.filter((p) => p.teamId === 'Blue') ?? []
  const red = match?.players.filter((p) => p.teamId === 'Red') ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Canlı Maç</h1>
          <p className="text-sm text-val-mute">
            {match ? `${match.mapName} · ${new Date(match.scannedAt).toLocaleTimeString('tr-TR')}` : 'Aktif maç yok'}
          </p>
        </div>
        <button
          onClick={() => void scanMatch()}
          disabled={scanning || status.connection !== 'connected'}
          className="flex items-center gap-2 rounded bg-val-red px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {scanning ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Durumu Yenile / Maçı Tara
        </button>
      </div>

      {match ? (
        <div className="flex gap-5">
          <Team title="Mavi Takım" color="text-val-blue" players={blue} />
          <Team title="Kırmızı Takım" color="text-val-red" players={red} />
        </div>
      ) : (
        <div className="rounded border border-dashed border-val-line p-12 text-center text-val-mute">
          Bir maça girdiğinde oyuncular ve skinler otomatik olarak burada görünür.
        </div>
      )}
    </div>
  )
}
