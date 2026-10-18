import type { RegionKey } from './types'

export const SHORTCUT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'CommandOrControl+Tab', label: 'Ctrl + Tab' },
  { value: 'CommandOrControl+Shift+O', label: 'Ctrl + Shift + O' },
  { value: 'Alt+Z', label: 'Alt + Z' },
  { value: 'Alt+Q', label: 'Alt + Q' },
  { value: 'F9', label: 'F9' }
]

export const REGION_OPTIONS: Array<{ value: RegionKey; label: string }> = [
  { value: 'eu', label: 'Avrupa (EU)' },
  { value: 'na', label: 'Kuzey Amerika (NA)' },
  { value: 'latam', label: 'Latin Amerika' },
  { value: 'br', label: 'Brezilya' },
  { value: 'ap', label: 'Asya-Pasifik (AP)' },
  { value: 'kr', label: 'Kore' }
]
