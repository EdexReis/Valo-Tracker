import { EventEmitter } from 'node:events'
import type { LogEntry } from '@shared/types'

export const logBus = new EventEmitter()
const history: LogEntry[] = []

export function log(source: string, level: LogEntry['level'], message: string): void {
  const entry: LogEntry = { time: Date.now(), level, source, message }
  history.push(entry)
  if (history.length > 200) history.shift()
  logBus.emit('log', entry)
}

export function getLogHistory(): LogEntry[] {
  return [...history]
}
