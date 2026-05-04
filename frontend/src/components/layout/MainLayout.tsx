import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import TopNavbar from './TopNavbar'
import NavigationBar from './NavigationBar'
import { MobileHeader } from './MobileHeader'
import { BottomTabBar } from './BottomTabBar'
import { MobileNavDrawer } from './MobileNavDrawer'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { useIsMobile } from '@/hooks/useIsMobile'

export default function MainLayout() {
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {isMobile ? (
        <MobileHeader onMenuOpen={() => setDrawerOpen(true)} />
      ) : (
        <>
          <TopNavbar />
          <NavigationBar />
        </>
      )}
      <main
        className={`flex-1 overflow-y-auto${isMobile ? ' pb-20' : ''}`}
        style={{ background: 'var(--so-bg)' }}
      >
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      {isMobile && <BottomTabBar onMenuOpen={() => setDrawerOpen(true)} />}
      {isMobile && <MobileNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />}
    </div>
  )
}
