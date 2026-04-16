import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  Truck,
  FileText,
  ScrollText,
  DollarSign,
  BookUser,
  FileSpreadsheet,
  ScanLine,
  ClipboardList,
  Tags,
  BarChart3,
  Calendar,
  Palette,
  GitBranchPlus,
  CheckSquare,
  Cog,
  Shield,
  LogOut,
  Search,
  X,
  Sun,
  Moon,
  Mail,
  Scale,
  MapPin,
  Navigation,
  PenLine,
  ContactRound,
  Boxes,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/components/theme-provider'
import { useNotifications } from '@/api/notifications'
import { useMyPendingApprovals } from '@/api/approvals'
import { useUnreadMessageCount } from '@/api/collaboration'

interface DrawerNavItem {
  icon: React.ElementType
  label: string
  to: string
}

interface DrawerSection {
  items: DrawerNavItem[]
}

const DRAWER_SECTIONS: DrawerSection[] = [
  {
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', to: '/' },
    ],
  },
  {
    items: [
      { icon: Users, label: 'Customers', to: '/customers' },
      { icon: Truck, label: 'Vendors', to: '/vendors' },
      { icon: Package, label: 'Items', to: '/items' },
      { icon: Boxes, label: 'Inventory', to: '/inventory' },
    ],
  },
  {
    items: [
      { icon: Package, label: 'Sales Orders', to: '/orders/sales' },
      { icon: Truck, label: 'Purchase Orders', to: '/vendors/open-orders' },
      { icon: FileText, label: 'Estimates', to: '/estimates' },
      { icon: ScrollText, label: 'Contracts', to: '/contracts' },
    ],
  },
  {
    items: [
      { icon: FileText, label: 'Invoices', to: '/invoices' },
      { icon: DollarSign, label: 'Receive Payment', to: '/receive-payment' },
      { icon: PenLine, label: 'Write Checks', to: '/checks' },
      { icon: ContactRound, label: 'Other Names', to: '/other-names' },
      { icon: BookUser, label: 'Chart of Accounts', to: '/chart-of-accounts' },
      { icon: FileSpreadsheet, label: 'Journal Entries', to: '/journal-entries' },
    ],
  },
  {
    items: [
      { icon: Truck, label: 'Shipping', to: '/shipping' },
      { icon: ScanLine, label: 'Scanner', to: '/warehouse/scanner' },
      { icon: ClipboardList, label: 'Cycle Counts', to: '/warehouse/cycle-counts' },
      { icon: Tags, label: 'Print Labels', to: '/warehouse/print-labels' },
      { icon: MapPin, label: 'Locations & Lots', to: '/warehouse/locations' },
      { icon: Navigation, label: 'Logistics', to: '/logistics' },
      { icon: Truck, label: 'Driver Manifest', to: '/logistics/manifest' },
    ],
  },
  {
    items: [
      { icon: BarChart3, label: 'Reports', to: '/reports' },
      { icon: Calendar, label: 'Scheduler', to: '/scheduler' },
      { icon: Palette, label: 'Design Requests', to: '/design-requests' },
      { icon: FileText, label: 'RFQs', to: '/rfqs' },
      { icon: Scale, label: 'Price Lists', to: '/price-lists' },
    ],
  },
  {
    items: [
      { icon: GitBranchPlus, label: 'Pipeline', to: '/pipeline' },
      { icon: CheckSquare, label: 'Approvals', to: '/approvals' },
    ],
  },
  {
    items: [
      { icon: Cog, label: 'Settings', to: '/settings' },
      { icon: Shield, label: 'Admin', to: '/admin' },
    ],
  },
]

