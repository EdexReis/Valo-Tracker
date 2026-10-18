import { useState } from 'react'
import { TABS } from './tabs'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import DodgeBanner from './components/DodgeBanner'
import CompBanner from './components/CompBanner'
import SuggestBanner from './components/SuggestBanner'

export default function App(): JSX.Element {
  const [active, setActive] = useState(TABS[0].id)
  const Page = (TABS.find((t) => t.id === active) ?? TABS[0]).component

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar tabs={TABS} active={active} onSelect={setActive} />
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <DodgeBanner />
          <CompBanner />
          <SuggestBanner />
          <Page />
        </main>
      </div>
    </div>
  )
}
