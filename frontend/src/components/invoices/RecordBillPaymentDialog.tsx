import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/format'
import { useCreateBillPayment } from '@/api/invoicing'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

type PaymentMethod = 'CHECK' | 'ACH' | 'WIRE' | 'CREDIT_CARD' | 'CASH' | 'DEBIT_MEMO' | 'OTHER'

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'CHECK', label: 'Check' },
  { value: 'ACH', label: 'ACH / Bank Transfer' },
  { value: 'WIRE', label: 'Wire Transfer' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'CASH', label: 'Cash' },
  { value: 'DEBIT_MEMO', label: 'Debit Memo' },
  { value: 'OTHER', label: 'Other' },
]

interface RecordBillPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  billId: number
  billNumber: string
  balanceDue: string
}

export function RecordBillPaymentDialog({
  open,
  onOpenChange,
  billId,
  billNumber,
  balanceDue,
}: RecordBillPaymentDialogProps) {
  const createPayment = useCreateBillPayment()
  const balanceNum = parseFloat(balanceDue) || 0

  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CHECK')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setPaymentDate(new Date().toISOString().slice(0, 10))
      setAmount(balanceNum > 0 ? balanceNum.toFixed(2) : '')
      setPaymentMethod('CHECK')
      setReferenceNumber('')
      setNotes('')
      setError('')
    }
  }, [open, balanceNum])

  const amountNum = parseFloat(amount) || 0
  const isOverpayment = amountNum > balanceNum && balanceNum > 0
  const isPending = createPayment.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!paymentDate) {
      setError('Payment date is required')
      return
    }
    if (!amountNum || amountNum <= 0) {
      setError('Amount must be greater than zero')
      return
    }

    try {
      await createPayment.mutateAsync({
        bill: billId,
        payment_date: paymentDate,
        amount: amountNum.toFixed(2),
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        notes,
      })
      onOpenChange(false)
    } catch {
      // toast handled by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Bill {billNumber} &middot; Balance due {formatCurrency(balanceNum)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              className="rounded-md p-3 text-sm"
              style={{
                background: 'var(--so-danger-bg)',
                color: 'var(--so-danger-text)',
                border: '1px solid var(--so-danger-text)',
              }}
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="payment_date" className="text-[12.5px]">Payment Date</Label>
              <Input
                id="payment_date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-[12.5px]">Amount</Label>
              <NumericInput
                id="amount"
                inputMode="decimal"
                value={amount}
                onValueChange={(v) => setAmount(v)}
                placeholder="0.00"
                className="h-9 text-sm font-mono text-right"
              />
              {isOverpayment && (
                <p className="text-[11.5px]" style={{ color: 'var(--so-warning-text)' }}>
                  Payment exceeds balance due by {formatCurrency(amountNum - balanceNum)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="payment_method" className="text-[12.5px]">Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger id="payment_method" className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reference_number" className="text-[12.5px]">Reference / Check #</Label>
              <Input
                id="reference_number"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Optional"
                className="h-9 text-sm font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-[12.5px]">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this payment"
              rows={2}
              className="text-sm min-h-0"
              style={{ minHeight: '60px' }}
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={primaryBtnClass + (isPending ? ' opacity-50 pointer-events-none' : '')}
              style={primaryBtnStyle}
              disabled={isPending}
            >
              {isPending ? 'Recording...' : 'Record Payment'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
