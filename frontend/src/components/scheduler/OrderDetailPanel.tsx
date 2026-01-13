import { useState, useEffect, useCallback } from 'react'
import { X, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { CalendarOrder, OrderStatus } from '@/types/api'
import { useUpdateStatus, useUpdateNotes } from '@/api/scheduling'
import { cn } from '@/lib/utils'

interface OrderDetailPanelProps {
  order: CalendarOrder | null
  onClose: () => void
}

const statusOptions: { value: OrderStatus; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-400' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-gray-500' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-blue-500' },
  { value: 'picking', label: 'Picking', color: 'bg-yellow-500' },
  { value: 'shipped', label: 'Shipped', color: 'bg-green-500' },
  { value: 'complete', label: 'Complete', color: 'bg-blue-600' },
  { value: 'crossdock', label: 'Crossdock', color: 'bg-orange-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-500' },
]

export default function OrderDetailPanel({ order, onClose }: OrderDetailPanelProps) {
  const [notes, setNotes] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  const updateStatus = useUpdateStatus()
  const updateNotes = useUpdateNotes()

  useEffect(() => {
    if (order) {
      setNotes(order.notes || '')
      setIsDirty(false)
    }
  }, [order])

  // Debounced save for notes
  useEffect(() => {
    if (!order || !isDirty) return

    const timer = setTimeout(() => {
      updateNotes.mutate({
        orderType: order.order_type,
        orderId: order.id,
        notes,
      })
      setIsDirty(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [notes, isDirty, order])

  const handleStatusChange = useCallback(
    (status: OrderStatus) => {
      if (!order) return
      updateStatus.mutate({
        orderType: order.order_type,
        orderId: order.id,
        status,
      })
    },
    [order, updateStatus]
  )

  if (!order) {
    return (
      <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-gray-50 p-4">
        <div className="text-center text-gray-400 text-sm py-8">
          Select an order to view details
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">
            {order.order_type === 'PO' ? 'PO ' : ''}
            {order.number}
          </h2>
          <p className="text-sm text-gray-500">{order.party_name}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Order info */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">Type:</span>
            <span className="ml-2 font-medium">
              {order.order_type === 'SO' ? 'Sales Order' : 'Purchase Order'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Priority:</span>
            <span className="ml-2 font-medium">{order.priority}</span>
          </div>
          <div>
            <span className="text-gray-500">Lines:</span>
            <span className="ml-2 font-medium">{order.num_lines}</span>
          </div>
          <div>
            <span className="text-gray-500">Quantity:</span>
            <span className="ml-2 font-medium">{order.total_quantity}</span>
          </div>
        </div>

        {/* Schedule info */}
        {order.scheduled_date && (
          <div className="text-sm">
            <span className="text-gray-500">Scheduled:</span>
            <span className="ml-2 font-medium">
              {order.scheduled_date}
              {order.scheduled_truck_name && ` - ${order.scheduled_truck_name}`}
            </span>
          </div>
        )}

        {/* Status */}
        <div>
          <Label className="text-sm text-gray-500 mb-2 block">Status</Label>
          <div className="flex flex-wrap gap-1">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                disabled={updateStatus.isPending}
                className={cn(
                  'px-2 py-1 text-xs rounded border transition-colors',
                  order.status === opt.value
                    ? 'border-gray-800 bg-gray-100 font-medium'
                    : 'border-gray-200 hover:border-gray-400'
                )}
              >
                <span className={cn('inline-block w-2 h-2 rounded-full mr-1', opt.color)} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label htmlFor="notes" className="text-sm text-gray-500 mb-2 block">
            Delivery Notes
            {isDirty && (
              <span className="ml-2 text-xs text-yellow-600">
                <Save className="h-3 w-3 inline" /> saving...
              </span>
            )}
          </Label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              setIsDirty(true)
            }}
            placeholder="Add delivery notes..."
            className="w-full h-24 text-sm border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  )
}
