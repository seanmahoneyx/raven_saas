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

interface OrderCardProps {
  order: CalendarOrder
  onClick?: () => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  onAddNote?: (order: CalendarOrder, position: { x: number; y: number }) => void
  /** Callback when clicking the yellow note indicator to view notes */
  onViewNotes?: (order: CalendarOrder) => void
  /** Number of notes attached to this order (for yellow bubble) */
  noteCount?: number
  isDragging?: boolean
  isOverlay?: boolean
  disableDrag?: boolean
  showRequestedDate?: boolean
  /** Whether an order is being dragged (for showing drop indicator) */
  isDragActive?: boolean
  /** Whether edit mode (jiggle) is active - LOCAL ONLY */
  isEditMode?: boolean
  /** Index for staggered jiggle animation (0-4) */
  jiggleIndex?: number
  /** Whether this card is the merge target (dwell threshold reached) */
  isMergeTarget?: boolean
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

// Status-based background colors (with transparency) for cards
// Border color indicates order type/delivery run, background indicates status
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

// Get border color based on order type and delivery run membership
const getBorderColor = (orderType: 'PO' | 'SO', inDeliveryRun: boolean) => {
  if (inDeliveryRun) {
    return 'border-purple-400'
  }
  if (orderType === 'PO') {
    return 'border-green-400'
  }
  return 'border-blue-400'
}

// Get handle colors based on order type
const getHandleColors = (orderType: 'PO' | 'SO', inDeliveryRun: boolean) => {
  if (inDeliveryRun) {
    return {
      bg: 'bg-purple-200/50 hover:bg-purple-300/50',
      icon: 'text-purple-600',
    }
  }
  if (orderType === 'PO') {
    return {
      bg: 'bg-green-200/50 hover:bg-green-300/50',
      icon: 'text-green-600',
    }
  }
  return {
    bg: 'bg-blue-200/50 hover:bg-blue-300/50',
    icon: 'text-blue-600',
  }
}

// Combined styling: status determines background, order type determines border
const getOrderTypeColors = (orderType: 'PO' | 'SO', status: OrderStatus, inDeliveryRun: boolean) => {
  const bgColor = statusBackgroundColors[status]
  const borderColor = getBorderColor(orderType, inDeliveryRun)

  // Add hover effect based on context
  const hoverBg = inDeliveryRun
    ? 'hover:bg-purple-100'
    : orderType === 'PO'
      ? 'hover:bg-green-50'
      : 'hover:bg-blue-50'

  return `${bgColor} ${borderColor} ${hoverBg}`
}

export default function OrderCard({ order, onClick, onStatusChange, onAddNote, onViewNotes, noteCount = 0, isDragging, isOverlay, disableDrag, showRequestedDate, isDragActive, isEditMode = false, jiggleIndex = 0, isMergeTarget = false }: OrderCardProps) {
  const orderId = `${order.order_type}-${order.id}`
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return

    const handleClick = () => {
      setContextMenu(null)
    }

    // Use setTimeout to avoid closing immediately on the same click that opened it
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
    transition: {
      duration: 200,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)', // iOS-like spring
    },
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

  // Apply sortable transform for smooth reordering animation
  // Always include transition for iOS-like smooth movement during drag preview
  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
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
    <div className="relative">
      {/* Drop indicator line above card - shows when hovering during drag (but NOT merge target) */}
      {isOver && isDragActive && !isMergeTarget && (
        <div className="absolute -top-1 left-1 right-1 h-1 bg-purple-500 rounded-full z-10 shadow-sm" />
      )}

      {/* Merge target overlay - shows when dwell threshold (600ms) reached */}
      {isMergeTarget && (
        <div className="absolute inset-0 bg-purple-500/20 rounded-lg flex items-center justify-center pointer-events-none z-20">
          <span className="bg-purple-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg">
            Release to merge
          </span>
        </div>
      )}

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
        data-order-id={`${order.order_type}-${order.id}`}
        onContextMenu={handleContextMenu}
        className={cn(
          // Base styles - iOS-like with rounded corners and subtle shadow
          'mb-1 rounded-lg border shadow-sm select-none overflow-hidden flex',
          'text-[11px] leading-tight transition-all duration-200',
          getOrderTypeColors(order.order_type, order.status, inDeliveryRun),
          // Dragging state - fade out the original
          (isDragging || isSortableDragging) && 'opacity-30 scale-[0.98]',
          // Overlay state (being dragged)
          isOverlay && (inDeliveryRun
            ? 'shadow-2xl ring-2 ring-purple-500'
            : order.order_type === 'PO'
              ? 'shadow-2xl ring-2 ring-green-500'
              : 'shadow-2xl ring-2 ring-blue-500'),
          // Hover effect - subtle lift (only when not dragging)
          !isDragging && !isSortableDragging && !isOverlay && 'hover:shadow-md hover:-translate-y-[1px]',
          // Drop target indicator - when another card hovers over this one (but NOT merge target)
          isOver && isDragActive && !isMergeTarget && 'ring-2 ring-purple-500 ring-offset-1 bg-purple-50 scale-[1.02]',
          // iOS-style jiggle animation when in edit mode (not while being dragged or overlay)
          isEditMode && !isDragging && !isSortableDragging && !isOverlay &&
            `jiggle-phase-${((jiggleIndex ?? 0) % 5) + 1}`,
          // Merge target indicator - shows when dwell threshold (600ms) reached
          isMergeTarget && 'merge-ready merge-target-expanded ring-2 ring-purple-500'
        )}
        onClick={() => {
          // Close context menu if open
          if (contextMenu) {
            setContextMenu(null)
            return
          }
          onClick?.()
        }}
      >
        {/* Drag handle on the left */}
        {!disableDrag && (
          <div
            {...attributes}
            {...listeners}
            className={cn(
              'flex items-center justify-center w-4 shrink-0 cursor-grab active:cursor-grabbing',
              handleColors.bg
            )}
            title="Drag to move"
          >
            <GripVertical className={cn('h-3 w-3', handleColors.icon)} />
          </div>
        )}

        {/* Main content */}
        <div className={cn(
          'flex-1 min-w-0',
          showRequestedDate ? 'py-1 px-1.5 flex flex-col gap-0.5' : 'h-6 px-1.5 flex items-center gap-1.5',
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

            {/* Order number - can truncate but shows at least some chars */}
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
