import { useEffect, useState, type ReactNode } from 'react'
import { Download, Loader2, Save, Send, ShieldAlert, Upload } from 'lucide-react'
import type { DiscordWebhookView, TelegramSettingsView } from '@shared/types'
import { REGION_OPTIONS, SHORTCUT_OPTIONS } from '@shared/options'
import { useApp } from '../store'
import { tr } from '@shared/i18n'

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
      <Row title={tr('Windows ile başlat')} hint={tr('Bilgisayar açılınca uygulama kendiliğinden başlar (kurulu sürümde).')}>
        <Toggle on={s.startWithWindows} onChange={(v) => updateApp({ startWithWindows: v })} label={tr('Windows ile başlat')} />
      </Row>
      <Row title={tr('Kapatınca sistem tepsisine küçült')} hint={tr('Pencereyi kapatınca uygulama arka planda çalışmaya devam eder.')}>
        <Toggle on={s.minimizeToTray} onChange={(v) => updateApp({ minimizeToTray: v })} label={tr('Tepsiye küçült')} />
      </Row>
      <Row title={tr('Bölge')} hint={tr('Hesabının bulunduğu sunucu bölgesi.')}>
        <select className={field} value={s.region} onChange={(e) => updateApp({ region: e.target.value as typeof s.region })}>
          {REGION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {tr(o.label)}
            </option>
          ))}
        </select>
      </Row>
      <Row title={tr('Dil')} hint={tr('Uygulamanın dili. Değişince arayüz yeniden yüklenir.')}>
        <select className={field} value={s.language} onChange={(e) => updateApp({ language: e.target.value as typeof s.language })} aria-label={tr('Dil')}>
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
      </Row>
      <Row title={tr('Discord Rich Presence')} hint={tr('Lobi, ajan seçimi ve maç durumunu Discord profilinde göster.')}>
        <Toggle on={s.discordRpc} onChange={(v) => updateApp({ discordRpc: v })} label={tr('Discord Rich Presence')} />
      </Row>
      <Row title={tr('Oyun içi overlay')} hint={tr('Maç sırasında kısayola basılı tutunca oyuncu ve rank listesi görünür.')}>
        <div className="flex items-center gap-3">
          <select className={field} value={s.overlayShortcut} onChange={(e) => updateApp({ overlayShortcut: e.target.value })} disabled={!s.overlayEnabled}>
            {SHORTCUT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {tr(o.label)}
              </option>
            ))}
          </select>
          <Toggle on={s.overlayEnabled} onChange={(v) => updateApp({ overlayEnabled: v })} label="Overlay" />
        </div>
      </Row>
      <Row title={tr('Overlay konumu ve saydamlığı')} hint={tr('Maç sırasında overlay\'in ekranın hangi köşesinde ve ne kadar opak görüneceği (ana monitör).')}>
        <div className="flex items-center gap-3">
          <select
            className={field}
            value={s.overlayCorner}
            onChange={(e) => updateApp({ overlayCorner: e.target.value as typeof s.overlayCorner })}
            disabled={!s.overlayEnabled}
            aria-label={tr('Overlay köşesi')}
          >
            <option value="tr">{tr('Sağ üst')}</option>
            <option value="tl">{tr('Sol üst')}</option>
            <option value="br">{tr('Sağ alt')}</option>
            <option value="bl">{tr('Sol alt')}</option>
          </select>
          <input
            type="range"
            min={40}
            max={100}
            step={5}
            value={Math.round(s.overlayOpacity * 100)}
            onChange={(e) => updateApp({ overlayOpacity: Number(e.target.value) / 100 })}
            disabled={!s.overlayEnabled}
            aria-label={tr('Overlay saydamlığı')}
            className="w-28"
          />
        </div>
      </Row>
      <Row title={tr('Dodge asistanı')} hint={tr('Ajan seçiminde takım arkadaşlarının son maçlarına bakıp uyarır.')}>
        <Toggle on={s.dodgeAssistant} onChange={(v) => updateApp({ dodgeAssistant: v })} label={tr('Dodge asistanı')} />
      </Row>
      <Row
        title={tr('Oyun içi hafiflik modu')}
        hint={tr('Maç sırasında uygulamanın işlemlerinin önceliğini düşürür, animasyonları durdurur; mağaza, rapor ve mola kontrollerini maç bitene kadar bekletir.')}
      >
        <Toggle on={s.lightMode} onChange={(v) => updateApp({ lightMode: v })} label={tr('Oyun içi hafiflik modu')} />
      </Row>
      <Row title={tr('Windows bildirimleri')} hint={tr('Wishlist, mola ve AI koç bildirimleri Windows\'ta da gösterilir.')}>
        <Toggle on={s.nativeNotifications} onChange={(v) => updateApp({ nativeNotifications: v })} label={tr('Bildirimler')} />
      </Row>
      <Row title={tr('Müzik kontrolü')} hint={tr('Maç bulununca Windows\'ta çalan müziği (Spotify, YouTube Music, tarayıcı…) duraklatır, lobiye dönünce devam ettirir. Sadece kendi durdurduğunu başlatır.')}>
        <Toggle on={s.musicControl} onChange={(v) => updateApp({ musicControl: v })} label={tr('Müzik kontrolü')} />
      </Row>
      <Row title={tr('Haftalık rapor')} hint={tr('Pazar akşamı 20:00\'den sonra haftalık özet bildirimi gönderir.')}>
        <Toggle on={s.weeklyReport} onChange={(v) => updateApp({ weeklyReport: v })} label={tr('Haftalık rapor')} />
      </Row>
      <Row title={tr('Telegram komutları')} hint={tr('Kayıtlı sohbetten /rank, /magaza, /son, /oturum, /hafta, /durum yazınca bot yanıtlar.')}>
        <Toggle on={s.telegramCommands} onChange={(v) => updateApp({ telegramCommands: v })} label={tr('Telegram komutları')} />
      </Row>
      <Row title={tr('Mola hatırlatıcı')} hint={tr('3 maç üst üste kayıp, -50 RR ve uzun oturum için bildirim.')}>
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
            {tr('saat')}
          </label>
          <Toggle on={s.breakReminders} onChange={(v) => updateApp({ breakReminders: v })} label={tr('Mola hatırlatıcı')} />
        </div>
      </Row>
    </section>
  )
}

