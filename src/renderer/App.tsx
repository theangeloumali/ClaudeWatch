import { useState } from 'react'
import { Header, type ViewType } from './components/Header'
import { Dashboard } from './components/Dashboard'
import { SessionHistory } from './components/SessionHistory'
import { Settings } from './components/Settings'
import { PopoverView } from './components/PopoverView'

const isPopover = window.location.hash === '#popover'

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard')

  if (isPopover) {
    return <PopoverView />
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header currentView={currentView} onViewChange={setCurrentView} />
      <main className="no-drag min-h-0 flex-1 overflow-hidden">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'history' && <SessionHistory />}
        {currentView === 'settings' && <Settings />}
      </main>
    </div>
  )
}
