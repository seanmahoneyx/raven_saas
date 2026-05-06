import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, FileSpreadsheet, Printer, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable } from '@/components/ui/data-table'
import { useJournalEntries } from '@/api/accounting'
import { useSettings } from '@/api/settings'
import type { JournalEntry } from '@/types/api'
import { ReportFilterModal, type ReportFilterConfig, type ReportFilterResult } from '@/components/common/ReportFilterModal'


import { formatCurrency } from '@/lib/format'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

export default function JournalEntries() {
  usePageTitle('Journal Entries')
  const navigate = useNavigate()

  const { data: entriesData, isLoading } = useJournalEntries()
  const { data: settingsData } = useSettings()
  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [exportFilterOpen, setExportFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const entries = entriesData?.results ?? []

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      if (searchTerm && !entry.memo.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (selectedStatus !== 'all' && entry.status !== selectedStatus) {
        return false
      }
      if (selectedType !== 'all' && entry.entry_type !== selectedType) {
        return false
      }
      if (dateFrom && entry.date < dateFrom) {
        return false
      }
      if (dateTo && entry.date > dateTo) {
        return false
      }
      return true
    })
  }, [entries, searchTerm, selectedStatus, selectedType, dateFrom, dateTo])

  const columns: ColumnDef<JournalEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'entry_number',
        header: 'Entry #',
        cell: ({ row }) => (
          <span className="font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>{row.getValue('entry_number')}</span>
        ),
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => {
          const date = row.getValue('date') as string
          return <span style={{ color: 'var(--so-text-secondary)' }}>{new Date(date + 'T00:00:00').toLocaleDateString()}</span>
        },
      },
      {
        accessorKey: 'memo',
        header: 'Memo',
        cell: ({ row }) => {
          const memo = row.getValue('memo') as string
          return <span style={{ color: 'var(--so-text-secondary)' }}>{memo.length > 60 ? memo.substring(0, 60) + '...' : memo}</span>
        },
      },
      {
        accessorKey: 'entry_type',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.getValue('entry_type') as string
          return <span style={{ color: 'var(--so-text-secondary)' }}>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
        },
      },
      {
        accessorKey: 'total_debit',
        header: 'Debit',
        cell: ({ row }) => (
          <div className="text-right font-medium" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(row.getValue('total_debit'))}</div>
        ),
      },
      {
        accessorKey: 'total_credit',
        header: 'Credit',
        cell: ({ row }) => (
          <div className="text-right font-medium" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(row.getValue('total_credit'))}</div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as string
          return getStatusBadge(status)
        },
      },
    ],
    []
  )

  const reportFilterConfig: ReportFilterConfig = {
    title: 'Journal Entries',
    columns: [
      { key: 'entry_number', header: 'Entry #' },
      { key: 'date', header: 'Date' },
      { key: 'memo', header: 'Description' },
      { key: 'status', header: 'Status' },
      { key: 'total_debit', header: 'Debits' },
      { key: 'total_credit', header: 'Credits' },
    ],
    rowFilters: [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'draft', label: 'Draft' },
          { value: 'posted', label: 'Posted' },
        ],
      },
    ],
  }

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setTimeout(() => window.print(), 100)
  }

  const handleFilteredExport = (filters: ReportFilterResult) => {
    let rows = entries
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
    const csv = [cols.map(c => esc(c.header)).join(','), ...rows.map(r => cols.map(c => esc((r as unknown as Record<string, unknown>)[c.key])).join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `journal-entries-${new Date().toISOString().split('T')[0]}.csv`; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printFilteredData = useMemo(() => {
    let rows = entries
    if (printFilters) {
      if (printFilters.rowFilters.status && printFilters.rowFilters.status !== 'all') {
        rows = rows.filter(r => r.status === printFilters.rowFilters.status)
      }
    }
    return rows
  }, [entries, printFilters])

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16" data-print-hide>

        {/* Header */}
        <div className="flex items-start justify-between mb-8 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Journal Entries</h1>
            <p className="mt-1 text-[13.5px]" style={{ color: 'var(--so-text-muted)' }}>
              View and manage general ledger entries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => navigate('/journal-entries/new')}>
              <Plus className="h-4 w-4" />
              New Entry
            </button>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setExportFilterOpen(true)} title="Export CSV">
              <Download className="h-4 w-4" />
            </button>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setPrintFilterOpen(true)} title="Print">
              <Printer className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 animate-in delay-2">
          <div className="py-3">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Search Memo</label>
                <Input
                  placeholder="Search memo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="posted">Posted</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Type</label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="adjusting">Adjusting</SelectItem>
                    <SelectItem value="closing">Closing</SelectItem>
                    <SelectItem value="reversing">Reversing</SelectItem>
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

        {/* Table Card */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" style={{ color: 'var(--so-text-muted)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>All Journal Entries</span>
            </div>
            <span className="text-[12px]" style={{ color: 'var(--so-text-muted)' }}>
              {filteredEntries.length} of {entries.length}
            </span>
          </div>
          {isLoading ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--so-text-muted)' }}>Loading...</div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredEntries}
              storageKey="journal-entries"
              onRowClick={(row) => navigate(`/journal-entries/${row.id}`)}
            />
          )}
        </div>

      </div>

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
            <div style={{ fontSize: '18pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>Journal Entries</div>
            <div style={{ fontSize: '10pt', color: '#555', marginTop: '4px' }}>{printFilters?.dateRangeLabel || ''}</div>
            <div style={{ fontSize: '9pt', color: '#555', marginTop: '4px', padding: '2px 10px', border: '1px solid #999', display: 'inline-block' }}>{printFilteredData.length} entries</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr>
              {[
                { key: 'entry_number', label: 'Entry #' },
                { key: 'date', label: 'Date' },
                { key: 'memo', label: 'Description' },
                { key: 'status', label: 'Status' },
                { key: 'total_debit', label: 'Debits' },
                { key: 'total_credit', label: 'Credits' },
              ].filter(h => !printFilters || printFilters.visibleColumns.includes(h.key)).map(h => (
                <th key={h.key} style={{ padding: '5px 6px', border: '1px solid #ccc', background: '#f5f5f5', fontWeight: 600, textAlign: ['total_debit', 'total_credit'].includes(h.key) ? 'right' : 'left' }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printFilteredData.map(row => {
              const showCol = (key: string) => !printFilters || printFilters.visibleColumns.includes(key)
              return (
                <tr key={row.id}>
                  {showCol('entry_number') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', fontFamily: 'monospace' }}>{row.entry_number}</td>}
                  {showCol('date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.date}</td>}
                  {showCol('memo') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.memo}</td>}
                  {showCol('status') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.status}</td>}
                  {showCol('total_debit') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.total_debit)}</td>}
                  {showCol('total_credit') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(row.total_credit)}</td>}
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
