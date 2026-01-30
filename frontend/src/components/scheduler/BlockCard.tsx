import { useState, useCallback, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { CalendarOrder, OrderStatus } from '@/types/api'
import { Info, Calendar, GripVertical } from 'lucide-react'
import { format, parseISO, isPast, isToday } from 'date-fns'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface BlockCardProps {
  order: CalendarOrder
  onClick?: () => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  onAddNote?: (order: CalendarOrder, position: { x: number; y: number }) => void
  onViewNotes?: (order: CalendarOrder) => void
  noteCount?: number
  isNested?: boolean
  isOverlay?: boolean
  disableDrag?: boolean
  showRequestedDate?: boolean
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

// Scratch-style blocky background colors
const statusBackgroundColors: Record<OrderStatus, string> = {
  draft: 'bg-gray-100',
  confirmed: 'bg-gray-200',
  scheduled: 'bg-white',
  picking: 'bg-yellow-100',
  shipped: 'bg-green-100',
  complete: 'bg-blue-100',
  crossdock: 'bg-orange-100',
  cancelled: 'bg-red-100 opacity-60',
}

// Get border color - Scratch style with thicker borders
const getBorderColor = (orderType: 'PO' | 'SO', inDeliveryRun: boolean) => {
  if (inDeliveryRun) {
    return 'border-purple-500'
  }
  if (orderType === 'PO') {
    return 'border-green-500'
  }
  return 'border-blue-500'
}

// Get handle colors - Scratch-style blocky
const getHandleColors = (orderType: 'PO' | 'SO', inDeliveryRun: boolean) => {
  if (inDeliveryRun) {
    return {
      bg: 'bg-purple-200 hover:bg-purple-300',
      icon: 'text-purple-700',
    }
  }
  if (orderType === 'PO') {
    return {
      bg: 'bg-green-200 hover:bg-green-300',
      icon: 'text-green-700',
    }
  }
  return {
    bg: 'bg-blue-200 hover:bg-blue-300',
    icon: 'text-blue-700',
  }
}

// Combined styling: status determines background, order type determines border
const getOrderTypeColors = (orderType: 'PO' | 'SO', status: OrderStatus, inDeliveryRun: boolean) => {
  const bgColor = statusBackgroundColors[status]
  const borderColor = getBorderColor(orderType, inDeliveryRun)

  const hoverBg = inDeliveryRun
    ? 'hover:bg-purple-100'
    : orderType === 'PO'
      ? 'hover:bg-green-50'
      : 'hover:bg-blue-50'

  return `${bgColor} ${borderColor} ${hoverBg}`
}

export default function BlockCard({
  order,
  onClick,
  onStatusChange,
  onAddNote,
  onViewNotes,
  noteCount = 0,
  isNested = false,
  isOverlay = false,
  disableDrag = false,
  showRequestedDate = false,
}: BlockCardProps) {
  const orderId = `${order.order_type}-${order.id}`
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return

    const handleClick = () => {
      setContextMenu(null)
    }

    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleAddNoteClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const pos = contextMenu
    setContextMenu(null)
    if (pos && onAddNote) {
      onAddNote(order, pos)
    }
  }, [onAddNote, order, contextMenu])

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: orderId,
    disabled: disableDrag,
  })

  // Make the order card also droppable for drop detection
  const { setNodeRef: setDroppableRef } = useDroppable({
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

  // Simple transform for Scratch-style (instant snap, no rubber band)
  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition: transition || 'none',
      }

  // Check if requested date is past due
  const requestedDateObj = order.requested_date ? parseISO(order.requested_date) : null
  const isPastDue = requestedDateObj && isPast(requestedDateObj) && !isToday(requestedDateObj)
  const isDueToday = requestedDateObj && isToday(requestedDateObj)

  // Check if order is part of a delivery run
  const inDeliveryRun = !!order.delivery_run_id

  // Get handle colors
  const handleColors = getHandleColors(order.order_type, inDeliveryRun)

  return (
    <div className="relative" data-block-card>
      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={handleAddNoteClick}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
          >
            Add Note
          </button>
        </div>
      )}

      <div
        ref={setNodeRef}
        style={style}
        data-order-card
        data-order-id={orderId}
        onContextMenu={handleContextMenu}
        className={cn(
          // Scratch-style base: blocky, high-contrast, THICK borders
          'mb-1.5 rounded-xl border-3 select-none overflow-hidden flex',
          'font-family-sans font-bold transition-all duration-100',
          isNested ? 'text-[10px]' : 'text-xs',
          // STRONG box shadow for Scratch depth
          'shadow-[0_3px_6px_rgba(0,0,0,0.3)]',
          getOrderTypeColors(order.order_type, order.status, inDeliveryRun),
          // Dragging state
          isSortableDragging && 'opacity-30',
          // Overlay state (being dragged)
          isOverlay && (inDeliveryRun
            ? 'shadow-[0_12px_24px_rgba(0,0,0,0.4)] ring-3 ring-purple-500'
            : order.order_type === 'PO'
              ? 'shadow-[0_12px_24px_rgba(0,0,0,0.4)] ring-3 ring-green-500'
              : 'shadow-[0_12px_24px_rgba(0,0,0,0.4)] ring-3 ring-blue-500'),
          // Hover effect - blocky lift (more dramatic)
          !isSortableDragging && !isOverlay && 'hover:translate-y-[-3px] hover:shadow-[0_6px_12px_rgba(0,0,0,0.35)]',
        )}
        onClick={() => {
          if (contextMenu) {
            setContextMenu(null)
            return
          }
          onClick?.()
        }}
      >
        {/* Drag handle on the left - 6-dot grip, 24px wide */}
        {!disableDrag && (
          <div
            {...attributes}
            {...listeners}
            className={cn(
              'flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing transition-colors',
              'border-r-2 border-black border-opacity-10',
              isNested ? 'w-5' : 'w-6',
              handleColors.bg
            )}
            title="Drag to move"
          >
            <GripVertical className={cn(isNested ? 'h-3.5 w-3.5' : 'h-4 w-4', handleColors.icon)} />
          </div>
        )}

        {/* Main content */}
        <div className={cn(
          'flex-1 min-w-0',
          showRequestedDate ? 'py-1 px-1.5 flex flex-col gap-0.5' : (isNested ? 'h-5 px-1.5' : 'h-6 px-1.5') + ' flex items-center gap-1.5',
          disableDrag && 'cursor-pointer'
        )}>
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

            {/* Order number */}
            <span className="text-gray-500 font-mono shrink-0 max-w-[50px] truncate">
              {order.number}
            </span>

            {/* Pallets/Quantity - always visible */}
            <span className="font-bold text-gray-700 shrink-0 tabular-nums min-w-[16px] text-right">
              {order.total_pallets ?? order.total_quantity ?? 0}
            </span>

            {/* Notes indicator - yellow bubble with count */}
            {noteCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onViewNotes?.(order)
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="bg-yellow-400 text-yellow-900 text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shrink-0 hover:bg-yellow-500 hover:scale-110 transition-all cursor-pointer"
                title="View notes"
              >
                {noteCount}
              </button>
            )}

            {/* Order notes indicator */}
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
      </div>
    </div>
  )
}
