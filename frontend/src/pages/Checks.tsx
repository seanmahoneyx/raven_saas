import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useQuery } from '@tanstack/react-query'
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
  useCreateCheck,
  usePrintCheck,
  useVoidCheck,
  type Check,
} from '@/api/checks'
import { useOtherNames } from '@/api/otherNames'
import api from '@/api/client'
import { format } from 'date-fns'

type PayeeType = 'vendor' | 'other_name' | 'manual'

interface BankAccount {
  id: number
  name: string
  account_type: string
}

const emptyForm = {
  payee_type: 'vendor' as PayeeType,
  payee_name: '',
  payee_address: '',
  other_name_id: '',
  vendor_name: '',
  bank_account: '',
  check_date: new Date().toISOString().split('T')[0],
  amount: '',
  memo: '',
}

type FormData = typeof emptyForm

const formatCurrency = (value: string | number) => {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

export default function Checks() {
  usePageTitle('Checks')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [pendingVoidId, setPendingVoidId] = useState<number | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const { data, isLoading } = useChecks()
  const { data: otherNamesData } = useOtherNames()
  const { data: bankAccountsData } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts-asset'],
    queryFn: async () => {
      const { data: res } = await api.get('/accounts/', { params: { type: 'ASSET_CURRENT' } })
      return res.results ?? res
    },
  })

  const createCheck = useCreateCheck()
  const printCheck = usePrintCheck()
  const voidCheck = useVoidCheck()

  const rows: Check[] = useMemo(() => data ?? [], [data])
  const otherNames = useMemo(() => otherNamesData ?? [], [otherNamesData])
  const bankAccounts: BankAccount[] = useMemo(() => bankAccountsData ?? [], [bankAccountsData])

  const handleAddNew = () => {
    setForm({ ...emptyForm, check_date: new Date().toISOString().split('T')[0] })
    setDialogOpen(true)
  }

  const handleOtherNameSelect = (id: string) => {
    const found = otherNames.find((o) => String(o.id) === id)
    setForm(f => ({
      ...f,
      other_name_id: id,
      payee_name: found ? (found.print_name || found.name) : '',
      payee_address: found ? found.full_address ?? '' : '',
    }))
  }

  const handleSave = async () => {
    const payload: Record<string, unknown> = {
      check_date: form.check_date,
      payee_name: form.payee_name,
      payee_address: form.payee_address,
      bank_account: form.bank_account ? Number(form.bank_account) : undefined,
      amount: form.amount,
      memo: form.memo,
    }
    if (form.payee_type === 'other_name' && form.other_name_id) {
      payload.other_name = Number(form.other_name_id)
    }
    await createCheck.mutateAsync(payload as Parameters<typeof createCheck.mutateAsync>[0])
    setDialogOpen(false)
  }

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

  const isSaving = createCheck.isPending

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
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleAddNew}>
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

      {/* Write Check Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Write Check</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">

            {/* Payee Type */}
            <div className="space-y-1.5">
              <Label>Payee Type</Label>
              <div className="flex rounded-md overflow-hidden border" style={{ borderColor: 'var(--so-border)' }}>
                {(['vendor', 'other_name', 'manual'] as PayeeType[]).map((type) => {
                  const label = type === 'vendor' ? 'Vendor' : type === 'other_name' ? 'Other Name' : 'Manual'
                  const active = form.payee_type === type
                  return (
                    <button
                      key={type}
                      type="button"
                      className="flex-1 px-3 py-2 text-sm font-medium transition-colors"
                      style={{
                        background: active ? 'var(--so-accent)' : 'var(--so-surface)',
                        color: active ? '#fff' : 'var(--so-text-secondary)',
                        borderRight: type !== 'manual' ? '1px solid var(--so-border)' : undefined,
                      }}
                      onClick={() => setForm(f => ({
                        ...f,
                        payee_type: type,
                        payee_name: '',
                        payee_address: '',
                        other_name_id: '',
                        vendor_name: '',
                      }))}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Payee Input based on type */}
            {form.payee_type === 'other_name' && (
              <div className="space-y-1.5">
                <Label>Select Other Name</Label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-primary)' }}
                  value={form.other_name_id}
                  onChange={(e) => handleOtherNameSelect(e.target.value)}
                >
                  <option value="">Select a payee...</option>
                  {otherNames.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.print_name || o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.payee_type === 'vendor' && (
              <div className="space-y-1.5">
                <Label>Vendor Name</Label>
                <Input
                  value={form.payee_name}
                  onChange={(e) => setForm(f => ({ ...f, payee_name: e.target.value, vendor_name: e.target.value }))}
                  placeholder="Enter vendor name"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            )}

            {form.payee_type === 'manual' && (
              <>
                <div className="space-y-1.5">
                  <Label>Payee Name</Label>
                  <Input
                    value={form.payee_name}
                    onChange={(e) => setForm(f => ({ ...f, payee_name: e.target.value }))}
                    placeholder="Payee name"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Payee Address</Label>
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm resize-none"
                    rows={3}
                    value={form.payee_address}
                    onChange={(e) => setForm(f => ({ ...f, payee_address: e.target.value }))}
                    placeholder="Street address..."
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-primary)' }}
                  />
                </div>
              </>
            )}

            {/* Show resolved address for other_name */}
            {form.payee_type === 'other_name' && form.payee_address && (
              <div className="space-y-1.5">
                <Label>Address</Label>
                <div className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface-raised)', color: 'var(--so-text-secondary)' }}>
                  {form.payee_address}
                </div>
              </div>
            )}

            {/* Bank Account */}
            <div className="space-y-1.5">
              <Label>Bank Account</Label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-primary)' }}
                value={form.bank_account}
                onChange={(e) => setForm(f => ({ ...f, bank_account: e.target.value }))}
              >
                <option value="">Select bank account...</option>
                {bankAccounts.map((acct) => (
                  <option key={acct.id} value={String(acct.id)}>
                    {acct.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Check Date */}
              <div className="space-y-1.5">
                <Label>Check Date</Label>
                <Input
                  type="date"
                  value={form.check_date}
                  onChange={(e) => setForm(f => ({ ...f, check_date: e.target.value }))}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>

            {/* Memo */}
            <div className="space-y-1.5">
              <Label>Memo</Label>
              <Input
                value={form.memo}
                onChange={(e) => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="Memo (optional)"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>

          </div>

          <DialogFooter className="flex justify-end gap-2">
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className={primaryBtnClass}
              style={primaryBtnStyle}
              onClick={handleSave}
              disabled={isSaving || !form.payee_name.trim() || !form.amount || !form.check_date}
            >
              {isSaving ? 'Saving...' : 'Write Check'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
