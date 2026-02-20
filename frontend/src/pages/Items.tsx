import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Package, Ruler, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
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
import { useItems, useUnitsOfMeasure, useDeleteItem } from '@/api/items'
import { ItemDialog } from '@/components/items/ItemDialog'
import { UOMDialog } from '@/components/items/UOMDialog'
import type { Item, UnitOfMeasure } from '@/types/api'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

type Tab = 'items' | 'uom'

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    active:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    inactive:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    sent:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    accepted:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    rejected:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    converted: { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    received:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    cancelled: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
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

export default function Items() {
  usePageTitle('Items')

  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('items')

  // Dialog states
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [uomDialogOpen, setUomDialogOpen] = useState(false)
  const [editingUOM, setEditingUOM] = useState<UnitOfMeasure | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const { data: itemsData, isLoading: itemsLoading } = useItems()
  const { data: uomData, isLoading: uomLoading } = useUnitsOfMeasure()
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

  const handleAddNew = () => {
    if (activeTab === 'items') {
      navigate('/items/new')
    } else {
      setEditingUOM(null)
      setUomDialogOpen(true)
    }
  }

  const itemColumns: ColumnDef<Item>[] = useMemo(
    () => [
      {
        accessorKey: 'sku',
        header: 'MSPN',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('sku')}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => {
          const desc = row.getValue('description') as string
          return desc ? (
            <span className="truncate max-w-[200px] block" style={{ color: 'var(--so-text-tertiary)' }}>
              {desc}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
          )
        },
      },
      {
        accessorKey: 'base_uom_code',
        header: 'UOM',
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium"
            style={{ background: 'var(--so-surface-raised)', border: '1px solid var(--so-border)', color: 'var(--so-text-secondary)' }}>
            {row.getValue('base_uom_code')}
          </span>
        ),
      },
      {
        accessorKey: 'is_inventory',
        header: 'Inventory',
        cell: ({ row }) => getStatusBadge(row.getValue('is_inventory') ? 'active' : 'inactive'),
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('is_active') ? 'active' : 'inactive'),
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

  const uomColumns: ColumnDef<UnitOfMeasure>[] = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('code')}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => {
          const desc = row.getValue('description') as string
          return desc || <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('is_active') ? 'active' : 'inactive'),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const uom = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingUOM(uom)
                  setUomDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    []
  )

  const tabs = [
    { id: 'items' as Tab, label: 'Items', icon: Package },
    { id: 'uom' as Tab, label: 'Units of Measure', icon: Ruler },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Items</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              Manage products and units of measure
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'items' && (
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
              />
            )}
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleAddNew}>
              <Plus className="h-4 w-4" />
              Add {activeTab === 'items' ? 'Item' : 'UOM'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 animate-in delay-1"
          style={{ borderBottom: '1px solid var(--so-border)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors -mb-px"
              style={{
                borderBottom: activeTab === tab.id ? '2px solid var(--so-accent)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--so-accent)' : 'var(--so-text-tertiary)',
              }}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Items DataTable */}
        {activeTab === 'items' && (
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
              <div className="p-6"><TableSkeleton columns={6} rows={8} /></div>
            ) : (
              <DataTable
                columns={itemColumns}
                data={itemsData?.results ?? []}
                searchColumn="name"
                searchPlaceholder="Search items..."
                onRowClick={(item) => navigate(`/items/${item.id}`)}
              />
            )}
          </div>
        )}

        {/* UOM DataTable */}
        {activeTab === 'uom' && (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2"
            style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Units of Measure</span>
              <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                {uomData?.results?.length ?? 0} total
              </span>
            </div>
            {uomLoading ? (
              <div className="p-6"><TableSkeleton columns={4} rows={8} /></div>
            ) : (
              <DataTable
                columns={uomColumns}
                data={uomData?.results ?? []}
                searchColumn="name"
                searchPlaceholder="Search units of measure..."
              />
            )}
          </div>
        )}

      </div>

      {/* Dialogs */}
      <ItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
      />
      <UOMDialog
        open={uomDialogOpen}
        onOpenChange={setUomDialogOpen}
        uom={editingUOM}
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
