import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useOrderSync } from '@/hooks/useRealtimeSync'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, ShoppingCart, Package, Calendar, MoreHorizontal, Pencil, Trash2, FileDown, Printer, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/ui/export-button'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSalesOrders, usePurchaseOrders, useDeleteSalesOrder, useDeletePurchaseOrder, useUpdateSalesOrder } from '@/api/orders'
import { SalesOrderDialog } from '@/components/orders/SalesOrderDialog'
import { PurchaseOrderDialog } from '@/components/orders/PurchaseOrderDialog'
import type { SalesOrder, PurchaseOrder } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { FolderTabs } from '@/components/ui/folder-tabs'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MobileCardList } from '@/components/ui/MobileCardList'
import { SalesOrderCard, PurchaseOrderCard } from '@/components/orders/OrderCard'

import { PageHeader, KpiGrid, KpiCard } from '@/components/page'

type Tab = 'sales' | 'purchase'

export default function Orders() {
  usePageTitle('Orders')
  useOrderSync()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const isMobile = useIsMobile()
  const [mobileSearch, setMobileSearch] = useState('')
  const [mobileSortKey, setMobileSortKey] = useState('order_number')
  const [mobileSortDir, setMobileSortDir] = useState<'asc' | 'desc'>('desc')

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
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [statusDialogRows, setStatusDialogRows] = useState<SalesOrder[]>([])
  const [newStatus, setNewStatus] = useState<string>('confirmed')

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
  const updateOrder = useUpdateSalesOrder()

  const mobileOrders = useMemo(() => {
    const raw = activeTab === 'sales'
      ? (salesData?.results ?? [])
      : (purchaseData?.results ?? [])
    let rows = [...raw]
    if (mobileSearch.trim()) {
      const q = mobileSearch.toLowerCase()
      rows = rows.filter(o => {
        const num = activeTab === 'sales' ? (o as SalesOrder).order_number : (o as PurchaseOrder).po_number
        const party = activeTab === 'sales' ? (o as SalesOrder).customer_name : (o as PurchaseOrder).vendor_name
        return num?.toLowerCase().includes(q) || party?.toLowerCase().includes(q)
      })
    }
    rows.sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (mobileSortKey === 'order_number') {
        av = activeTab === 'sales' ? (a as SalesOrder).order_number ?? '' : (a as PurchaseOrder).po_number ?? ''
        bv = activeTab === 'sales' ? (b as SalesOrder).order_number ?? '' : (b as PurchaseOrder).po_number ?? ''
      } else if (mobileSortKey === 'party') {
        av = activeTab === 'sales' ? (a as SalesOrder).customer_name ?? '' : (a as PurchaseOrder).vendor_name ?? ''
        bv = activeTab === 'sales' ? (b as SalesOrder).customer_name ?? '' : (b as PurchaseOrder).vendor_name ?? ''
      } else if (mobileSortKey === 'subtotal') {
        av = parseFloat(a.subtotal || '0')
        bv = parseFloat(b.subtotal || '0')
      } else if (mobileSortKey === 'scheduled_date') {
        av = a.scheduled_date ?? ''
        bv = b.scheduled_date ?? ''
      }
      if (av < bv) return mobileSortDir === 'asc' ? -1 : 1
      if (av > bv) return mobileSortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [activeTab, salesData, purchaseData, mobileSearch, mobileSortKey, mobileSortDir])

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

  const handleBulkStatusUpdate = async () => {
    try {
      await Promise.all(
        statusDialogRows.map(order =>
          updateOrder.mutateAsync({ id: order.id, status: newStatus as any })
        )
      )
      toast.success(`Updated ${statusDialogRows.length} order(s) to ${newStatus}`)
      setStatusDialogOpen(false)
      setStatusDialogRows([])
    } catch {
      toast.error('Failed to update some orders')
    }
  }

  const salesColumns: ColumnDef<SalesOrder>[] = useMemo(
    () => [
      {
        accessorKey: 'order_number',
        header: 'Order #',
        cell: ({ row }) => (
          <span className="font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>{row.getValue('order_number')}</span>
        ),
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
        cell: ({ row }) => <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('customer_name')}</span>,
      },
      {
        accessorKey: 'order_date',
        header: 'Order Date',
        cell: ({ row }) => <span style={{ color: 'var(--so-text-secondary)' }}>{format(new Date(row.getValue('order_date')), 'MMM d, yyyy')}</span>,
      },
      {
        accessorKey: 'scheduled_date',
        header: 'Scheduled',
        cell: ({ row }) => {
          const date = row.getValue('scheduled_date') as string | null
          return date ? (
            <span className="flex items-center gap-1" style={{ color: 'var(--so-text-secondary)' }}>
              <Calendar className="h-3 w-3" style={{ color: 'var(--so-text-muted)' }} />
              {format(new Date(date), 'MMM d')}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-muted)' }}>-</span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as string),
      },
      {
        accessorKey: 'num_lines',
        header: 'Lines',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('num_lines')}</span>
        ),
      },
      {
        accessorKey: 'subtotal',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>
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
            <span style={{ color: priority <= 3 ? 'var(--so-danger-text)' : 'var(--so-text-secondary)', fontWeight: priority <= 3 ? 600 : 400 }}>
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
          <span className="font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>{row.getValue('po_number')}</span>
        ),
      },
      {
        accessorKey: 'vendor_name',
        header: 'Vendor',
        cell: ({ row }) => <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('vendor_name')}</span>,
      },
      {
        accessorKey: 'order_date',
        header: 'Order Date',
        cell: ({ row }) => <span style={{ color: 'var(--so-text-secondary)' }}>{format(new Date(row.getValue('order_date')), 'MMM d, yyyy')}</span>,
      },
      {
        accessorKey: 'expected_date',
        header: 'Expected',
        cell: ({ row }) => {
          const date = row.getValue('expected_date') as string | null
          return <span style={{ color: 'var(--so-text-secondary)' }}>{date ? format(new Date(date), 'MMM d, yyyy') : '-'}</span>
        },
      },
      {
        accessorKey: 'scheduled_date',
        header: 'Scheduled',
        cell: ({ row }) => {
          const date = row.getValue('scheduled_date') as string | null
          return date ? (
            <span className="flex items-center gap-1" style={{ color: 'var(--so-text-secondary)' }}>
              <Calendar className="h-3 w-3" style={{ color: 'var(--so-text-muted)' }} />
              {format(new Date(date), 'MMM d')}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-muted)' }}>-</span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as string),
      },
      {
        accessorKey: 'num_lines',
        header: 'Lines',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('num_lines')}</span>
        ),
      },
      {
        accessorKey: 'subtotal',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>
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

  const activeOrders = activeTab === 'sales' ? salesData?.results ?? [] : purchaseData?.results ?? []

  const kpis = [
    { label: 'Draft', count: activeOrders.filter((o) => o.status === 'draft').length },
    { label: 'Scheduled', count: activeOrders.filter((o) => o.status === 'scheduled').length },
    { label: 'In Progress', count: activeOrders.filter((o) => o.status === 'picking').length },
    { label: 'Complete', count: activeOrders.filter((o) => o.status === 'complete').length },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">

        <PageHeader
          title="Orders"
          description="Manage sales and purchase orders"
          primary={{
            label: `New ${activeTab === 'sales' ? 'Sales' : 'Purchase'} Order`,
            icon: Plus,
            onClick: handleAddNew,
          }}
          trailing={
            <ExportButton
              data={(activeTab === 'sales' ? (salesData?.results ?? []) : (purchaseData?.results ?? [])) as unknown as Record<string, unknown>[]}
              filename={activeTab === 'sales' ? 'sales-orders' : 'purchase-orders'}
              columns={activeTab === 'sales' ? [
                { key: 'order_number', header: 'Order #' },
                { key: 'customer_name', header: 'Customer' },
                { key: 'order_date', header: 'Order Date' },
                { key: 'scheduled_date', header: 'Scheduled Date' },
                { key: 'status', header: 'Status' },
                { key: 'num_lines', header: 'Lines' },
                { key: 'subtotal', header: 'Total' },
                { key: 'priority', header: 'Priority' },
              ] : [
                { key: 'po_number', header: 'PO #' },
                { key: 'vendor_name', header: 'Vendor' },
                { key: 'order_date', header: 'Order Date' },
                { key: 'expected_date', header: 'Expected Date' },
                { key: 'scheduled_date', header: 'Scheduled Date' },
                { key: 'status', header: 'Status' },
                { key: 'num_lines', header: 'Lines' },
                { key: 'subtotal', header: 'Total' },
              ]}
              iconOnly
            />
          }
        />


        {/* Tabs */}
        <div className="mb-6 animate-in">
          <FolderTabs
            tabs={[
              { id: 'sales', label: 'Sales Orders' },
              { id: 'purchase', label: 'Purchase Orders' },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => {
              setActiveTab(id as Tab)
              setSearchParams({ tab: id }, { replace: true })
            }}
          />
        </div>

        <div className="mb-5 animate-in delay-2">
          <KpiGrid columns={4}>
            {kpis.map((kpi) => (
              <KpiCard key={kpi.label} label={kpi.label} value={kpi.count} />
            ))}
          </KpiGrid>
        </div>

        {/* Orders Table / Mobile Cards */}
        {isMobile ? (
          <MobileCardList
            data={mobileOrders}
            renderCard={(item) =>
              activeTab === 'sales'
                ? <SalesOrderCard order={item as SalesOrder} />
                : <PurchaseOrderCard order={item as PurchaseOrder} />
            }
            searchValue={mobileSearch}
            onSearchChange={setMobileSearch}
            searchPlaceholder={activeTab === 'sales' ? 'Search orders...' : 'Search POs...'}
            sortOptions={[
              { label: activeTab === 'sales' ? 'Order #' : 'PO #', key: 'order_number' },
              { label: activeTab === 'sales' ? 'Customer' : 'Vendor', key: 'party' },
              { label: 'Total', key: 'subtotal' },
              { label: 'Scheduled Date', key: 'scheduled_date' },
            ]}
            currentSort={mobileSortKey}
            onSortChange={setMobileSortKey}
            sortDirection={mobileSortDir}
            onSortDirectionChange={() => setMobileSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            resultCount={mobileOrders.length}
            onItemClick={(item) =>
              activeTab === 'sales'
                ? navigate(`/orders/sales/${(item as SalesOrder).id}`)
                : navigate(`/orders/purchase/${(item as PurchaseOrder).id}`)
            }
            emptyMessage="No orders found."
          />
        ) : (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                {tabs.find((t) => t.id === activeTab)?.label}
              </span>
            </div>
            {activeTab === 'sales' && (
              <DataTable
                columns={salesColumns}
                data={salesData?.results ?? []}
                searchColumn="order_number"
                searchPlaceholder="Search orders..."
                storageKey="all-sales-orders"
                onRowClick={(order) => navigate(`/orders/sales/${order.id}`)}
                enableSelection
                bulkActions={[
                  { key: 'print', label: 'Print', icon: <Printer className="mr-1 h-4 w-4" /> },
                  { key: 'status', label: 'Update Status', icon: <RefreshCw className="mr-1 h-4 w-4" /> },
                ]}
                onBulkAction={(action, rows) => {
                  if (action === 'print') {
                    rows.forEach((row: any) => {
                      window.open(`/api/v1/sales-orders/${row.id}/pick-ticket/`, '_blank')
                    })
                  } else if (action === 'status') {
                    setStatusDialogRows(rows as SalesOrder[])
                    setStatusDialogOpen(true)
                  }
                }}
              />
            )}
            {activeTab === 'purchase' && (
              <DataTable
                columns={purchaseColumns}
                data={purchaseData?.results ?? []}
                searchColumn="po_number"
                searchPlaceholder="Search POs..."
                storageKey="all-purchase-orders"
                onRowClick={(order) => navigate(`/orders/purchase/${order.id}`)}
              />
            )}
          </div>
        )}

      </div>

      {/* Dialogs */}
      <SalesOrderDialog
        open={salesDialogOpen}
        onOpenChange={setSalesDialogOpen}
        order={editingSalesOrder}
        onSuccess={() => {
          setActiveTab('sales')
        }}
      />
      <PurchaseOrderDialog
        open={purchaseDialogOpen}
        onOpenChange={setPurchaseDialogOpen}
        order={editingPurchaseOrder}
        onSuccess={() => {
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

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-[400px]" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--so-text-primary)' }}>Update Order Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              Update {statusDialogRows.length} selected order(s) to:
            </p>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['draft', 'confirmed', 'scheduled', 'picking', 'shipped', 'complete', 'cancelled'].map(s => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <button
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md text-[13px] font-medium transition-all cursor-pointer"
              style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }}
              onClick={() => setStatusDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer"
              style={{ background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }}
              onClick={handleBulkStatusUpdate}
              disabled={updateOrder.isPending}
            >
              {updateOrder.isPending ? 'Updating...' : 'Update Status'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
