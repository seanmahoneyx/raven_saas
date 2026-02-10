import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Users, MapPin, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
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
import { useVendors, useLocations, useDeleteVendor } from '@/api/parties'
import { VendorDialog } from '@/components/parties/VendorDialog'
import { LocationDialog } from '@/components/parties/LocationDialog'
import type { Vendor, Location } from '@/types/api'

type Tab = 'vendors' | 'locations'

export default function Vendors() {
  usePageTitle('Vendor Center')
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<Tab>('vendors')

  const [vendorDialogOpen, setVendorDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)

  const { data: vendorsData } = useVendors()
  const { data: locationsData } = useLocations()
  const deleteVendor = useDeleteVendor()

  const handleAddNew = () => {
    if (activeTab === 'vendors') {
      navigate('/vendors/new')
    } else {
      setEditingLocation(null)
      setLocationDialogOpen(true)
    }
  }

  const vendorColumns: ColumnDef<Vendor>[] = useMemo(
    () => [
      {
        accessorKey: 'party_display_name',
        header: 'Vendor',
        cell: ({ row }) => (
          <div>
            <span className="font-semibold text-foreground">{row.original.party_display_name}</span>
            <span className="ml-2 text-xs text-muted-foreground font-mono">{row.original.party_code}</span>
          </div>
        ),
      },
      {
        accessorKey: 'open_po_total',
        header: 'Open PO $',
        cell: ({ row }) => {
          const val = parseFloat(row.original.open_po_total || '0')
          return (
            <span className={`font-mono font-medium ${val > 0 ? 'text-blue-600' : 'text-muted-foreground'}`}>
              {val > 0 ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </span>
          )
        },
      },
      {
        accessorKey: 'open_po_count',
        header: 'Open POs',
        cell: ({ row }) => {
          const count = row.original.open_po_count
          return (
            <Badge variant={count > 0 ? 'default' : 'secondary'}>
              {count}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'next_incoming',
        header: 'Next Incoming',
        cell: ({ row }) => {
          const dateStr = row.original.next_incoming
          if (!dateStr) return <span className="text-muted-foreground">—</span>
          const date = new Date(dateStr + 'T00:00:00')
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          let colorClass = 'text-muted-foreground'
          if (diffDays <= 0) colorClass = 'text-red-600 font-medium'
          else if (diffDays <= 3) colorClass = 'text-amber-600 font-medium'
          else colorClass = 'text-foreground'
          return (
            <span className={colorClass}>
              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {diffDays <= 0 && <span className="ml-1 text-xs">(today)</span>}
              {diffDays === 1 && <span className="ml-1 text-xs">(tomorrow)</span>}
            </span>
          )
        },
      },
      {
        accessorKey: 'payment_terms',
        header: 'Terms',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.payment_terms || '—'}</span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const vendor = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingVendor(vendor)
                  setVendorDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this vendor?')) {
                      deleteVendor.mutate(vendor.id)
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
    [deleteVendor]
  )

  const locationColumns: ColumnDef<Location>[] = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('code')}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
      },
      {
        accessorKey: 'location_type',
        header: 'Type',
        cell: ({ row }) => (
          <Badge variant="outline">{row.getValue('location_type')}</Badge>
        ),
      },
      {
        accessorKey: 'city',
        header: 'City',
      },
      {
        accessorKey: 'state',
        header: 'State',
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
          const location = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingLocation(location)
                  setLocationDialogOpen(true)
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
    { id: 'vendors' as Tab, label: 'Vendors', icon: Users },
    { id: 'locations' as Tab, label: 'Locations', icon: MapPin },
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Vendor Center</h1>
          <p className="text-muted-foreground">
            Manage vendors and locations
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          {activeTab === 'vendors' ? 'Add Vendor' : 'Add Location'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle>
            {tabs.find((t) => t.id === activeTab)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeTab === 'vendors' && (
            <DataTable
              columns={vendorColumns}
              data={vendorsData?.results ?? []}
              searchColumn="party_display_name"
              searchPlaceholder="Search vendors..."
              onRowDoubleClick={(vendor) => navigate(`/vendors/${vendor.id}`)}
            />
          )}
          {activeTab === 'locations' && (
            <DataTable
              columns={locationColumns}
              data={locationsData?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search locations..."
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <VendorDialog
        open={vendorDialogOpen}
        onOpenChange={(open) => {
          setVendorDialogOpen(open)
          if (!open) setEditingVendor(null)
        }}
        vendor={editingVendor}
      />
      <LocationDialog
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
        location={editingLocation}
      />
    </div>
  )
}
