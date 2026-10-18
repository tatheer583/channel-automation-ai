import type { ReactNode } from 'react'
import { AppProvider } from './store/AppStore'
import { AppShell } from './components/AppShell'
import { useRoute } from './lib/router'
import OverviewPage from './pages/Overview'
import ChannelsPage from './pages/Channels'
import LibraryPage from './pages/Library'
import StudioPage from './pages/Studio'
import CaptionsPage from './pages/Captions'
import CalendarPage from './pages/Calendar'
import SettingsPage from './pages/Settings'

function RoutedApp() {
  const route = useRoute()
  let page: ReactNode
  switch (route) {
    case '/overview':
      page = <OverviewPage />
      break
    case '/channels':
      page = <ChannelsPage />
      break
    case '/library':
      page = <LibraryPage />
      break
    case '/studio':
      page = <StudioPage />
      break
    case '/captions':
      page = <CaptionsPage />
      break
    case '/calendar':
      page = <CalendarPage />
      break
    case '/settings':
      page = <SettingsPage />
      break
    default:
      page = <OverviewPage />
  }
  return <AppShell route={route}>{page}</AppShell>
}

export default function App() {
  return (
    <AppProvider>
      <RoutedApp />
    </AppProvider>
  )
}
