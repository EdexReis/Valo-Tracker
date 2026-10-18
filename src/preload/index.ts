import { contextBridge, ipcRenderer } from 'electron'
import type { ValoApi } from '@shared/types'
import { IPC } from '@shared/ipc'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: ValoApi = {
  getStatus: () => ipcRenderer.invoke(IPC.getStatus),
  getAssets: () => ipcRenderer.invoke(IPC.getAssets),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (s) => ipcRenderer.invoke(IPC.saveSettings, s),
  getMatch: () => ipcRenderer.invoke(IPC.getMatch),
  scanMatch: () => ipcRenderer.invoke(IPC.scanMatch),
  triggerPregame: () => ipcRenderer.invoke(IPC.triggerPregame),
  getStorefront: () => ipcRenderer.invoke(IPC.getStorefront),
  getMatchHistory: () => ipcRenderer.invoke(IPC.getMatchHistory),
  getSessionRR: () => ipcRenderer.invoke(IPC.getSessionRR),
  onSessionRR: (cb) => subscribe(IPC.evSession, cb),
  getDodgeWarning: () => ipcRenderer.invoke(IPC.getDodgeWarning),
  onDodgeWarning: (cb) => subscribe(IPC.evDodge, cb),
  getTelegram: () => ipcRenderer.invoke(IPC.getTelegram),
  saveTelegram: (i) => ipcRenderer.invoke(IPC.saveTelegram, i),
  testTelegram: (i) => ipcRenderer.invoke(IPC.testTelegram, i),
  getLogs: () => ipcRenderer.invoke(IPC.getLogs),
  windowAction: (a) => ipcRenderer.send(IPC.windowAction, a),
  onStatus: (cb) => subscribe(IPC.evStatus, cb),
  onMatch: (cb) => subscribe(IPC.evMatch, cb),
  onLog: (cb) => subscribe(IPC.evLog, cb)
}

contextBridge.exposeInMainWorld('api', api)
