import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Users, MapPin, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/ui/export-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { useCustomers, useLocations, useDeleteCustomer } from '@/api/parties'
import { CustomerDialog } from '@/components/parties/CustomerDialog'
import { LocationDialog } from '@/components/parties/LocationDialog'
import type { Customer, Location } from '@/types/api'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

type Tab = 'customers' | 'locations'

export default function Customers() {
  usePageTitle('Customer Center')
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<Tab>('customers')

  const [customerDialogOpen, setCustomerDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const { data: customersData, isLoading: customersLoading } = useCustomers()
  const { data: locationsData, isLoading: locationsLoading } = useLocations()
  const deleteCustomer = useDeleteCustomer()

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteCustomer.mutateAsync(pendingDeleteId)
      toast.success('Customer deleted successfully')
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    } catch (error) {
      toast.error('Failed to delete customer')
    }
  }

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
        accessorKey: 'party_display_name',
        header: 'Customer',
        cell: ({ row }) => (
          <div>
            <span className="font-semibold text-foreground">{row.original.party_display_name}</span>
            <span className="ml-2 text-xs text-muted-foreground font-mono">{row.original.party_code}</span>
          </div>
        ),
      },
      {
        accessorKey: 'open_sales_total',
        header: 'Open Sales $',
        cell: ({ row }) => {
          const val = parseFloat(row.original.open_sales_total || '0')
          return (
            <span className={`font-mono font-medium ${val > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
              {val > 0 ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </span>
          )
        },
      },
      {
        accessorKey: 'open_order_count',
        header: 'Open Orders',
        cell: ({ row }) => {
          const count = row.original.open_order_count
          return (
            <Badge variant={count > 0 ? 'default' : 'secondary'}>
              {count}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'next_expected_delivery',
        header: 'Next Delivery',
        cell: ({ row }) => {
          const dateStr = row.original.next_expected_delivery
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
                    setPendingDeleteId(customer.id)
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
        <div className="flex items-center gap-2">
          {activeTab === 'customers' && (
            <ExportButton
              data={customersData?.results ?? []}
              filename="customers"
              columns={[
                { key: 'party_display_name', header: 'Customer Name' },
                { key: 'payment_terms', header: 'Payment Terms' },
                { key: 'open_sales_total', header: 'Open Sales Total' },
                { key: 'open_order_count', header: 'Open Orders' },
              ]}
            />
          )}
          <Button onClick={handleAddNew}>
            <Plus className="h-4 w-4 mr-2" />
            {activeTab === 'customers' ? 'Add Customer' : 'Add Location'}
          </Button>
        </div>
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
            customersLoading ? (
              <TableSkeleton columns={6} rows={8} />
            ) : (
              <DataTable
                columns={customerColumns}
                data={customersData?.results ?? []}
                searchColumn="party_display_name"
                searchPlaceholder="Search customers..."
                showSearchDropdown
                searchDropdownLabel={(row) => (row as Customer).party_display_name}
                searchDropdownSublabel={(row) => (row as Customer).party_code}
                onRowClick={(customer) => navigate(`/customers/${customer.id}`)}
              />
            )
          )}
          {activeTab === 'locations' && (
            locationsLoading ? (
              <TableSkeleton columns={6} rows={8} />
            ) : (
              <DataTable
                columns={locationColumns}
                data={locationsData?.results ?? []}
                searchColumn="name"
                searchPlaceholder="Search locations..."
                onRowClick={(location) => {
                  setEditingLocation(location)
                  setLocationDialogOpen(true)
                }}
              />
            )
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

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Customer"
        description="Are you sure you want to delete this customer? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteCustomer.isPending}
      />
    </div>
  )
}
