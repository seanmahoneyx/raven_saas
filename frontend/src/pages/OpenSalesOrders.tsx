import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Calendar, ChevronDown, ChevronRight, Filter, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSalesOrders } from '@/api/orders'
import type { SalesOrder, OrderStatus } from '@/types/api'
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

export default function OpenSalesOrders() {
  usePageTitle('Open Sales Orders')

  const { data: ordersData } = useSalesOrders()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
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
      // Search filter
      if (searchTerm && !order.order_number.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }

      // Customer filter
      if (selectedCustomer !== 'all' && order.customer_name !== selectedCustomer) {
        return false
      }

      // Status filter
      if (selectedStatus !== 'all' && order.status !== selectedStatus) {
        return false
      }

      // Date from filter
      if (dateFrom && order.order_date < dateFrom) {
        return false
      }

      // Date to filter
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

    // Sort orders within each group by date (newest first)
    Object.keys(groups).forEach(customerName => {
      groups[customerName].sort((a, b) =>
        new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
      )
    })

    // Initialize all groups as expanded on first render
    const currentExpanded = { ...expandedGroups }
    let hasChanges = false
    Object.keys(groups).forEach(customerName => {
      if (!(customerName in currentExpanded)) {
        currentExpanded[customerName] = true
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
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.status]}>
          {row.original.status}
        </Badge>
      ),
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
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => row.original.priority,
    },
  ]

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Open Sales Orders</h1>
        <p className="text-muted-foreground">
          View all open sales orders grouped by customer
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Open Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
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
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
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
              <label className="text-sm font-medium">Customer</label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger>
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
              <label className="text-sm font-medium">Status</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
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
              <label className="text-sm font-medium">Search Order #</label>
              <Input
                placeholder="Search order number..."
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
                No open sales orders found matching the current filters.
              </div>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedOrders).map(([customerName, orders]) => {
            const customerTotal = orders.reduce((sum, order) => sum + parseFloat(order.subtotal), 0)
            const isExpanded = expandedGroups[customerName]

            return (
              <Card key={customerName}>
                <CardHeader
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => toggleGroup(customerName)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                      <CardTitle className="text-xl">
                        {customerName}
                      </CardTitle>
                      <Badge variant="outline">
                        {orders.length} {orders.length === 1 ? 'order' : 'orders'}
                      </Badge>
                      <span className="text-lg font-semibold text-muted-foreground">
                        ${customerTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent>
                    <DataTable columns={columns} data={orders} />
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
