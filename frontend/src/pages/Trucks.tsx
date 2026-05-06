import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Truck as TruckIcon, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTrucks, useDeleteTruck } from '@/api/parties'
import { TruckDialog } from '@/components/parties/TruckDialog'
import type { Truck } from '@/types/api'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { PageHeader, KpiGrid, KpiCard } from '@/components/page'

export default function Trucks() {
  usePageTitle('Trucks')

  const [truckDialogOpen, setTruckDialogOpen] = useState(false)
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const { data: trucksData } = useTrucks()
  const deleteTruck = useDeleteTruck()

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteTruck.mutateAsync(pendingDeleteId)
      toast.success('Truck deleted successfully')
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    } catch (error) {
      toast.error('Failed to delete truck')
    }
  }

  const truckColumns: ColumnDef<Truck>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('name')}</span>
        ),
      },
      { accessorKey: 'license_plate', header: 'License Plate' },
      { accessorKey: 'capacity_pallets', header: 'Capacity (Pallets)' },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => getStatusBadge((row.getValue('is_active') as boolean) ? 'active' : 'inactive'),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const truck = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center justify-center h-8 w-8 rounded-md cursor-pointer"
                  style={{ color: 'var(--so-text-tertiary)' }}>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingTruck(truck)
                  setTruckDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setPendingDeleteId(truck.id)
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
    [deleteTruck]
  )

  const totalTrucks = trucksData?.results.length ?? 0
  const activeTrucks = trucksData?.results.filter((t) => t.is_active).length ?? 0

  const summaryKPIs = [
    { label: 'Total Trucks', value: totalTrucks },
    { label: 'Active', value: activeTrucks },
    { label: 'Inactive', value: totalTrucks - activeTrucks },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">
        {/* Header */}
        <PageHeader
          title="Trucks"
          description="Manage trucks and fleet"
          primary={{ label: 'Add Truck', icon: Plus, onClick: () => { setEditingTruck(null); setTruckDialogOpen(true) } }}
        />

        <div className="mb-5 animate-in delay-1">
          <KpiGrid columns={3}>
            {summaryKPIs.map((kpi, idx) => (
              <KpiCard key={idx} label={kpi.label} value={<span className="font-mono">{kpi.value}</span>} />
            ))}
          </KpiGrid>
        </div>

        {/* Content */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <TruckIcon className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
            <span className="text-sm font-semibold">Trucks</span>
          </div>
          <div className="px-6 py-5">
            <DataTable
              columns={truckColumns}
              data={trucksData?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search trucks..."
              storageKey="trucks"
            />
          </div>
        </div>

        <TruckDialog
          open={truckDialogOpen}
          onOpenChange={setTruckDialogOpen}
          truck={editingTruck}
        />

        <ConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Delete Truck"
          description="Are you sure you want to delete this truck? This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={handleConfirmDelete}
          loading={deleteTruck.isPending}
        />
      </div>
    </div>
  )
}
