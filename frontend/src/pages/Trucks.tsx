import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Truck as TruckIcon, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
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
import { useTrucks, useDeleteTruck } from '@/api/parties'
import { TruckDialog } from '@/components/parties/TruckDialog'
import type { Truck } from '@/types/api'

export default function Trucks() {
  usePageTitle('Trucks')

  const [truckDialogOpen, setTruckDialogOpen] = useState(false)
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null)

  const { data: trucksData } = useTrucks()
  const deleteTruck = useDeleteTruck()

  const truckColumns: ColumnDef<Truck>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('name')}</span>
        ),
      },
      {
        accessorKey: 'license_plate',
        header: 'License Plate',
      },
      {
        accessorKey: 'capacity_pallets',
        header: 'Capacity (Pallets)',
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.getValue('is_active') ? 'success' : 'secondary'}>
            {row.getValue('is_active') ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const truck = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
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
                    if (confirm('Are you sure you want to delete this truck?')) {
                      deleteTruck.mutate(truck.id)
                    }
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Trucks</h1>
          <p className="text-muted-foreground">
            Manage trucks and fleet
          </p>
        </div>
        <Button onClick={() => {
          setEditingTruck(null)
          setTruckDialogOpen(true)
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Truck
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TruckIcon className="h-5 w-5" />
            Trucks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={truckColumns}
            data={trucksData?.results ?? []}
            searchColumn="name"
            searchPlaceholder="Search trucks..."
          />
        </CardContent>
      </Card>

      <TruckDialog
        open={truckDialogOpen}
        onOpenChange={setTruckDialogOpen}
        truck={editingTruck}
      />
    </div>
  )
}
