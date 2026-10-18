import path from 'node:path'
import { app, Notification } from 'electron'
import type { SettingsService } from './SettingsService'
import type { TelegramService } from './TelegramService'

/** Sends a notification to the Windows notification center and, when configured, to Telegram. */
export class NotifyService {
  constructor(
    private settings: SettingsService,
    private telegram: TelegramService
  ) {}

  async push(title: string, body: string): Promise<void> {
    if (this.settings.getApp().nativeNotifications && Notification.isSupported()) {
      new Notification({ title, body, icon: path.join(app.getAppPath(), 'resources/icon.png') }).show()
    }
    await this.telegram.sendText(`${title}\n${body}`)
  }
}
