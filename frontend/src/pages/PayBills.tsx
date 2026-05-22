import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useAllBills, useCreateBillPayment, type Bill } from '@/api/invoicing'
import { useAllVendors } from '@/api/parties'
import { useAllAccounts } from '@/api/accounting'
import { formatCurrency } from '@/lib/format'
import { getApiErrorMessage } from '@/lib/errors'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

/**
 * Pay Bills — apply a single check/transfer across one or more posted bills.
 *
 * NOTE on atomicity: this page issues N parallel POSTs to /bill-payments/,
 * one per applied bill. If one fails after others succeed, the partial
 * payments persist (no rollback). A proper VendorPayment header + applications
 * model (parallel to CustomerPayment/PaymentApplication on the AR side) would
 * give true batch semantics; building it is a follow-on.
 */

const inputStyle: React.CSSProperties = { borderColor: 'var(--so-border)', background: 'var(--so-surface)' }
const labelStyle: React.CSSProperties = { color: 'var(--so-text-secondary)' }

export default function PayBills() {
  usePageTitle('Pay Bills')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<string>('CHECK')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [withdrawAccount, setWithdrawAccount] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [applications, setApplications] = useState<Record<number, string>>({})
  const [selectedBills, setSelectedBills] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const { data: vendorsData } = useAllVendors()
  const vendors = vendorsData ?? []

  const { data: accountsData } = useAllAccounts({ is_active: true })
  const bankAccounts = (accountsData ?? []).filter(a =>
    a.account_type === 'ASSET_CURRENT'
    && (a.name?.toLowerCase().includes('bank')
      || a.name?.toLowerCase().includes('cash')
      || a.code?.startsWith('1'))
  )

  // Fetch open bills (posted + partial) for the selected vendor
  const { data: openBills, isLoading: loadingBills } = useAllBills(
    selectedVendorId ? { vendor: selectedVendorId } : undefined,
  )

  const unpaidBills: Bill[] = useMemo(
    () => (openBills ?? []).filter(b => b.status === 'posted' || b.status === 'partial'),
    [openBills],
  )

  // Reset applications when vendor changes
  useEffect(() => {
    setApplications({})
    setSelectedBills(new Set())
  }, [selectedVendorId])

  const createPayment = useCreateBillPayment()

  const checkAmount = parseFloat(amount) || 0
  const totalApplied = useMemo(
    () => Object.values(applications).reduce((sum, v) => sum + (parseFloat(v) || 0), 0),
    [applications],
  )
  const unapplied = checkAmount - totalApplied

  const handleAutoApply = () => {
    if (checkAmount <= 0) {
      toast.error('Enter a payment amount first')
      return
    }
    let remaining = checkAmount
    const next: Record<number, string> = {}
    const sel = new Set<number>()
    const sorted = [...unpaidBills].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
    )
    for (const bill of sorted) {
      if (remaining <= 0) break
      const bal = parseFloat(bill.balance_due) || 0
      const apply = Math.min(remaining, bal)
      if (apply > 0) {
        next[bill.id] = apply.toFixed(2)
        sel.add(bill.id)
        remaining -= apply
      }
    }
    setApplications(next)
    setSelectedBills(sel)
  }

  const handleClearAll = () => {
    setApplications({})
    setSelectedBills(new Set())
  }

  const handleApplicationChange = (billId: number, value: string) => {
    const bill = unpaidBills.find(b => b.id === billId)
    if (!bill) return
    const bal = parseFloat(bill.balance_due) || 0
    const v = parseFloat(value) || 0
    if (v > bal) {
      toast.error(`Cannot exceed balance of ${formatCurrency(bal)}`)
      return
    }
    const next = { ...applications }
    if (!value || v === 0) {
      delete next[billId]
      const sel = new Set(selectedBills)
      sel.delete(billId)
      setSelectedBills(sel)
    } else {
      next[billId] = value
    }
    setApplications(next)
  }

  const handleBillSelect = (billId: number, checked: boolean) => {
    const sel = new Set(selectedBills)
    if (checked) {
      sel.add(billId)
      if (!applications[billId]) {
        const bill = unpaidBills.find(b => b.id === billId)
        if (bill) {
          const bal = parseFloat(bill.balance_due) || 0
          const remaining = checkAmount - totalApplied
          const apply = Math.min(bal, remaining > 0 ? remaining : bal)
          if (apply > 0) {
            setApplications(prev => ({ ...prev, [billId]: apply.toFixed(2) }))
          }
        }
      }
    } else {
      sel.delete(billId)
      const next = { ...applications }
      delete next[billId]
      setApplications(next)
    }
    setSelectedBills(sel)
  }

  const handlePost = async () => {
    if (!selectedVendorId) {
      toast.error('Select a vendor')
      return
    }
    if (checkAmount <= 0) {
      toast.error('Enter a payment amount')
      return
    }
    const entries = Object.entries(applications).filter(([, v]) => parseFloat(v) > 0)
    if (entries.length === 0) {
      toast.error('Apply the payment to at least one bill')
      return
    }
    if (totalApplied > checkAmount + 0.001) {
      toast.error('Applied total exceeds payment amount')
      return
    }

    setSubmitting(true)
    let succeeded = 0
    let failed = 0
    let lastError: unknown = null

    for (const [billIdStr, applyAmount] of entries) {
      const billId = Number(billIdStr)
      try {
        await createPayment.mutateAsync({
          bill: billId,
          payment_date: paymentDate,
          amount: applyAmount,
          payment_method: paymentMethod as 'CHECK' | 'ACH' | 'WIRE' | 'CREDIT_CARD' | 'CASH' | 'DEBIT_MEMO' | 'OTHER',
          reference_number: referenceNumber,
          notes,
        })
        succeeded += 1
      } catch (err) {
        failed += 1
        lastError = err
      }
    }

    setSubmitting(false)
    queryClient.invalidateQueries({ queryKey: ['bills'] })
    queryClient.invalidateQueries({ queryKey: ['bill-payments'] })

    if (failed === 0) {
      toast.success(`Recorded ${succeeded} payment${succeeded === 1 ? '' : 's'}`)
      navigate('/invoices')
    } else if (succeeded === 0) {
      toast.error(getApiErrorMessage(lastError, 'No payments recorded'))
    } else {
      toast.warning(`Recorded ${succeeded}, failed ${failed} — review the bills list`)
    }
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7 pb-16">
        {/* Header */}
        <div className="flex items-center gap-4 mb-7 animate-in">
          <button
            className={outlineBtnClass + ' !px-2'}
            style={outlineBtnStyle}
            onClick={() => navigate('/invoices')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Pay Bills</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              Record a vendor payment and apply to open bills
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Payment info */}
          <div
            className="rounded-[14px] border overflow-hidden animate-in delay-1"
            style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
          >
            <div
              className="px-6 py-4 flex items-center gap-2"
              style={{ borderBottom: '1px solid var(--so-border-light)' }}
            >
              <DollarSign className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
              <span className="text-sm font-semibold">Payment Information</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Vendor *</Label>
                  <Select
                    value={selectedVendorId?.toString() ?? ''}
                    onValueChange={(v) => setSelectedVendorId(parseInt(v, 10))}
                  >
                    <SelectTrigger style={inputStyle}>
                      <SelectValue placeholder="Select vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id.toString()}>
                          {vendor.party_display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Payment Date *</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Amount *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="font-mono"
                    style={inputStyle}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CHECK">Check</SelectItem>
                      <SelectItem value="ACH">ACH</SelectItem>
                      <SelectItem value="WIRE">Wire</SelectItem>
                      <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="DEBIT_MEMO">Debit Memo</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Reference # / Check #</Label>
                  <Input
                    placeholder="Check number or reference"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Withdraw Account (optional)</Label>
                  <Select value={withdrawAccount} onValueChange={setWithdrawAccount}>
                    <SelectTrigger style={inputStyle}>
                      <SelectValue placeholder="Select bank account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((acct) => (
                        <SelectItem key={acct.id} value={String(acct.id)}>
                          {acct.code} - {acct.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  className="text-[13px] font-medium cursor-pointer mb-2"
                  style={{ color: 'var(--so-accent)' }}
                  onClick={() => setShowNotes(!showNotes)}
                >
                  {showNotes ? 'Hide' : 'Add'} Notes
                </button>
                {showNotes && (
                  <Textarea
                    placeholder="Payment notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    style={inputStyle}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Bill applications grid */}
          {selectedVendorId && (
            <div
              className="rounded-[14px] border overflow-hidden animate-in delay-2"
              style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
            >
              <div
                className="px-6 py-4 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--so-border-light)' }}
              >
                <span className="text-sm font-semibold">Apply to Bills</span>
                <div className="flex gap-2">
                  <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleAutoApply}>
                    Auto-Apply (FIFO)
                  </button>
                  <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleClearAll}>
                    Clear
                  </button>
                </div>
              </div>

              {loadingBills ? (
                <div className="text-center py-10 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                  Loading bills…
                </div>
              ) : unpaidBills.length === 0 ? (
                <div className="text-center py-10 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                  No open bills for this vendor.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['', 'Bill #', 'Vendor Inv #', 'Bill Date', 'Due', 'Total', 'Balance', 'Apply'].map((label) => (
                          <th
                            key={label || 'cb'}
                            className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-3 text-left"
                            style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {unpaidBills.map((bill) => {
                        const selected = selectedBills.has(bill.id)
                        const balance = parseFloat(bill.balance_due) || 0
                        return (
                          <tr key={bill.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                            <td className="py-2.5 px-3">
                              <Checkbox
                                checked={selected}
                                onCheckedChange={(c) => handleBillSelect(bill.id, !!c)}
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[12.5px]">{bill.bill_number}</td>
                            <td className="py-2.5 px-3 font-mono text-[12.5px]" style={{ color: 'var(--so-text-secondary)' }}>
                              {bill.vendor_invoice_number || '—'}
                            </td>
                            <td className="py-2.5 px-3" style={{ color: 'var(--so-text-secondary)' }}>{bill.bill_date}</td>
                            <td className="py-2.5 px-3" style={{ color: 'var(--so-text-secondary)' }}>{bill.due_date}</td>
                            <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(bill.total_amount)}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold"
                              style={{ color: balance > 0 ? 'var(--so-danger-text)' : 'var(--so-success-text)' }}
                            >
                              {formatCurrency(balance)}
                            </td>
                            <td className="py-2.5 px-3">
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={applications[bill.id] ?? ''}
                                onChange={(e) => handleApplicationChange(bill.id, e.target.value)}
                                className="h-8 w-28 text-right font-mono text-sm"
                                style={inputStyle}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals + post */}
              {unpaidBills.length > 0 && (
                <div
                  className="px-6 py-4 grid grid-cols-3 gap-4 items-center"
                  style={{ borderTop: '1px solid var(--so-border)', background: 'var(--so-bg)' }}
                >
                  <div>
                    <div className="text-[11.5px] font-medium uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>
                      Applied
                    </div>
                    <div className="text-sm font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>
                      {formatCurrency(totalApplied)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11.5px] font-medium uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>
                      Unapplied
                    </div>
                    <div
                      className="text-sm font-bold font-mono"
                      style={{ color: Math.abs(unapplied) < 0.01 ? 'var(--so-success-text)' : 'var(--so-warning-text)' }}
                    >
                      {formatCurrency(unapplied)}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      className={primaryBtnClass + (submitting ? ' opacity-50 pointer-events-none' : '')}
                      style={primaryBtnStyle}
                      onClick={handlePost}
                      disabled={submitting}
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                      {submitting ? 'Posting...' : 'Post Payment'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
