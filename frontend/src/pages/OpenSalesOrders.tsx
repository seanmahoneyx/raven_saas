import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronRight, Plus, Printer, Download } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSalesOrders } from '@/api/orders'
import { useSettings } from '@/api/settings'
import type { SalesOrder, OrderStatus } from '@/types/api'
import { format } from 'date-fns'
import { ReportFilterModal, type ReportFilterConfig, type ReportFilterResult } from '@/components/common/ReportFilterModal'

import { getStatusBadge } from '@/components/ui/StatusBadge'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { PageHeader, KpiGrid, KpiCard } from '@/components/page'

const openStatuses: OrderStatus[] = ['draft', 'confirmed', 'scheduled', 'picking', 'shipped', 'crossdock']

export default function OpenSalesOrders() {
  usePageTitle('Sales Orders')
  const navigate = useNavigate()

  const { data: ordersData } = useSalesOrders()
  const { data: settingsData } = useSettings()
  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [exportFilterOpen, setExportFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
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
      if (searchTerm && !order.order_number.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (selectedCustomer !== 'all' && order.customer_name !== selectedCustomer) {
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
  }, [openOrders, searchTerm, selectedCustomer, selectedStatus, dateFrom, dateTo])

  // Group by customer
  const groupedOrders = useMemo(() => {
    const groups: Record<string, SalesOrder[]> = {}

    filteredOrders.forEach(order => {
      if (!groups[order.customer_name]) {
        groups[order.customer_name] = []
      }
      groups[order.customer_name].push(order)
    })

    Object.keys(groups).forEach(customerName => {
      groups[customerName].sort((a, b) =>
        new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
      )
    })

    const currentExpanded = { ...expandedGroups }
    let hasChanges = false
    Object.keys(groups).forEach(customerName => {
      if (!(customerName in currentExpanded)) {
        currentExpanded[customerName] = false
        hasChanges = true
      }
    })
    if (hasChanges) {
      setExpandedGroups(currentExpanded)
    }

    return groups
  }, [filteredOrders, expandedGroups])

  // Get unique customers from open orders
  const customerOptions = useMemo(() => {
    const customers = new Set(openOrders.map(order => order.customer_name))
    return Array.from(customers).sort()
  }, [openOrders])

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalOpen = filteredOrders.length
    const draftCount = filteredOrders.filter(o => o.status === 'draft').length
    const scheduledCount = filteredOrders.filter(o => o.status === 'scheduled').length
    const totalValue = filteredOrders.reduce((sum, order) => sum + parseFloat(order.subtotal), 0)
    return { totalOpen, draftCount, scheduledCount, totalValue }
  }, [filteredOrders])

  const toggleGroup = (customerName: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [customerName]: !prev[customerName]
    }))
  }

  const summaryKPIs = [
    { label: 'Total Open Orders', value: summaryStats.totalOpen },
    { label: 'Draft', value: summaryStats.draftCount },
    { label: 'Scheduled', value: summaryStats.scheduledCount },
    { label: 'Total Value', value: `$${summaryStats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ]

  const columns: ColumnDef<SalesOrder>[] = [
    {
      accessorKey: 'order_number',
      header: 'Order #',
      cell: ({ row }) => (
        <div className="font-medium">{row.original.order_number}</div>
      ),
    },
    {
      accessorKey: 'order_date',
      header: 'Order Date',
      cell: ({ row }) => format(new Date(row.original.order_date), 'MMM d, yyyy'),
    },
    {
      accessorKey: 'scheduled_date',
      header: 'Scheduled',
      cell: ({ row }) =>
        row.original.scheduled_date
          ? format(new Date(row.original.scheduled_date), 'MMM d, yyyy')
          : '-',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => getStatusBadge(row.original.status),
    },
    {
      accessorKey: 'customer_po',
      header: 'Customer PO',
      cell: ({ row }) => row.original.customer_po || '-',
    },
    {
      accessorKey: 'num_lines',
      header: 'Lines',
      cell: ({ row }) => row.original.num_lines,
    },
    {
      accessorKey: 'subtotal',
      header: 'Total',
      cell: ({ row }) => `$${parseFloat(row.original.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sortingFn: (rowA, rowB) => parseFloat(rowA.original.subtotal) - parseFloat(rowB.original.subtotal),
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => row.original.priority,
    },
  ]

  const reportFilterConfig: ReportFilterConfig = {
    title: 'Open Sales Orders',
    columns: [
      { key: 'order_number', header: 'Order #' },
      { key: 'customer_name', header: 'Customer' },
      { key: 'order_date', header: 'Order Date' },
      { key: 'scheduled_date', header: 'Scheduled' },
      { key: 'status', header: 'Status' },
      { key: 'customer_po', header: 'Customer PO' },
      { key: 'num_lines', header: 'Lines' },
      { key: 'subtotal', header: 'Total' },
    ],
    rowFilters: [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'draft', label: 'Draft' },
          { value: 'confirmed', label: 'Confirmed' },
          { value: 'scheduled', label: 'Scheduled' },
          { value: 'picking', label: 'Picking' },
          { value: 'shipped', label: 'Shipped' },
          { value: 'crossdock', label: 'Crossdock' },
        ],
      },
    ],
  }

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setTimeout(() => window.print(), 100)
  }

  const handleFilteredExport = (filters: ReportFilterResult) => {
    let rows: SalesOrder[] = filteredOrders
    if (filters.rowFilters.status && filters.rowFilters.status !== 'all') {
      rows = rows.filter(r => r.status === filters.rowFilters.status)
    }
    if (rows.length === 0) return

    const allCols = reportFilterConfig.columns
    const cols = allCols.filter(c => filters.visibleColumns.includes(c.key))
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const csv = [cols.map(c => esc(c.header)).join(','), ...rows.map(r => cols.map(c => esc((r as unknown as Record<string, unknown>)[c.key])).join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `open-sales-orders-${new Date().toISOString().split('T')[0]}.csv`; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printFilteredData = useMemo(() => {
    let rows = filteredOrders
    if (printFilters) {
      if (printFilters.rowFilters.status && printFilters.rowFilters.status !== 'all') {
        rows = rows.filter(r => r.status === printFilters.rowFilters.status)
      }
    }
    return rows
  }, [filteredOrders, printFilters])

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16" data-print-hide>

        {/* Header */}
        <PageHeader
          title="Sales Orders"
          primary={{ label: 'Create Sales Order', icon: Plus, onClick: () => navigate('/orders/sales/new') }}
          actions={[
            { label: 'Export CSV', icon: Download, onClick: () => setExportFilterOpen(true) },
            { label: 'Print', icon: Printer, onClick: () => setPrintFilterOpen(true) },
          ]}
        />

        <div className="mb-5 animate-in delay-1">
          <KpiGrid columns={4}>
            {summaryKPIs.map((kpi, idx) => (
              <KpiCard key={idx} label={kpi.label} value={<span className="font-mono">{kpi.value}</span>} />
            ))}
          </KpiGrid>
        </div>

        {/* Filters */}
        <div className="mb-5 animate-in delay-2">
          <div className="py-3">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Search Order #</label>
                <Input
                  placeholder="Search order number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Customer</label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All customers</SelectItem>
                    {customerOptions.map(customer => (
                      <SelectItem key={customer} value={customer}>
                        {customer}
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
                        {status}
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
                No open sales orders found matching the current filters.
              </div>
            </div>
          ) : (
            Object.entries(groupedOrders).map(([customerName, orders]) => {
              const customerTotal = orders.reduce((sum, order) => sum + parseFloat(order.subtotal), 0)
              const isExpanded = expandedGroups[customerName]
              const isHovered = hoveredGroup === customerName

              return (
                <div key={customerName} className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
                  <div
                    className="px-6 py-4 cursor-pointer transition-colors"
                    style={{ background: isHovered ? 'var(--so-bg)' : 'var(--so-surface)', borderBottom: isExpanded ? '1px solid var(--so-border-light)' : 'none' }}
                    onClick={() => toggleGroup(customerName)}
                    onMouseEnter={() => setHoveredGroup(customerName)}
                    onMouseLeave={() => setHoveredGroup(null)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--so-text-tertiary)' }} />
                        : <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--so-text-tertiary)' }} />
                      }
                      <span className="text-lg font-semibold" style={{ color: 'var(--so-text-primary)' }}>{customerName}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: 'var(--so-border-light)', color: 'var(--so-text-secondary)' }}>
                        {orders.length} {orders.length === 1 ? 'order' : 'orders'}
                      </span>
                      <span className="text-sm font-medium ml-1" style={{ color: 'var(--so-text-secondary)' }}>
                        ${customerTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-6 py-4">
                      <DataTable
                        columns={columns}
                        data={orders}
                        storageKey="open-sales-orders"
                        onRowClick={(order) => navigate(`/orders/sales/${order.id}`)}
                      />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

      </div>

      {/* Print-only section */}
      <div className="print-only" style={{ color: 'black' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '16px', borderBottom: '3px solid #333' }}>
          <div>
            <div style={{ fontSize: '22pt', fontWeight: 700, letterSpacing: '-0.5px' }}>{settingsData?.company_name || 'Company'}</div>
            {settingsData?.company_address && <div style={{ fontSize: '9pt', color: '#555', whiteSpace: 'pre-line', marginTop: '4px' }}>{settingsData.company_address}</div>}
            {(settingsData?.company_phone || settingsData?.company_email) && (
              <div style={{ fontSize: '9pt', color: '#555', marginTop: '2px' }}>{[settingsData?.company_phone, settingsData?.company_email].filter(Boolean).join(' | ')}</div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>Open Sales Orders</div>
            <div style={{ fontSize: '10pt', color: '#555', marginTop: '4px' }}>{printFilters?.dateRangeLabel || ''}</div>
            <div style={{ fontSize: '9pt', color: '#555', marginTop: '4px', padding: '2px 10px', border: '1px solid #999', display: 'inline-block' }}>{printFilteredData.length} orders</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr>
              {[
                { key: 'order_number', label: 'Order #' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'order_date', label: 'Order Date' },
                { key: 'scheduled_date', label: 'Scheduled' },
                { key: 'status', label: 'Status' },
                { key: 'customer_po', label: 'Customer PO' },
                { key: 'num_lines', label: 'Lines' },
                { key: 'subtotal', label: 'Total' },
              ].filter(h => !printFilters || printFilters.visibleColumns.includes(h.key)).map(h => (
                <th key={h.key} style={{ padding: '5px 6px', border: '1px solid #ccc', background: '#f5f5f5', fontWeight: 600, textAlign: h.key === 'subtotal' ? 'right' : 'left' }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printFilteredData.map(row => {
              const showCol = (key: string) => !printFilters || printFilters.visibleColumns.includes(key)
              return (
                <tr key={row.id}>
                  {showCol('order_number') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', fontFamily: 'monospace' }}>{row.order_number}</td>}
                  {showCol('customer_name') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.customer_name}</td>}
                  {showCol('order_date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.order_date}</td>}
                  {showCol('scheduled_date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.scheduled_date || '\u2014'}</td>}
                  {showCol('status') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.status}</td>}
                  {showCol('customer_po') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.customer_po || '\u2014'}</td>}
                  {showCol('num_lines') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.num_lines}</td>}
                  {showCol('subtotal') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace' }}>${parseFloat(row.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ marginTop: '40px', paddingTop: '12px', borderTop: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#999' }}>
          <span>Printed {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
          <span>{settingsData?.company_name || ''}</span>
        </div>
      </div>

      <ReportFilterModal open={printFilterOpen} onOpenChange={setPrintFilterOpen} config={reportFilterConfig} mode="print" onConfirm={handleFilteredPrint} />
      <ReportFilterModal open={exportFilterOpen} onOpenChange={setExportFilterOpen} config={reportFilterConfig} mode="export" onConfirm={handleFilteredExport} />
    </div>
  )
}
