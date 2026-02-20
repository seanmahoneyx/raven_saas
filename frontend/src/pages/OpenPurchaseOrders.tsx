import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Calendar, ChevronDown, ChevronRight, Package } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePurchaseOrders } from '@/api/orders'
import type { PurchaseOrder, OrderStatus } from '@/types/api'
import { format } from 'date-fns'

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    confirmed: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    scheduled: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    picking:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    shipped:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    complete:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    crossdock: { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    cancelled: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    received:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  }
  const c = configs[status] || configs.draft
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status}
    </span>
  )
}

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

const openStatuses: OrderStatus[] = ['draft', 'confirmed', 'scheduled', 'picking', 'shipped', 'crossdock']

export default function OpenPurchaseOrders() {
  usePageTitle('Purchase Orders')
  const navigate = useNavigate()

  const { data: ordersData } = usePurchaseOrders()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedVendor, setSelectedVendor] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null)

  // Filter to open orders only
  const openOrders = useMemo(() => {
    const orders = ordersData?.results || []
    return orders.filter(order =>
      order.status !== 'complete' && order.status !== 'cancelled'
    )
  }, [ordersData])

  // Apply filters
  const filteredOrders = useMemo(() => {
    return openOrders.filter(order => {
      if (searchTerm && !order.po_number.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (selectedVendor !== 'all' && order.vendor_name !== selectedVendor) {
        return false
      }
      if (selectedStatus !== 'all' && order.status !== selectedStatus) {
        return false
      }
      if (dateFrom && order.order_date < dateFrom) {
        return false
      }
      if (dateTo && order.order_date > dateTo) {
        return false
      }
      return true
    })
  }, [openOrders, searchTerm, selectedVendor, selectedStatus, dateFrom, dateTo])

  // Group by vendor
  const groupedOrders = useMemo(() => {
    const groups: Record<string, PurchaseOrder[]> = {}

    filteredOrders.forEach(order => {
      if (!groups[order.vendor_name]) {
        groups[order.vendor_name] = []
      }
      groups[order.vendor_name].push(order)
    })

    Object.keys(groups).forEach(vendorName => {
      groups[vendorName].sort((a, b) =>
        new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
      )
    })

    const currentExpanded = { ...expandedGroups }
    let hasChanges = false
    Object.keys(groups).forEach(vendorName => {
      if (!(vendorName in currentExpanded)) {
        currentExpanded[vendorName] = false
        hasChanges = true
      }
    })
    if (hasChanges) {
      setExpandedGroups(currentExpanded)
    }

    return groups
  }, [filteredOrders, expandedGroups])

  // Get unique vendors from open orders
  const vendorOptions = useMemo(() => {
    const vendors = new Set(openOrders.map(order => order.vendor_name))
    return Array.from(vendors).sort()
  }, [openOrders])

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalOpen = filteredOrders.length
    const draftCount = filteredOrders.filter(o => o.status === 'draft').length
    const scheduledCount = filteredOrders.filter(o => o.status === 'scheduled').length
    const totalValue = filteredOrders.reduce((sum, order) => sum + parseFloat(order.subtotal), 0)
    return { totalOpen, draftCount, scheduledCount, totalValue }
  }, [filteredOrders])

  const toggleGroup = (vendorName: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [vendorName]: !prev[vendorName]
    }))
  }

  const summaryKPIs = [
    { label: 'Total Open POs', value: summaryStats.totalOpen },
    { label: 'Draft', value: summaryStats.draftCount },
    { label: 'Scheduled', value: summaryStats.scheduledCount },
    { label: 'Total Value', value: `$${summaryStats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ]

  const columns: ColumnDef<PurchaseOrder>[] = [
    {
      accessorKey: 'po_number',
      header: 'PO #',
      cell: ({ row }) => (
        <span className="font-mono font-medium">{row.original.po_number}</span>
      ),
    },
    {
      accessorKey: 'order_date',
      header: 'Order Date',
      cell: ({ row }) => format(new Date(row.original.order_date), 'MMM d, yyyy'),
    },
    {
      accessorKey: 'expected_date',
      header: 'Expected',
      cell: ({ row }) =>
        row.original.expected_date
          ? format(new Date(row.original.expected_date), 'MMM d, yyyy')
          : '-',
    },
    {
      accessorKey: 'scheduled_date',
      header: 'Scheduled',
      cell: ({ row }) =>
        row.original.scheduled_date ? (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" style={{ color: 'var(--so-text-tertiary)' }} />
            {format(new Date(row.original.scheduled_date), 'MMM d')}
          </span>
        ) : (
          <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
        ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => getStatusBadge(row.original.status),
    },
    {
      accessorKey: 'num_lines',
      header: 'Lines',
      cell: ({ row }) => (
        <span style={{ color: 'var(--so-text-secondary)' }}>{row.original.num_lines}</span>
      ),
    },
    {
      accessorKey: 'subtotal',
      header: 'Total',
      cell: ({ row }) => (
        <span className="font-medium">
          ${parseFloat(row.original.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
      sortingFn: (rowA, rowB) => parseFloat(rowA.original.subtotal) - parseFloat(rowB.original.subtotal),
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => {
        const priority = row.original.priority
        return (
          <span style={{ color: priority <= 3 ? 'var(--so-danger-text)' : undefined, fontWeight: priority <= 3 ? 500 : undefined }}>
            {priority}
          </span>
        )
      },
    },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Purchase Orders</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>View all open purchase orders grouped by vendor</p>
          </div>
          <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => navigate('/orders/purchase/new')}>
            <Package className="h-3.5 w-3.5" /> Create Purchase Order
          </button>
        </div>

        {/* KPI Summary */}
        <div className="rounded-[14px] border overflow-hidden mb-5 animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="grid grid-cols-4">
            {summaryKPIs.map((kpi, idx) => (
              <div key={idx} className="px-5 py-4" style={{ borderRight: idx < 3 ? '1px solid var(--so-border-light)' : 'none' }}>
                <div className="text-[11px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>{kpi.label}</div>
                <div className="text-xl font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-[14px] border overflow-hidden mb-5 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Filters</span>
          </div>
          <div className="px-6 py-5">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Search PO #</label>
                <Input
                  placeholder="Search PO number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Vendor</label>
                <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All vendors</SelectItem>
                    {vendorOptions.map(vendor => (
                      <SelectItem key={vendor} value={vendor}>
                        {vendor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {openStatuses.map(status => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>From Date</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>To Date</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Grouped Orders */}
        <div className="space-y-4 animate-in delay-3">
          {Object.keys(groupedOrders).length === 0 ? (
            <div className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="py-12 text-center text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                No open purchase orders found matching the current filters.
              </div>
            </div>
          ) : (
            Object.entries(groupedOrders)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([vendorName, orders]) => {
                const vendorTotal = orders.reduce((sum, order) => sum + parseFloat(order.subtotal), 0)
                const isExpanded = expandedGroups[vendorName]
                const isHovered = hoveredGroup === vendorName

                return (
                  <div key={vendorName} className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
                    <div
                      className="px-6 py-4 cursor-pointer transition-colors"
                      style={{ background: isHovered ? 'var(--so-bg)' : 'var(--so-surface)', borderBottom: isExpanded ? '1px solid var(--so-border-light)' : 'none' }}
                      onClick={() => toggleGroup(vendorName)}
                      onMouseEnter={() => setHoveredGroup(vendorName)}
                      onMouseLeave={() => setHoveredGroup(null)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--so-text-tertiary)' }} />
                          : <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--so-text-tertiary)' }} />
                        }
                        <span className="text-lg font-semibold" style={{ color: 'var(--so-text-primary)' }}>{vendorName}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: 'var(--so-border-light)', color: 'var(--so-text-secondary)' }}>
                          {orders.length} {orders.length === 1 ? 'PO' : 'POs'}
                        </span>
                        <span className="text-sm font-medium ml-1" style={{ color: 'var(--so-text-secondary)' }}>
                          ${vendorTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-6 py-4">
                        <DataTable
                          columns={columns}
                          data={orders}
                          storageKey="open-purchase-orders"
                          onRowClick={(order) => navigate(`/orders/purchase/${order.id}`)}
                        />
                      </div>
                    )}
                  </div>
                )
              })
          )}
        </div>

      </div>
    </div>
  )
}
