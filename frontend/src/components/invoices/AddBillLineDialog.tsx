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
import { SearchableCombobox } from '@/components/common/SearchableCombobox'
import { useAllItems } from '@/api/items'
import { useAddBillLine } from '@/api/invoicing'
import { formatCurrency } from '@/lib/format'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

interface AddBillLineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  billId: number
  billNumber: string
}

export function AddBillLineDialog({ open, onOpenChange, billId, billNumber }: AddBillLineDialogProps) {
  const addLine = useAddBillLine()
  const { data: itemsData } = useAllItems()
  const items = itemsData ?? []

  const [itemId, setItemId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setItemId(null)
      setDescription('')
      setQuantity('')
      setUnitPrice('')
      setError('')
    }
  }, [open])

  const handleItemChange = (id: number | null) => {
    setItemId(id)
    if (id != null) {
      const selected = items.find(i => i.id === id)
      if (selected && !description) {
        setDescription(selected.name)
      }
    }
  }

  const qtyNum = parseFloat(quantity) || 0
  const priceNum = parseFloat(unitPrice) || 0
  const amount = qtyNum * priceNum
  const isPending = addLine.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!itemId) {
      setError('Item is required')
      return
    }
    if (qtyNum <= 0) {
      setError('Quantity must be greater than zero')
      return
    }
    if (priceNum < 0) {
      setError('Unit price cannot be negative')
      return
    }

    try {
      await addLine.mutateAsync({
        billId,
        line: {
          item: itemId,
          description,
          quantity: quantity,
          unit_price: unitPrice || '0',
        },
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
          <DialogTitle>Add Line to Bill {billNumber}</DialogTitle>
          <DialogDescription>
            Lines can only be added to draft bills.
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

          <div className="space-y-1.5">
            <Label className="text-[12.5px]">Item *</Label>
            <SearchableCombobox
              entityType="item"
              value={itemId}
              onChange={handleItemChange}
              placeholder="Select item..."
              allowClear
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-[12.5px]">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Defaults to item name"
              className="h-9 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="quantity" className="text-[12.5px]">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className="h-9 text-sm font-mono text-right"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit_price" className="text-[12.5px]">Unit Price *</Label>
              <Input
                id="unit_price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
                className="h-9 text-sm font-mono text-right"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">Amount</Label>
              <div
                className="h-9 px-3 flex items-center justify-end rounded-md text-sm font-mono font-semibold"
                style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border)', color: 'var(--so-text-primary)' }}
              >
                {formatCurrency(amount)}
              </div>
            </div>
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
              {isPending ? 'Adding...' : 'Add Line'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
