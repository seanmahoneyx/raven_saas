import { useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { BookUser } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { useAccounts } from '@/api/accounting'
import type { GLAccount, GLAccountType } from '@/types/api'
import React from 'react'

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

const getStatusBadge = (active: boolean) => {
  const c = active
    ? { bg: 'var(--so-success-bg)', border: 'transparent', text: 'var(--so-success-text)', label: 'Active' }
    : { bg: 'var(--so-danger-bg)', border: 'transparent', text: 'var(--so-danger-text)', label: 'Inactive' }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {c.label}
    </span>
  )
}

export default function ChartOfAccounts() {
  usePageTitle('Chart of Accounts')

  const { data: accountsData, isLoading } = useAccounts()

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
        cell: ({ row }) => getStatusBadge(row.getValue('is_active')),
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

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Chart of Accounts</h1>
            <p className="mt-1 text-[13.5px]" style={{ color: 'var(--so-text-muted)' }}>
              Manage your general ledger accounts
            </p>
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
              data={accountsData?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search accounts..."
              storageKey="chart-of-accounts"
            />
          )}
        </div>

      </div>
    </div>
  )
}
