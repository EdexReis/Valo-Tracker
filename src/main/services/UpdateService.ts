import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { log } from '../logger'
import { tr } from '@shared/i18n'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

/** Checks GitHub Releases for a newer version; downloads silently and installs on quit. */
export function startUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (i) => log('Updater', 'info', tr('Yeni sürüm bulundu: {v}, indiriliyor…', { v: i.version })))
  autoUpdater.on('update-downloaded', (i) =>
    log('Updater', 'success', tr('{v} indirildi. Uygulama kapatılınca otomatik kurulacak.', { v: i.version }))
  )
  autoUpdater.on('error', (e) => log('Updater', 'error', tr('Güncelleme hatası: {msg}', { msg: e.message })))

  const check = (): void => void autoUpdater.checkForUpdates().catch(() => undefined)
  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
