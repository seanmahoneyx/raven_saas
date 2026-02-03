import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, ShoppingCart, Package, Calendar, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSalesOrders, usePurchaseOrders, useDeleteSalesOrder, useDeletePurchaseOrder } from '@/api/orders'
import { SalesOrderDialog } from '@/components/orders/SalesOrderDialog'
import { PurchaseOrderDialog } from '@/components/orders/PurchaseOrderDialog'
import type { SalesOrder, PurchaseOrder, OrderStatus } from '@/types/api'
import { format } from 'date-fns'

type Tab = 'sales' | 'purchase'

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

export default function Orders() {
  usePageTitle('Orders')

  const [activeTab, setActiveTab] = useState<Tab>('sales')

  // Dialog states
  const [salesDialogOpen, setSalesDialogOpen] = useState(false)
  const [editingSalesOrder, setEditingSalesOrder] = useState<SalesOrder | null>(null)
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState<PurchaseOrder | null>(null)

  const { data: salesData } = useSalesOrders()
  const { data: purchaseData } = usePurchaseOrders()
  const deleteSalesOrder = useDeleteSalesOrder()
  const deletePurchaseOrder = useDeletePurchaseOrder()

  const handleAddNew = () => {
    if (activeTab === 'sales') {
      setEditingSalesOrder(null)
      setSalesDialogOpen(true)
    } else {
      setEditingPurchaseOrder(null)
      setPurchaseDialogOpen(true)
    }
  }

  const salesColumns: ColumnDef<SalesOrder>[] = useMemo(
    () => [
      {
        accessorKey: 'order_number',
        header: 'Order #',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('order_number')}</span>
        ),
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
      },
      {
        accessorKey: 'order_date',
        header: 'Order Date',
        cell: ({ row }) => format(new Date(row.getValue('order_date')), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'scheduled_date',
        header: 'Scheduled',
        cell: ({ row }) => {
          const date = row.getValue('scheduled_date') as string | null
          return date ? (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3 text-gray-400" />
              {format(new Date(date), 'MMM d')}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as OrderStatus
          return (
            <Badge variant={statusVariant[status]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'num_lines',
        header: 'Lines',
        cell: ({ row }) => (
          <span className="text-gray-600">{row.getValue('num_lines')}</span>
        ),
      },
      {
        accessorKey: 'subtotal',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-medium">
            ${parseFloat(row.getValue('subtotal')).toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        cell: ({ row }) => {
          const priority = row.getValue('priority') as number
          return (
            <span className={priority <= 3 ? 'text-red-600 font-medium' : ''}>
              {priority}
            </span>
          )
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const order = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingSalesOrder(order)
                  setSalesDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this order?')) {
                      deleteSalesOrder.mutate(order.id)
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [deleteSalesOrder]
  )

  const purchaseColumns: ColumnDef<PurchaseOrder>[] = useMemo(
    () => [
      {
        accessorKey: 'po_number',
        header: 'PO #',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('po_number')}</span>
        ),
      },
      {
        accessorKey: 'vendor_name',
        header: 'Vendor',
      },
      {
        accessorKey: 'order_date',
        header: 'Order Date',
        cell: ({ row }) => format(new Date(row.getValue('order_date')), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'expected_date',
        header: 'Expected',
        cell: ({ row }) => {
          const date = row.getValue('expected_date') as string | null
          return date ? format(new Date(date), 'MMM d, yyyy') : '-'
        },
      },
      {
        accessorKey: 'scheduled_date',
        header: 'Scheduled',
        cell: ({ row }) => {
          const date = row.getValue('scheduled_date') as string | null
          return date ? (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3 text-gray-400" />
              {format(new Date(date), 'MMM d')}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as OrderStatus
          return (
            <Badge variant={statusVariant[status]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'num_lines',
        header: 'Lines',
        cell: ({ row }) => (
          <span className="text-gray-600">{row.getValue('num_lines')}</span>
        ),
      },
      {
        accessorKey: 'subtotal',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-medium">
            ${parseFloat(row.getValue('subtotal')).toFixed(2)}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const order = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingPurchaseOrder(order)
                  setPurchaseDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this purchase order?')) {
                      deletePurchaseOrder.mutate(order.id)
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [deletePurchaseOrder]
  )

  const tabs = [
    { id: 'sales' as Tab, label: 'Sales Orders', icon: ShoppingCart },
    { id: 'purchase' as Tab, label: 'Purchase Orders', icon: Package },
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground">
            Manage sales and purchase orders
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          New {activeTab === 'sales' ? 'Sales' : 'Purchase'} Order
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {activeTab === 'sales'
                ? salesData?.results.filter((o) => o.status === 'draft').length ?? 0
                : purchaseData?.results.filter((o) => o.status === 'draft').length ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Draft</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {activeTab === 'sales'
                ? salesData?.results.filter((o) => o.status === 'scheduled').length ?? 0
                : purchaseData?.results.filter((o) => o.status === 'scheduled').length ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Scheduled</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {activeTab === 'sales'
                ? salesData?.results.filter((o) => o.status === 'picking').length ?? 0
                : purchaseData?.results.filter((o) => o.status === 'picking').length ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">In Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {activeTab === 'sales'
                ? salesData?.results.filter((o) => o.status === 'complete').length ?? 0
                : purchaseData?.results.filter((o) => o.status === 'complete').length ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Complete</div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {tabs.find((t) => t.id === activeTab)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeTab === 'sales' && (
            <DataTable
              columns={salesColumns}
              data={salesData?.results ?? []}
              searchColumn="order_number"
              searchPlaceholder="Search orders..."
            />
          )}
          {activeTab === 'purchase' && (
            <DataTable
              columns={purchaseColumns}
              data={purchaseData?.results ?? []}
              searchColumn="po_number"
              searchPlaceholder="Search POs..."
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <SalesOrderDialog
        open={salesDialogOpen}
        onOpenChange={setSalesDialogOpen}
        order={editingSalesOrder}
      />
      <PurchaseOrderDialog
        open={purchaseDialogOpen}
        onOpenChange={setPurchaseDialogOpen}
        order={editingPurchaseOrder}
      />
    </div>
  )
}