function RiskPanel(): JSX.Element {
  return (
    <section className="space-y-3 rounded border border-orange-500/50 bg-orange-500/10 p-5">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <ShieldAlert size={18} className="text-orange-400" /> {tr('Risk Bilgilendirmesi')}
      </h2>
      <p className="text-sm text-val-text/90">
        {tr('Valo Tracker, Riot\'un resmi olmayan yerel istemci arayüzünü kullanır. Riot bunu desteklemez ve bu arayüz haber verilmeden değişebilir. Aşağıdaki özellikler hesabına yönelik risk taşıyabilir;')} <span className="font-semibold">{tr('önermiyoruz')}</span>{tr(', kullanım ve sorumluluk sana aittir.')}
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-val-text/90">
        <li>
          <span className="font-semibold">{tr('Instalocker:')}</span> {tr('Riot\'un ajan seçimi otomasyonu yapan araçlara geçici veya kalıcı hesap cezası verdiği bildirilmiştir.')}
        </li>
        <li>
          <span className="font-semibold">{tr('Dodge asistanı:')}</span> {tr('Başka oyuncuların maç geçmişini okur. Riot\'un politikası izin vermemiş oyuncuların istatistiklerini göstermeyi kısıtlar.')}
        </li>
        <li>
          <span className="font-semibold">{tr('Overlay:')}</span> {tr('Oyunun üstüne pencere çizer. Vanguard bu konuda garanti vermez; yalnızca "pencereli tam ekran" modunda görünür.')}
        </li>
      </ul>
      <p className="text-xs text-val-mute">{tr('Yayıncı modundaki oyuncuların adı hiçbir yerde gösterilmez.')}</p>
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
    setNotice(r.ok ? { kind: 'ok', text: tr('Test mesajı gönderildi. Telegram\'ı kontrol et.') } : { kind: 'error', text: tr('Gönderilemedi: {msg}', { msg: r.error ?? '' }) })
    setBusy(null)
  }

  const save = async (): Promise<void> => {
    setBusy('save')
    setNotice(null)
    const v = await window.api.saveTelegram({ botToken: token, chatId })
    setView(v)
    setToken('')
    setNotice({ kind: 'ok', text: tr('Kaydedildi.') })
    setBusy(null)
  }

  const input = `${field} w-full px-3 py-2 select-text`

  return (
    <section className="space-y-4 rounded border border-val-line bg-val-panel p-5">
      <div>
        <h2 className="text-base font-bold">{tr('Telegram AFK Asistanı')}</h2>
        <p className="text-sm text-val-mute">{tr('Maç bulunduğunda, wishlist skin düştüğünde ve mola uyarılarında Telegram\'dan bildirim alırsın.')}</p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold uppercase tracking-widest text-val-mute">{tr('Bot Token')}</label>
        <input
          type="password"
          autoComplete="off"
          className={input}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={view?.tokenHint ? tr('Kayıtlı: {hint} (değiştirmek için yeni token yaz)', { hint: view.tokenHint }) : '123456:ABC-DEF…'}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold uppercase tracking-widest text-val-mute">{tr('Chat ID')}</label>
        <input className={input} value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void test()}
          disabled={!canSubmit || busy !== null}
          className="flex items-center gap-2 rounded border border-val-line px-4 py-2 text-sm font-semibold hover:bg-val-raised disabled:opacity-40"
        >
          {busy === 'test' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {tr('Test Mesajı Gönder')}
        </button>
        <button
          onClick={() => void save()}
          disabled={!canSubmit || busy !== null}
          className="flex items-center gap-2 rounded bg-val-red px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-40"
        >
          {busy === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {tr('Kaydet')}
        </button>
        {view?.configured && <span className="text-xs text-emerald-400">{tr('Telegram bildirimleri açık')}</span>}
      </div>

      {notice && <p className={`select-text text-sm ${notice.kind === 'ok' ? 'text-emerald-400' : 'text-val-red'}`}>{notice.text}</p>}

      <p className="text-xs text-val-mute">
        {tr('Bot token\'ı için Telegram\'da @BotFather ile bir bot oluştur. Chat ID için bota bir mesaj yaz, sonra @userinfobot\'a yazarak kendi ID\'ni öğren. Token bu bilgisayarda şifreli saklanır.')}
      </p>
    </section>
  )
}

function AiPanel(): JSX.Element {
  const { appSettings: s, updateApp } = useApp()
  const [url, setUrl] = useState(s.aiUrl)
  const [model, setModel] = useState(s.aiModel)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)

  // The saved values arrive after the first render.
  useEffect(() => {
    setUrl(s.aiUrl)
    setModel(s.aiModel)
  }, [s.aiUrl, s.aiModel])

  const test = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    updateApp({ aiUrl: url, aiModel: model })
    await new Promise((r) => setTimeout(r, 300)) // let the main process save before it is asked to connect
    const r = await window.api.testAI()
    setNotice(r.ok ? { kind: 'ok', text: tr('Bağlandı. Kullanılacak model: {model}', { model: r.model ?? '' }) } : { kind: 'error', text: r.error ?? tr('Bağlanılamadı.') })
    setBusy(false)
  }

  const input = `${field} w-full px-3 py-2 select-text`
  return (
    <section className="space-y-4 rounded border border-val-line bg-val-panel p-5">
      <div>
        <h2 className="text-base font-bold">{tr('AI Koç sunucusu')}</h2>
        <p className="text-sm text-val-mute">
          {tr('LM Studio (varsayılan 1234) veya Ollama ({url}) gibi OpenAI uyumlu bir yerel sunucu. Maç verilerinin bilgisayarından çıkmaması için yalnızca bu bilgisayardaki adresler (127.0.0.1 / localhost) kabul edilir.', {
            url: 'http://127.0.0.1:11434/v1'
          })}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-widest text-val-mute">{tr('Adres')}</span>
          <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:1234/v1" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-widest text-val-mute">{tr('Model (boşsa otomatik)')}</span>
          <input className={input} value={model} onChange={(e) => setModel(e.target.value)} placeholder={tr('örn. llama3.1:8b')} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => void test()}
          disabled={busy}
          className="flex items-center gap-2 rounded border border-val-line px-4 py-2 text-sm font-semibold hover:bg-val-raised disabled:opacity-40"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {tr('Kaydet ve bağlantıyı dene')}
        </button>
        {notice && <span className={`select-text text-sm ${notice.kind === 'ok' ? 'text-emerald-400' : 'text-val-red'}`}>{notice.text}</span>}
      </div>
    </section>
  )
}

