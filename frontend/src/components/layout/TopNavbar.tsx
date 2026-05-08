import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
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
  PackageCheck,
  DollarSign,
  Boxes,
  ScrollText,
  ShoppingCart,
  Palette,
  Search,
  Cog,
  Keyboard,
  ScanLine,
  Warehouse,
  Tags,
  ClipboardList,
  GitBranchPlus,
  Ruler,
  Mail,
  MapPin,
  Navigation,
  PenLine,
  ContactRound,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import SearchDialog from '@/components/search/SearchDialog'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import KeyboardShortcutsModal from '@/components/KeyboardShortcutsModal'
import { useNotifications } from '@/api/notifications'
import { useMyPendingApprovals } from '@/api/approvals'
import { useUnreadMessageCount } from '@/api/collaboration'
import { useNotificationSync } from '@/hooks/useRealtimeSync'

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
  requiresAdmin?: boolean
}

interface NavMenuAction {
  type: 'action'
  icon: React.ElementType
  label: string
  shortcut?: string
  onClick: () => void
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
  items: Array<NavMenuItem | NavMenuAction | NavMenuSeparator | NavSubMenu>
}

type NavItem = NavLinkItem | NavDropdownItem

// ─── Nav Dropdown Component ────────────────────────────────────────────────────

function NavDropdown({ item, isAdmin }: { item: NavDropdownItem; isAdmin: boolean }) {
  const visibleItems = item.items.filter((subItem) => {
    if (subItem.type === 'item' && subItem.requiresAdmin && !isAdmin) return false
    return true
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
            'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            'data-[state=open]:outline data-[state=open]:outline-2 data-[state=open]:outline-offset-2',
            'data-[state=open]:outline-[hsl(245_58%_51%)]',
            'dark:data-[state=open]:outline-[hsl(187_100%_50%)] dark:data-[state=open]:shadow-[0_0_8px_hsl(187_100%_50%/0.2)]'
          )}
        >
          <item.icon className="h-4 w-4" />
          <span className="hidden lg:inline">{item.label}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {visibleItems.map((subItem, idx) => {
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
                        <DropdownMenuItem key={nestedItem.label} asChild>
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
          if (subItem.type === 'action') {
            return (
              <DropdownMenuItem key={subItem.label} onSelect={() => subItem.onClick()} className="flex items-center gap-2 cursor-pointer">
                <subItem.icon className="h-4 w-4" />
                <span className="flex-1">{subItem.label}</span>
                {subItem.shortcut && (
                  <span className="text-[11px] text-muted-foreground">{subItem.shortcut}</span>
                )}
              </DropdownMenuItem>
            )
          }
          return (
            <DropdownMenuItem key={subItem.label} asChild>
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
  const { logout, user } = useAuth()
  const isAdmin = user?.is_superuser || user?.roles?.includes('admin') || false
  const { resolvedTheme, setTheme } = useTheme()

  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const navigationStructure: NavItem[] = [
    // 1. Company
    {
      type: 'dropdown',
      icon: Building2,
      label: 'Company',
      requiresAdmin: true,
      items: [
        { type: 'action', icon: Search, label: 'Search', shortcut: 'Ctrl+K', onClick: () => setSearchOpen(true) },
        { type: 'separator' },
        { type: 'item', to: '/settings', icon: Building2, label: 'My Company' },
        { type: 'item', to: '/users', icon: Users, label: 'Users' },
        { type: 'item', to: '/admin', icon: Cog, label: 'Settings' },
        { type: 'item', to: '/uom', icon: Ruler, label: 'Units of Measure', requiresAdmin: true },
        { type: 'separator' },
        { type: 'item', to: '/admin/user-audit', icon: FileText, label: 'Audit Reports', requiresAdmin: true },
        { type: 'separator' },
        {
          type: 'action',
          icon: resolvedTheme === 'dark' ? Sun : Moon,
          label: resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode',
          onClick: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
        },
        { type: 'action', icon: Keyboard, label: 'Keyboard shortcuts', shortcut: '?', onClick: () => setShortcutsOpen(true) },
      ],
    },
    // 2. Customers
    {
      type: 'dropdown',
      icon: Users,
      label: 'Customers',
      items: [
        { type: 'item', to: '/customers', icon: Users, label: 'Customer Center' },
        { type: 'separator' },
        { type: 'item', to: '/estimates', icon: FileText, label: 'Estimates' },
        { type: 'item', to: '/contracts', icon: ScrollText, label: 'Contracts' },
        { type: 'separator' },
        { type: 'item', to: '/customers/open-orders', icon: ShoppingCart, label: 'Sales Orders' },
        { type: 'separator' },
        { type: 'item', to: '/price-lists', icon: DollarSign, label: 'Price Lists' },
      ],
    },
    // 3. Vendors
    {
      type: 'dropdown',
      icon: Truck,
      label: 'Vendors',
      items: [
        { type: 'item', to: '/vendors', icon: Building2, label: 'Vendor Center' },
        { type: 'separator' },
        { type: 'item', to: '/rfqs', icon: FileText, label: 'RFQs' },
        { type: 'separator' },
        { type: 'item', to: '/vendors/open-orders', icon: PackageCheck, label: 'Purchase Orders' },
        { type: 'separator' },
        { type: 'item', to: '/cost-lists', icon: DollarSign, label: 'Cost Lists' },
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
        { type: 'item', to: '/items/request', icon: Plus, label: 'New Item Request' },
        { type: 'item', to: '/items/workbench', icon: ClipboardList, label: 'Item Setup' },
        { type: 'separator' },
        { type: 'item', to: '/inventory', icon: Boxes, label: 'Inventory' },
      ],
    },
    // 5. Warehouse
    {
      type: 'dropdown',
      icon: Warehouse,
      label: 'Warehouse',
      items: [
        { type: 'item', to: '/shipping', icon: Truck, label: 'Shipping' },
        { type: 'item', to: '/warehouse/scanner', icon: ScanLine, label: 'Scanner' },
        { type: 'item', to: '/warehouse/cycle-counts', icon: ClipboardList, label: 'Cycle Counts' },
        { type: 'item', to: '/warehouse/print-labels', icon: Tags, label: 'Print Labels' },
        { type: 'separator' },
        { type: 'item', to: '/warehouse/locations', icon: MapPin, label: 'Locations & Lots' },
        { type: 'item', to: '/logistics', icon: Navigation, label: 'Logistics' },
        { type: 'item', to: '/logistics/manifest', icon: Truck, label: 'Driver Manifest' },
        { type: 'item', to: '/trucks', icon: Truck, label: 'Trucks' },
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
        { type: 'item', to: '/invoices', icon: FileText, label: 'Invoices' },
        { type: 'item', to: '/receive-payment', icon: DollarSign, label: 'Receive Payments' },
        { type: 'separator' },
        { type: 'item', to: '/checks', icon: PenLine, label: 'Write Checks' },
        { type: 'item', to: '/other-names', icon: ContactRound, label: 'Other Names' },
      ],
    },
    // 7. Reports
    {
      type: 'dropdown',
      icon: BarChart3,
      label: 'Reports',
      items: [
        { type: 'item', to: '/reports', icon: BarChart3, label: 'All Reports' },
        { type: 'item', to: '/reports/item-quick-report', icon: Package, label: 'Item Quick Report' },
        { type: 'separator' },
        {
          type: 'submenu',
          icon: Boxes,
          label: 'Inventory',
          items: [
            { type: 'item', to: '/reports/stock-status', icon: Package, label: 'Stock Status by Item' },
            { type: 'item', to: '/reports/inventory-valuation', icon: DollarSign, label: 'Inventory Valuation' },
          ],
        },
      ],
    },
    // 8. Tools
    {
      type: 'dropdown',
      icon: Wrench,
      label: 'Tools',
      items: [
        { type: 'item', to: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { type: 'separator' },
        { type: 'item', to: '/pipeline', icon: GitBranchPlus, label: 'Pipeline' },
        { type: 'item', to: '/scheduler', icon: Calendar, label: 'Schedulizer' },
        { type: 'item', to: '/priority-list', icon: Scale, label: 'Priority Lists' },
        { type: 'item', to: '/product-cards', icon: DollarSign, label: 'Product Cards' },
        { type: 'item', to: '/fixed-assets', icon: Building2, label: 'Fixed Asset Tracker' },
      ],
    },
    // 9. Design
    {
      type: 'dropdown',
      icon: Palette,
      label: 'Design',
      items: [
        { type: 'item', to: '/design-requests', icon: FileText, label: 'Design Requests' },
        { type: 'item', to: '/design-workbench', icon: Palette, label: 'Design Workbench' },
      ],
    },
  ]

  // Inbox badge: notifications + approvals + DMs
  const { data: notifData } = useNotifications()
  const { data: pendingApprovals } = useMyPendingApprovals()
  const { data: dmUnread } = useUnreadMessageCount()
  useNotificationSync()
  const inboxBadge = (notifData?.unread_count ?? 0) + (pendingApprovals?.length ?? 0) + (dmUnread?.unread_count ?? 0)

  useKeyboardShortcuts([
    {
      key: 'k',
      ctrl: true,
      description: 'Open Global Search',
      category: 'Navigation',
      action: () => setSearchOpen(true),
    },
    {
      key: 'n',
      ctrl: true,
      description: 'Create New',
      category: 'Actions',
      action: () => {
        const path = location.pathname
        if (path.startsWith('/customers')) navigate('/customers/new')
        else if (path.startsWith('/vendors')) navigate('/vendors/new')
        else if (path.startsWith('/items')) navigate('/items/new')
        else if (path.startsWith('/orders') || path.includes('sales')) navigate('/orders/sales/new')
        else if (path.startsWith('/estimates')) navigate('/estimates/new')
        else if (path.startsWith('/contracts')) navigate('/contracts/new')
        else if (path.startsWith('/rfqs')) navigate('/rfqs/new')
        else navigate('/orders/sales/new')
      },
    },
    {
      key: 's',
      ctrl: true,
      description: 'Save current form',
      category: 'Actions',
      action: () => {
        const saveBtn = document.querySelector('[data-save-button]') as HTMLButtonElement
        if (saveBtn) saveBtn.click()
      },
    },
    {
      key: 'ArrowLeft',
      alt: true,
      description: 'Go back',
      category: 'Navigation',
      action: () => navigate(-1),
    },
    {
      key: 'ArrowRight',
      alt: true,
      description: 'Go forward',
      category: 'Navigation',
      action: () => navigate(1),
    },
    {
      key: '/',
      shift: true,
      description: 'Show keyboard shortcuts',
      category: 'Help',
      action: () => setShortcutsOpen(true),
    },
  ])

  return (
    <header className="flex h-14 items-center border-b bg-sidebar px-4 shrink-0">
      {/* Logo */}
      <NavLink to="/" className="flex items-center gap-2 mr-6 shrink-0">
        <img src="/logo.png" alt="Raven Tech" className="h-8 w-8 object-contain shrink-0" />
        <span className="text-lg font-bold text-sidebar-foreground hidden md:inline">Raven Tech</span>
      </NavLink>

      {/* Navigation */}
      <nav className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0 scrollbar-hide">
        {navigationStructure.map((item) => {
          // Skip admin-only items if not admin
          if (item.type === 'dropdown' && item.requiresAdmin && !isAdmin) {
            return null
          }

          if (item.type === 'dropdown') {
            return <NavDropdown key={item.label} item={item} isAdmin={isAdmin} />
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
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

      {/* Right side - Inbox and Logout */}
      <div className="flex items-center gap-1">
        <NavLink
          to="/notifications"
          className={({ isActive }) =>
            cn(
              'relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )
          }
          title="Inbox"
        >
          <Mail className="h-4 w-4" />
          <span className="hidden lg:inline">Inbox</span>
          {inboxBadge > 0 && (
            <span className="flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold text-white" style={{ background: '#f97316' }}>
              {inboxBadge > 99 ? '99+' : inboxBadge}
            </span>
          )}
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

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <KeyboardShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </header>
  )
}
