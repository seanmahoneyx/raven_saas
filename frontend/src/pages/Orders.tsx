import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, ShoppingCart, Package, Calendar, MoreHorizontal, Pencil, Trash2, FileDown } from 'lucide-react'
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
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Read initial tab from URL params, default to 'sales'
  const tabParam = searchParams.get('tab')
  const initialTab: Tab = tabParam === 'purchase' ? 'purchase' : 'sales'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  // Dialog states
  const [salesDialogOpen, setSalesDialogOpen] = useState(false)
  const [editingSalesOrder, setEditingSalesOrder] = useState<SalesOrder | null>(null)
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState<PurchaseOrder | null>(null)
  const [deleteSalesDialogOpen, setDeleteSalesDialogOpen] = useState(false)
  const [deletePurchaseDialogOpen, setDeletePurchaseDialogOpen] = useState(false)
  const [pendingDeleteSalesId, setPendingDeleteSalesId] = useState<number | null>(null)
  const [pendingDeletePurchaseId, setPendingDeletePurchaseId] = useState<number | null>(null)

  // Handle URL params for tab and action
  useEffect(() => {
    const tab = searchParams.get('tab')
    const action = searchParams.get('action')

    // Set active tab from URL
    if (tab === 'purchase') {
      setActiveTab('purchase')
    } else if (tab === 'sales') {
      setActiveTab('sales')
    }

    // Open dialog if action=new
    if (action === 'new') {
      if (tab === 'purchase') {
        setEditingPurchaseOrder(null)
        setPurchaseDialogOpen(true)
      } else {
        setEditingSalesOrder(null)
        setSalesDialogOpen(true)
      }
      // Clear the action param after opening dialog
      searchParams.delete('action')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

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

  const handleConfirmDeleteSales = async () => {
    if (!pendingDeleteSalesId) return
    try {
      await deleteSalesOrder.mutateAsync(pendingDeleteSalesId)
      toast.success('Sales order deleted successfully')
      setDeleteSalesDialogOpen(false)
      setPendingDeleteSalesId(null)
    } catch (error) {
      toast.error('Failed to delete sales order')
    }
  }

  const handleConfirmDeletePurchase = async () => {
    if (!pendingDeletePurchaseId) return
    try {
      await deletePurchaseOrder.mutateAsync(pendingDeletePurchaseId)
      toast.success('Purchase order deleted successfully')
      setDeletePurchaseDialogOpen(false)
      setPendingDeletePurchaseId(null)
    } catch (error) {
      toast.error('Failed to delete purchase order')
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
                    setPendingDeleteSalesId(order.id)
                    setDeleteSalesDialogOpen(true)
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
                <DropdownMenuItem onClick={() => window.open(`/api/v1/purchase-orders/${order.id}/pdf/`, '_blank')}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setPendingDeletePurchaseId(order.id)
                    setDeletePurchaseDialogOpen(true)
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
              onRowClick={(order) => navigate(`/orders/sales/${order.id}`)}
            />
          )}
          {activeTab === 'purchase' && (
            <DataTable
              columns={purchaseColumns}
              data={purchaseData?.results ?? []}
              searchColumn="po_number"
              searchPlaceholder="Search POs..."
              onRowClick={(order) => navigate(`/orders/purchase/${order.id}`)}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <SalesOrderDialog
        open={salesDialogOpen}
        onOpenChange={setSalesDialogOpen}
        order={editingSalesOrder}
        onSuccess={() => {
          // Stay on sales tab after creation
          setActiveTab('sales')
        }}
      />
      <PurchaseOrderDialog
        open={purchaseDialogOpen}
        onOpenChange={setPurchaseDialogOpen}
        order={editingPurchaseOrder}
        onSuccess={() => {
          // Stay on purchase tab after creation
          setActiveTab('purchase')
        }}
      />

      <ConfirmDialog
        open={deleteSalesDialogOpen}
        onOpenChange={setDeleteSalesDialogOpen}
        title="Delete Sales Order"
        description="Are you sure you want to delete this sales order? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDeleteSales}
        loading={deleteSalesOrder.isPending}
      />

      <ConfirmDialog
        open={deletePurchaseDialogOpen}
        onOpenChange={setDeletePurchaseDialogOpen}
        title="Delete Purchase Order"
        description="Are you sure you want to delete this purchase order? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDeletePurchase}
        loading={deletePurchaseOrder.isPending}
      />
    </div>
  )
}
