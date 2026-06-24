import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { useWarehouses, useDeleteWarehouse } from '@/api/warehouse'
import type { Warehouse } from '@/api/warehouse'
import { toastApiError } from '@/lib/errors'
import { PageHeader } from '@/components/page'
import { WarehouseDialog } from './WarehouseDialog'

export default function Warehouses() {
  usePageTitle('Warehouses')

  const navigate = useNavigate()
  const { data, isLoading } = useWarehouses()
  const deleteWarehouse = useDeleteWarehouse()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteWarehouse.mutateAsync(pendingDeleteId)
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    } catch (error) {
      toastApiError(error, 'Failed to delete warehouse')
    }
  }

  const columns: ColumnDef<Warehouse>[] = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-mono font-medium text-[13px]">{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium text-[13px]">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'pallet_capacity',
        header: 'Pallet Capacity',
        cell: ({ row }) => {
          const cap = row.original.pallet_capacity
          return cap != null ? (
            <span className="font-mono text-[13px]">{cap.toLocaleString()}</span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'bin_count',
        header: 'Bins',
        cell: ({ row }) => {
          const count = row.original.bin_count ?? 0
          return (
            <span className="font-mono text-[13px]" style={{ color: count > 0 ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
              {count}
            </span>
          )
        },
      },
      {
        accessorKey: 'is_default',
        header: 'Default',
        cell: ({ row }) =>
          row.original.is_default ? (
            <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--so-success, #4a905c)' }} />
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          ),
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
          const warehouse = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(warehouse)
                    setDialogOpen(true)
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPendingDeleteId(warehouse.id)
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

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">

        <PageHeader
          title="Warehouses"
          description="Manage warehouses and storage bins"
          primary={{
            label: 'Add Warehouse',
            icon: Plus,
            onClick: () => {
              setEditing(null)
              setDialogOpen(true)
            },
          }}
        />

        <div className="rounded-[14px] border overflow-hidden animate-in delay-2"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Warehouses</span>
            <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {data?.results?.length ?? 0} total
            </span>
          </div>
          {isLoading ? (
            <div className="p-6"><TableSkeleton columns={6} rows={8} /></div>
          ) : (
            <DataTable
              storageKey="warehouses"
              columns={columns}
              data={data?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search warehouses..."
              onRowClick={(w) => navigate(`/warehouse/warehouses/${w.id}`)}
            />
          )}
        </div>

      </div>

      <WarehouseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        warehouse={editing}
      />
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Warehouse"
        description="Are you sure you want to delete this warehouse? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteWarehouse.isPending}
      />
    </div>
  )
}
