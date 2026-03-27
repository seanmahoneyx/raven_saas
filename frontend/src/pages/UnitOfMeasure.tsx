import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { useUnitsOfMeasure } from '@/api/items'
import { UOMDialog } from '@/components/items/UOMDialog'
import type { UnitOfMeasure } from '@/types/api'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

export default function UnitOfMeasurePage() {
  usePageTitle('Units of Measure')

  const [uomDialogOpen, setUomDialogOpen] = useState(false)
  const [editingUOM, setEditingUOM] = useState<UnitOfMeasure | null>(null)

  const { data: uomData, isLoading: uomLoading } = useUnitsOfMeasure()

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

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Units of Measure</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              Manage units of measure for items
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => {
              setEditingUOM(null)
              setUomDialogOpen(true)
            }}>
              <Plus className="h-4 w-4" />
              Add UOM
            </button>
          </div>
        </div>

        {/* UOM DataTable */}
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
              storageKey="uom"
              columns={uomColumns}
              data={uomData?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search units of measure..."
            />
          )}
        </div>

      </div>

      {/* Dialog */}
      <UOMDialog
        open={uomDialogOpen}
        onOpenChange={setUomDialogOpen}
        uom={editingUOM}
      />
    </div>
  )
}
