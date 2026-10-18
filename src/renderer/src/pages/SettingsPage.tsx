import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, Save, Send, ShieldAlert } from 'lucide-react'
import type { TelegramSettingsView } from '@shared/types'
import { REGION_OPTIONS, SHORTCUT_OPTIONS } from '@shared/options'
import { useApp } from '../store'

type Notice = { kind: 'ok' | 'error'; text: string } | null

const field = 'rounded border border-val-line bg-val-bg px-2 py-1.5 text-sm outline-none focus:border-val-red'

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 border-t border-val-line py-3 first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {hint && <div className="text-xs text-val-mute">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-val-red' : 'bg-val-raised'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

function GeneralPanel(): JSX.Element {
  const { appSettings: s, updateApp } = useApp()
  return (
    <section className="rounded border border-val-line bg-val-panel px-5 py-2">
      <Row title="Windows ile başlat" hint="Bilgisayar açılınca uygulama kendiliğinden başlar (kurulu sürümde).">
        <Toggle on={s.startWithWindows} onChange={(v) => updateApp({ startWithWindows: v })} label="Windows ile başlat" />
      </Row>
      <Row title="Kapatınca sistem tepsisine küçült" hint="Pencereyi kapatınca uygulama arka planda çalışmaya devam eder.">
        <Toggle on={s.minimizeToTray} onChange={(v) => updateApp({ minimizeToTray: v })} label="Tepsiye küçült" />
      </Row>
      <Row title="Bölge" hint="Hesabının bulunduğu sunucu bölgesi.">
        <select className={field} value={s.region} onChange={(e) => updateApp({ region: e.target.value as typeof s.region })}>
          {REGION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
      <Row title="Discord Rich Presence" hint="Lobi, ajan seçimi ve maç durumunu Discord profilinde göster.">
        <Toggle on={s.discordRpc} onChange={(v) => updateApp({ discordRpc: v })} label="Discord Rich Presence" />
      </Row>
      <Row title="Oyun içi overlay" hint="Maç sırasında kısayola basılı tutunca oyuncu ve rank listesi görünür.">
        <div className="flex items-center gap-3">
          <select className={field} value={s.overlayShortcut} onChange={(e) => updateApp({ overlayShortcut: e.target.value })} disabled={!s.overlayEnabled}>
            {SHORTCUT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Toggle on={s.overlayEnabled} onChange={(v) => updateApp({ overlayEnabled: v })} label="Overlay" />
        </div>
      </Row>
      <Row title="Dodge asistanı" hint="Ajan seçiminde takım arkadaşlarının son maçlarına bakıp uyarır.">
        <Toggle on={s.dodgeAssistant} onChange={(v) => updateApp({ dodgeAssistant: v })} label="Dodge asistanı" />
      </Row>
      <Row title="Windows bildirimleri" hint="Wishlist, mola ve AI koç bildirimleri Windows'ta da gösterilir.">
        <Toggle on={s.nativeNotifications} onChange={(v) => updateApp({ nativeNotifications: v })} label="Bildirimler" />
      </Row>
      <Row title="Haftalık rapor" hint="Pazar akşamı 20:00'den sonra haftalık özet bildirimi gönderir.">
        <Toggle on={s.weeklyReport} onChange={(v) => updateApp({ weeklyReport: v })} label="Haftalık rapor" />
      </Row>
      <Row title="Telegram komutları" hint="Kayıtlı sohbetten /rank, /magaza, /son, /oturum, /hafta, /durum yazınca bot yanıtlar.">
        <Toggle on={s.telegramCommands} onChange={(v) => updateApp({ telegramCommands: v })} label="Telegram komutları" />
      </Row>
      <Row title="Mola hatırlatıcı" hint="3 maç üst üste kayıp, -50 RR ve uzun oturum için bildirim.">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-val-mute">
            <input
              type="number"
              min={1}
              max={12}
              value={s.breakAfterHours}
              onChange={(e) => updateApp({ breakAfterHours: Number(e.target.value) })}
              className={`${field} w-16`}
              disabled={!s.breakReminders}
            />
            saat
          </label>
          <Toggle on={s.breakReminders} onChange={(v) => updateApp({ breakReminders: v })} label="Mola hatırlatıcı" />
        </div>
      </Row>
    </section>
  )
}

function RiskPanel(): JSX.Element {
  return (
    <section className="space-y-3 rounded border border-orange-500/50 bg-orange-500/10 p-5">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <ShieldAlert size={18} className="text-orange-400" /> Risk Bilgilendirmesi
      </h2>
      <p className="text-sm text-val-text/90">
        Valo Tracker, Riot'un resmi olmayan yerel istemci arayüzünü kullanır. Riot bunu desteklemez ve bu arayüz haber verilmeden değişebilir.
        Aşağıdaki özellikler hesabına yönelik risk taşıyabilir; <span className="font-semibold">önermiyoruz</span>, kullanım ve sorumluluk sana aittir.
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-val-text/90">
        <li>
          <span className="font-semibold">Instalocker:</span> Riot'un ajan seçimi otomasyonu yapan araçlara geçici veya kalıcı hesap cezası verdiği bildirilmiştir.
        </li>
        <li>
          <span className="font-semibold">Dodge asistanı:</span> Başka oyuncuların maç geçmişini okur. Riot'un politikası izin vermemiş oyuncuların istatistiklerini göstermeyi kısıtlar.
        </li>
        <li>
          <span className="font-semibold">Overlay:</span> Oyunun üstüne pencere çizer. Vanguard bu konuda garanti vermez; yalnızca "pencereli tam ekran" modunda görünür.
        </li>
      </ul>
      <p className="text-xs text-val-mute">Yayıncı modundaki oyuncuların adı hiçbir yerde gösterilmez.</p>
    </section>
  )
}

function TelegramPanel(): JSX.Element {
  const [view, setView] = useState<TelegramSettingsView | null>(null)
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [busy, setBusy] = useState<'test' | 'save' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  useEffect(() => {
    void window.api.getTelegram().then((v) => {
      setView(v)
      setChatId(v.chatId)
    })
  }, [])

  const canSubmit = (token.trim() || view?.tokenHint) && chatId.trim()

  const test = async (): Promise<void> => {
    setBusy('test')
    setNotice(null)
    const r = await window.api.testTelegram({ botToken: token, chatId })
    setNotice(r.ok ? { kind: 'ok', text: "Test mesajı gönderildi. Telegram'ı kontrol et." } : { kind: 'error', text: `Gönderilemedi: ${r.error}` })
    setBusy(null)
  }

  const save = async (): Promise<void> => {
    setBusy('save')
    setNotice(null)
    const v = await window.api.saveTelegram({ botToken: token, chatId })
    setView(v)
    setToken('')
    setNotice({ kind: 'ok', text: 'Kaydedildi.' })
    setBusy(null)
  }

  const input = `${field} w-full px-3 py-2 select-text`

  return (
    <section className="space-y-4 rounded border border-val-line bg-val-panel p-5">
      <div>
        <h2 className="text-base font-bold">Telegram AFK Asistanı</h2>
        <p className="text-sm text-val-mute">Maç bulunduğunda, wishlist skin düştüğünde ve mola uyarılarında Telegram'dan bildirim alırsın.</p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold uppercase tracking-widest text-val-mute">Bot Token</label>
        <input
          type="password"
          autoComplete="off"
          className={input}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={view?.tokenHint ? `Kayıtlı: ${view.tokenHint} (değiştirmek için yeni token yaz)` : '123456:ABC-DEF…'}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold uppercase tracking-widest text-val-mute">Chat ID</label>
        <input className={input} value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void test()}
          disabled={!canSubmit || busy !== null}
          className="flex items-center gap-2 rounded border border-val-line px-4 py-2 text-sm font-semibold hover:bg-val-raised disabled:opacity-40"
        >
          {busy === 'test' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          Test Mesajı Gönder
        </button>
        <button
          onClick={() => void save()}
          disabled={!canSubmit || busy !== null}
          className="flex items-center gap-2 rounded bg-val-red px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-40"
        >
          {busy === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Kaydet
        </button>
        {view?.configured && <span className="text-xs text-emerald-400">Telegram bildirimleri açık</span>}
      </div>

      {notice && <p className={`select-text text-sm ${notice.kind === 'ok' ? 'text-emerald-400' : 'text-val-red'}`}>{notice.text}</p>}

      <p className="text-xs text-val-mute">
        Bot token'ı için Telegram'da @BotFather ile bir bot oluştur. Chat ID için bota bir mesaj yaz, sonra @userinfobot'a yazarak kendi ID'ni öğren. Token bu bilgisayarda şifreli saklanır.
      </p>
    </section>
  )
}

export default function SettingsPage(): JSX.Element {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Ayarlar</h1>
      <GeneralPanel />
      <RiskPanel />
      <TelegramPanel />
    </div>
  )
}
