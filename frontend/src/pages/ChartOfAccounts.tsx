import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { BookUser, Printer, Download } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { useAccounts } from '@/api/accounting'
import { useSettings } from '@/api/settings'
import type { GLAccount, GLAccountType } from '@/types/api'
import { ReportFilterModal, type ReportFilterConfig, type ReportFilterResult } from '@/components/common/ReportFilterModal'
import React from 'react'
import { outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'

const accountTypeLabels: Record<GLAccountType, string> = {
  ASSET_CURRENT: 'Current Asset',
  ASSET_FIXED: 'Fixed Asset',
  ASSET_OTHER: 'Other Asset',
  CONTRA_ASSET: 'Contra Asset',
  LIABILITY_CURRENT: 'Current Liability',
  LIABILITY_LONG_TERM: 'Long-Term Liability',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  REVENUE_OTHER: 'Other Income',
  CONTRA_REVENUE: 'Contra Revenue',
  EXPENSE_COGS: 'COGS',
  EXPENSE_OPERATING: 'Operating Expense',
  EXPENSE_OTHER: 'Other Expense',
}

const getAccountTypeBadge = (accountType: GLAccountType) => {
  let bg: string, border: string, text: string
  if (accountType.startsWith('ASSET')) {
    bg = 'var(--so-info-bg)'; border = 'transparent'; text = 'var(--so-info-text)'
  } else if (accountType.startsWith('LIABILITY')) {
    bg = 'var(--so-warning-bg)'; border = 'var(--so-warning-border)'; text = 'var(--so-warning-text)'
  } else if (accountType === 'EQUITY') {
    bg = 'var(--so-surface-alt, #f3f0eb)'; border = 'var(--so-border)'; text = 'var(--so-text-secondary)'
  } else if (accountType.startsWith('REVENUE') || accountType.startsWith('CONTRA_REVENUE')) {
    bg = 'var(--so-success-bg)'; border = 'transparent'; text = 'var(--so-success-text)'
  } else if (accountType.startsWith('EXPENSE')) {
    bg = 'var(--so-danger-bg)'; border = 'transparent'; text = 'var(--so-danger-text)'
  } else {
    bg = 'var(--so-warning-bg)'; border = 'var(--so-warning-border)'; text = 'var(--so-warning-text)'
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: bg, border: `1px solid ${border}`, color: text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: text }} />
      {accountTypeLabels[accountType]}
    </span>
  )
}

import { getStatusBadge } from '@/components/ui/StatusBadge'

