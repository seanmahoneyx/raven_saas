import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Warehouse,
  Truck,
  FileText,
  BarChart3,
  Calendar,
  Settings,
  LogOut,
  ChevronDown,
  Plus,
  Building2,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type NavItem =
  | { type: 'link'; to: string; icon: React.ElementType; label: string }
  | {
      type: 'dropdown'
      icon: React.ElementType
      label: string
      basePath: string
      items: Array<
        | { type: 'item'; to: string; icon: React.ElementType; label: string }
        | { type: 'separator' }
      >
    }

const navItems: NavItem[] = [
  { type: 'link', to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  {
    type: 'dropdown',
    icon: Users,
    label: 'Parties',
    basePath: '/parties',
    items: [
      { type: 'item', to: '/parties', icon: Building2, label: 'Customer Center' },
      { type: 'item', to: '/parties?tab=customers&action=new', icon: Plus, label: 'Add Customer' },
      { type: 'separator' },
      { type: 'item', to: '/contracts', icon: ClipboardList, label: 'Contracts' },
      { type: 'separator' },
      { type: 'item', to: '/parties?tab=vendors', icon: Warehouse, label: 'Vendor Center' },
      { type: 'item', to: '/parties?tab=vendors&action=new', icon: Plus, label: 'Add Vendor' },
    ],
  },
  {
    type: 'dropdown',
    icon: Package,
    label: 'Items',
    basePath: '/items',
    items: [
      { type: 'item', to: '/items', icon: Package, label: 'Item Catalog' },
      { type: 'item', to: '/items?action=new', icon: Plus, label: 'Add Item' },
    ],
  },
  {
    type: 'dropdown',
    icon: ShoppingCart,
    label: 'Orders',
    basePath: '/orders',
    items: [
      { type: 'item', to: '/orders?tab=sales', icon: ShoppingCart, label: 'Sales Orders' },
      { type: 'item', to: '/orders?tab=sales&action=new', icon: Plus, label: 'New Sales Order' },
      { type: 'separator' },
      { type: 'item', to: '/orders?tab=purchase', icon: Truck, label: 'Purchase Orders' },
      { type: 'item', to: '/orders?tab=purchase&action=new', icon: Plus, label: 'New Purchase Order' },
    ],
  },
  { type: 'link', to: '/inventory', icon: Warehouse, label: 'Inventory' },
  { type: 'link', to: '/shipping', icon: Truck, label: 'Shipping' },
  { type: 'link', to: '/invoices', icon: FileText, label: 'Invoices' },
  { type: 'link', to: '/reports', icon: BarChart3, label: 'Reports' },
  { type: 'link', to: '/scheduler', icon: Calendar, label: 'Scheduler' },
]

function NavDropdown({
  item,
}: {
  item: Extract<NavItem, { type: 'dropdown' }>
}) {
  const location = useLocation()
  const isActive = location.pathname.startsWith(item.basePath) ||
    (item.label === 'Parties' && location.pathname.startsWith('/contracts'))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
            isActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <item.icon className="h-4 w-4" />
          <span className="hidden lg:inline">{item.label}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{item.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {item.items.map((subItem, idx) =>
          subItem.type === 'separator' ? (
            <DropdownMenuSeparator key={idx} />
          ) : (
            <DropdownMenuItem key={subItem.to} asChild>
              <NavLink to={subItem.to} className="flex items-center gap-2 cursor-pointer">
                <subItem.icon className="h-4 w-4" />
                {subItem.label}
              </NavLink>
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function TopNavbar() {
  const { logout } = useAuth()

  return (
    <header className="flex h-14 items-center border-b bg-sidebar px-4 shrink-0">
      {/* Logo */}
      <div className="flex items-center mr-6">
        <h1 className="text-lg font-bold text-sidebar-foreground">Raven SaaS</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex items-center gap-1">
        {navItems.map((item) =>
          item.type === 'dropdown' ? (
            <NavDropdown key={item.label} item={item} />
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              <span className="hidden lg:inline">{item.label}</span>
            </NavLink>
          )
        )}
      </nav>

      {/* Right side - Settings and Logout */}
      <div className="flex items-center gap-1">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )
          }
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Settings</span>
        </NavLink>

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  )
}
