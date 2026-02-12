import { useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { BookUser } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { useAccounts } from '@/api/accounting'
import type { GLAccount, GLAccountType } from '@/types/api'

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

const getAccountTypeBadgeVariant = (accountType: GLAccountType): 'default' | 'warning' | 'secondary' | 'success' | 'destructive' => {
  if (accountType.startsWith('ASSET')) return 'default'
  if (accountType.startsWith('LIABILITY')) return 'warning'
  if (accountType === 'EQUITY') return 'secondary'
  if (accountType.startsWith('REVENUE') || accountType.startsWith('CONTRA_REVENUE')) return 'success'
  if (accountType.startsWith('EXPENSE')) return 'destructive'
  return 'default'
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
          <span className="font-mono">{row.getValue('code')}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('name')}</span>
        ),
      },
      {
        accessorKey: 'account_type',
        header: 'Type',
        cell: ({ row }) => {
          const accountType = row.getValue('account_type') as GLAccountType
          return (
            <Badge variant={getAccountTypeBadgeVariant(accountType)}>
              {accountTypeLabels[accountType]}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.getValue('is_active') ? 'success' : 'secondary'}>
            {row.getValue('is_active') ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        accessorKey: 'is_system',
        header: 'System',
        cell: ({ row }) => {
          const isSystem = row.getValue('is_system') as boolean
          return isSystem ? <Badge variant="outline">System</Badge> : null
        },
      },
    ],
    []
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Chart of Accounts</h1>
          <p className="text-muted-foreground">
            Manage your general ledger accounts
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookUser className="h-5 w-5" />
            All Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <DataTable
              columns={columns}
              data={accountsData?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search accounts..."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