function DiscordWebhookPanel(): JSX.Element {
  const { appSettings: s, updateApp } = useApp()
  const [view, setView] = useState<DiscordWebhookView | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'test' | 'save' | 'send' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  useEffect(() => {
    void window.api.getDiscordWebhook().then(setView)
  }, [])

  const run = async (kind: 'test' | 'save' | 'send'): Promise<void> => {
    setBusy(kind)
    setNotice(null)
    try {
      if (kind === 'save') {
        setView(await window.api.saveDiscordWebhook(url))
        setUrl('')
        setNotice({ kind: 'ok', text: url.trim() ? tr('Kaydedildi.') : tr('Webhook kaldırıldı.') })
      } else {
        const r = kind === 'test' ? await window.api.testDiscordWebhook(url) : await window.api.sendLastMatchToDiscord()
        setNotice(r.ok ? { kind: 'ok', text: kind === 'test' ? tr('Test mesajı gönderildi. Discord\'u kontrol et.') : tr('Son maç gönderildi.') } : { kind: 'error', text: r.error ?? tr('Gönderilemedi.') })
      }
    } catch {
      setNotice({ kind: 'error', text: tr('Geçerli bir Discord webhook adresi değil.') })
    }
    setBusy(null)
  }

  const input = `${field} w-full px-3 py-2 select-text`
  const btn = 'flex items-center gap-2 rounded border border-val-line px-4 py-2 text-sm font-semibold hover:bg-val-raised disabled:opacity-40'
  return (
    <section className="space-y-4 rounded border border-val-line bg-val-panel p-5">
      <div>
        <h2 className="text-base font-bold">{tr('Discord maç özeti')}</h2>
        <p className="text-sm text-val-mute">
          {tr('Her Rekabetçi/Derecesiz maçtan sonra sonucu bir Discord kanalına gönderir (harita, ajan, K/D/A, ACS, VTS, RR). İsim veya Riot ID içermez. Kanal ayarlarından Entegrasyonlar → Webhooklar → Yeni Webhook ile adres oluştur.')}
        </p>
      </div>
      <input
        type="password"
        autoComplete="off"
        className={input}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={view?.configured ? tr('Kayıtlı: {hint} (değiştirmek için yeni adres yaz, kaldırmak için boş kaydet)', { hint: view.hint }) : 'https://discord.com/api/webhooks/…'}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => void run('test')} disabled={busy !== null || (!url.trim() && !view?.configured)} className={btn}>
          {busy === 'test' && <Loader2 size={15} className="animate-spin" />}
          <Send size={15} /> {tr('Test mesajı')}
        </button>
        <button
          onClick={() => void run('save')}
          disabled={busy !== null || (!url.trim() && !view?.configured)}
          className="flex items-center gap-2 rounded bg-val-red px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-40"
        >
          {busy === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {tr('Kaydet')}
        </button>
        <button onClick={() => void run('send')} disabled={busy !== null || !view?.configured} className={btn}>
          {busy === 'send' && <Loader2 size={15} className="animate-spin" />} {tr('Son maçı gönder')}
        </button>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-val-mute">
          <input type="checkbox" checked={s.discordMatchSummary} onChange={(e) => updateApp({ discordMatchSummary: e.target.checked })} />
          {tr('Her maçtan sonra otomatik gönder')}
        </label>
      </div>
      {notice && <p className={`select-text text-sm ${notice.kind === 'ok' ? 'text-emerald-400' : 'text-val-red'}`}>{notice.text}</p>}
    </section>
  )
}

