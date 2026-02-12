import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { useJournalEntries } from '@/api/accounting'
import type { JournalEntry } from '@/types/api'

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

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
          <span className="font-mono">{row.getValue('entry_number')}</span>
        ),
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => {
          const date = row.getValue('date') as string
          return new Date(date + 'T00:00:00').toLocaleDateString()
        },
      },
      {
        accessorKey: 'memo',
        header: 'Memo',
        cell: ({ row }) => {
          const memo = row.getValue('memo') as string
          return memo.length > 60 ? memo.substring(0, 60) + '...' : memo
        },
      },
      {
        accessorKey: 'entry_type',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.getValue('entry_type') as string
          return type.charAt(0).toUpperCase() + type.slice(1)
        },
      },
      {
        accessorKey: 'total_debit',
        header: 'Debit',
        cell: ({ row }) => (
          <div className="text-right">{formatCurrency(row.getValue('total_debit'))}</div>
        ),
      },
      {
        accessorKey: 'total_credit',
        header: 'Credit',
        cell: ({ row }) => (
          <div className="text-right">{formatCurrency(row.getValue('total_credit'))}</div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as string
          const variants = {
            draft: 'secondary',
            posted: 'success',
            reversed: 'destructive',
          }
          return (
            <Badge variant={variants[status as keyof typeof variants] as any}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          )
        },
      },
    ],
    []
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Journal Entries</h1>
          <p className="text-muted-foreground">
            View and manage general ledger entries
          </p>
        </div>
        <Button onClick={() => navigate('/journal-entries/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Entry
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            All Journal Entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <DataTable
              columns={columns}
              data={entriesData?.results ?? []}
              searchColumn="memo"
              searchPlaceholder="Search by memo..."
              onRowClick={(row) => navigate(`/journal-entries/${row.id}`)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
