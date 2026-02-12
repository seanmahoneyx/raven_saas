import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Calendar, ChevronDown, ChevronRight, Filter, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePurchaseOrders } from '@/api/orders'
import type { PurchaseOrder, OrderStatus } from '@/types/api'
import { format } from 'date-fns'

const statusVariant: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  draft: 'secondary',
  confirmed: 'outline',
  scheduled: 'default',
  picking: 'warning',
  shipped: 'success',
  complete: 'success',
  crossdock: 'warning',
  cancelled: 'destructive',
}

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

    // Sort orders within each group by date (newest first)
    Object.keys(groups).forEach(vendorName => {
      groups[vendorName].sort((a, b) =>
        new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
      )
    })

    // Initialize all groups as expanded on first render
    const currentExpanded = { ...expandedGroups }
    let hasChanges = false
    Object.keys(groups).forEach(vendorName => {
      if (!(vendorName in currentExpanded)) {
        currentExpanded[vendorName] = true
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
            <Calendar className="h-3 w-3 text-gray-400" />
            {format(new Date(row.original.scheduled_date), 'MMM d')}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.status]}>
          {row.original.status.charAt(0).toUpperCase() + row.original.status.slice(1)}
        </Badge>
      ),
    },
    {
      accessorKey: 'num_lines',
      header: 'Lines',
      cell: ({ row }) => (
        <span className="text-gray-600">{row.original.num_lines}</span>
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
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => {
        const priority = row.original.priority
        return (
          <span className={priority <= 3 ? 'text-red-600 font-medium' : ''}>
            {priority}
          </span>
        )
      },
    },
  ]

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
        <p className="text-muted-foreground">
          View all open purchase orders grouped by vendor
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Open POs</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.totalOpen}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.draftCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.scheduledCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${summaryStats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Vendor</label>
              <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                <SelectTrigger>
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
              <label className="text-sm font-medium">Status</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
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
              <label className="text-sm font-medium">From Date</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Search PO #</label>
              <Input
                placeholder="Search PO number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grouped Orders */}
      <div className="space-y-4">
        {Object.keys(groupedOrders).length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                No open purchase orders found matching the current filters.
              </div>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedOrders)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([vendorName, orders]) => {
              const vendorTotal = orders.reduce((sum, order) => sum + parseFloat(order.subtotal), 0)
              const isExpanded = expandedGroups[vendorName]

              return (
                <Card key={vendorName}>
                  <CardHeader
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => toggleGroup(vendorName)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                        <CardTitle className="text-xl">
                          {vendorName}
                        </CardTitle>
                        <Badge variant="outline">
                          {orders.length} {orders.length === 1 ? 'PO' : 'POs'}
                        </Badge>
                        <span className="text-lg font-semibold text-muted-foreground">
                          ${vendorTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent>
                      <DataTable
                        columns={columns}
                        data={orders}
                        onRowClick={(order) => navigate(`/orders/purchase/${order.id}`)}
                      />
                    </CardContent>
                  )}
                </Card>
              )
            })
        )}
      </div>
    </div>
  )
}
