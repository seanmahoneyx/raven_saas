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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateBill, type Bill } from '@/api/invoicing'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

interface EditBillHeaderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bill: Bill
}

export function EditBillHeaderDialog({ open, onOpenChange, bill }: EditBillHeaderDialogProps) {
  const updateBill = useUpdateBill()

  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState('')
  const [billDate, setBillDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [purchaseOrder, setPurchaseOrder] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setVendorInvoiceNumber(bill.vendor_invoice_number ?? '')
      setBillDate(bill.bill_date)
      setDueDate(bill.due_date)
      setPurchaseOrder(bill.purchase_order != null ? String(bill.purchase_order) : '')
      setNotes(bill.notes ?? '')
      setError('')
    }
  }, [open, bill])

  const isPending = updateBill.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!vendorInvoiceNumber.trim()) {
      setError('Vendor invoice number is required')
      return
    }
    if (!billDate) {
      setError('Bill date is required')
      return
    }
    if (!dueDate) {
      setError('Due date is required')
      return
    }
    if (new Date(dueDate) < new Date(billDate)) {
      setError('Due date must be on or after bill date')
      return
    }

    try {
      await updateBill.mutateAsync({
        id: bill.id,
        vendor_invoice_number: vendorInvoiceNumber,
        bill_date: billDate,
        due_date: dueDate,
        purchase_order: purchaseOrder ? Number(purchaseOrder) : null,
        notes,
      })
      onOpenChange(false)
    } catch {
      // toast handled by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit Bill {bill.bill_number}</DialogTitle>
          <DialogDescription>
            Update header fields. Line items are edited inline on the detail page.
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
              <Label htmlFor="vendor_invoice_number" className="text-[12.5px]">Vendor Inv # *</Label>
              <Input
                id="vendor_invoice_number"
                value={vendorInvoiceNumber}
                onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                placeholder="V-12345"
                className="h-9 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchase_order" className="text-[12.5px]">PO # (optional)</Label>
              <Input
                id="purchase_order"
                type="number"
                inputMode="numeric"
                value={purchaseOrder}
                onChange={(e) => setPurchaseOrder(e.target.value)}
                placeholder="—"
                className="h-9 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bill_date" className="text-[12.5px]">Bill Date *</Label>
              <Input
                id="bill_date"
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due_date" className="text-[12.5px]">Due Date *</Label>
              <Input
                id="due_date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-[12.5px]">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this bill"
              rows={3}
              className="text-sm min-h-0"
              style={{ minHeight: '72px' }}
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
              {isPending ? 'Saving...' : 'Save'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
