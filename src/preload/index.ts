import { contextBridge, ipcRenderer } from 'electron'
import type { ValoApi } from '@shared/types'
import { IPC } from '@shared/ipc'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args)

const api: ValoApi = {
  getStatus: () => invoke(IPC.getStatus),
  getAssets: () => invoke(IPC.getAssets),
  getSettings: () => invoke(IPC.getSettings),
  saveSettings: (s) => invoke(IPC.saveSettings, s),
  getAppSettings: () => invoke(IPC.getAppSettings),
  saveAppSettings: (s) => invoke(IPC.saveAppSettings, s),
  getMatch: () => invoke(IPC.getMatch),
  scanMatch: () => invoke(IPC.scanMatch),
  triggerPregame: () => invoke(IPC.triggerPregame),
  getStorefront: () => invoke(IPC.getStorefront),
  getCollection: () => invoke(IPC.getCollection),
  getWishlist: () => invoke(IPC.getWishlist),
  searchSkins: (q) => invoke(IPC.searchSkins, q),
  addWish: (u) => invoke(IPC.addWish, u),
  removeWish: (u) => invoke(IPC.removeWish, u),
  checkWishlist: () => invoke(IPC.checkWishlist),
  getOwnHistory: () => invoke(IPC.getOwnHistory),
  getStats: () => invoke(IPC.getStats),
  exportHistory: (f) => invoke(IPC.exportHistory, f),
  getSessionRR: () => invoke(IPC.getSessionRR),
  getTelegram: () => invoke(IPC.getTelegram),
  saveTelegram: (i) => invoke(IPC.saveTelegram, i),
  testTelegram: (i) => invoke(IPC.testTelegram, i),
  getCompWarning: () => invoke(IPC.getCompWarning),
  onCompWarning: (cb) => subscribe(IPC.evComp, cb),
  getAICoaching: (m) => invoke(IPC.getAICoaching, m),
  onCoach: (cb) => subscribe(IPC.evCoach, cb),
  getDodgeWarning: () => invoke(IPC.getDodgeWarning),
  onDodgeWarning: (cb) => subscribe(IPC.evDodge, cb),
  onStage: (cb) => subscribe(IPC.evStage, cb),
  getCrosshairs: () => invoke(IPC.getCrosshairs),
  addCrosshair: (i) => invoke(IPC.addCrosshair, i),
  removeCrosshair: (id) => invoke(IPC.removeCrosshair, id),
  onSessionRR: (cb) => subscribe(IPC.evSession, cb),
  getLogs: () => invoke(IPC.getLogs),
  windowAction: (a) => ipcRenderer.send(IPC.windowAction, a),
  onStatus: (cb) => subscribe(IPC.evStatus, cb),
  onMatch: (cb) => subscribe(IPC.evMatch, cb),
  onLog: (cb) => subscribe(IPC.evLog, cb)
}

contextBridge.exposeInMainWorld('api', api)
