import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Building2, Users, Truck as TruckIcon, MapPin, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
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
import { useParties, useCustomers, useVendors, useTrucks, useLocations, useDeleteParty, useDeleteTruck, useDeleteCustomer, useDeleteVendor } from '@/api/parties'
import { PartyDialog } from '@/components/parties/PartyDialog'
import { TruckDialog } from '@/components/parties/TruckDialog'
import { CustomerDialog } from '@/components/parties/CustomerDialog'
import { VendorDialog } from '@/components/parties/VendorDialog'
import { LocationDialog } from '@/components/parties/LocationDialog'
import type { Party, Customer, Vendor, Truck, Location } from '@/types/api'

type Tab = 'parties' | 'customers' | 'vendors' | 'trucks' | 'locations'

export default function Parties() {
  usePageTitle('Parties')

  const [activeTab, setActiveTab] = useState<Tab>('parties')

  // Dialog states
  const [partyDialogOpen, setPartyDialogOpen] = useState(false)
  const [editingParty, setEditingParty] = useState<Party | null>(null)
  const [truckDialogOpen, setTruckDialogOpen] = useState(false)
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null)
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)

  const { data: partiesData } = useParties()
  const { data: customersData } = useCustomers()
  const { data: vendorsData } = useVendors()
  const { data: trucksData } = useTrucks()
  const { data: locationsData } = useLocations()

  const deleteParty = useDeleteParty()
  const deleteTruck = useDeleteTruck()
  const deleteCustomer = useDeleteCustomer()
  const deleteVendor = useDeleteVendor()

  const handleAddNew = () => {
    switch (activeTab) {
      case 'parties':
        setEditingParty(null)
        setPartyDialogOpen(true)
        break
      case 'customers':
        setEditingCustomer(null)
        setCustomerDialogOpen(true)
        break
      case 'vendors':
        setEditingVendor(null)
        setVendorDialogOpen(true)
        break
      case 'trucks':
        setEditingTruck(null)
        setTruckDialogOpen(true)
        break
      case 'locations':
        setEditingLocation(null)
        setLocationDialogOpen(true)
        break
    }
  }

  const partyColumns: ColumnDef<Party>[] = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('code')}</span>
        ),
      },
      {
        accessorKey: 'display_name',
        header: 'Name',
      },
      {
        accessorKey: 'party_type',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.getValue('party_type') as string
          return (
            <Badge variant="outline">
              {type}
            </Badge>
          )
        },
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
          const party = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingParty(party)
                  setPartyDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this party?')) {
                      deleteParty.mutate(party.id)
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
    [deleteParty]
  )

  const customerColumns: ColumnDef<Customer>[] = useMemo(
    () => [
      {
        accessorKey: 'party_code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('party_code')}</span>
        ),
      },
      {
        accessorKey: 'party_display_name',
        header: 'Name',
      },
      {
        accessorKey: 'payment_terms',
        header: 'Payment Terms',
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const customer = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingCustomer(customer)
                  setCustomerDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this customer?')) {
                      deleteCustomer.mutate(customer.id)
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
    [deleteCustomer]
  )

  const vendorColumns: ColumnDef<Vendor>[] = useMemo(
    () => [
      {
        accessorKey: 'party_code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('party_code')}</span>
        ),
      },
      {
        accessorKey: 'party_display_name',
        header: 'Name',
      },
      {
        accessorKey: 'payment_terms',
        header: 'Payment Terms',
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
    { id: 'parties' as Tab, label: 'All Parties', icon: Building2 },
    { id: 'customers' as Tab, label: 'Customers', icon: Users },
    { id: 'vendors' as Tab, label: 'Vendors', icon: Users },
    { id: 'trucks' as Tab, label: 'Trucks', icon: TruckIcon },
    { id: 'locations' as Tab, label: 'Locations', icon: MapPin },
  ]

  const getAddButtonLabel = () => {
    switch (activeTab) {
      case 'parties': return 'Add Party'
      case 'customers': return 'Add Customer'
      case 'vendors': return 'Add Vendor'
      case 'trucks': return 'Add Truck'
      case 'locations': return 'Add Location'
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Parties</h1>
          <p className="text-muted-foreground">
            Manage customers, vendors, trucks, and locations
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          {getAddButtonLabel()}
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
          {activeTab === 'parties' && (
            <DataTable
              columns={partyColumns}
              data={partiesData?.results ?? []}
              searchColumn="display_name"
              searchPlaceholder="Search parties..."
            />
          )}
          {activeTab === 'customers' && (
            <DataTable
              columns={customerColumns}
              data={customersData?.results ?? []}
              searchColumn="party_display_name"
              searchPlaceholder="Search customers..."
            />
          )}
          {activeTab === 'vendors' && (
            <DataTable
              columns={vendorColumns}
              data={vendorsData?.results ?? []}
              searchColumn="party_display_name"
              searchPlaceholder="Search vendors..."
            />
          )}
          {activeTab === 'trucks' && (
            <DataTable
              columns={truckColumns}
              data={trucksData?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search trucks..."
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
      <PartyDialog
        open={partyDialogOpen}
        onOpenChange={setPartyDialogOpen}
        party={editingParty}
      />
      <TruckDialog
        open={truckDialogOpen}
        onOpenChange={setTruckDialogOpen}
        truck={editingTruck}
      />
      <CustomerDialog
        open={customerDialogOpen}
        onOpenChange={(open) => {
          setCustomerDialogOpen(open)
          if (!open) setEditingCustomer(null)
        }}
        customer={editingCustomer}
      />
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
