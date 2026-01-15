import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { CalendarOrder, OrderStatus } from '@/types/api'
import { Info, Calendar } from 'lucide-react'
import { format, parseISO, isPast, isToday } from 'date-fns'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface OrderCardProps {
  order: CalendarOrder
  onClick?: () => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  isDragging?: boolean
  isOverlay?: boolean
  disableDrag?: boolean
  showRequestedDate?: boolean
  /** Whether an order is being dragged (for showing drop indicator) */
  isDragActive?: boolean
}

// Status options for the dropdown
const statusOptions: { value: OrderStatus; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-300' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-gray-400' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-white border border-gray-400' },
  { value: 'picking', label: 'Pick Ticket', color: 'bg-yellow-500' },
  { value: 'shipped', label: 'Shipped', color: 'bg-green-600' },
  { value: 'complete', label: 'Completed', color: 'bg-blue-600' },
  { value: 'crossdock', label: 'Crossdock', color: 'bg-orange-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-500' },
]

// Status-based styling for the status dot
const statusDotColors: Record<OrderStatus, string> = {
  draft: 'bg-gray-300',
  confirmed: 'bg-gray-400',
  scheduled: 'bg-white border border-gray-400',
  picking: 'bg-yellow-500',
  shipped: 'bg-green-600',
  complete: 'bg-blue-600',
  crossdock: 'bg-orange-500',
  cancelled: 'bg-red-500',
}

// Order type colors - POs are green (match inbound row), SOs are blue (match truck rows)
// Orders in a delivery run get purple border to match the group
const getOrderTypeColors = (orderType: 'PO' | 'SO', status: OrderStatus, inDeliveryRun: boolean) => {
  if (status === 'cancelled') {
    return 'bg-red-50 border-red-300 opacity-60'
  }
  // Orders in a delivery run get purple theme
  if (inDeliveryRun) {
    return 'bg-purple-50 border-purple-400 hover:bg-purple-100'
  }
  if (orderType === 'PO') {
    // Purchase Orders - green theme to match inbound row
    return 'bg-green-50 border-green-300 hover:bg-green-100'
  }
  // Sales Orders - blue theme to match truck rows
  return 'bg-blue-50 border-blue-300 hover:bg-blue-100'
}

export default function OrderCard({ order, onClick, onStatusChange, isDragging, isOverlay, disableDrag, showRequestedDate, isDragActive }: OrderCardProps) {
  const orderId = `${order.order_type}-${order.id}`

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isSorting,
  } = useSortable({
    id: orderId,
    disabled: disableDrag,
  })

  // Make the order card also droppable for order-on-order drops
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `order-drop-${orderId}`,
    data: {
      type: 'order',
      order,
    },
  })

  // Combine both refs
  const setNodeRef = (node: HTMLElement | null) => {
    setSortableRef(node)
    setDroppableRef(node)
  }

  // Only apply transform/transition when not in overlay mode
  // and disable transitions during sorting for snappy feel
  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition: isSorting ? 'none' : transition,
      }

  // Check if requested date is past due
  const requestedDateObj = order.requested_date ? parseISO(order.requested_date) : null
  const isPastDue = requestedDateObj && isPast(requestedDateObj) && !isToday(requestedDateObj)
  const isDueToday = requestedDateObj && isToday(requestedDateObj)

  // Check if order is part of a delivery run
  const inDeliveryRun = !!order.delivery_run_id

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-order-card
      data-order-id={`${order.order_type}-${order.id}`}
      {...attributes}
      {...(disableDrag ? {} : listeners)}
      className={cn(
        'transition-all duration-150',
        'mb-0.5 px-1.5 rounded border shadow-sm select-none overflow-hidden',
        showRequestedDate ? 'py-1 flex flex-col gap-0.5' : 'h-6 flex items-center gap-1.5',
        'text-[11px] leading-none',
        getOrderTypeColors(order.order_type, order.status, inDeliveryRun),
        !disableDrag && 'cursor-move',
        disableDrag && 'cursor-pointer',
        isDragging && 'opacity-40',
        isOverlay && (inDeliveryRun
          ? 'shadow-xl ring-2 ring-purple-500'
          : order.order_type === 'PO'
            ? 'shadow-xl ring-2 ring-green-500'
            : 'shadow-xl ring-2 ring-blue-500'),
        // Visual indicator when another order is being dragged over this one
        isOver && isDragActive && 'ring-2 ring-purple-500 ring-offset-1 scale-105 bg-purple-100 border-purple-400'
      )}
      onClick={onClick}
    >
      {/* Main row */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Status dot - dropdown to change status */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Change status (currently ${order.status})`}
              className={cn(
                'w-3 h-3 rounded-full shrink-0 hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 transition-all',
                statusDotColors[order.status]
              )}
              title={`Status: ${order.status} (click to change)`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {statusOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={(e) => {
                  e.stopPropagation()
                  onStatusChange?.(order, option.value)
                }}
                className="flex items-center gap-2 text-xs"
              >
                <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', option.color)} />
                <span className={order.status === option.value ? 'font-semibold' : ''}>
                  {option.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Party name - truncates if needed */}
        <span className="font-semibold text-gray-800 truncate min-w-0 flex-1">
          {order.party_name}
        </span>

        {/* Order number - can truncate but shows at least some chars */}
        <span className="text-gray-500 font-mono shrink-0 max-w-[50px] truncate">
          {order.number}
        </span>

        {/* Pallets/Quantity - always visible */}
        <span className="font-bold text-gray-700 shrink-0 tabular-nums min-w-[16px] text-right">
          {order.total_pallets ?? order.total_quantity ?? 0}
        </span>

        {/* Notes indicator */}
        {order.notes && (
          <Info className="h-3 w-3 text-yellow-600 shrink-0" />
        )}
      </div>

      {/* Requested date row - only shown when showRequestedDate is true */}
      {showRequestedDate && order.requested_date && (
        <div className={cn(
          'flex items-center gap-1 text-[10px] pl-4',
          isPastDue && 'text-red-600 font-medium',
          isDueToday && 'text-orange-600 font-medium',
          !isPastDue && !isDueToday && 'text-gray-500'
        )}>
          <Calendar className="h-2.5 w-2.5" />
          <span>
            {isPastDue && 'OVERDUE: '}
            {isDueToday && 'TODAY: '}
            {format(requestedDateObj!, 'MMM d')}
          </span>
        </div>
      )}
    </div>
  )
}
