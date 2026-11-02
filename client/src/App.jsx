import Shell from './components/layout/Shell'
import { ToastProvider } from './components/ui/Toast'
import GuidelineHealthPage from './pages/GuidelineHealthPage'
import HistoryPage from './pages/HistoryPage'
import ImpactPage from './pages/ImpactPage'
import NotFoundPage from './pages/NotFoundPage'
import ReviewPage from './pages/ReviewPage'
import VaultPage from './pages/VaultPage'
import { useRoute } from './lib/router'
import { DemoProvider } from './state/demo'

const PAGES = {
  '/': ReviewPage,
  '/review': ReviewPage,
  '/vault': VaultPage,
  '/impact': ImpactPage,
  '/health': GuidelineHealthPage,
  '/history': HistoryPage,
}

function RoutedApp() {
  const route = useRoute()

  const path = route.path === '/' ? '/review' : route.path
  // Unknown hash → a small "Page not found" with a link back to Review
  // (Round 3, F6) instead of a silent redirect.
  const Page = PAGES[route.path] ?? NotFoundPage

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
