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
import { useSalesOrders, usePurchaseOrders, useDeleteSalesOrder, useDeletePurchaseOrder } from '@/api/orders'
import { SalesOrderDialog } from '@/components/orders/SalesOrderDialog'
import { PurchaseOrderDialog } from '@/components/orders/PurchaseOrderDialog'
import type { SalesOrder, PurchaseOrder, OrderStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import React from 'react'

type Tab = 'sales' | 'purchase'

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:       { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    active:      { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    inactive:    { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    pending:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    in_progress: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    approved:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    rejected:    { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    completed:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    posted:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    confirmed:   { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    scheduled:   { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    picking:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    shipped:     { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    complete:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    cancelled:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    crossdock:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    received:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    sent:        { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    converted:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    expired:     { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  }
  const c = configs[status] || { bg: 'var(--so-warning-bg)', border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' }
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

export default function Orders() {
  usePageTitle('Orders')
  useOrderSync()
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
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Orders</h1>
            <p className="mt-1 text-[13.5px]" style={{ color: 'var(--so-text-muted)' }}>
              Manage sales and purchase orders
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton
              data={activeTab === 'sales' ? (salesData?.results ?? []) : (purchaseData?.results ?? [])}
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
            />
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleAddNew}>
              <Plus className="h-4 w-4" />
              New {activeTab === 'sales' ? 'Sales' : 'Purchase'} Order
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 animate-in delay-1" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors -mb-px"
                style={{
                  borderBottom: isActive ? '2px solid var(--so-accent)' : '2px solid transparent',
                  color: isActive ? 'var(--so-accent)' : 'var(--so-text-muted)',
                }}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* KPI Cards */}
        <div className="rounded-[14px] border mb-5 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="grid grid-cols-4 divide-x" style={{ borderColor: 'var(--so-border-light)' }}>
            {kpis.map((kpi) => (
              <div key={kpi.label} className="px-6 py-5">
                <div className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>{kpi.count}</div>
                <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--so-text-muted)' }}>{kpi.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Orders Table */}
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
                  toast.info(`${rows.length} orders selected for status update`)
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
              onRowClick={(order) => navigate(`/orders/purchase/${order.id}`)}
            />
          )}
        </div>

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
    </div>
  )
}
