import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Pencil, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { useWarehouse, useBins, useDeleteBin } from '@/api/warehouse'
import type { Bin } from '@/api/warehouse'
import { toastApiError } from '@/lib/errors'
import { PageHeader } from '@/components/page'
import { WarehouseDialog } from './WarehouseDialog'
import { BinDialog } from './BinDialog'

const BIN_TYPE_LABELS: Record<string, string> = {
  STORAGE: 'Storage',
  STAGING: 'Staging',
  RECEIVING: 'Receiving',
  SHIPPING: 'Shipping',
  DAMAGED: 'Damaged/Hold',
}

function fmtDim(v?: string | null): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toString() : String(v)
}

export default function WarehouseDetail() {
  const { id } = useParams<{ id: string }>()
  const warehouseId = id ? Number(id) : undefined

  const { data: warehouse, isLoading } = useWarehouse(warehouseId)
  const { data: binsData, isLoading: binsLoading } = useBins(warehouseId)
  const deleteBin = useDeleteBin()

  usePageTitle(warehouse ? `${warehouse.code} — Warehouse` : 'Warehouse')

  const [whDialogOpen, setWhDialogOpen] = useState(false)
  const [binDialogOpen, setBinDialogOpen] = useState(false)
  const [editingBin, setEditingBin] = useState<Bin | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteBin.mutateAsync(pendingDeleteId)
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    } catch (error) {
      toastApiError(error, 'Failed to delete bin')
    }
  }

  const binColumns: ColumnDef<Bin>[] = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-mono font-medium text-[13px]">{row.original.code}</span>
        ),
      },
      {
        id: 'location',
        header: 'Aisle / Rack / Level',
        cell: ({ row }) => {
          const { aisle, rack, level } = row.original
          const parts = [aisle, rack, level].filter(Boolean)
          return parts.length ? (
            <span className="text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
              {parts.join(' / ')}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'bin_type',
        header: 'Type',
        cell: ({ row }) => {
          const t = row.original.bin_type
          return t ? (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium"
              style={{
                background: 'var(--so-surface-raised)',
                border: '1px solid var(--so-border)',
                color: 'var(--so-text-secondary)',
              }}
            >
              {BIN_TYPE_LABELS[t] ?? t}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        id: 'dimensions',
        header: 'L × W × H (in)',
        cell: ({ row }) => {
          const { length, width, height } = row.original
          if (length == null && width == null && height == null) {
            return <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          }
          return (
            <span className="font-mono text-[12px]" style={{ color: 'var(--so-text-secondary)' }}>
              {fmtDim(length)} × {fmtDim(width)} × {fmtDim(height)}
            </span>
          )
        },
      },
      {
        accessorKey: 'max_capacity',
        header: 'Max Cap',
        cell: ({ row }) => {
          const c = row.original.max_capacity
          return c != null ? (
            <span className="font-mono text-[13px]">{c.toLocaleString()}</span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'volume',
        header: 'Volume (in³)',
        cell: ({ row }) => {
          const v = row.original.volume
          return v != null && v !== '' ? (
            <span className="font-mono text-[12px]" style={{ color: 'var(--so-text-secondary)' }}>
              {Number(v).toLocaleString()}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Active',
        cell: ({ row }) =>
          row.original.is_active ? (
            <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--so-success, #4a905c)' }} />
          ) : (
            <XCircle className="h-4 w-4" style={{ color: 'var(--so-danger, #dc2626)' }} />
          ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const bin = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setEditingBin(bin)
                    setBinDialogOpen(true)
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setPendingDeleteId(bin.id)
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
    []
  )

  const bins = binsData?.results ?? []

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">

        <PageHeader
          title={warehouse ? `${warehouse.code} — ${warehouse.name}` : 'Warehouse'}
          description="Warehouse details and storage bins"
          breadcrumb={[
            { label: 'Warehouses', to: '/warehouse/warehouses' },
            { label: warehouse?.code ?? '…' },
          ]}
          primary={{
            label: 'Edit Warehouse',
            icon: Pencil,
            onClick: () => setWhDialogOpen(true),
            disabled: !warehouse,
          }}
        />

        {/* Header summary card */}
        {isLoading ? (
          <div className="rounded-[14px] border p-6 mb-6 animate-in delay-1"
            style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <TableSkeleton columns={4} rows={1} />
          </div>
        ) : warehouse ? (
          <div className="rounded-[14px] border p-6 mb-6 animate-in delay-1 grid grid-cols-2 md:grid-cols-4 gap-6"
            style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Code</div>
              <div className="font-mono font-medium text-[14px]">{warehouse.code}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Pallet Capacity</div>
              <div className="font-mono text-[14px]">
                {warehouse.pallet_capacity != null ? warehouse.pallet_capacity.toLocaleString() : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Default</div>
              <div className="text-[14px]">{warehouse.is_default ? 'Yes' : 'No'}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Active</div>
              <div className="text-[14px]">{warehouse.is_active ? 'Yes' : 'No'}</div>
            </div>
            {warehouse.notes && (
              <div className="col-span-2 md:col-span-4">
                <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Notes</div>
                <div className="text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>{warehouse.notes}</div>
              </div>
            )}
          </div>
        ) : null}

        {/* Bins table */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Bins</span>
            <div className="flex items-center gap-3">
              <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                {bins.length} total
              </span>
              <Button
                size="sm"
                onClick={() => {
                  setEditingBin(null)
                  setBinDialogOpen(true)
                }}
                disabled={!warehouseId}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Bin
              </Button>
            </div>
          </div>
          {binsLoading ? (
            <div className="p-6"><TableSkeleton columns={8} rows={6} /></div>
          ) : (
            <DataTable
              storageKey="warehouse-bins"
              columns={binColumns}
              data={bins}
              searchColumn="code"
              searchPlaceholder="Search bins..."
            />
          )}
        </div>

      </div>

      {warehouse && (
        <WarehouseDialog
          open={whDialogOpen}
          onOpenChange={setWhDialogOpen}
          warehouse={warehouse}
        />
      )}
      {warehouseId != null && (
        <BinDialog
          open={binDialogOpen}
          onOpenChange={setBinDialogOpen}
          warehouseId={warehouseId}
          bin={editingBin}
        />
      )}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Bin"
        description="Are you sure you want to delete this bin? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteBin.isPending}
      />
    </div>
  )
}
