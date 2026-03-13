import { Outlet } from 'react-router-dom'
import TopNavbar from './TopNavbar'
import NavigationBar from './NavigationBar'
import { ErrorBoundary } from '@/components/ui/error-boundary'

export default function MainLayout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNavbar />
      <NavigationBar />
      <main className="flex-1 overflow-y-auto bg-background">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
