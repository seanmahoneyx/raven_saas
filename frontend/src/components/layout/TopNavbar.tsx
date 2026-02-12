import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Building2,
  Users,
  LayoutDashboard,
  BookUser,
  FileSpreadsheet,
  Package,
  Truck,
  FileText,
  BarChart3,
  Calendar,
  LogOut,
  ChevronDown,
  Plus,
  Scale,
  Sun,
  Moon,
  ClipboardList,
  Receipt,
  Eye,
  DollarSign,
  Boxes,
  ScrollText,
  Palette,
  Search,
  Cog,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import SearchDialog from '@/components/search/SearchDialog'

// ─── Navigation Structure ──────────────────────────────────────────────────────

interface NavItemBase {
  icon: React.ElementType
  label: string
}

interface NavLinkItem extends NavItemBase {
  type: 'link'
  to: string
}

interface NavMenuItem {
  type: 'item'
  to: string
  icon: React.ElementType
  label: string
}

interface NavMenuSeparator {
  type: 'separator'
}

interface NavSubMenu {
  type: 'submenu'
  icon: React.ElementType
  label: string
  items: Array<NavMenuItem | NavMenuSeparator>
}

interface NavDropdownItem extends NavItemBase {
  type: 'dropdown'
  requiresAdmin?: boolean
  items: Array<NavMenuItem | NavMenuSeparator | NavSubMenu>
}

type NavItem = NavLinkItem | NavDropdownItem

const NAVIGATION_STRUCTURE: NavItem[] = [
  // 1. Company (Admin only - placeholder, will show for all until auth has isAdmin)
  {
    type: 'dropdown',
    icon: Building2,
    label: 'Company',
    requiresAdmin: true,
    items: [
      { type: 'item', to: '/company', icon: Building2, label: 'My Company' },
      { type: 'item', to: '/users', icon: Users, label: 'Users' },
      { type: 'item', to: '/', icon: LayoutDashboard, label: 'Company Snapshot' },
      { type: 'separator' },
      { type: 'item', to: '/settings', icon: Cog, label: 'Settings' },
    ],
  },
  // 2. Customers
  {
    type: 'dropdown',
    icon: Users,
    label: 'Customers',
    items: [
      { type: 'item', to: '/customers', icon: Users, label: 'Customer Center' },
      { type: 'item', to: '/customers/open-orders', icon: Eye, label: 'Sales Orders' },
      { type: 'item', to: '/estimates', icon: FileText, label: 'Estimates' },
      { type: 'item', to: '/contracts', icon: ScrollText, label: 'Contracts' },
      { type: 'item', to: '/price-lists', icon: DollarSign, label: 'Price Lists' },
      { type: 'separator' },
      { type: 'item', to: '/customers/new', icon: Plus, label: 'Create Customer' },
      { type: 'item', to: '/estimates/new', icon: Plus, label: 'Create Estimate' },
      { type: 'item', to: '/contracts/new', icon: Plus, label: 'Create Contract' },
      { type: 'item', to: '/orders/sales/new', icon: Plus, label: 'Create Sales Order' },
      { type: 'item', to: '/price-lists/new', icon: Plus, label: 'Create Price List' },
    ],
  },
  // 3. Vendors
  {
    type: 'dropdown',
    icon: Truck,
    label: 'Vendors',
    items: [
      { type: 'item', to: '/vendors', icon: Building2, label: 'Vendor Center' },
      { type: 'item', to: '/vendors/open-orders', icon: Eye, label: 'Purchase Orders' },
      { type: 'item', to: '/rfqs', icon: FileText, label: 'RFQs' },
      { type: 'separator' },
      { type: 'item', to: '/vendors/new', icon: Plus, label: 'Create Vendor' },
      { type: 'item', to: '/rfqs/new', icon: Plus, label: 'Create RFQ' },
      { type: 'item', to: '/orders/purchase/new', icon: Plus, label: 'Create Purchase Order' },
      { type: 'item', to: '/price-lists/new', icon: Plus, label: 'Create Cost List' },
      { type: 'separator' },
      { type: 'item', to: '/priority-list', icon: Scale, label: 'Priority Lists' },
    ],
  },
  // 4. Items
  {
    type: 'dropdown',
    icon: Package,
    label: 'Items',
    items: [
      { type: 'item', to: '/items', icon: Package, label: 'Item Center' },
      { type: 'separator' },
      { type: 'item', to: '/items/new', icon: Plus, label: 'Create Item' },
      { type: 'separator' },
      { type: 'item', to: '/contracts', icon: Eye, label: 'View Active Contracts' },
      { type: 'item', to: '/orders?tab=sales', icon: Eye, label: 'View Active Sales Orders' },
      { type: 'item', to: '/orders?tab=purchase', icon: Eye, label: 'View Active Purchase Orders' },
    ],
  },
  // 5. Design
  {
    type: 'dropdown',
    icon: Palette,
    label: 'Design',
    items: [
      { type: 'item', to: '/design-requests', icon: Palette, label: 'Design Center' },
      { type: 'separator' },
      { type: 'item', to: '/design-requests/new', icon: Plus, label: 'Create New Design' },
    ],
  },
  // 6. Accounting
  {
    type: 'dropdown',
    icon: DollarSign,
    label: 'Accounting',
    items: [
      { type: 'item', to: '/chart-of-accounts', icon: BookUser, label: 'Chart of Accounts' },
      { type: 'item', to: '/journal-entries', icon: FileSpreadsheet, label: 'Journal Entries' },
      { type: 'separator' },
      { type: 'item', to: '/journal-entries/new', icon: Plus, label: 'Make Journal Entry' },
    ],
  },
  // 7. Reports (with nested submenus)
  {
    type: 'dropdown',
    icon: BarChart3,
    label: 'Reports',
    items: [
      { type: 'item', to: '/reports/item-quick-report', icon: Package, label: 'Item Quick Report' },
      { type: 'separator' },
      {
        type: 'submenu',
        icon: Building2,
        label: 'Company & Financial',
        items: [
          { type: 'item', to: '/reports/pl', icon: DollarSign, label: 'P&L' },
          { type: 'item', to: '/reports/balance-sheet', icon: FileSpreadsheet, label: 'Balance Sheet' },
        ],
      },
      {
        type: 'submenu',
        icon: Users,
        label: 'Customer',
        items: [
          { type: 'item', to: '/reports/open-invoices', icon: Receipt, label: 'Open Invoices' },
          { type: 'item', to: '/reports/ar-aging', icon: ScrollText, label: 'A/R Aging' },
        ],
      },
      {
        type: 'submenu',
        icon: Truck,
        label: 'Vendor',
        items: [
          { type: 'item', to: '/reports/open-receipts', icon: ClipboardList, label: 'Open Item Receipts' },
          { type: 'item', to: '/reports/unpaid-bills', icon: FileText, label: 'Unpaid Bills' },
          { type: 'item', to: '/reports/ap-aging', icon: ScrollText, label: 'A/P Aging' },
        ],
      },
      {
        type: 'submenu',
        icon: Boxes,
        label: 'Inventory (FIFO)',
        items: [
          { type: 'item', to: '/reports/inventory-aging-summary', icon: BarChart3, label: 'Inventory Aging Summary' },
          { type: 'item', to: '/reports/inventory-aging-detail', icon: FileText, label: 'Inventory Aging Detail' },
          { type: 'item', to: '/reports/stock-status', icon: Package, label: 'Stock Status by Item' },
          { type: 'item', to: '/reports/inventory-valuation', icon: DollarSign, label: 'Inventory Valuation' },
        ],
      },
    ],
  },
  // 6. Schedulizer (direct link)
  {
    type: 'link',
    icon: Calendar,
    label: 'Schedulizer',
    to: '/scheduler',
  },
]

