import { useRef, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { House, Users, Package, Grid3x3, Menu, Building2, FileText, ScrollText, Calculator, Truck } from 'lucide-react'

interface BottomTabBarProps {
  onMenuOpen: () => void
}

const MORE_ITEMS = [
  { icon: Truck, label: 'Vendors', to: '/vendors' },
  { icon: Package, label: 'Items', to: '/items' },
  { icon: FileText, label: 'Invoices', to: '/invoices' },
  { icon: ScrollText, label: 'Contracts', to: '/contracts' },
  { icon: Calculator, label: 'Estimates', to: '/estimates' },
  { icon: Building2, label: 'Company', to: '/settings' },
]

export function BottomTabBar({ onMenuOpen }: BottomTabBarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  // Close the "More" popover on outside click
  useEffect(() => {
    if (!moreOpen) return
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [moreOpen])

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const tabColor = (active: boolean) =>
    active ? 'hsl(265 80% 70%)' : 'hsl(0 0% 60%)'

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch shrink-0 bg-sidebar"
      style={{
        height: '64px',
      }}
    >
      {/* Home */}
      <button
        className="flex flex-1 flex-col items-center justify-center gap-0.5"
        style={{ color: tabColor(isActive('/') && location.pathname === '/'), minHeight: '44px' }}
        onClick={() => navigate('/')}
      >
        <House size={20} />
        <span className="text-[11px] font-medium">Home</span>
      </button>

      {/* Customers */}
      <button
        className="flex flex-1 flex-col items-center justify-center gap-0.5"
        style={{ color: tabColor(isActive('/customers')) }}
        onClick={() => navigate('/customers')}
      >
        <Users size={20} />
        <span className="text-[11px] font-medium">Customers</span>
      </button>

      {/* Orders */}
      <button
        className="flex flex-1 flex-col items-center justify-center gap-0.5"
        style={{ color: tabColor(isActive('/orders')) }}
        onClick={() => navigate('/orders')}
      >
        <Package size={20} />
        <span className="text-[11px] font-medium">Orders</span>
      </button>

      {/* More — with popover */}
      <div ref={moreRef} className="flex flex-1 flex-col items-center justify-center relative">
        <button
          className="flex flex-1 w-full flex-col items-center justify-center gap-0.5"
          style={{ color: tabColor(moreOpen) }}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <Grid3x3 size={20} />
          <span className="text-[11px] font-medium">More</span>
        </button>

        {moreOpen && (
          <div
            className="absolute bottom-full mb-2 right-0 rounded-xl shadow-lg p-3 z-50"
            style={{
              background: 'var(--so-surface)',
              border: '1px solid var(--so-border)',
              width: '200px',
            }}
          >
            <div className="grid grid-cols-3 gap-2">
              {MORE_ITEMS.map(({ icon: Icon, label, to }) => (
                <button
                  key={to}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg py-3 px-1 transition-colors"
                  style={{
                    color: isActive(to) ? 'var(--so-accent)' : 'var(--so-text-primary)',
                    background: isActive(to) ? 'var(--so-accent-light)' : 'transparent',
                  }}
                  onMouseEnter={e => {
                    if (!isActive(to)) (e.currentTarget as HTMLButtonElement).style.background = 'var(--so-border-light)'
                  }}
                  onMouseLeave={e => {
                    if (!isActive(to)) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }}
                  onClick={() => { navigate(to); setMoreOpen(false) }}
                >
                  <Icon size={18} />
                  <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Menu (drawer) */}
      <button
        className="flex flex-1 flex-col items-center justify-center gap-0.5"
        style={{ color: 'var(--so-text-secondary)' }}
        onClick={onMenuOpen}
      >
        <Menu size={20} />
        <span className="text-[11px] font-medium">Menu</span>
      </button>
    </div>
  )
}
