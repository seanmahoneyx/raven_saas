import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Users, MapPin, MoreHorizontal, Pencil, Trash2, Paperclip, Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { useVendors, useLocations, useDeleteVendor } from '@/api/parties'
import { useSettings } from '@/api/settings'
import { ReportFilterModal, type ReportFilterConfig, type ReportFilterResult } from '@/components/common/ReportFilterModal'
import { VendorDialog } from '@/components/parties/VendorDialog'
import { LocationDialog } from '@/components/parties/LocationDialog'
import type { Vendor, Location } from '@/types/api'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

type Tab = 'vendors' | 'locations'

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

const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

export default function Vendors() {
  usePageTitle('Vendor Center')
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<Tab>('vendors')

  const [vendorDialogOpen, setVendorDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const { data: settings } = useSettings()

  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [exportFilterOpen, setExportFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)

  const { data: vendorsData, isLoading: vendorsLoading } = useVendors()
  const { data: locationsData, isLoading: locationsLoading } = useLocations()
  const deleteVendor = useDeleteVendor()

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteVendor.mutateAsync(pendingDeleteId)
      toast.success('Vendor deleted successfully')
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    } catch (error) {
      toast.error('Failed to delete vendor')
    }
  }

  const handleAddNew = () => {
    if (activeTab === 'vendors') {
      navigate('/vendors/new')
    } else {
      setEditingLocation(null)
      setLocationDialogOpen(true)
    }
  }

  const reportFilterConfig: ReportFilterConfig = {
    title: 'Vendor List',
    columns: [
      { key: 'party_display_name', header: 'Vendor Name' },
      { key: 'party_code', header: 'Code' },
      { key: 'vendor_type', header: 'Vendor Type' },
      { key: 'payment_terms', header: 'Payment Terms' },
      { key: 'buyer_name', header: 'Buyer' },
      { key: 'open_po_total', header: 'Open PO Total' },
      { key: 'open_balance', header: 'Open Balance' },
    ],
    rowFilters: [
      {
        key: 'vendor_type',
        label: 'Vendor Type',
        options: Array.from(new Set((vendorsData?.results ?? []).map(v => v.vendor_type).filter(Boolean))).sort().map(t => ({ value: t!, label: t! })),
      },
    ],
  }

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setTimeout(() => window.print(), 100)
  }

  const handleFilteredExport = (filters: ReportFilterResult) => {
    let rows = vendorsData?.results ?? []
    if (rows.length === 0) return

    if (filters.rowFilters.vendor_type && filters.rowFilters.vendor_type !== 'all') {
      rows = rows.filter(r => r.vendor_type === filters.rowFilters.vendor_type)
    }

    const allCols = [
      { key: 'party_display_name', header: 'Vendor Name' },
      { key: 'party_code', header: 'Code' },
      { key: 'vendor_type', header: 'Vendor Type' },
      { key: 'payment_terms', header: 'Payment Terms' },
      { key: 'buyer_name', header: 'Buyer' },
      { key: 'open_po_total', header: 'Open PO Total' },
      { key: 'open_balance', header: 'Open Balance' },
    ]
    const cols = allCols.filter(c => filters.visibleColumns.includes(c.key))

    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const csv = [cols.map(c => esc(c.header)).join(','), ...rows.map(r => cols.map(c => esc((r as Record<string, unknown>)[c.key])).join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'vendors.csv'; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const vendorColumns: ColumnDef<Vendor>[] = useMemo(
    () => [
      {
        accessorKey: 'party_display_name',
        header: 'Vendor',
        cell: ({ row }) => (
          <div>
            <span className="font-semibold" style={{ color: 'var(--so-text-primary)' }}>{row.original.party_display_name}</span>
            <span className="ml-2 text-xs font-mono" style={{ color: 'var(--so-text-tertiary)' }}>{row.original.party_code}</span>
          </div>
        ),
      },
      {
        accessorKey: 'open_po_total',
        header: 'Open PO $',
        cell: ({ row }) => {
          const val = parseFloat(row.original.open_po_total || '0')
          return (
            <span
              className="font-mono font-medium"
              style={{ color: val > 0 ? 'var(--so-accent)' : 'var(--so-text-tertiary)' }}
            >
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
        accessorKey: 'next_incoming',
        header: 'Next Incoming',
        cell: ({ row }) => {
          const dateStr = row.original.next_incoming
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
        accessorKey: 'buyer_name',
        header: 'Buyer',
        cell: ({ row }) => (
          <span className="text-sm" style={{ color: row.original.buyer_name ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
            {row.original.buyer_name || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'vendor_type',
        header: 'Type',
        cell: ({ row }) => {
          const t = row.original.vendor_type
          if (!t) return <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          return (
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
              style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border)', color: 'var(--so-text-secondary)' }}
            >
              {t}
            </span>
          )
        },
      },
      {
        accessorKey: 'open_balance',
        header: 'Open Balance',
        cell: ({ row }) => {
          const val = parseFloat(row.original.open_balance || '0')
          return (
            <span
              className="font-mono font-medium"
              style={{ color: val > 0 ? 'var(--so-danger-text)' : 'var(--so-text-tertiary)' }}
            >
              {val > 0 ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </span>
          )
        },
      },
      {
        accessorKey: 'has_attachments',
        header: '',
        cell: ({ row }) => row.original.has_attachments ? (
          <Paperclip className="h-3.5 w-3.5" style={{ color: 'var(--so-text-tertiary)' }} />
        ) : null,
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
                    setPendingDeleteId(vendor.id)
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
    [deleteVendor]
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
    { id: 'vendors' as Tab, label: 'Vendors', icon: Users },
    { id: 'locations' as Tab, label: 'Locations', icon: MapPin },
  ]

  const activeCount = activeTab === 'vendors'
    ? (vendorsData?.results ?? []).length
    : (locationsData?.results ?? []).length

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Vendor Center</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Manage vendors and locations</p>
          </div>
          <div className="flex items-center gap-2">
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleAddNew}>
              <Plus className="h-3.5 w-3.5" />
              {activeTab === 'vendors' ? 'Add Vendor' : 'Add Location'}
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
            <span className="flex items-center gap-2 text-sm font-semibold">
              {tabs.find((t) => t.id === activeTab)?.label}
              {activeTab === 'vendors' && (
                <>
                  <button
                    onClick={() => setPrintFilterOpen(true)}
                    title="Print vendor list"
                    className="inline-flex items-center opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--so-text-tertiary)' }}
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setExportFilterOpen(true)}
                    title="Export CSV"
                    className="inline-flex items-center opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--so-text-tertiary)' }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </span>
            <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {activeCount} total
            </span>
          </div>
          <div className="p-0">
            {activeTab === 'vendors' && (
              vendorsLoading ? (
                <div className="p-6"><TableSkeleton columns={6} rows={8} /></div>
              ) : (
                <DataTable
                  storageKey="vendors"
                  columns={vendorColumns}
                  data={vendorsData?.results ?? []}
                  searchColumn="party_display_name"
                  searchPlaceholder="Search vendors..."
                  showSearchDropdown
                  searchDropdownLabel={(row) => (row as Vendor).party_display_name}
                  searchDropdownSublabel={(row) => (row as Vendor).party_code}
                  onRowClick={(vendor) => navigate(`/vendors/${vendor.id}`)}
                />
              )
            )}
            {activeTab === 'locations' && (
              locationsLoading ? (
                <div className="p-6"><TableSkeleton columns={6} rows={8} /></div>
              ) : (
                <DataTable
                  storageKey="vendor-locations"
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
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Vendor"
        description="Are you sure you want to delete this vendor? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteVendor.isPending}
      />
    </div>
  )
}
