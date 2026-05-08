import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, DollarSign, Printer, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable } from '@/components/ui/data-table'
import { useCostLists } from '@/api/costLists'
import { useSettings } from '@/api/settings'
import type { CostListHead } from '@/types/api'
import { ReportFilterModal, type ReportFilterConfig, type ReportFilterResult } from '@/components/common/ReportFilterModal'

import { getStatusBadge } from '@/components/ui/StatusBadge'
import { PageHeader } from '@/components/page'

export default function CostLists() {
  usePageTitle('Cost Lists')
  const navigate = useNavigate()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedVendor, setSelectedVendor] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: costListsData, isLoading } = useCostLists()
  const { data: settingsData } = useSettings()
  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [exportFilterOpen, setExportFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)

  const allCostLists = costListsData?.results ?? []
  const activeCount = allCostLists.filter((c) => c.is_active).length
  const inactiveCount = allCostLists.filter((c) => !c.is_active).length

  const vendorOptions = useMemo(() => {
    const names = new Set(allCostLists.map(c => c.vendor_name).filter(Boolean))
    return Array.from(names).sort()
  }, [allCostLists])

  const filteredCostLists = useMemo(() => {
    return allCostLists.filter(c => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        const matchesVendor = c.vendor_name?.toLowerCase().includes(q)
        const matchesSku = c.item_sku?.toLowerCase().includes(q)
        const matchesName = c.item_name?.toLowerCase().includes(q)
        if (!matchesVendor && !matchesSku && !matchesName) return false
      }
      if (selectedVendor !== 'all' && c.vendor_name !== selectedVendor) return false
      if (selectedStatus !== 'all') {
        const isActive = selectedStatus === 'active'
        if (c.is_active !== isActive) return false
      }
      if (dateFrom && c.begin_date < dateFrom) return false
      if (dateTo && c.begin_date > dateTo) return false
      return true
    })
  }, [allCostLists, searchTerm, selectedVendor, selectedStatus, dateFrom, dateTo])

  const columns: ColumnDef<CostListHead>[] = useMemo(
    () => [
      {
        accessorKey: 'vendor_name',
        header: 'Vendor',
        cell: ({ row }) => (
          <div>
            <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>
              {row.original.vendor_name}
            </span>
            <span className="text-xs font-mono ml-2" style={{ color: 'var(--so-text-tertiary)' }}>
              {row.original.vendor_code}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'item_sku',
        header: 'Item',
        cell: ({ row }) => (
          <div>
            <span className="font-mono text-sm" style={{ color: 'var(--so-text-primary)' }}>
              {row.original.item_sku}
            </span>
            <span className="text-sm ml-2" style={{ color: 'var(--so-text-secondary)' }}>
              {row.original.item_name}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'begin_date',
        header: 'Begin Date',
        cell: ({ row }) => {
          const date = row.getValue('begin_date') as string
          return (
            <span style={{ color: 'var(--so-text-secondary)' }}>
              {date ? new Date(date + 'T00:00:00').toLocaleDateString() : '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'end_date',
        header: 'End Date',
        cell: ({ row }) => {
          const date = row.getValue('end_date') as string | null
          return (
            <span style={{ color: date ? 'var(--so-text-secondary)' : 'var(--so-text-tertiary)' }}>
              {date ? new Date(date + 'T00:00:00').toLocaleDateString() : 'Ongoing'}
            </span>
          )
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('is_active') ? 'active' : 'inactive'),
      },
    ],
    []
  )

  const reportFilterConfig: ReportFilterConfig = {
    title: 'Cost Lists',
    columns: [
      { key: 'vendor_name', header: 'Name' },
      { key: 'item_sku', header: 'Type' },
      { key: 'begin_date', header: 'Effective' },
      { key: 'end_date', header: 'Expires' },
      { key: 'is_active', header: 'Active' },
    ],
  }

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setTimeout(() => window.print(), 100)
  }

  const handleFilteredExport = (filters: ReportFilterResult) => {
    const rows = allCostLists
    if (rows.length === 0) return

    const allCols = reportFilterConfig.columns
    const cols = allCols.filter(c => filters.visibleColumns.includes(c.key))
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const csv = [cols.map(c => esc(c.header)).join(','), ...rows.map(r => cols.map(c => {
      const key = c.key
      if (key === 'is_active') return esc((r as any).is_active ? 'Yes' : 'No')
      return esc((r as unknown as Record<string, unknown>)[key])
    }).join(','))].join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `cost-lists-${new Date().toISOString().split('T')[0]}.csv`; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printFilteredData = allCostLists

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16" data-print-hide>

        {/* Header */}
        <PageHeader
          title="Cost Lists"
          description="Manage vendor costs with quantity break tiers"
          primary={{ label: 'New Cost List', icon: Plus, onClick: () => navigate('/cost-lists/new') }}
          actions={[
            { label: 'Export CSV', icon: Download, onClick: () => setExportFilterOpen(true) },
            { label: 'Print', icon: Printer, onClick: () => setPrintFilterOpen(true) },
          ]}
        />

        {/* KPI Summary Cards */}
        <div className="rounded-[14px] mb-6 overflow-hidden animate-in delay-1"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Total Cost Lists
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>
                {allCostLists.length}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Active
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-success-text)' }}>
                {activeCount}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Inactive
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-danger-text)' }}>
                {inactiveCount}
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 animate-in delay-2">
          <div className="py-3">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Search</label>
                <Input
                  placeholder="Vendor, item SKU or name..."
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
                      <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
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
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
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

        {/* DataTable Card */}
        <div className="rounded-[14px] overflow-hidden animate-in delay-3"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="px-6 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>All Cost Lists</span>
            </div>
            <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {filteredCostLists.length} of {allCostLists.length}
            </span>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
            ) : (
              <DataTable
                columns={columns}
                data={filteredCostLists}
                storageKey="cost-lists"
                onRowClick={(row) => navigate(`/cost-lists/${row.id}`)}
              />
            )}
          </div>
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
            <div style={{ fontSize: '18pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>Cost Lists</div>
            <div style={{ fontSize: '10pt', color: '#555', marginTop: '4px' }}>{printFilters?.dateRangeLabel || ''}</div>
            <div style={{ fontSize: '9pt', color: '#555', marginTop: '4px', padding: '2px 10px', border: '1px solid #999', display: 'inline-block' }}>{printFilteredData.length} cost lists</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr>
              {[
                { key: 'vendor_name', label: 'Name' },
                { key: 'item_sku', label: 'Type' },
                { key: 'begin_date', label: 'Effective' },
                { key: 'end_date', label: 'Expires' },
                { key: 'is_active', label: 'Active' },
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
                  {showCol('vendor_name') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.vendor_name}</td>}
                  {showCol('item_sku') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.item_sku} {row.item_name}</td>}
                  {showCol('begin_date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.begin_date ? new Date(row.begin_date + 'T00:00:00').toLocaleDateString() : '—'}</td>}
                  {showCol('end_date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.end_date ? new Date(row.end_date + 'T00:00:00').toLocaleDateString() : 'Ongoing'}</td>}
                  {showCol('is_active') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.is_active ? 'Yes' : 'No'}</td>}
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