// ─── Theme Toggle ──────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  )
}

// ─── Nav Dropdown Component ────────────────────────────────────────────────────

function NavDropdown({ item }: { item: NavDropdownItem }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
            'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
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
        {item.items.map((subItem, idx) => {
          if (subItem.type === 'separator') {
            return <DropdownMenuSeparator key={idx} />
          }
          if (subItem.type === 'submenu') {
            return (
              <DropdownMenuSub key={subItem.label}>
                <DropdownMenuSubTrigger>
                  <subItem.icon className="mr-2 h-4 w-4" />
                  {subItem.label}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    {subItem.items.map((nestedItem, nestedIdx) => {
                      if (nestedItem.type === 'separator') {
                        return <DropdownMenuSeparator key={nestedIdx} />
                      }
                      return (
                        <DropdownMenuItem key={nestedItem.to} asChild>
                          <NavLink to={nestedItem.to} className="flex items-center gap-2 cursor-pointer">
                            <nestedItem.icon className="h-4 w-4" />
                            {nestedItem.label}
                          </NavLink>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )
          }
          return (
            <DropdownMenuItem key={subItem.to} asChild>
              <NavLink to={subItem.to} className="flex items-center gap-2 cursor-pointer">
                <subItem.icon className="h-4 w-4" />
                {subItem.label}
              </NavLink>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Main TopNavbar ────────────────────────────────────────────────────────────

export default function TopNavbar() {
  const { logout } = useAuth()
  // TODO: Connect to real user.isAdmin when available
  const isAdmin = true

  const [searchOpen, setSearchOpen] = useState(false)

  // Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <header className="flex h-14 items-center border-b bg-sidebar px-4 shrink-0">
      {/* Logo */}
      <NavLink to="/" className="flex items-center gap-2 mr-6">
        <img src="/logo.png" alt="Raven Tech" className="h-8 w-8 object-contain" />
        <span className="text-lg font-bold text-sidebar-foreground hidden sm:inline">Raven Tech</span>
      </NavLink>

      {/* Navigation */}
      <nav className="flex-1 flex items-center gap-1">
        {NAVIGATION_STRUCTURE.map((item) => {
          // Skip admin-only items if not admin
          if (item.type === 'dropdown' && item.requiresAdmin && !isAdmin) {
            return null
          }

          if (item.type === 'dropdown') {
            return <NavDropdown key={item.label} item={item} />
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
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
        })}
      </nav>

      {/* Right side - Search, Theme Toggle, and Logout */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => setSearchOpen(true)}
          title="Search (Ctrl+K)"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline text-xs text-muted-foreground">Ctrl+K</span>
        </Button>

        <ThemeToggle />

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

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  )
}