function BackupPanel(): JSX.Element {
  const [notice, setNotice] = useState<Notice>(null)
  const run = async (kind: 'export' | 'import'): Promise<void> => {
    const r = kind === 'export' ? await window.api.exportBackup() : await window.api.importBackup()
    if (r.ok) {
      setNotice({ kind: 'ok', text: kind === 'export' ? tr('Yedek kaydedildi: {path}', { path: r.path ?? '' }) : tr('Yedek yüklendi. Sayfa ayarları yenileniyor…') })
      if (kind === 'import') setTimeout(() => window.location.reload(), 800)
    } else if (!r.canceled) {
      setNotice({ kind: 'error', text: r.error ?? tr('İşlem başarısız.') })
    }
  }
  const btn = 'flex items-center gap-2 rounded border border-val-line px-4 py-2 text-sm font-semibold hover:bg-val-raised'
  return (
    <section className="space-y-3 rounded border border-val-line bg-val-panel p-5">
      <div>
        <h2 className="text-base font-bold">{tr('Ayar yedeği')}</h2>
        <p className="text-sm text-val-mute">
          {tr('Ayarlarını, wishlist\'ini ve nişangah kütüphaneni dosyaya kaydet veya başka bir bilgisayarda yükle. Telegram token\'ı ve maç geçmişi yedeğe girmez. Yüklenen yedekte instalock riski her zaman yeniden onaylatılır.')}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => void run('export')} className={btn}>
          <Download size={15} /> {tr('Yedek al')}
        </button>
        <button onClick={() => void run('import')} className={btn}>
          <Upload size={15} /> {tr('Yedekten yükle')}
        </button>
        {notice && <span className={`select-text text-sm ${notice.kind === 'ok' ? 'text-emerald-400' : 'text-val-red'}`}>{notice.text}</span>}
      </div>
    </section>
  )
}

export default function SettingsPage(): JSX.Element {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{tr('Ayarlar')}</h1>
      <GeneralPanel />
      <AiPanel />
      <DiscordWebhookPanel />
      <BackupPanel />
      <RiskPanel />
      <TelegramPanel />
    </div>
  )
}
