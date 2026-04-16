import { Menu, Bell } from 'lucide-react'
import { Link } from 'react-router-dom'

interface MobileHeaderProps {
  onMenuOpen: () => void
}

export function MobileHeader({ onMenuOpen }: MobileHeaderProps) {
  return (
    <header
      className="flex items-center justify-between shrink-0 px-2 bg-sidebar"
      style={{
        height: '48px',
      }}
    >
      {/* Left: Hamburger */}
      <button
        onClick={onMenuOpen}
        className="flex items-center justify-center rounded-md"
        style={{ minWidth: '44px', minHeight: '44px' }}
        aria-label="Open menu"
      >
        <Menu size={20} className="text-sidebar-foreground" />
      </button>

      {/* Center: Brand */}
      <span className="text-base font-semibold text-sidebar-foreground">
        Raven
      </span>

      {/* Right: Notifications */}
      <Link
        to="/notifications"
        className="flex items-center justify-center rounded-md"
        style={{ minWidth: '44px', minHeight: '44px' }}
        aria-label="Notifications"
      >
        <Bell size={20} className="text-sidebar-foreground" />
      </Link>
    </header>
  )
}