interface MobileNavDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileNavDrawer({ open, onOpenChange }: MobileNavDrawerProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const [search, setSearch] = useState('')

  const { data: notifData } = useNotifications()
  const { data: pendingApprovals } = useMyPendingApprovals()
  const { data: dmUnread } = useUnreadMessageCount()
  const inboxBadge =
    (notifData?.unread_count ?? 0) +
    (pendingApprovals?.length ?? 0) +
    (dmUnread?.unread_count ?? 0)

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/'
    return location.pathname.startsWith(to)
  }

  function handleNav(to: string) {
    navigate(to)
    onOpenChange(false)
    setSearch('')
  }

  // Filter items by search
  const lowerSearch = search.toLowerCase()
  const filteredSections = lowerSearch
    ? DRAWER_SECTIONS.map((section) => ({
        items: section.items.filter((item) =>
          item.label.toLowerCase().includes(lowerSearch)
        ),
      })).filter((section) => section.items.length > 0)
    : DRAWER_SECTIONS

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Overlay */}
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        />

        {/* Drawer panel */}
        <Dialog.Content
          className="fixed top-0 left-0 bottom-0 z-50 flex flex-col focus:outline-none"
          style={{
            width: 'min(80vw, 320px)',
            background: 'var(--so-surface)',
            borderRight: '1px solid var(--so-border)',
          }}
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>

          {/* Header */}
          <div
            className="flex items-center justify-between px-4 shrink-0"
            style={{
              height: '56px',
              borderBottom: '1px solid var(--so-border)',
            }}
          >
            <span className="text-base font-semibold" style={{ color: 'var(--so-text-primary)' }}>
              Raven
            </span>
            <Dialog.Close
              className="flex items-center justify-center rounded-md"
              style={{ minWidth: '44px', minHeight: '44px', color: 'var(--so-text-secondary)' }}
              aria-label="Close menu"
            >
              <X size={20} />
            </Dialog.Close>
          </div>

          {/* Search */}
          <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <div
              className="flex items-center gap-2 rounded-lg px-3"
              style={{
                background: 'var(--so-bg)',
                border: '1px solid var(--so-border)',
                height: '40px',
              }}
            >
              <Search size={16} style={{ color: 'var(--so-text-tertiary)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm focus:outline-none"
                style={{ color: 'var(--so-text-primary)' }}
              />
            </div>
          </div>

          {/* Nav items — scrollable */}
          <nav className="flex-1 overflow-y-auto py-2">
            {filteredSections.map((section, sIdx) => (
              <div key={sIdx}>
                {sIdx > 0 && (
                  <div
                    className="mx-4 my-1"
                    style={{ height: '1px', background: 'var(--so-border-light)' }}
                  />
                )}
                {section.items.map((item) => {
                  const active = isActive(item.to)
                  const isInbox = item.to === '/notifications'
                  return (
                    <button
                      key={item.to}
                      className="flex items-center gap-3 w-full px-4 rounded-none transition-colors"
                      style={{
                        minHeight: '48px',
                        color: active ? 'var(--so-accent)' : 'var(--so-text-primary)',
                        background: active ? 'var(--so-accent-light)' : 'transparent',
                        fontWeight: active ? 600 : 400,
                        fontSize: '14px',
                      }}
                      onMouseEnter={e => {
                        if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--so-bg)'
                      }}
                      onMouseLeave={e => {
                        if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                      }}
                      onClick={() => handleNav(item.to)}
                    >
                      <item.icon size={18} style={{ flexShrink: 0 }} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {isInbox && inboxBadge > 0 && (
                        <span
                          className="flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1.5"
                          style={{ background: '#f97316', minWidth: '18px', height: '18px' }}
                        >
                          {inboxBadge > 99 ? '99+' : inboxBadge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}

            {/* Notifications shortcut */}
            {!lowerSearch && (
              <>
                <div
                  className="mx-4 my-1"
                  style={{ height: '1px', background: 'var(--so-border-light)' }}
                />
                <button
                  className="flex items-center gap-3 w-full px-4 transition-colors"
                  style={{
                    minHeight: '48px',
                    color: isActive('/notifications') ? 'var(--so-accent)' : 'var(--so-text-primary)',
                    background: isActive('/notifications') ? 'var(--so-accent-light)' : 'transparent',
                    fontWeight: isActive('/notifications') ? 600 : 400,
                    fontSize: '14px',
                  }}
                  onMouseEnter={e => {
                    if (!isActive('/notifications')) (e.currentTarget as HTMLButtonElement).style.background = 'var(--so-bg)'
                  }}
                  onMouseLeave={e => {
                    if (!isActive('/notifications')) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }}
                  onClick={() => handleNav('/notifications')}
                >
                  <Mail size={18} style={{ flexShrink: 0 }} />
                  <span className="flex-1 text-left">Inbox</span>
                  {inboxBadge > 0 && (
                    <span
                      className="flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1.5"
                      style={{ background: '#f97316', minWidth: '18px', height: '18px' }}
                    >
                      {inboxBadge > 99 ? '99+' : inboxBadge}
                    </span>
                  )}
                </button>
              </>
            )}
          </nav>

          {/* Footer: theme toggle + logout */}
          <div
            className="shrink-0 flex items-center gap-2 px-4 py-3"
            style={{ borderTop: '1px solid var(--so-border)' }}
          >
            <button
              className="flex items-center justify-center rounded-md flex-1 gap-2 text-sm font-medium transition-colors"
              style={{
                minHeight: '44px',
                color: 'var(--so-text-secondary)',
                background: 'var(--so-bg)',
                border: '1px solid var(--so-border)',
              }}
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            >
              {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span>{resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>

            <button
              className="flex items-center justify-center rounded-md flex-1 gap-2 text-sm font-medium transition-colors"
              style={{
                minHeight: '44px',
                color: 'var(--so-danger-text)',
                background: 'var(--so-danger-bg)',
                border: '1px solid var(--so-border)',
              }}
              onClick={() => { logout(); onOpenChange(false) }}
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
