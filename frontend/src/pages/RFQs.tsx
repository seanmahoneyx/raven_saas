import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Trash2, FileText, Printer, Download } from 'lucide-react'
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
import { useRFQs, useDeleteRFQ } from '@/api/rfqs'
import type { RFQ, RFQStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { useSettings } from '@/api/settings'
import { ReportFilterModal, type ReportFilterConfig, type ReportFilterResult } from '@/components/common/ReportFilterModal'

import { getStatusBadge } from '@/components/ui/StatusBadge'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

export default function RFQs() {
  usePageTitle('RFQs')
  const navigate = useNavigate()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingRFQ, setDeletingRFQ] = useState<RFQ | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedVendor, setSelectedVendor] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: rfqsData } = useRFQs()
  const deleteRFQ = useDeleteRFQ()
  const { data: settingsData } = useSettings()
  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [exportFilterOpen, setExportFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)

  const handleDeleteClick = (rfq: RFQ) => {
    setDeletingRFQ(rfq)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingRFQ) return
    try {
      await deleteRFQ.mutateAsync(deletingRFQ.id)
      toast.success('RFQ deleted successfully')
      setDeleteDialogOpen(false)
      setDeletingRFQ(null)
    } catch (error) {
      console.error('Failed to delete RFQ:', error)
      toast.error('Failed to delete RFQ')
    }
  }

  const columns: ColumnDef<RFQ>[] = useMemo(
    () => [
      {
        accessorKey: 'rfq_number',
        header: 'RFQ #',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('rfq_number')}</span>
        ),
      },
      {
        accessorKey: 'vendor_name',
        header: 'Vendor',
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => format(new Date(row.getValue('date')), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'expected_date',
        header: 'Expected Date',
        cell: ({ row }) => {
          const date = row.getValue('expected_date') as string | null
          if (!date) return <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
          return format(new Date(date), 'MMM d, yyyy')
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as RFQStatus),
      },
      {
        accessorKey: 'num_lines',
        header: 'Lines',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-tertiary)' }}>{row.getValue('num_lines')}</span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const rfq = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/rfqs/${rfq.id}`)}>
                  <FileText className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => handleDeleteClick(rfq)}
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
    [navigate]
  )

  const rfqs = rfqsData?.results ?? []

  const vendorOptions = useMemo(() => {
    const names = new Set(rfqs.map(r => r.vendor_name).filter(Boolean))
    return Array.from(names).sort()
  }, [rfqs])

  const filteredRFQs = useMemo(() => {
    return rfqs.filter(rfq => {
      if (searchTerm && !rfq.rfq_number.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (selectedVendor !== 'all' && rfq.vendor_name !== selectedVendor) {
        return false
      }
      if (selectedStatus !== 'all' && rfq.status !== selectedStatus) {
        return false
      }
      if (dateFrom && rfq.date < dateFrom) {
        return false
      }
      if (dateTo && rfq.date > dateTo) {
        return false
      }
      return true
    })
  }, [rfqs, searchTerm, selectedVendor, selectedStatus, dateFrom, dateTo])

  const kpiStats = [
    { label: 'Draft',     value: rfqs.filter((r) => r.status === 'draft').length,     status: 'draft' },
    { label: 'Sent',      value: rfqs.filter((r) => r.status === 'sent').length,      status: 'sent' },
    { label: 'Received',  value: rfqs.filter((r) => r.status === 'received').length,  status: 'received' },
    { label: 'Converted', value: rfqs.filter((r) => r.status === 'converted').length, status: 'converted' },
    { label: 'Cancelled', value: rfqs.filter((r) => r.status === 'cancelled').length, status: 'cancelled' },
  ]

  const reportFilterConfig: ReportFilterConfig = {
    title: 'RFQ List',
    columns: [
      { key: 'rfq_number', header: 'RFQ #' },
      { key: 'vendor_name', header: 'Vendor' },
      { key: 'date', header: 'Date' },
      { key: 'expected_date', header: 'Due' },
      { key: 'status', header: 'Status' },
      { key: 'num_lines', header: 'Lines' },
    ],
    rowFilters: [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'draft', label: 'Draft' },
          { value: 'sent', label: 'Sent' },
          { value: 'received', label: 'Received' },
          { value: 'cancelled', label: 'Closed' },
        ],
      },
    ],
  }

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setTimeout(() => window.print(), 100)
  }

  const handleFilteredExport = (filters: ReportFilterResult) => {
    let rows = rfqs
    if (filters.rowFilters.status && filters.rowFilters.status !== 'all') {
      rows = rows.filter(r => r.status === filters.rowFilters.status)
    }
    if (rows.length === 0) return

    const allCols = reportFilterConfig.columns
    const cols = allCols.filter(c => filters.visibleColumns.includes(c.key))
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const csv = [cols.map(c => esc(c.header)).join(','), ...rows.map(r => cols.map(c => esc((r as Record<string, unknown>)[c.key])).join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `rfqs-${new Date().toISOString().split('T')[0]}.csv`; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printFilteredData = useMemo(() => {
    let rows = rfqs
    if (printFilters) {
      if (printFilters.rowFilters.status && printFilters.rowFilters.status !== 'all') {
        rows = rows.filter(r => r.status === printFilters.rowFilters.status)
      }
    }
    return rows
  }, [rfqs, printFilters])

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>RFQs</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              Create and manage requests for quotation
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => navigate('/rfqs/new')}>
              <Plus className="h-4 w-4" />
              Create RFQ
            </button>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setExportFilterOpen(true)} title="Export CSV">
              <Download className="h-4 w-4" />
            </button>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setPrintFilterOpen(true)} title="Print">
              <Printer className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* KPI Summary */}
        <div className="rounded-[14px] border mb-6 animate-in delay-1"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="grid grid-cols-5 divide-x" style={{ borderColor: 'var(--so-border)' }}>
            {kpiStats.map((stat) => (
              <div key={stat.label} className="px-6 py-5">
                <div className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>{stat.value}</div>
                <div className="mt-1">{getStatusBadge(stat.status)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 animate-in delay-2">
          <div className="py-3">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Search RFQ #</label>
                <Input
                  placeholder="Search RFQ number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Vendor</label>
                <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All vendors</SelectItem>
                    {vendorOptions.map(vendor => (
                      <SelectItem key={vendor} value={vendor}>
                        {vendor}
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
                    {['draft', 'sent', 'received', 'cancelled'].map(status => (
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

        {/* RFQs Table */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-3"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
              RFQs
            </span>
            <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {filteredRFQs.length} of {rfqs.length}
            </span>
          </div>
          <DataTable
            storageKey="rfqs"
            columns={columns}
            data={filteredRFQs}
            onRowClick={(rfq) => navigate(`/rfqs/${rfq.id}`)}
          />
        </div>

      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete RFQ"
        description={`Are you sure you want to delete RFQ ${deletingRFQ?.rfq_number}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteRFQ.isPending}
      />

      {/* Print-only section */}
      <div className="print-only" style={{ color: 'black' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '16px', borderBottom: '3px solid #333' }}>
          <div>
            <div style={{ fontSize: '22pt', fontWeight: 700, letterSpacing: '-0.5px' }}>{settingsData?.company_name || 'Company'}</div>
            {settingsData?.company_address && <div style={{ fontSize: '9pt', color: '#555', whiteSpace: 'pre-line', marginTop: '4px' }}>{settingsData.company_address}</div>}
            {(settingsData?.company_phone || settingsData?.company_email) && (
              <div style={{ fontSize: '9pt', color: '#555', marginTop: '2px' }}>{[settingsData?.company_phone, settingsData?.company_email].filter(Boolean).join(' | ')}</div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>RFQ List</div>
            <div style={{ fontSize: '10pt', color: '#555', marginTop: '4px' }}>{printFilters?.dateRangeLabel || ''}</div>
            <div style={{ fontSize: '9pt', color: '#555', marginTop: '4px', padding: '2px 10px', border: '1px solid #999', display: 'inline-block' }}>{printFilteredData.length} RFQs</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr>
              {[
                { key: 'rfq_number', label: 'RFQ #' },
                { key: 'vendor_name', label: 'Vendor' },
                { key: 'date', label: 'Date' },
                { key: 'expected_date', label: 'Due' },
                { key: 'status', label: 'Status' },
                { key: 'num_lines', label: 'Lines' },
              ].filter(h => !printFilters || printFilters.visibleColumns.includes(h.key)).map(h => (
                <th key={h.key} style={{ padding: '5px 6px', border: '1px solid #ccc', background: '#f5f5f5', fontWeight: 600, textAlign: 'left' }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printFilteredData.map(row => {
              const showCol = (key: string) => !printFilters || printFilters.visibleColumns.includes(key)
              return (
                <tr key={row.id}>
                  {showCol('rfq_number') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', fontFamily: 'monospace' }}>{row.rfq_number}</td>}
                  {showCol('vendor_name') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.vendor_name}</td>}
                  {showCol('date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.date}</td>}
                  {showCol('expected_date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.expected_date || '\u2014'}</td>}
                  {showCol('status') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.status}</td>}
                  {showCol('num_lines') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.num_lines}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ marginTop: '40px', paddingTop: '12px', borderTop: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#999' }}>
          <span>Printed {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
          <span>{settingsData?.company_name || ''}</span>
        </div>
      </div>

      <ReportFilterModal open={printFilterOpen} onOpenChange={setPrintFilterOpen} config={reportFilterConfig} mode="print" onConfirm={handleFilteredPrint} />
      <ReportFilterModal open={exportFilterOpen} onOpenChange={setExportFilterOpen} config={reportFilterConfig} mode="export" onConfirm={handleFilteredExport} />
    </div>
  )
}
