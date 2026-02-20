import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Users, MapPin, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/ui/export-button'
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

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    active:   { bg: 'var(--so-success-bg)', border: 'transparent', text: 'var(--so-success-text)' },
    inactive: { bg: 'var(--so-danger-bg)',  border: 'transparent', text: 'var(--so-danger-text)' },
  }
  const c = configs[status] || configs.active
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status}
    </span>
  )
}

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

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
            <span className="font-semibold" style={{ color: 'var(--so-text-primary)' }}>{row.original.party_display_name}</span>
            <span className="ml-2 text-xs font-mono" style={{ color: 'var(--so-text-tertiary)' }}>{row.original.party_code}</span>
          </div>
        ),
      },
      {
        accessorKey: 'open_sales_total',
        header: 'Open Sales $',
        cell: ({ row }) => {
          const val = parseFloat(row.original.open_sales_total || '0')
          return (
            <span
              className="font-mono font-medium"
              style={{ color: val > 0 ? 'var(--so-success-text)' : 'var(--so-text-tertiary)' }}
            >
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
          return count > 0 ? (
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold"
              style={{ background: 'var(--so-accent-muted)', color: 'var(--so-accent)' }}
            >
              {count}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>0</span>
          )
        },
      },
      {
        accessorKey: 'next_expected_delivery',
        header: 'Next Delivery',
        cell: ({ row }) => {
          const dateStr = row.original.next_expected_delivery
          if (!dateStr) return <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          const date = new Date(dateStr + 'T00:00:00')
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          let color = 'var(--so-text-tertiary)'
          if (diffDays <= 0) color = 'var(--so-danger-text)'
          else if (diffDays <= 3) color = '#d97706'
          else color = 'var(--so-text-primary)'
          return (
            <span className={diffDays <= 3 ? 'font-medium' : ''} style={{ color }}>
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
          <span className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>{row.original.payment_terms || '—'}</span>
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
          <span className="font-medium font-mono text-sm" style={{ color: 'var(--so-text-primary)' }}>{row.getValue('code')}</span>
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
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
            style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border)', color: 'var(--so-text-secondary)' }}
          >
            {row.getValue('location_type')}
          </span>
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
        cell: ({ row }) => getStatusBadge(row.getValue('is_active') ? 'active' : 'inactive'),
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

  const activeCount = activeTab === 'customers'
    ? (customersData?.results ?? []).length
    : (locationsData?.results ?? []).length

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Customer Center</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Manage customers and locations</p>
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
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleAddNew}>
              <Plus className="h-3.5 w-3.5" />
              {activeTab === 'customers' ? 'Add Customer' : 'Add Location'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 animate-in delay-1" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors cursor-pointer"
              style={{
                borderColor: activeTab === tab.id ? 'var(--so-accent)' : 'transparent',
                color: activeTab === tab.id ? 'var(--so-accent)' : 'var(--so-text-tertiary)',
                background: 'transparent',
              }}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* DataTable card */}
        <div
          className="rounded-[14px] border overflow-hidden animate-in delay-2"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
        >
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--so-border-light)' }}
          >
            <span className="text-sm font-semibold">
              {tabs.find((t) => t.id === activeTab)?.label}
            </span>
            <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {activeCount} total
            </span>
          </div>
          <div className="p-0">
            {activeTab === 'customers' && (
              customersLoading ? (
                <div className="p-6"><TableSkeleton columns={6} rows={8} /></div>
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
                <div className="p-6"><TableSkeleton columns={6} rows={8} /></div>
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
          </div>
        </div>

      </div>

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
