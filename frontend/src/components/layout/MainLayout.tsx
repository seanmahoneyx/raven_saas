import { Outlet } from 'react-router-dom'
import TopNavbar from './TopNavbar'

export default function MainLayout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNavbar />
      <main className="flex-1 overflow-y-auto bg-background">
        <Outlet />
      </main>
    </div>
  )
}
