import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Menu, Save, ArrowLeft, Clock, Truck, Package, FileText } from 'lucide-react'
import { Label } from '@/components/ui/label'
import type { CalendarOrder, OrderStatus, HistoryRecord } from '@/types/api'
import { useUpdateStatus, useUpdateNotes, useGlobalHistory } from '@/api/scheduling'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface OrderDetailPanelProps {
  order: CalendarOrder | null
  onClearSelection?: () => void
  allOrdersLookup?: Record<string, CalendarOrder>
  onHistoryItemClick?: (order: CalendarOrder) => void
}

const statusOptions: { value: OrderStatus; label: string; color: string }[] = [
  { value: 'scheduled', label: 'Scheduled', color: 'bg-white border border-gray-400' },
  { value: 'picking', label: 'Pick Ticket', color: 'bg-yellow-400' },
  { value: 'shipped', label: 'Shipped', color: 'bg-green-500' },
  { value: 'complete', label: 'Completed', color: 'bg-blue-500' },
  { value: 'crossdock', label: 'Crossdock', color: 'bg-orange-400' },
]

// Format history change description
function getHistoryDescription(record: HistoryRecord): string {
  if (record.history_type === '+') {
    return 'Order created'
  }
  if (record.history_type === '-') {
    return 'Order deleted'
  }

  // Changed - describe what changed
  const changes = record.changed_fields
  if (changes.includes('scheduled_date') && changes.includes('scheduled_truck_id')) {
    if (record.scheduled_date) {
      return `Scheduled for ${record.scheduled_date}`
    }
    return 'Unscheduled'
  }
  if (changes.includes('scheduled_date')) {
    if (record.scheduled_date) {
      return `Rescheduled to ${record.scheduled_date}`
    }
    return 'Unscheduled'
  }
  if (changes.includes('scheduled_truck_id')) {
    return 'Truck assignment changed'
  }
  if (changes.includes('status')) {
    return `Status → ${record.status}`
  }
  if (changes.includes('notes')) {
    return 'Notes updated'
  }
  if (changes.length > 0) {
    return `Updated: ${changes.join(', ')}`
  }
  return 'Updated'
}

export default function OrderDetailPanel({
  order,
  onClearSelection,
  allOrdersLookup = {},
  onHistoryItemClick,
}: OrderDetailPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [notes, setNotes] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  const updateStatus = useUpdateStatus()
  const updateNotes = useUpdateNotes()
  const { data: historyRecords = [], isLoading: historyLoading } = useGlobalHistory(30)

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
  }, [notes, isDirty, order, updateNotes])

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

  return (
    <div
      className={cn(
        'bg-white border-l flex flex-col shrink-0 z-10 shadow-lg',
        isOpen ? 'w-64' : 'w-10'
      )}
    >
      {/* Header */}
      <div className={cn(
        'px-2 py-2 border-b flex items-center gap-2 h-10',
        order ? 'bg-blue-50' : 'bg-gray-50'
      )}>
        {/* Back button when order selected - prominent styling */}
        {order && isOpen && (
          <button
            onClick={onClearSelection}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 focus:outline-none px-2 py-1 rounded text-xs font-medium transition-colors"
            title="Back to activity feed"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
        )}
        <h2
          className={cn(
            'font-bold text-gray-700 truncate text-xs flex-1',
            !isOpen && 'hidden'
          )}
        >
          {order ? (
            <>
              {order.order_type === 'PO' ? 'PO ' : ''}
              {order.number}
            </>
          ) : (
            'Activity'
          )}
        </h2>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-gray-400 hover:text-blue-600 focus:outline-none p-1"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className={cn('flex-1 overflow-y-auto', !isOpen && 'hidden')}>
        {!order ? (
          // Global Activity Feed
          <div className="divide-y divide-gray-100">
            {historyLoading ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                Loading activity...
              </div>
            ) : historyRecords.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                No recent activity
              </div>
            ) : (
              historyRecords.map((record) => {
                const orderKey = `${record.order_type}-${record.order_id}`
                const linkedOrder = allOrdersLookup[orderKey]
                return (
                <div
                  key={record.id}
                  onClick={() => {
                    if (linkedOrder && onHistoryItemClick) {
                      onHistoryItemClick(linkedOrder)
                    }
                  }}
                  className={cn(
                    'px-3 py-2 hover:bg-gray-50',
                    linkedOrder ? 'cursor-pointer' : 'cursor-default opacity-60',
                    record.order_type === 'PO' ? 'border-l-2 border-l-green-400' : 'border-l-2 border-l-blue-400'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {record.order_type === 'PO' ? (
                      <Package className="h-3 w-3 text-green-600" />
                    ) : (
                      <Truck className="h-3 w-3 text-blue-600" />
                    )}
                    <span className="font-medium text-xs text-gray-800">
                      {record.order_type}-{record.number}
                    </span>
                    <span className="text-[10px] text-gray-400 truncate flex-1">
                      {record.party_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                    <Clock className="h-3 w-3" />
                    <span>{formatDistanceToNow(new Date(record.history_date), { addSuffix: true })}</span>
                    <span className="text-gray-400">•</span>
                    <span className="truncate">{getHistoryDescription(record)}</span>
                  </div>
                  {record.history_user && (
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      by {record.history_user}
                    </div>
                  )}
                </div>
                )
              })
            )}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Party name */}
            <div>
              <h3 className="font-bold text-gray-800">{order.party_name}</h3>
              <p className="text-xs text-gray-500">
                {order.order_type === 'SO' ? 'Sales Order' : 'Purchase Order'}
              </p>
            </div>

            {/* Order info */}
            <div className="grid grid-cols-2 gap-2 text-sm">
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
              {order.total_pallets && (
                <div>
                  <span className="text-gray-500">Pallets:</span>
                  <span className="ml-2 font-medium">{order.total_pallets}</span>
                </div>
              )}
            </div>

            {/* Schedule info */}
            {order.scheduled_date && (
              <div className="text-sm p-2 bg-blue-50 rounded">
                <span className="text-gray-500">Scheduled:</span>
                <span className="ml-2 font-medium">
                  {order.scheduled_date}
                  {order.scheduled_truck_name && ` - ${order.scheduled_truck_name}`}
                </span>
              </div>
            )}

            {/* Contract Reference */}
            {order.contract_number && (
              <div className="text-sm p-2 bg-purple-50 rounded border border-purple-200">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-600" />
                  <span className="text-gray-500">Released from:</span>
                  <Link
                    to={`/contracts/${order.contract_id}`}
                    className="font-medium text-purple-600 hover:text-purple-800 hover:underline"
                  >
                    CTR-{order.contract_number}
                  </Link>
                </div>
              </div>
            )}

            {/* Status buttons */}
            <div>
              <Label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">
                Set Status
              </Label>
              <div className="flex flex-col gap-1">
                {statusOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleStatusChange(opt.value)}
                    disabled={updateStatus.isPending}
                    className={cn(
                      'text-left px-3 py-2 text-[11px] hover:bg-gray-100 flex items-center gap-2 transition-colors w-full rounded',
                      order.status === opt.value && 'bg-gray-100 font-medium'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full', opt.color)} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes" className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">
                Delivery Notes
                {isDirty && (
                  <span className="ml-2 text-yellow-600 normal-case">
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
        )}
      </div>
    </div>
  )
}
