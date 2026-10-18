import { useEffect, useState } from 'react'
import { Loader2, Save, Send } from 'lucide-react'
import type { TelegramSettingsView } from '@shared/types'

type Notice = { kind: 'ok' | 'error'; text: string } | null

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
    setNotice(r.ok ? { kind: 'ok', text: 'Test mesajı gönderildi. Telegram\'ı kontrol et.' } : { kind: 'error', text: `Gönderilemedi: ${r.error}` })
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

  const input = 'w-full rounded border border-val-line bg-val-bg px-3 py-2 text-sm outline-none focus:border-val-red select-text'

  return (
    <section className="space-y-4 rounded border border-val-line bg-val-panel p-5">
      <div>
        <h2 className="text-base font-bold">Telegram AFK Asistanı</h2>
        <p className="text-sm text-val-mute">Maç bulunduğunda (ajan seçimi başlayınca) Telegram'dan bildirim alırsın.</p>
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
        Bot token'ı için Telegram'da @BotFather ile bir bot oluştur. Chat ID için bota bir mesaj yaz, sonra @userinfobot'a yazarak kendi ID'ni öğren.
        Token bu bilgisayarda şifreli saklanır.
      </p>
    </section>
  )
}

export default function SettingsPage(): JSX.Element {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Ayarlar</h1>
      <TelegramPanel />
    </div>
  )
}
