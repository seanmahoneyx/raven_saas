import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Building2, Users, Truck as TruckIcon, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { useParties, useCustomers, useVendors, useTrucks, useLocations } from '@/api/parties'
import type { Party, Customer, Vendor, Truck, Location } from '@/types/api'

type Tab = 'parties' | 'customers' | 'vendors' | 'trucks' | 'locations'

export default function Parties() {
  const [activeTab, setActiveTab] = useState<Tab>('parties')

  const { data: partiesData } = useParties()
  const { data: customersData } = useCustomers()
  const { data: vendorsData } = useVendors()
  const { data: trucksData } = useTrucks()
  const { data: locationsData } = useLocations()

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
    ],
    []
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
    ],
    []
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
    ],
    []
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
    ],
    []
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Parties</h1>
          <p className="text-muted-foreground">
            Manage customers, vendors, trucks, and locations
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add New
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
    </div>
  )
}
