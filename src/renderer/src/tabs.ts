import type { ComponentType } from 'react'
import { Crosshair, ScrollText, Settings, History, ShoppingBag, Swords, type LucideIcon } from 'lucide-react'
import LiveMatchPage from './pages/LiveMatchPage'
import InstalockPage from './pages/InstalockPage'
import LogPage from './pages/LogPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import StorefrontPage from './pages/StorefrontPage'

export interface TabDef {
  id: string
  label: string
  icon: LucideIcon
  component: ComponentType
}

/** Add a new feature tab by appending an entry here. */
export const TABS: TabDef[] = [
  { id: 'live', label: 'Canlı Maç', icon: Swords, component: LiveMatchPage },
  { id: 'instalock', label: 'Instalocker', icon: Crosshair, component: InstalockPage },
  { id: 'history', label: 'Kariyer / Geçmiş', icon: History, component: HistoryPage },
  { id: 'store', label: 'Mağaza', icon: ShoppingBag, component: StorefrontPage },
  { id: 'settings', label: 'Ayarlar', icon: Settings, component: SettingsPage },
  { id: 'log', label: 'Günlük', icon: ScrollText, component: LogPage }
]
