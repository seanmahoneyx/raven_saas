import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Printer, Ban } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { primaryBtnClass, primaryBtnStyle, outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  useChecks,
  usePrintCheck,
  useVoidCheck,
  type Check,
} from '@/api/checks'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/format'

export default function Checks() {
  usePageTitle('Checks')
  const navigate = useNavigate()

  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [pendingVoidId, setPendingVoidId] = useState<number | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const { data, isLoading, isError } = useChecks()
  const printCheck = usePrintCheck()
  const voidCheck = useVoidCheck()

  const rows: Check[] = useMemo(() => data ?? [], [data])

  const handlePrint = async (id: number) => {
    await printCheck.mutateAsync(id)
  }

  const handleVoidConfirm = async () => {
    if (!pendingVoidId) return
    await voidCheck.mutateAsync({ id: pendingVoidId, reason: voidReason })
    setVoidDialogOpen(false)
    setPendingVoidId(null)
    setVoidReason('')
  }

  const columns: ColumnDef<Check>[] = useMemo(
    () => [
      {
        accessorKey: 'check_number',
        header: 'Check #',
        cell: ({ row }) => {
          const num = row.getValue('check_number') as number | null
          return num ? (
            <span className="font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>
              {num}
            </span>
          ) : (
            <span className="italic text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
              DRAFT
            </span>
          )
        },
      },
      {
        accessorKey: 'check_date',
        header: 'Date',
        cell: ({ row }) => {
          const d = row.getValue('check_date') as string
          return (
            <span style={{ color: 'var(--so-text-secondary)' }}>
              {d ? format(new Date(d), 'MMM d, yyyy') : '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'payee_name',
        header: 'Payee',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-primary)' }}>{row.getValue('payee_name')}</span>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>
            {formatCurrency(row.getValue('amount'))}
          </span>
        ),
      },
      {
        accessorKey: 'memo',
        header: 'Memo',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-tertiary)' }}>
            {(row.getValue('memo') as string) || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'bank_account_name',
        header: 'Bank Account',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>
            {row.getValue('bank_account_name') || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as string),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const check = row.original
          return (
            <div className="flex items-center gap-1">
              {check.status === 'draft' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={(e) => { e.stopPropagation(); handlePrint(check.id) }}
                  disabled={printCheck.isPending}
                  title="Print check"
                >
                  <Printer className="h-3.5 w-3.5 mr-1" />
                  Print
                </Button>
              )}
              {check.status === 'printed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  style={{ color: 'var(--so-danger-text)' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPendingVoidId(check.id)
                    setVoidReason('')
                    setVoidDialogOpen(true)
                  }}
                  title="Void check"
                >
                  <Ban className="h-3.5 w-3.5 mr-1" />
                  Void
                </Button>
              )}
            </div>
          )
        },
      },
    ],
    [printCheck.isPending]
  )

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Checks</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
              Write and manage checks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => navigate('/checks/new')}>
              <Plus className="h-3.5 w-3.5" />
              Write Check
            </button>
          </div>
        </div>

        {/* DataTable Card */}
        <div className="rounded-[14px] overflow-hidden animate-in delay-2"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="px-6 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
              Checks
            </span>
            <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
              {rows.length} {rows.length === 1 ? 'check' : 'checks'}
            </span>
          </div>
          <div className="p-4">
            {isError && (
              <div className="rounded-[10px] px-4 py-3 text-[13px]" style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }}>
                Failed to load checks. Please try again.
              </div>
            )}
            {isLoading ? (
              <TableSkeleton columns={8} rows={6} />
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                searchColumn="payee_name"
                searchPlaceholder="Search by payee..."
                storageKey="checks"
              />
            )}
          </div>
        </div>

      </div>

      {/* Void Check Dialog */}
      <Dialog open={voidDialogOpen} onOpenChange={(open) => { setVoidDialogOpen(open); if (!open) { setPendingVoidId(null); setVoidReason('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Void Check</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              Are you sure you want to void this check? This action cannot be undone.
            </p>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Enter reason for voiding..."
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => { setVoidDialogOpen(false); setPendingVoidId(null); setVoidReason('') }}
            >
              Cancel
            </button>
            <button
              className={primaryBtnClass}
              style={{ ...primaryBtnStyle, background: 'var(--so-danger)', borderColor: 'var(--so-danger)' }}
              onClick={handleVoidConfirm}
              disabled={voidCheck.isPending}
            >
              {voidCheck.isPending ? 'Voiding...' : 'Void Check'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
