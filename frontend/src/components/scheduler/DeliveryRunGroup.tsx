import { useMemo, useState, useCallback, useEffect } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { GripVertical } from 'lucide-react'
import type { CalendarOrder, DeliveryRun, OrderStatus } from '@/types/api'
import OrderCard from './OrderCard'

interface DeliveryRunGroupProps {
  run: DeliveryRun
  orders: CalendarOrder[]
  onOrderClick?: (order: CalendarOrder) => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  onAddNote?: (order: CalendarOrder, position: { x: number; y: number }) => void
  onAddRunNote?: (run: DeliveryRun, position: { x: number; y: number }) => void
  /** Called when user wants to dissolve the run (remove all orders from it) */
  onDissolveRun?: (run: DeliveryRun) => void
  /** Callback when clicking the yellow note indicator to view notes */
  onViewNotes?: (target: { type: 'order'; order: CalendarOrder } | { type: 'run'; run: DeliveryRun }) => void
  /** Note counts per order key (e.g. "SO-123") */
  noteCounts?: Record<string, number>
  /** Total notes attached to this run */
  runNoteCount?: number
  isDragActive?: boolean
  isFirst?: boolean
  /** Whether edit mode (jiggle) is active - LOCAL ONLY */
  isEditMode?: boolean
  /** Index for staggered jiggle animation (0-4) */
  jiggleIndex?: number
  /** Whether this run group is the merge target (dwell threshold reached) */
  isMergeTarget?: boolean
}

export default function DeliveryRunGroup({
  run,
  orders,
  onOrderClick,
  onStatusChange,
  onAddNote,
  onAddRunNote,
  onDissolveRun,
  onViewNotes,
  noteCounts = {},
  runNoteCount = 0,
  isDragActive,
  isFirst = true,
  isEditMode = false,
  jiggleIndex = 0,
  isMergeTarget = false,
}: DeliveryRunGroupProps) {
  const groupId = `run-${run.id}`
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
    // Add note to the run itself
    if (pos && onAddRunNote) {
      onAddRunNote(run, pos)
    }
  }, [onAddRunNote, run, contextMenu])

  const handleDissolveClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu(null)
    onDissolveRun?.(run)
  }, [onDissolveRun, run])

  // Calculate total pallets for this run
  const totalPallets = useMemo(() => {
    return orders.reduce((sum, order) => {
      return sum + (order.total_pallets ?? order.total_quantity ?? 0)
    }, 0)
  }, [orders])

  // Use useDraggable for cross-container dragging (not useSortable which is for within-container sorting)
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    isDragging,
  } = useDraggable({
    id: groupId,
    data: {
      type: 'run',
      run,
      orders,
    },
  })

  // Make the run group droppable so other orders/runs can be dropped on it
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `run-drop-${run.id}`,
    data: {
      type: 'run',
      run,
      orders,
    },
  })

  // Combine refs - droppable on container, draggable on handle
  const setContainerRef = (node: HTMLElement | null) => {
    setDroppableRef(node)
  }

  const style = {
    // Use inline style to override the global * { border-color } rule
    borderColor: isOver && isDragActive ? '#7c3aed' : '#a855f7', // purple-600 when hover, purple-500 otherwise
  }

  // Calculate total notes for all orders in this run
  const totalOrderNotes = orders.reduce((sum, o) => {
    const key = `${o.order_type}-${o.id}`
    return sum + (noteCounts[key] || 0)
  }, 0)
  const totalNotes = totalOrderNotes + runNoteCount

  return (
    <div className={cn('relative', !isFirst && 'mt-1.5')}>
      {/* Merge target overlay - shows when dwell threshold (600ms) reached */}
      {isMergeTarget && (
        <div className="absolute inset-0 bg-purple-500/20 rounded-lg flex items-center justify-center pointer-events-none z-20">
          <span className="bg-purple-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg">
            Release to add to run
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
          <button
            type="button"
            onClick={handleDissolveClick}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 text-red-600"
          >
            Ungroup Orders
          </button>
        </div>
      )}

      {/* Drop indicator line above run group - shows when hovering during drag */}
      {isOver && isDragActive && (
        <div className="absolute -top-1 left-0 right-0 h-1 bg-purple-500 rounded-full z-10 shadow-sm" />
      )}
      <div
        ref={setContainerRef}
        data-run-group
        onContextMenu={handleContextMenu}
        style={style}
        className={cn(
          // iOS-like styling
          'rounded-lg border-2 bg-purple-50/60 flex transition-all duration-200',
          // Dragging state
          isDragging && 'opacity-30 scale-[0.98]',
          // Drop target indicator (but NOT merge target)
          isOver && isDragActive && !isMergeTarget && 'ring-2 ring-purple-500 ring-offset-1 bg-purple-100 scale-[1.01]',
          // Hover effect
          !isDragging && 'hover:shadow-md',
          // iOS-style jiggle animation when in edit mode (not while being dragged)
          isEditMode && !isDragging &&
            `jiggle-phase-${((jiggleIndex ?? 0) % 5) + 1}`,
          // Merge target indicator - shows when dwell threshold (600ms) reached
          isMergeTarget && 'merge-ready merge-target-expanded ring-2 ring-purple-500'
        )}
      >
        {/* Drag handle on the left - only this triggers group drag */}
        <div
          ref={setDraggableRef}
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-5 bg-purple-200/50 rounded-l-lg cursor-grab active:cursor-grabbing hover:bg-purple-300/50 shrink-0 transition-colors"
          title="Drag to move entire run"
        >
          <GripVertical className="h-4 w-4 text-purple-600" />
        </div>

        {/* Orders container - orders can be individually manipulated */}
        <div className="flex-1 p-0.5 min-w-0">
          {orders.map((order) => {
            const orderKey = `${order.order_type}-${order.id}`
            return (
              <OrderCard
                key={orderKey}
                order={order}
                onClick={() => onOrderClick?.(order)}
                onStatusChange={onStatusChange}
                onAddNote={onAddNote}
                onViewNotes={(order) => onViewNotes?.({ type: 'order', order })}
                noteCount={noteCounts[orderKey] || 0}
                isDragActive={isDragActive}
              />
            )
          })}
        </div>

        {/* Right side - pallet count and optional note indicator */}
        <div
          className="flex flex-col items-center justify-center w-5 bg-purple-500 rounded-r shrink-0 gap-0.5 py-0.5"
          title={`Total: ${totalPallets} pallets${totalNotes > 0 ? `, ${totalNotes} notes` : ''}`}
        >
          <span className="text-[10px] font-bold text-white">{totalPallets}</span>
          {/* Notes indicator - yellow bubble with count */}
          {totalNotes > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onViewNotes?.({ type: 'run', run })
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="bg-yellow-400 text-yellow-900 text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center hover:bg-yellow-500 hover:scale-110 transition-all cursor-pointer"
              title="View notes"
            >
              {totalNotes}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