export default function ChartOfAccounts() {
  usePageTitle('Chart of Accounts')

  const { data: accountsData, isLoading } = useAccounts()
  const { data: settingsData } = useSettings()
  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [exportFilterOpen, setExportFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)

  const accounts = accountsData?.results ?? []

  const columns: ColumnDef<GLAccount>[] = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>{row.getValue('code')}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>{row.getValue('name')}</span>
        ),
      },
      {
        accessorKey: 'account_type',
        header: 'Type',
        cell: ({ row }) => {
          const accountType = row.getValue('account_type') as GLAccountType
          return getAccountTypeBadge(accountType)
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => getStatusBadge((row.getValue('is_active') as boolean) ? 'active' : 'inactive'),
      },
      {
        accessorKey: 'is_system',
        header: 'System',
        cell: ({ row }) => {
          const isSystem = row.getValue('is_system') as boolean
          if (!isSystem) return null
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
              style={{ background: 'var(--so-surface-alt, #f3f0eb)', border: '1px solid var(--so-border)', color: 'var(--so-text-muted)' }}>
              System
            </span>
          )
        },
      },
    ],
    []
  )

  const reportFilterConfig: ReportFilterConfig = {
    title: 'Chart of Accounts',
    columns: [
      { key: 'code', header: 'Account #' },
      { key: 'name', header: 'Name' },
      { key: 'account_type', header: 'Type' },
      { key: 'balance', header: 'Balance' },
      { key: 'is_active', header: 'Active' },
    ],
    rowFilters: [
      {
        key: 'account_type',
        label: 'Account Type',
        options: [
          { value: 'ASSET_CURRENT', label: 'Current Asset' },
          { value: 'ASSET_FIXED', label: 'Fixed Asset' },
          { value: 'ASSET_OTHER', label: 'Other Asset' },
          { value: 'CONTRA_ASSET', label: 'Contra Asset' },
          { value: 'LIABILITY_CURRENT', label: 'Current Liability' },
          { value: 'LIABILITY_LONG_TERM', label: 'Long-Term Liability' },
          { value: 'EQUITY', label: 'Equity' },
          { value: 'REVENUE', label: 'Revenue' },
          { value: 'REVENUE_OTHER', label: 'Other Income' },
          { value: 'CONTRA_REVENUE', label: 'Contra Revenue' },
          { value: 'EXPENSE_COGS', label: 'COGS' },
          { value: 'EXPENSE_OPERATING', label: 'Operating Expense' },
          { value: 'EXPENSE_OTHER', label: 'Other Expense' },
        ],
      },
    ],
    showDateRange: false,
  }

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setTimeout(() => window.print(), 100)
  }

  const handleFilteredExport = (filters: ReportFilterResult) => {
    let rows = accounts
    if (filters.rowFilters.account_type && filters.rowFilters.account_type !== 'all') {
      rows = rows.filter(r => r.account_type === filters.rowFilters.account_type)
    }
    if (rows.length === 0) return

    const allCols = reportFilterConfig.columns
    const cols = allCols.filter(c => filters.visibleColumns.includes(c.key))
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const csv = [cols.map(c => esc(c.header)).join(','), ...rows.map(r => cols.map(c => {
      const key = c.key
      if (key === 'account_type') return esc(accountTypeLabels[r.account_type] || r.account_type)
      if (key === 'is_active') return esc(r.is_active ? 'Yes' : 'No')
      return esc((r as Record<string, unknown>)[key])
    }).join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `chart-of-accounts-${new Date().toISOString().split('T')[0]}.csv`; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printFilteredData = useMemo(() => {
    let rows = accounts
    if (printFilters) {
      if (printFilters.rowFilters.account_type && printFilters.rowFilters.account_type !== 'all') {
        rows = rows.filter(r => r.account_type === printFilters.rowFilters.account_type)
      }
    }
    return rows
  }, [accounts, printFilters])

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16" data-print-hide>

        {/* Header */}
        <div className="flex items-start justify-between mb-8 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Chart of Accounts</h1>
            <p className="mt-1 text-[13.5px]" style={{ color: 'var(--so-text-muted)' }}>
              Manage your general ledger accounts
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setPrintFilterOpen(true)} title="Print">
              <Printer className="h-3.5 w-3.5" />
            </button>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setExportFilterOpen(true)} title="Export CSV">
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Table Card */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <div className="flex items-center gap-2">
              <BookUser className="h-4 w-4" style={{ color: 'var(--so-text-muted)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>All Accounts</span>
            </div>
          </div>
          {isLoading ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--so-text-muted)' }}>Loading...</div>
          ) : (
            <DataTable
              columns={columns}
              data={accounts}
              searchColumn="name"
              searchPlaceholder="Search accounts..."
              storageKey="chart-of-accounts"
            />
          )}
        </div>

      </div>

      {/* Print-only section */}
      <div className="print-only" style={{ color: 'black' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '16px', borderBottom: '3px solid var(--so-text-primary)' }}>
          <div>
            <div style={{ fontSize: '22pt', fontWeight: 700, letterSpacing: '-0.5px' }}>{settingsData?.company_name || 'Company'}</div>
            {settingsData?.company_address && <div style={{ fontSize: '9pt', color: 'var(--so-text-secondary)', whiteSpace: 'pre-line', marginTop: '4px' }}>{settingsData.company_address}</div>}
            {(settingsData?.company_phone || settingsData?.company_email) && (
              <div style={{ fontSize: '9pt', color: 'var(--so-text-secondary)', marginTop: '2px' }}>{[settingsData?.company_phone, settingsData?.company_email].filter(Boolean).join(' | ')}</div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>Chart of Accounts</div>
            <div style={{ fontSize: '9pt', color: 'var(--so-text-secondary)', marginTop: '4px', padding: '2px 10px', border: '1px solid var(--so-border)', display: 'inline-block' }}>{printFilteredData.length} accounts</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr>
              {[
                { key: 'code', label: 'Account #' },
                { key: 'name', label: 'Name' },
                { key: 'account_type', label: 'Type' },
                { key: 'balance', label: 'Balance' },
                { key: 'is_active', label: 'Active' },
              ].filter(h => !printFilters || printFilters.visibleColumns.includes(h.key)).map(h => (
                <th key={h.key} style={{ padding: '5px 6px', border: '1px solid var(--so-border)', background: 'var(--so-bg)', fontWeight: 600, textAlign: h.key === 'balance' ? 'right' : 'left' }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printFilteredData.map(row => {
              const showCol = (key: string) => !printFilters || printFilters.visibleColumns.includes(key)
              return (
                <tr key={row.id}>
                  {showCol('code') && <td style={{ padding: '4px 6px', border: '1px solid var(--so-border)', fontFamily: 'monospace' }}>{row.code}</td>}
                  {showCol('name') && <td style={{ padding: '4px 6px', border: '1px solid var(--so-border)' }}>{row.name}</td>}
                  {showCol('account_type') && <td style={{ padding: '4px 6px', border: '1px solid var(--so-border)' }}>{accountTypeLabels[row.account_type] || row.account_type}</td>}
                  {showCol('balance') && <td style={{ padding: '4px 6px', border: '1px solid var(--so-border)', textAlign: 'right', fontFamily: 'monospace' }}>{row.balance ?? '\u2014'}</td>}
                  {showCol('is_active') && <td style={{ padding: '4px 6px', border: '1px solid var(--so-border)' }}>{row.is_active ? 'Yes' : 'No'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ marginTop: '40px', paddingTop: '12px', borderTop: '1px solid var(--so-border)', display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: 'var(--so-text-tertiary)' }}>
          <span>Printed {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
          <span>{settingsData?.company_name || ''}</span>
        </div>
      </div>

      <ReportFilterModal open={printFilterOpen} onOpenChange={setPrintFilterOpen} config={reportFilterConfig} mode="print" onConfirm={handleFilteredPrint} />
      <ReportFilterModal open={exportFilterOpen} onOpenChange={setExportFilterOpen} config={reportFilterConfig} mode="export" onConfirm={handleFilteredExport} />
    </div>
  )
}
