import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Pencil, Trash2, Paperclip, Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { useCustomers, useDeleteCustomer } from '@/api/parties'
import { CustomerDialog } from '@/components/parties/CustomerDialog'
import type { Customer } from '@/types/api'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { useSettings } from '@/api/settings'
import { ReportFilterModal, type ReportFilterConfig, type ReportFilterResult } from '@/components/common/ReportFilterModal'

const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

export default function Customers() {
  usePageTitle('Customer Center')
  const navigate = useNavigate()

  const [customerDialogOpen, setCustomerDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const { data: customersData, isLoading: customersLoading } = useCustomers()
  const deleteCustomer = useDeleteCustomer()
  const { data: settings } = useSettings()

  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [exportFilterOpen, setExportFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)

  const reportFilterConfig: ReportFilterConfig = {
    title: 'Customer List',
    columns: [
      { key: 'party_display_name', header: 'Customer Name' },
      { key: 'party_code', header: 'Code' },
      { key: 'customer_type', header: 'Customer Type' },
      { key: 'payment_terms', header: 'Payment Terms' },
      { key: 'sales_rep_name', header: 'Sales Rep' },
      { key: 'csr_name', header: 'CSR' },
      { key: 'open_sales_total', header: 'Open Sales' },
      { key: 'open_balance', header: 'Open Balance' },
    ],
    rowFilters: [
      {
        key: 'customer_type',
        label: 'Customer Type',
        options: Array.from(new Set((customersData?.results ?? []).map(c => c.customer_type).filter(Boolean))).sort().map(t => ({ value: t!, label: t! })),
      },
    ],
  }

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setTimeout(() => window.print(), 100)
  }

  const handleFilteredExport = (filters: ReportFilterResult) => {
    let rows = customersData?.results ?? []
    if (rows.length === 0) return

    // Apply row filters
    if (filters.rowFilters.customer_type && filters.rowFilters.customer_type !== 'all') {
      rows = rows.filter(r => r.customer_type === filters.rowFilters.customer_type)
    }

    const allCols = [
      { key: 'party_display_name', header: 'Customer Name' },
      { key: 'party_code', header: 'Code' },
      { key: 'customer_type', header: 'Customer Type' },
      { key: 'payment_terms', header: 'Payment Terms' },
      { key: 'sales_rep_name', header: 'Sales Rep' },
      { key: 'csr_name', header: 'CSR' },
      { key: 'open_sales_total', header: 'Open Sales Total' },
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
    a.href = url; a.download = 'customers.csv'; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

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
    navigate('/customers/new')
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
        accessorKey: 'sales_rep_name',
        header: 'Sales Rep',
        cell: ({ row }) => (
          <span className="text-sm" style={{ color: row.original.sales_rep_name ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
            {row.original.sales_rep_name || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'csr_name',
        header: 'CSR',
        cell: ({ row }) => (
          <span className="text-sm" style={{ color: row.original.csr_name ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
            {row.original.csr_name || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'customer_type',
        header: 'Type',
        cell: ({ row }) => {
          const t = row.original.customer_type
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

  const customerCount = (customersData?.results ?? []).length

  const printFilteredCustomers = useMemo(() => {
    let rows = customersData?.results ?? []
    if (printFilters) {
      if (printFilters.rowFilters.customer_type && printFilters.rowFilters.customer_type !== 'all') {
        rows = rows.filter(r => r.customer_type === printFilters.rowFilters.customer_type)
      }
    }
    return rows
  }, [customersData, printFilters])

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Customer Center</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Manage customers</p>
          </div>
          <div className="flex items-center gap-2">
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleAddNew}>
              <Plus className="h-3.5 w-3.5" />
              Add Customer
            </button>
          </div>
        </div>

        {/* DataTable card */}
        <div
          className="rounded-[14px] border overflow-hidden animate-in delay-1"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
        >
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--so-border-light)' }}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              Customers
              <button
                onClick={() => setPrintFilterOpen(true)}
                title="Print customer list"
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
            </span>
            <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {customerCount} total
            </span>
          </div>
          <div className="p-0">
            {customersLoading ? (
              <div className="p-6"><TableSkeleton columns={11} rows={8} /></div>
            ) : (
              <DataTable
                storageKey="customers"
                columns={customerColumns}
                data={customersData?.results ?? []}
                searchColumn="party_display_name"
                searchPlaceholder="Search customers..."
                showSearchDropdown
                searchDropdownLabel={(row) => (row as Customer).party_display_name}
                searchDropdownSublabel={(row) => (row as Customer).party_code}
                onRowClick={(customer) => navigate(`/customers/${customer.id}`)}
              />
            )}
          </div>
        </div>

      </div>

      {/* Print-only customer list */}
      <div className="print-only" style={{ color: 'black' }}>
        {/* Letterhead */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '16px', borderBottom: '3px solid #333' }}>
          <div>
            <div style={{ fontSize: '22pt', fontWeight: 700, letterSpacing: '-0.5px' }}>
              {settings?.company_name || 'Company'}
            </div>
            {settings?.company_address && (
              <div style={{ fontSize: '9pt', color: '#555', whiteSpace: 'pre-line', marginTop: '4px' }}>
                {settings.company_address}
              </div>
            )}
            {(settings?.company_phone || settings?.company_email) && (
              <div style={{ fontSize: '9pt', color: '#555', marginTop: '2px' }}>
                {[settings?.company_phone, settings?.company_email].filter(Boolean).join(' | ')}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>
              Customer List
            </div>
            <div style={{ fontSize: '10pt', color: '#555', marginTop: '4px' }}>
              {printFilters?.dateRangeLabel || `January 1, ${new Date().getFullYear()} \u2013 ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
            </div>
            <div style={{ fontSize: '9pt', color: '#555', marginTop: '4px', padding: '2px 10px', border: '1px solid #999', display: 'inline-block' }}>
              {printFilteredCustomers.length} customers
            </div>
          </div>
        </div>

        {/* Customer Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr>
              {[
                { key: 'party_display_name', label: 'Customer' },
                { key: 'party_code', label: 'Code' },
                { key: 'customer_type', label: 'Type' },
                { key: 'payment_terms', label: 'Terms' },
                { key: 'sales_rep_name', label: 'Sales Rep' },
                { key: 'csr_name', label: 'CSR' },
                { key: 'open_sales_total', label: 'Open Sales' },
                { key: 'open_balance', label: 'Open Balance' },
              ].filter(h => !printFilters || printFilters.visibleColumns.includes(h.key)).map((h) => (
                <th key={h.label} style={{ padding: '5px 6px', border: '1px solid #ccc', background: '#f5f5f5', fontWeight: 600, textAlign: ['Open Sales', 'Open Balance'].includes(h.label) ? 'right' : 'left' }}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printFilteredCustomers.map((c) => {
              const sales = parseFloat(c.open_sales_total || '0')
              const balance = parseFloat(c.open_balance || '0')
              const showCol = (key: string) => !printFilters || printFilters.visibleColumns.includes(key)
              return (
                <tr key={c.id}>
                  {showCol('party_display_name') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{c.party_display_name}</td>}
                  {showCol('party_code') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', fontFamily: 'monospace', fontSize: '8pt' }}>{c.party_code}</td>}
                  {showCol('customer_type') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{c.customer_type || '\u2014'}</td>}
                  {showCol('payment_terms') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{c.payment_terms || '\u2014'}</td>}
                  {showCol('sales_rep_name') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{c.sales_rep_name || '\u2014'}</td>}
                  {showCol('csr_name') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{c.csr_name || '\u2014'}</td>}
                  {showCol('open_sales_total') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace' }}>
                    {sales > 0 ? `$${sales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '\u2014'}
                  </td>}
                  {showCol('open_balance') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace' }}>
                    {balance > 0 ? `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '\u2014'}
                  </td>}
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ marginTop: '40px', paddingTop: '12px', borderTop: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#999' }}>
          <span>Printed {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
          <span>{settings?.company_name || ''}</span>
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
      <ReportFilterModal
        open={printFilterOpen}
        onOpenChange={setPrintFilterOpen}
        config={reportFilterConfig}
        mode="print"
        onConfirm={handleFilteredPrint}
      />
      <ReportFilterModal
        open={exportFilterOpen}
        onOpenChange={setExportFilterOpen}
        config={reportFilterConfig}
        mode="export"
        onConfirm={handleFilteredExport}
      />
    </div>
  )
}
