import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Pencil, Trash2, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/ui/export-button'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { useItems, useDeleteItem } from '@/api/items'
import { ItemDialog } from '@/components/items/ItemDialog'
import type { Item } from '@/types/api'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

import { getStatusBadge } from '@/components/ui/StatusBadge'
import { primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

export default function Items() {
  usePageTitle('Items')

  const navigate = useNavigate()

  // Dialog states
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('active')

  const { data: itemsData, isLoading: itemsLoading } = useItems(
    lifecycleFilter === 'all' ? undefined : { lifecycle_status: lifecycleFilter }
  )
  const deleteItem = useDeleteItem()

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteItem.mutateAsync(pendingDeleteId)
      toast.success('Item deleted successfully')
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    } catch (error) {
      toast.error('Failed to delete item')
    }
  }

  const itemColumns: ColumnDef<Item>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Item',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.name}</div>
            <div className="font-mono text-[12px] truncate" style={{ color: 'var(--so-text-tertiary)' }}>
              {row.original.sku}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'item_type',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.getValue('item_type') as string
          const labels: Record<string, string> = {
            inventory: 'Inv',
            crossdock: 'Cross',
            non_stockable: 'Non-Inv',
            other_charge: 'Other',
          }
          const colors: Record<string, { bg: string; text: string }> = {
            inventory: { bg: 'rgba(74,144,92,0.1)', text: 'var(--so-success, #4a905c)' },
            crossdock: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
            non_stockable: { bg: 'rgba(168,85,247,0.1)', text: '#a855f7' },
            other_charge: { bg: 'var(--so-bg)', text: 'var(--so-text-tertiary)' },
          }
          const c = colors[type] || colors.inventory
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium"
              style={{ background: c.bg, color: c.text }}>
              {labels[type] || type}
            </span>
          )
        },
      },
      {
        accessorKey: 'division',
        header: 'Division',
        cell: ({ row }) => {
          const div = row.getValue('division') as string
          const labels: Record<string, string> = {
            corrugated: 'Corrugated',
            packaging: 'Packaging',
            tooling: 'Tooling',
            janitorial: 'Janitorial',
            misc: 'Misc',
          }
          return (
            <span className="text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
              {labels[div] || div}
            </span>
          )
        },
      },
      {
        accessorKey: 'lifecycle_status',
        header: 'Status',
        cell: ({ row }) => {
          const ls = row.getValue('lifecycle_status') as string
          const config: Record<string, { label: string; bg: string; text: string }> = {
            draft: { label: 'Draft', bg: 'rgba(168,85,247,0.1)', text: '#a855f7' },
            pending_design: { label: 'Design Req', bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
            in_design: { label: 'In Design', bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
            design_complete: { label: 'Design Done', bg: 'rgba(16,185,129,0.1)', text: '#10b981' },
            pending_approval: { label: 'Pending', bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
            active: { label: 'Active', bg: 'rgba(74,144,92,0.1)', text: 'var(--so-success, #4a905c)' },
          }
          const c = config[ls] || config.active
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider"
              style={{ background: c.bg, color: c.text }}>
              {c.label}
            </span>
          )
        },
      },
      {
        accessorKey: 'revision',
        header: 'Rev',
        cell: ({ row }) => {
          const rev = row.original.revision
          return rev ? (
            <span className="font-mono text-[12px]" style={{ color: 'var(--so-text-secondary)' }}>
              {rev}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
          )
        },
      },
      {
        accessorKey: 'box_type',
        header: 'Box Type',
        cell: ({ row }) => {
          const type = row.getValue('box_type') as string
          const labels: Record<string, string> = {
            base: 'Base',
            corrugated: 'Corrugated',
            dc: 'D/C',
            rsc: 'RSC',
            hsc: 'HSC',
            fol: 'FOL',
            tele: 'Tele',
          }
          return type && type !== 'base' ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium"
              style={{ background: 'var(--so-surface-raised)', border: '1px solid var(--so-border)', color: 'var(--so-text-secondary)' }}>
              {labels[type] || type.toUpperCase()}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
          )
        },
      },
      {
        accessorKey: 'qty_on_hand',
        header: 'On Hand',
        cell: ({ row }) => {
          const qty = row.original.qty_on_hand ?? 0
          return (
            <span className="font-mono text-[13px]" style={{ color: qty > 0 ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
              {qty.toLocaleString()}
            </span>
          )
        },
      },
      {
        accessorKey: 'qty_on_open_po',
        header: 'Open PO',
        cell: ({ row }) => {
          const qty = row.original.qty_on_open_po ?? 0
          return (
            <span className="font-mono text-[13px]" style={{ color: qty > 0 ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
              {qty.toLocaleString()}
            </span>
          )
        },
      },
      {
        accessorKey: 'qty_on_open_so',
        header: 'Open SO',
        cell: ({ row }) => {
          const qty = row.original.qty_on_open_so ?? 0
          return (
            <span className="font-mono text-[13px]" style={{ color: qty > 0 ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
              {qty.toLocaleString()}
            </span>
          )
        },
      },
      {
        accessorKey: 'preferred_vendor_name',
        header: 'Preferred Vendor',
        cell: ({ row }) => {
          const name = row.original.preferred_vendor_name
          return name ? (
            <span className="text-[13px] truncate max-w-[140px] block">{name}</span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
          )
        },
      },
      {
        accessorKey: 'expense_account_name',
        header: 'COGS',
        cell: ({ row }) => {
          const name = row.original.expense_account_name
          return name ? (
            <span className="text-[13px] truncate max-w-[120px] block">{name}</span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
          )
        },
      },
      {
        accessorKey: 'asset_account_name',
        header: 'Asset',
        cell: ({ row }) => {
          const name = row.original.asset_account_name
          return name ? (
            <span className="text-[13px] truncate max-w-[120px] block">{name}</span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
          )
        },
      },
      {
        accessorKey: 'income_account_name',
        header: 'Sales',
        cell: ({ row }) => {
          const name = row.original.income_account_name
          return name ? (
            <span className="text-[13px] truncate max-w-[120px] block">{name}</span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
          )
        },
      },
      {
        accessorKey: 'attachment_count',
        header: 'Attachments',
        cell: ({ row }) => {
          const count = row.original.attachment_count ?? 0
          return (
            <div className="relative inline-flex items-center justify-center w-6 h-6">
              <Paperclip className="h-4 w-4" style={{ color: count > 0 ? 'var(--so-text-secondary)' : 'var(--so-text-tertiary)', opacity: count > 0 ? 1 : 0.4 }} />
              {count > 0 && (
                <span className="absolute -top-1 -left-1 flex items-center justify-center h-3.5 min-w-[14px] px-0.5 rounded-full text-[9px] font-bold text-white"
                  style={{ background: '#f97316' }}>
                  {count}
                </span>
              )}
            </div>
          )
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const item = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingItem(item)
                  setItemDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setPendingDeleteId(item.id)
                    setDeleteDialogOpen(true)
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
    [deleteItem]
  )

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Items</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              Manage products and inventory
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => navigate('/items/new')}>
              <Plus className="h-4 w-4" />
              Add Item
            </button>
            <ExportButton
              data={itemsData?.results ?? []}
              filename="items"
              columns={[
                { key: 'sku', header: 'SKU' },
                { key: 'name', header: 'Name' },
                { key: 'description', header: 'Description' },
                { key: 'base_uom_code', header: 'UOM' },
                { key: 'is_active', header: 'Active' },
              ]}
              iconOnly
            />
          </div>
        </div>

        {/* Lifecycle Filter Tabs */}
        <div className="flex items-center gap-1 mb-4 rounded-lg p-1 animate-in delay-1"
          style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border-light)', width: 'fit-content' }}>
          {[
            { value: 'active', label: 'Active' },
            { value: 'draft', label: 'Drafts' },
            { value: 'pending_design', label: 'Design Requested' },
            { value: 'in_design', label: 'In Design' },
            { value: 'pending_approval', label: 'Pending Approval' },
            { value: 'all', label: 'All' },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setLifecycleFilter(tab.value)}
              className="px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors"
              style={{
                background: lifecycleFilter === tab.value ? 'var(--so-surface)' : 'transparent',
                color: lifecycleFilter === tab.value ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)',
                boxShadow: lifecycleFilter === tab.value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Items DataTable */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Items</span>
            <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {itemsData?.results?.length ?? 0} total
            </span>
          </div>
          {itemsLoading ? (
            <div className="p-6"><TableSkeleton columns={14} rows={8} /></div>
          ) : (
            <DataTable
              storageKey="items"
              columns={itemColumns}
              data={itemsData?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search items..."
              onRowClick={(item) => navigate(`/items/${item.id}`)}
              responsiveColumns={{
                // Always visible: sku, name, actions
                // Show at ≥768px (tablet)
                item_type: 768,
                division: 768,
                lifecycle_status: 768,
                revision: 768,
                box_type: 768,
                qty_on_hand: 768,
                // Show at ≥1024px (desktop)
                qty_on_open_po: 1024,
                qty_on_open_so: 1024,
                preferred_vendor_name: 1024,
                // Show at ≥1280px (wide)
                expense_account_name: 1280,
                asset_account_name: 1280,
                income_account_name: 1280,
                attachment_count: 1280,
              }}
            />
          )}
        </div>

      </div>

      {/* Dialogs */}
      <ItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
      />
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Item"
        description="Are you sure you want to delete this item? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteItem.isPending}
      />
    </div>
  )
}
