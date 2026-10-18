import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { log } from '../logger'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

/** Checks GitHub Releases for a newer version; downloads silently and installs on quit. */
export function startUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (i) => log('Updater', 'info', `Yeni sürüm bulundu: ${i.version}, indiriliyor…`))
  autoUpdater.on('update-downloaded', (i) =>
    log('Updater', 'success', `${i.version} indirildi. Uygulama kapatılınca otomatik kurulacak.`)
  )
  autoUpdater.on('error', (e) => log('Updater', 'error', `Güncelleme hatası: ${e.message}`))

  const check = (): void => void autoUpdater.checkForUpdates().catch(() => undefined)
  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
