import { useMemo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { GripVertical, ChevronDown, ChevronRight, Layers } from 'lucide-react'
import type { CalendarOrder, DeliveryRun, OrderStatus } from '@/types/api'
import BlockCard from './BlockCard'

interface ContainerBlockProps {
  run: DeliveryRun
  ordersInRun: CalendarOrder[]
  isExpanded: boolean
  onToggleExpand: () => void
  onDissolve: () => void
  onOrderClick?: (order: CalendarOrder) => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  onAddNote?: (order: CalendarOrder, position: { x: number; y: number }) => void
  onViewNotes?: (order: CalendarOrder) => void
  noteCounts?: Record<string, number>
}

export default function ContainerBlock({
  run,
  ordersInRun,
  isExpanded,
  onToggleExpand,
  onDissolve,
  onOrderClick,
  onStatusChange,
  onAddNote,
  onViewNotes,
  noteCounts = {},
}: ContainerBlockProps) {
  const containerId = `container-${run.id}`

  // Container is SORTABLE (can be dragged as a unit)
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    isDragging,
  } = useSortable({
    id: containerId,
    data: {
      type: 'container',
      run,
      orders: ordersInRun,
    },
  })

  // Container body is ALSO DROPPABLE (can receive drops)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `container-drop-${run.id}`,
    data: {
      type: 'container-drop',
      runId: run.id,
    },
  })

  // Combine refs - sortable on the whole container, droppable on the body
  const setContainerRef = (node: HTMLElement | null) => {
    setSortableRef(node)
    setDropRef(node)
  }

  // Calculate total pallets for this run
  const totalPallets = useMemo(() => {
    return ordersInRun.reduce((sum, order) => {
      return sum + (order.total_pallets ?? order.total_quantity ?? 0)
    }, 0)
  }, [ordersInRun])

  // Calculate total notes
  const totalNotes = useMemo(() => {
    return ordersInRun.reduce((sum, order) => {
      const key = `${order.order_type}-${order.id}`
      return sum + (noteCounts[key] || 0)
    }, 0)
  }, [ordersInRun, noteCounts])

  return (
    <div
      ref={setContainerRef}
      className={cn(
        // Scratch-style C-block container
        'relative mb-2 rounded-xl border-3 bg-gradient-to-br from-purple-50 to-purple-100',
        'shadow-[0_4px_12px_rgba(139,92,246,0.3)]',
        'transition-all duration-150',
        // Dragging state
        isDragging && 'opacity-30',
        // Drop target indicator
        isOver && 'ring-2 ring-purple-500 ring-offset-2 bg-purple-200',
        // Hover effect
        !isDragging && 'hover:shadow-[0_6px_16px_rgba(139,92,246,0.4)]'
      )}
      style={{
        borderWidth: '3px',
        borderColor: '#8b5cf6', // purple-500
      }}
    >
      {/* Container Header - C-block style with drag handle */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'flex items-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-t-lg cursor-grab active:cursor-grabbing',
          'font-bold text-sm'
        )}
      >
        {/* Drag handle */}
        <GripVertical className="h-4 w-4 shrink-0" />

        {/* Collapse/expand button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 hover:bg-purple-600 rounded p-0.5 transition-colors"
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Run name */}
        <span className="flex-1 truncate">{run.name}</span>

        {/* Pallet count */}
        <span className="shrink-0 tabular-nums text-sm">{totalPallets}p</span>

        {/* Notes indicator */}
        {totalNotes > 0 && (
          <span className="bg-yellow-400 text-yellow-900 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
            {totalNotes}
          </span>
        )}

        {/* Dissolve button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDissolve()
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 hover:bg-red-600 bg-red-500 rounded px-2 py-1 transition-colors flex items-center gap-1 text-xs"
          title="Ungroup - remove container but keep orders"
        >
          <Layers className="w-3 h-3" />
          Dissolve
        </button>
      </div>

      {/* Container Body - visual wrapper ONLY, NO nested SortableContext */}
      {isExpanded && (
        <div
          className={cn(
            'p-2 bg-purple-50/50 rounded-b-lg min-h-[40px]',
            // Drop indicator when hovering
            isOver && 'bg-purple-100 ring-2 ring-purple-400 ring-inset'
          )}
        >
          {ordersInRun.length === 0 ? (
            <div className="text-center text-purple-400 text-xs py-4">
              Drop orders here
            </div>
          ) : (
            <>
              {/* CRITICAL: Orders are rendered here but are part of PARENT SortableContext */}
              {/* This is visual nesting only - no nested SortableContext */}
              {ordersInRun.map((order) => {
                const orderKey = `${order.order_type}-${order.id}`
                return (
                  <BlockCard
                    key={orderKey}
                    order={order}
                    isNested
                    onClick={() => onOrderClick?.(order)}
                    onStatusChange={onStatusChange}
                    onAddNote={onAddNote}
                    onViewNotes={onViewNotes}
                    noteCount={noteCounts[orderKey] || 0}
                  />
                )
              })}
              {/* Drop indicator at bottom */}
              {isOver && (
                <div className="h-1 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full shadow-lg animate-pulse mt-1" />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
