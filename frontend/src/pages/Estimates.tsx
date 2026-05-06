import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Pencil, Trash2, Send, ArrowRightLeft, FileText, AlertTriangle, FileDown, Printer, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEstimates, useDeleteEstimate, useSendEstimate, useConvertEstimate } from '@/api/estimates'
import type { Estimate, EstimateStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { useSettings } from '@/api/settings'
import { ReportFilterModal, type ReportFilterConfig, type ReportFilterResult } from '@/components/common/ReportFilterModal'

import { getStatusBadge } from '@/components/ui/StatusBadge'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MobileCardList } from '@/components/ui/MobileCardList'
import { EstimateCard } from '@/components/estimates/EstimateCard'
import { TableColumnPicker, useTableColumnVisibility } from '@/components/ui/data-table-column-picker'
import { PageHeader, KpiGrid, KpiCard } from '@/components/page'

export default function Estimates() {
  usePageTitle('Estimates')
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [mobileSearch, setMobileSearch] = useState('')
  const [mobileSortKey, setMobileSortKey] = useState('estimate_number')
  const [mobileSortDir, setMobileSortDir] = useState<'asc' | 'desc'>('desc')

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [pendingConvertId, setPendingConvertId] = useState<number | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: estimatesData } = useEstimates()
  const { data: settings } = useSettings()
  const { visibility: estimatesVisibility, setVisibility: setEstimatesVisibility, toggle: toggleEstimateColumn, reset: resetEstimateColumns } = useTableColumnVisibility('estimates')
  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [exportFilterOpen, setExportFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)

  const reportFilterConfig: ReportFilterConfig = {
    title: 'Estimates List',
    columns: [
      { key: 'estimate_number', header: 'Estimate #' },
      { key: 'customer_name', header: 'Customer' },
      { key: 'date', header: 'Date' },
      { key: 'expiration_date', header: 'Expires' },
      { key: 'status', header: 'Status' },
      { key: 'num_lines', header: 'Lines' },
      { key: 'total_amount', header: 'Total' },
    ],
    rowFilters: [
      {
        key: 'status',
        label: 'Status',
        options: ['draft', 'sent', 'accepted', 'rejected', 'converted', 'cancelled'].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
      },
    ],
  }

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setTimeout(() => window.print(), 100)
  }

  const handleFilteredExport = (filters: ReportFilterResult) => {
    let rows = filteredEstimates
    if (filters.rowFilters.status && filters.rowFilters.status !== 'all') {
      rows = rows.filter(r => r.status === filters.rowFilters.status)
    }
    if (filters.dateFrom) {
      rows = rows.filter(r => r.date >= filters.dateFrom)
    }
    if (filters.dateTo) {
      rows = rows.filter(r => r.date <= filters.dateTo)
    }
    if (rows.length === 0) return

    const allCols = reportFilterConfig.columns
    const cols = allCols.filter(c => filters.visibleColumns.includes(c.key))
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const csv = [cols.map(c => esc(c.header)).join(','), ...rows.map(r => cols.map(c => esc((r as unknown as Record<string, unknown>)[c.key])).join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `estimates-${new Date().toISOString().split('T')[0]}.csv`; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const deleteEstimate = useDeleteEstimate()
  const sendEstimate = useSendEstimate()
  const convertEstimate = useConvertEstimate()

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteEstimate.mutateAsync(pendingDeleteId)
      toast.success('Estimate deleted successfully')
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    } catch (error) {
      toast.error('Failed to delete estimate')
    }
  }

  const handleConfirmConvert = async () => {
    if (!pendingConvertId) return
    try {
      await convertEstimate.mutateAsync(pendingConvertId)
      toast.success('Estimate converted to Sales Order')
      setConvertDialogOpen(false)
      setPendingConvertId(null)
    } catch (error) {
      toast.error('Failed to convert estimate')
    }
  }

  const columns: ColumnDef<Estimate>[] = useMemo(
    () => [
      {
        accessorKey: 'estimate_number',
        header: 'Estimate #',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('estimate_number')}</span>
        ),
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => format(new Date(row.getValue('date')), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'expiration_date',
        header: 'Expires',
        cell: ({ row }) => {
          const date = row.getValue('expiration_date') as string | null
          const estimate = row.original
          if (!date) return <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
          return (
            <span className={estimate.is_expired ? 'flex items-center gap-1' : ''}
              style={estimate.is_expired ? { color: 'var(--so-danger-text)' } : undefined}>
              {estimate.is_expired && <AlertTriangle className="h-3 w-3" />}
              {format(new Date(date), 'MMM d, yyyy')}
            </span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as EstimateStatus),
      },
      {
        accessorKey: 'num_lines',
        header: 'Lines',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-tertiary)' }}>{row.getValue('num_lines')}</span>
        ),
      },
      {
        accessorKey: 'total_amount',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-medium">
            ${parseFloat(row.getValue('total_amount')).toFixed(2)}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const est = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/estimates/${est.id}`)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {est.status === 'draft' && (
                  <DropdownMenuItem onClick={() => {
                    sendEstimate.mutate({ id: est.id })
                    toast.success('Estimate sent to customer')
                  }}>
                    <Send className="mr-2 h-4 w-4" />
                    Send to Customer
                  </DropdownMenuItem>
                )}
                {(est.status === 'accepted' || est.status === 'draft' || est.status === 'sent') && (
                  <DropdownMenuItem onClick={() => {
                    setPendingConvertId(est.id)
                    setConvertDialogOpen(true)
                  }}>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Convert to Sales Order
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => window.open(`/api/v1/estimates/${est.id}/pdf/`, '_blank')}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Download PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setPendingDeleteId(est.id)
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
    [deleteEstimate, sendEstimate, convertEstimate]
  )

  const estimates = estimatesData?.results ?? []

  const customerOptions = useMemo(() => {
    const names = new Set(estimates.map(e => e.customer_name).filter(Boolean))
    return Array.from(names).sort()
  }, [estimates])

  const filteredEstimates = useMemo(() => {
    return estimates.filter(est => {
      if (searchTerm && !est.estimate_number.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (selectedCustomer !== 'all' && est.customer_name !== selectedCustomer) {
        return false
      }
      if (selectedStatus !== 'all' && est.status !== selectedStatus) {
        return false
      }
      if (dateFrom && est.date < dateFrom) {
        return false
      }
      if (dateTo && est.date > dateTo) {
        return false
      }
      return true
    })
  }, [estimates, searchTerm, selectedCustomer, selectedStatus, dateFrom, dateTo])

  const printFilteredEstimates = useMemo(() => {
    let rows = estimates
    if (printFilters) {
      if (printFilters.rowFilters.status && printFilters.rowFilters.status !== 'all') {
        rows = rows.filter(r => r.status === printFilters.rowFilters.status)
      }
      // Apply date filter
      if (printFilters.dateFrom) {
        rows = rows.filter(r => r.date >= printFilters.dateFrom)
      }
      if (printFilters.dateTo) {
        rows = rows.filter(r => r.date <= printFilters.dateTo)
      }
    }
    return rows
  }, [estimates, printFilters])

  const mobileEstimates = useMemo(() => {
    let rows = filteredEstimates
    if (mobileSearch.trim()) {
      const q = mobileSearch.toLowerCase()
      rows = rows.filter(e =>
        e.estimate_number?.toLowerCase().includes(q) ||
        e.customer_name?.toLowerCase().includes(q)
      )
    }
    return [...rows].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (mobileSortKey === 'estimate_number') {
        av = a.estimate_number ?? ''; bv = b.estimate_number ?? ''
      } else if (mobileSortKey === 'customer_name') {
        av = a.customer_name ?? ''; bv = b.customer_name ?? ''
      } else if (mobileSortKey === 'total_amount') {
        av = parseFloat(a.total_amount || '0'); bv = parseFloat(b.total_amount || '0')
      } else if (mobileSortKey === 'date') {
        av = a.date ?? ''; bv = b.date ?? ''
      }
      if (av < bv) return mobileSortDir === 'asc' ? -1 : 1
      if (av > bv) return mobileSortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredEstimates, mobileSearch, mobileSortKey, mobileSortDir])

  const kpiStats = [
    { label: 'Draft',     value: estimates.filter((e) => e.status === 'draft').length,     status: 'draft' },
    { label: 'Sent',      value: estimates.filter((e) => e.status === 'sent').length,      status: 'sent' },
    { label: 'Accepted',  value: estimates.filter((e) => e.status === 'accepted').length,  status: 'accepted' },
    { label: 'Rejected',  value: estimates.filter((e) => e.status === 'rejected').length,  status: 'rejected' },
    { label: 'Converted', value: estimates.filter((e) => e.status === 'converted').length, status: 'converted' },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16" data-print-hide>

        <PageHeader
          title="Estimates"
          description="Create and manage customer estimates and quotes"
          primary={{ label: 'New Estimate', icon: Plus, onClick: () => navigate('/estimates/new') }}
          actions={[
            { label: 'Export CSV', icon: Download, onClick: () => setExportFilterOpen(true) },
            { label: 'Print', icon: Printer, onClick: () => setPrintFilterOpen(true) },
          ]}
        />

        <div className="mb-6 animate-in delay-1">
          <KpiGrid columns={5}>
            {kpiStats.map((stat) => (
              <KpiCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                hint={getStatusBadge(stat.status)}
              />
            ))}
          </KpiGrid>
        </div>

        {/* Filters */}
        <div className="mb-5 animate-in delay-2">
          <div className="py-3">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Search Estimate #</label>
                <Input
                  placeholder="Search estimate number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Customer</label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All customers</SelectItem>
                    {customerOptions.map(customer => (
                      <SelectItem key={customer} value={customer}>
                        {customer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {['draft', 'sent', 'accepted', 'rejected', 'converted', 'cancelled'].map(status => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>From Date</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>To Date</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Estimates Table / Mobile Cards */}
        {isMobile ? (
          <MobileCardList
            data={mobileEstimates}
            renderCard={(estimate) => <EstimateCard estimate={estimate} />}
            searchValue={mobileSearch}
            onSearchChange={setMobileSearch}
            searchPlaceholder="Search estimates..."
            sortOptions={[
              { label: 'Estimate #', key: 'estimate_number' },
              { label: 'Customer', key: 'customer_name' },
              { label: 'Total', key: 'total_amount' },
              { label: 'Date', key: 'date' },
            ]}
            currentSort={mobileSortKey}
            onSortChange={setMobileSortKey}
            sortDirection={mobileSortDir}
            onSortDirectionChange={() => setMobileSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            resultCount={mobileEstimates.length}
            onItemClick={(estimate) => navigate(`/estimates/${estimate.id}`)}
            emptyMessage="No estimates found."
          />
        ) : (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-3"
            style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="flex items-center justify-between px-6 py-3"
              style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
                Estimates
              </span>
              <div className="flex items-center gap-3">
                <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                  {filteredEstimates.length} of {estimates.length}
                </span>
                <TableColumnPicker
                  columns={columns}
                  visibility={estimatesVisibility}
                  onToggle={toggleEstimateColumn}
                  onReset={resetEstimateColumns}
                />
              </div>
            </div>
            <DataTable
              storageKey="estimates"
              columns={columns}
              data={filteredEstimates}
              onRowClick={(estimate) => navigate(`/estimates/${estimate.id}`)}
              hideToolbar
              embedded
              userToggledColumns={estimatesVisibility}
              onUserToggledColumnsChange={setEstimatesVisibility}
            />
          </div>
        )}

      </div>

      {/* Print-only estimates list */}
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
              Estimates List
            </div>
            <div style={{ fontSize: '10pt', color: '#555', marginTop: '4px' }}>
              {printFilters?.dateRangeLabel || `January 1, ${new Date().getFullYear()} \u2013 ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
            </div>
            <div style={{ fontSize: '9pt', color: '#555', marginTop: '4px', padding: '2px 10px', border: '1px solid #999', display: 'inline-block' }}>
              {printFilteredEstimates.length} estimates
            </div>
          </div>
        </div>

        {/* Estimates Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr>
              {[
                { key: 'estimate_number', label: 'Estimate #' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'date', label: 'Date' },
                { key: 'expiration_date', label: 'Expires' },
                { key: 'status', label: 'Status' },
                { key: 'num_lines', label: 'Lines' },
                { key: 'total_amount', label: 'Total' },
              ].filter(h => !printFilters || printFilters.visibleColumns.includes(h.key)).map((h) => (
                <th key={h.label} style={{ padding: '5px 6px', border: '1px solid #ccc', background: '#f5f5f5', fontWeight: 600, textAlign: h.label === 'Total' ? 'right' : 'left' }}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printFilteredEstimates.map((e) => {
              const showCol = (key: string) => !printFilters || printFilters.visibleColumns.includes(key)
              return (
                <tr key={e.id}>
                  {showCol('estimate_number') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', fontFamily: 'monospace', fontSize: '8pt' }}>{e.estimate_number}</td>}
                  {showCol('customer_name') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{e.customer_name}</td>}
                  {showCol('date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>}
                  {showCol('expiration_date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{e.expiration_date ? new Date(e.expiration_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014'}</td>}
                  {showCol('status') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', textTransform: 'capitalize' }}>{e.status}</td>}
                  {showCol('num_lines') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{e.num_lines}</td>}
                  {showCol('total_amount') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace' }}>
                    ${parseFloat(e.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

      {/* Dialogs */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Estimate"
        description="Are you sure you want to delete this estimate? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteEstimate.isPending}
      />
      <ConfirmDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        title="Convert to Sales Order"
        description="Convert this estimate to a Sales Order? This action cannot be undone."
        confirmLabel="Convert"
        variant="default"
        onConfirm={handleConfirmConvert}
        loading={convertEstimate.isPending}
      />
    </div>
  )
}
