import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, FileSpreadsheet } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { useJournalEntries } from '@/api/accounting'
import type { JournalEntry } from '@/types/api'
import React from 'react'

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:       { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    active:      { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    inactive:    { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    pending:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    in_progress: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    approved:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    rejected:    { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    completed:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    posted:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    reversed:    { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    confirmed:   { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    scheduled:   { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    picking:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    shipped:     { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    complete:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    cancelled:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    crossdock:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    received:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    sent:        { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    converted:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    expired:     { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  }
  const c = configs[status] || { bg: 'var(--so-warning-bg)', border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status}
    </span>
  )
}

const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

export default function JournalEntries() {
  usePageTitle('Journal Entries')
  const navigate = useNavigate()

  const { data: entriesData, isLoading } = useJournalEntries()

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

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Journal Entries</h1>
            <p className="mt-1 text-[13.5px]" style={{ color: 'var(--so-text-muted)' }}>
              View and manage general ledger entries
            </p>
          </div>
          <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => navigate('/journal-entries/new')}>
            <Plus className="h-4 w-4" />
            New Entry
          </button>
        </div>

        {/* Table Card */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" style={{ color: 'var(--so-text-muted)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>All Journal Entries</span>
            </div>
          </div>
          {isLoading ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--so-text-muted)' }}>Loading...</div>
          ) : (
            <DataTable
              columns={columns}
              data={entriesData?.results ?? []}
              searchColumn="memo"
              searchPlaceholder="Search by memo..."
              onRowClick={(row) => navigate(`/journal-entries/${row.id}`)}
            />
          )}
        </div>

      </div>
    </div>
  )
}
