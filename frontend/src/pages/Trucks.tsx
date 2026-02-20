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

const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

const getStatusBadge = (active: boolean) => {
  const c = active
    ? { bg: 'var(--so-success-bg)', border: 'transparent', text: 'var(--so-success-text)' }
    : { bg: 'var(--so-border-light)', border: 'transparent', text: 'var(--so-text-tertiary)' }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

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
        cell: ({ row }) => getStatusBadge(row.getValue('is_active') as boolean),
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
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Trucks</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Manage trucks and fleet</p>
          </div>
          <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => {
            setEditingTruck(null)
            setTruckDialogOpen(true)
          }}>
            <Plus className="h-3.5 w-3.5" /> Add Truck
          </button>
        </div>

        {/* KPI Summary */}
        <div className="rounded-[14px] border overflow-hidden mb-5 animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="grid grid-cols-3">
            {summaryKPIs.map((kpi, idx) => (
              <div key={idx} className="px-5 py-4" style={{ borderRight: idx < 2 ? '1px solid var(--so-border-light)' : 'none' }}>
                <div className="text-[11px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>{kpi.label}</div>
                <div className="text-xl font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>{kpi.value}</div>
              </div>
            ))}
          </div>
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
