import { useState, useCallback, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import type { CalendarOrder, OrderStatus } from '@/types/api'
import OrderCard from './OrderCard'
import { ChevronDown, ChevronUp, Layers, GripVertical } from 'lucide-react'

interface CombinedOrderCardProps {
  orders: CalendarOrder[]
  partyName: string
  onOrderClick?: (order: CalendarOrder) => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  onAddNote?: (order: CalendarOrder, position: { x: number; y: number }) => void
  /** Callback when clicking the yellow note indicator to view notes */
  onViewNotes?: (order: CalendarOrder) => void
  /** Note counts per order key (e.g. "SO-123") */
  noteCounts?: Record<string, number>
  isDragActive?: boolean
  /** Whether edit mode (jiggle) is active - LOCAL ONLY */
  isEditMode?: boolean
  /** Index for staggered jiggle animation (0-4) */
  jiggleIndex?: number
  /** Whether this combined card is the merge target (dwell threshold reached) */
  isMergeTarget?: boolean
}

// Get the "most advanced" status from a group of orders for display purposes
const getMostAdvancedStatus = (orders: CalendarOrder[]): OrderStatus => {
  const statusPriority: OrderStatus[] = [
    'cancelled', 'draft', 'confirmed', 'scheduled', 'picking', 'crossdock', 'shipped', 'complete'
  ]
  let highestPriority = -1
  let result: OrderStatus = 'draft'

  for (const order of orders) {
    const priority = statusPriority.indexOf(order.status)
    if (priority > highestPriority) {
      highestPriority = priority
      result = order.status
    }
  }
  return result
}

// Status-based background colors matching OrderCard
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

// Status dot colors
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

export default function CombinedOrderCard({
  orders,
  partyName,
  onOrderClick,
  onStatusChange,
  onAddNote,
  onViewNotes,
  noteCounts = {},
  isDragActive,
  isEditMode = false,
  jiggleIndex = 0,
  isMergeTarget = false,
}: CombinedOrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
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
    // Add note to the first order in the combined group
    if (pos && orders.length > 0 && onAddNote) {
      onAddNote(orders[0], pos)
    }
  }, [onAddNote, orders, contextMenu])

  // Calculate totals
  const totalPallets = orders.reduce((sum, o) => sum + (o.total_pallets ?? o.total_quantity ?? 0), 0)
  const orderNumbers = orders.map((o) => o.number).join(', ')
  const orderCount = orders.length
  const dominantStatus = getMostAdvancedStatus(orders)

  // Calculate total notes for all orders in this combined card
  const totalNotes = orders.reduce((sum, o) => {
    const key = `${o.order_type}-${o.id}`
    return sum + (noteCounts[key] || 0)
  }, 0)

  // Check if any orders are in a delivery run
  const hasRunOrders = orders.some((o) => o.delivery_run_id)

  // Determine border color based on order type and run membership
  const orderType = orders[0].order_type
  const borderColor = hasRunOrders
    ? 'border-purple-400'
    : orderType === 'PO'
      ? 'border-green-400'
      : 'border-blue-400'

  // Get handle colors
  const handleColors = hasRunOrders
    ? { bg: 'bg-purple-200/50 hover:bg-purple-300/50', icon: 'text-purple-600' }
    : orderType === 'PO'
      ? { bg: 'bg-green-200/50 hover:bg-green-300/50', icon: 'text-green-600' }
      : { bg: 'bg-blue-200/50 hover:bg-blue-300/50', icon: 'text-blue-600' }

  // Create a unique ID for dragging the combined group
  // Use first order's ID as part of the key for uniqueness
  const combinedId = `combined-${orders[0].order_type}-${orders[0].id}`

  // Make the collapsed card draggable as a group
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    isDragging,
  } = useDraggable({
    id: combinedId,
    data: {
      type: 'combined',
      orders,
      partyName,
    },
    disabled: isExpanded, // Disable dragging when expanded
  })

  // If expanded, show individual cards
  if (isExpanded) {
    return (
      <div className="relative">
        {/* Collapse button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded(false)
          }}
          className={cn(
            'w-full mb-0.5 px-1.5 h-5 rounded border shadow-sm flex items-center gap-1.5',
            'text-[10px] leading-none cursor-pointer',
            'bg-gray-50 border-gray-300 hover:bg-gray-100 text-gray-600'
          )}
        >
          <ChevronUp className="h-3 w-3" />
          <span>Collapse {orderCount} orders for {partyName}</span>
        </button>

        {/* Individual order cards */}
        {orders.map((order, idx) => {
          const orderKey = `${order.order_type}-${order.id}`
          return (
            <OrderCard
              key={orderKey}
              order={order}
              onClick={() => onOrderClick?.(order)}
              onStatusChange={onStatusChange}
              onAddNote={onAddNote}
              onViewNotes={onViewNotes}
              noteCount={noteCounts[orderKey] || 0}
              isDragActive={isDragActive}
              isEditMode={isEditMode}
              jiggleIndex={jiggleIndex + idx}
            />
          )
        })}
      </div>
    )
  }

  // Collapsed view - combined card with drag handle
  return (
    <div className="relative">
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
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
          >
            Add Note
          </button>
        </div>
      )}

      <div
        onContextMenu={handleContextMenu}
        className={cn(
          // iOS-like styling
          'mb-1 rounded-lg border shadow-sm select-none overflow-hidden flex',
          'text-[11px] leading-tight transition-all duration-200',
          statusBackgroundColors[dominantStatus],
          borderColor,
          // Dragging state
          isDragging && 'opacity-30 scale-[0.98]',
          // Hover effect
          !isDragging && 'hover:shadow-md hover:-translate-y-[1px]',
          // iOS-style jiggle animation when in edit mode (not while being dragged)
          isEditMode && !isDragging &&
            `jiggle-phase-${((jiggleIndex ?? 0) % 5) + 1}`,
          // Merge target indicator - shows when dwell threshold (600ms) reached
          isMergeTarget && 'merge-ready merge-target-expanded ring-2 ring-purple-500'
        )}
      >
        {/* Drag handle on the left */}
        <div
          ref={setDraggableRef}
          {...attributes}
          {...listeners}
          className={cn(
            'flex items-center justify-center w-4 shrink-0 cursor-grab active:cursor-grabbing transition-colors',
            handleColors.bg
          )}
          title="Drag to move all orders together"
        >
          <GripVertical className={cn('h-3 w-3', handleColors.icon)} />
        </div>

        {/* Main content - clickable to expand */}
        <div
          className="flex-1 px-1.5 py-1 cursor-pointer min-w-0"
          onClick={() => setIsExpanded(true)}
          title={`Click to expand ${orderCount} orders`}
        >
          {/* Main row */}
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Status dot with count badge */}
            <div className="relative shrink-0">
              <div className={cn('w-3 h-3 rounded-full', statusDotColors[dominantStatus])} />
              {/* Count badge */}
              <span className={cn(
                'absolute -top-1 -right-1 text-white text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center',
                orderType === 'PO' ? 'bg-green-600' : 'bg-blue-600'
              )}>
                {orderCount}
              </span>
            </div>

            {/* Party name */}
            <span className="font-semibold text-gray-800 truncate min-w-0 flex-1">
              {partyName}
            </span>

            {/* Expand indicator */}
            <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />

            {/* Total pallets */}
            <span className="font-bold text-gray-700 shrink-0 tabular-nums min-w-[16px] text-right">
              {totalPallets}
            </span>

            {/* Notes indicator - yellow bubble with count */}
            {totalNotes > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  // View notes for first order in the combined group
                  if (orders.length > 0) {
                    onViewNotes?.(orders[0])
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="bg-yellow-400 text-yellow-900 text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shrink-0 hover:bg-yellow-500 hover:scale-110 transition-all cursor-pointer"
                title="View notes"
              >
                {totalNotes}
              </button>
            )}
          </div>

          {/* Order numbers row */}
          <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5 pl-4">
            <Layers className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{orderNumbers}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
