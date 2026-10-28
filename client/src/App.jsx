import { useEffect } from 'react'
import Shell from './components/layout/Shell'
import { ToastProvider } from './components/ui/Toast'
import HistoryPage from './pages/HistoryPage'
import ImpactPage from './pages/ImpactPage'
import ReviewPage from './pages/ReviewPage'
import VaultPage from './pages/VaultPage'
import { navigate, useRoute } from './lib/router'
import { DemoProvider } from './state/demo'

const PAGES = {
  '/': ReviewPage,
  '/review': ReviewPage,
  '/vault': VaultPage,
  '/impact': ImpactPage,
  '/history': HistoryPage,
}

function RoutedApp() {
  const route = useRoute()

  // Unknown hash → send the judge home to Review.
  useEffect(() => {
    if (!PAGES[route.path]) navigate('/review', { replace: true })
  }, [route.path])

  const path = route.path === '/' ? '/review' : route.path
  const Page = PAGES[route.path] ?? ReviewPage

  return (
    <Shell path={path} key={path}>
      <Page route={route} />
    </Shell>
  )
}

export default function App() {
  return (
    <DemoProvider>
      <ToastProvider>
        <RoutedApp />
      </ToastProvider>
    </DemoProvider>
  )
}
