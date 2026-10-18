import { useState } from 'react'
import { ShieldAlert, Zap } from 'lucide-react'
import { useApp } from '../store'

export default function InstalockPage(): JSX.Element {
  const { assets, settings, updateSettings, triggerPregame, status, appSettings, updateApp } = useApp()
  const [confirming, setConfirming] = useState(false)

  const setMapAgent = (mapUuid: string, agentUuid: string): void => {
    const next = { ...settings.agentByMap }
    if (agentUuid) next[mapUuid] = agentUuid
    else delete next[mapUuid]
    updateSettings({ agentByMap: next })
  }

  const select = 'w-full rounded border border-val-line bg-val-bg px-2 py-1.5 text-sm outline-none focus:border-val-red'

  const AgentOptions = (): JSX.Element => (
    <>
      <option value="">— Seçme —</option>
      {assets.agents.map((a) => (
        <option key={a.uuid} value={a.uuid}>
          {a.name}
        </option>
      ))}
    </>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Instalocker</h1>
          <p className="text-sm text-val-mute">Ajan seçimi başladığında seçtiğin ajan otomatik kilitlenir.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void triggerPregame()}
            disabled={status.connection !== 'connected'}
            className="flex items-center gap-2 rounded border border-val-line px-3 py-2 text-sm font-semibold hover:bg-val-raised disabled:opacity-40"
          >
            <Zap size={15} /> Şimdi Dene
          </button>
          <button
            role="switch"
            aria-checked={settings.enabled}
            onClick={() => {
              if (!settings.enabled && !appSettings.instalockRiskAck) setConfirming(true)
              else updateSettings({ enabled: !settings.enabled })
            }}
            className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-bold ${
              settings.enabled ? 'bg-val-red text-white' : 'bg-val-raised text-val-mute'
            }`}
          >
            Instalock {settings.enabled ? 'Aktif' : 'Kapalı'}
          </button>
        </div>
      </div>

      <div className="rounded border border-orange-500/50 bg-orange-500/10 p-4 text-sm">
        <p className="flex items-start gap-2">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-orange-400" />
          <span>
            <span className="font-semibold">Hesap riski:</span> Riot, ajan seçimini otomatikleştiren araçlara (instalock) geçici veya kalıcı ceza verdiğini bildirmiştir. Bu özelliği
            önermiyoruz; kullanırsan sorumluluk sana aittir.
          </span>
        </p>
        {(confirming || (settings.enabled && !appSettings.instalockRiskAck)) && (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => {
                updateApp({ instalockRiskAck: true })
                updateSettings({ enabled: true })
                setConfirming(false)
              }}
              className="rounded bg-val-red px-3 py-1.5 text-xs font-bold hover:opacity-90"
            >
              Riski anlıyorum, etkinleştir
            </button>
            <button onClick={() => setConfirming(false)} className="rounded border border-val-line px-3 py-1.5 text-xs font-semibold hover:bg-val-raised">
              Vazgeç
            </button>
          </div>
        )}
      </div>

      <div className="rounded border border-val-line bg-val-panel p-4">
        <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-val-mute">
          Varsayılan ajan (seçim yapılmamış haritalar için)
        </label>
        <select className={select} value={settings.defaultAgent ?? ''} onChange={(e) => updateSettings({ defaultAgent: e.target.value || null })}>
          <AgentOptions />
        </select>
      </div>

      {assets.maps.length === 0 && <p className="text-sm text-val-mute">Haritalar yükleniyor…</p>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {assets.maps.map((m) => {
          const agent = assets.agents.find((a) => a.uuid === settings.agentByMap[m.uuid])
          return (
            <div key={m.uuid} className="overflow-hidden rounded border border-val-line bg-val-panel">
              <div className="relative h-24">
                {m.splash && <img src={m.splash} alt="" className="h-full w-full object-cover opacity-60" />}
                <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-val-panel to-transparent p-2">
                  <span className="text-sm font-bold">{m.name}</span>
                  {agent && <img src={agent.icon} alt={agent.name} className="h-9 w-9 rounded bg-val-raised" />}
                </div>
              </div>
              <div className="p-2">
                <select className={select} value={settings.agentByMap[m.uuid] ?? ''} onChange={(e) => setMapAgent(m.uuid, e.target.value)}>
                  <AgentOptions />
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
