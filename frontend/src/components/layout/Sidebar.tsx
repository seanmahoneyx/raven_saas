import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Warehouse as WarehouseIcon,
  Truck,
  FileText,
  BarChart3,
  Calendar,
  Scale,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  Building2,
  DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

interface NavItem {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}

interface NavGroup {
  label: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
  defaultOpen?: boolean
}

type NavEntry = NavItem | NavGroup

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry
}

const navStructure: NavEntry[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  {
    label: 'Vendors',
    icon: Building2,
    items: [
      { to: '/vendors', icon: Users, label: 'Vendor List' },
      { to: '/priority-list', icon: Scale, label: 'Priority List' },
    ],
  },
  {
    label: 'Customers',
    icon: Users,
    items: [
      { to: '/customers', icon: Users, label: 'Customer List' },
    ],
  },
  { to: '/items', icon: Package, label: 'Items' },
  {
    label: 'Warehouse',
    icon: WarehouseIcon,
    items: [
      { to: '/inventory', icon: WarehouseIcon, label: 'Inventory' },
      { to: '/trucks', icon: Truck, label: 'Trucks' },
      { to: '/scheduler', icon: Calendar, label: 'Scheduler' },
      { to: '/shipping', icon: Truck, label: 'Shipping' },
    ],
  },
  {
    label: 'Accounting',
    icon: DollarSign,
    items: [
      { to: '/orders', icon: ShoppingCart, label: 'Orders' },
      { to: '/invoices', icon: FileText, label: 'Invoices' },
    ],
  },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
]

function NavGroupComponent({ group }: { group: NavGroup }) {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(() => {
    // Auto-expand if current path matches any item in the group
    return group.items.some(item => {
      const itemPath = item.to.split('?')[0]
      return location.pathname === itemPath || location.pathname.startsWith(itemPath + '/')
    })
  })

  const isAnyActive = group.items.some(item => {
    const itemPath = item.to.split('?')[0]
    return location.pathname === itemPath
  })

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isAnyActive
            ? 'bg-sidebar-accent/50 text-sidebar-accent-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        )}
      >
        <div className="flex items-center gap-3">
          <group.icon className="h-5 w-5" />
          {group.label}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
      {isOpen && (
        <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-accent pl-3">
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { logout } = useAuth()

  return (
    <aside className="flex h-screen w-52 flex-col border-r bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold text-sidebar-foreground">Raven SaaS</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {navStructure.map((entry) =>
          isNavGroup(entry) ? (
            <NavGroupComponent key={entry.label} group={entry} />
          ) : (
            <NavLink
              key={entry.to}
              to={entry.to}
              end={entry.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )
              }
            >
              <entry.icon className="h-5 w-5" />
              {entry.label}
            </NavLink>
          )
        )}
      </nav>

      {/* Footer */}
      <div className="border-t p-4 space-y-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )
          }
        >
          <Settings className="h-5 w-5" />
          Settings
        </NavLink>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={logout}
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
