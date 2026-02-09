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
import { useCustomers, useLocations, useDeleteCustomer } from '@/api/parties'
import { CustomerDialog } from '@/components/parties/CustomerDialog'
import { LocationDialog } from '@/components/parties/LocationDialog'
import type { Customer, Location } from '@/types/api'

type Tab = 'customers' | 'locations'

export default function Customers() {
  usePageTitle('Customer Center')
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<Tab>('customers')

  const [customerDialogOpen, setCustomerDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)

  const { data: customersData } = useCustomers()
  const { data: locationsData } = useLocations()
  const deleteCustomer = useDeleteCustomer()

  const handleAddNew = () => {
    if (activeTab === 'customers') {
      navigate('/customers/new')
    } else {
      setEditingLocation(null)
      setLocationDialogOpen(true)
    }
  }

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
    { id: 'customers' as Tab, label: 'Customers', icon: Users },
    { id: 'locations' as Tab, label: 'Locations', icon: MapPin },
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Customer Center</h1>
          <p className="text-muted-foreground">
            Manage customers and locations
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          {activeTab === 'customers' ? 'Add Customer' : 'Add Location'}
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
          {activeTab === 'customers' && (
            <DataTable
              columns={customerColumns}
              data={customersData?.results ?? []}
              searchColumn="party_display_name"
              searchPlaceholder="Search customers..."
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
      <CustomerDialog
        open={customerDialogOpen}
        onOpenChange={(open) => {
          setCustomerDialogOpen(open)
          if (!open) setEditingCustomer(null)
        }}
        customer={editingCustomer}
      />
      <LocationDialog
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
        location={editingLocation}
      />
    </div>
  )
}
