import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { REGION_OPTIONS } from '@shared/options'
import { useApp } from '../store'
import { tr } from '@shared/i18n'

const STEPS = 3

/** First-run wizard: explains the risks once, then picks region and a few defaults. */
export default function Onboarding(): JSX.Element | null {
  const { appSettings: s, updateApp, appLoaded } = useApp()
  const [step, setStep] = useState(0)
  const [understood, setUnderstood] = useState(false)
  if (!appLoaded || s.onboardingDone) return null

  const finish = (): void => updateApp({ onboardingDone: true })
  const field = 'rounded border border-val-line bg-val-bg px-2 py-1.5 text-sm outline-none focus:border-val-red'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-lg rounded border border-val-line bg-val-panel p-6 shadow-2xl" role="dialog" aria-label={tr('İlk kurulum')}>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-val-mute">
          {tr('Kurulum {step} / {total}', { step: step + 1, total: STEPS })}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <div className="flex gap-2" role="group" aria-label="Language">
              {(['tr', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => updateApp({ language: l })}
                  className={`rounded border px-3 py-1 text-xs font-bold ${s.language === l ? 'border-val-red bg-val-red/20' : 'border-val-line text-val-mute hover:bg-val-raised'}`}
                >
                  {l === 'tr' ? 'Türkçe' : 'English'}
                </button>
              ))}
            </div>
            <h2 className="text-xl font-bold">{tr('Valo Tracker\'a hoş geldin')}</h2>
            <p className="text-sm text-val-mute">
              {tr('Uygulama Riot Client\'ına bağlanır ve maç, rank, mağaza gibi verilerini yalnızca bu bilgisayarda gösterir. Hiçbir veri dışarı gönderilmez.')}
            </p>
            <div className="rounded border border-orange-500/50 bg-orange-500/10 p-3 text-sm">
              <p className="flex items-start gap-2">
                <ShieldAlert size={18} className="mt-0.5 shrink-0 text-orange-400" />
                <span>
                  {tr('Riot\'un resmi olmayan yerel arayüzünü kullanıyoruz; Riot bunu desteklemez. Instalocker ve Dodge asistanı gibi özellikler hesabına yönelik risk taşıyabilir. Önermiyoruz, kullanırsan sorumluluk sana aittir.')}
                </span>
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              {tr('Riski anladım')}
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">{tr('Temel ayarlar')}</h2>
            <label className="flex items-center justify-between gap-4 text-sm">
              {tr('Bölge')}
              <select className={field} value={s.region} onChange={(e) => updateApp({ region: e.target.value as typeof s.region })}>
                {REGION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {tr(o.label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
              {tr('Discord\'da oyun durumunu göster')}
              <input type="checkbox" checked={s.discordRpc} onChange={(e) => updateApp({ discordRpc: e.target.checked })} />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
              {tr('Oyun içi overlay (kısayola basılı tut)')}
              <input type="checkbox" checked={s.overlayEnabled} onChange={(e) => updateApp({ overlayEnabled: e.target.checked })} />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
              {tr('Mola hatırlatıcı')}
              <input type="checkbox" checked={s.breakReminders} onChange={(e) => updateApp({ breakReminders: e.target.checked })} />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">{tr('Hazırsın')}</h2>
            <p className="text-sm text-val-mute">{tr('Valorant\'ı aç ve giriş yap; uygulama kendiliğinden bağlanır. Kapalıysa "Valorant Bekleniyor" yazar.')}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-val-mute">
              <li>{tr('Telegram bildirimleri ve komutları için Ayarlar sekmesinden bot ekleyebilirsin.')}</li>
              <li>{tr('AI Koç için LM Studio veya Ollama sunucunu açman yeterli.')}</li>
              <li>{tr('Bu ayarların hepsini sonradan Ayarlar sekmesinden değiştirebilirsin.')}</li>
            </ul>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <button
            onClick={() => setStep((n) => n - 1)}
            disabled={step === 0}
            className="rounded border border-val-line px-4 py-2 text-sm font-semibold hover:bg-val-raised disabled:opacity-0"
          >
            {tr('Geri')}
          </button>
          {step < STEPS - 1 ? (
            <button
              onClick={() => setStep((n) => n + 1)}
              disabled={step === 0 && !understood}
              className="rounded bg-val-red px-5 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-40"
            >
              {tr('İleri')}
            </button>
          ) : (
            <button onClick={finish} className="rounded bg-val-red px-5 py-2 text-sm font-bold hover:opacity-90">
              {tr('Başla')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
