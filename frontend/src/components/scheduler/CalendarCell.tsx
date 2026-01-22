import { useMemo, useState, useCallback, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import type { CalendarOrder, DeliveryRun, OrderStatus, SchedulerNote, NoteColor } from '@/types/api'
import OrderCard from './OrderCard'
import DeliveryRunGroup from './DeliveryRunGroup'
import CombinedOrderCard from './CombinedOrderCard'
import NoteCard from './NoteCard'

// Preview state for iOS-like reordering during drag
type PreviewState = {
  // Map of cellId -> ordered list of order IDs in that cell
  cells: Record<string, string[]>
  // The ID of the item being dragged
  activeId: string
  // The original cell the item came from
  originalCellId: string
}

interface CalendarCellProps {
  date: string
  truckId: number | null
  orders: CalendarOrder[]
  /** Cell-attached notes (displayed inline with orders) */
  notes?: SchedulerNote[]
  /** All scheduler notes - used to compute order/run note counts */
  allNotes?: SchedulerNote[]
  deliveryRuns?: DeliveryRun[]
  isToday?: boolean
  onOrderClick?: (order: CalendarOrder) => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  onNoteUpdate?: (noteId: number, updates: { content?: string; color?: NoteColor; isPinned?: boolean }) => void
  onNoteDelete?: (noteId: number) => void
  onAddNote?: (position: { x: number; y: number }) => void
  onAddNoteToOrder?: (order: CalendarOrder, position: { x: number; y: number }) => void
  onAddNoteToRun?: (run: DeliveryRun, position: { x: number; y: number }) => void
  /** Callback when clicking the yellow note indicator to view notes */
  onViewNotes?: (target: { type: 'order'; order: CalendarOrder } | { type: 'run'; run: DeliveryRun }) => void
  onDissolveRun?: (run: DeliveryRun) => void
  variant?: 'default' | 'inbound'
  isValidDropTarget?: boolean
  /** Whether a drag is currently active */
  isDragActive?: boolean
  /** ID of the cell currently being hovered during drag (for drop zone visibility) */
  hoveredCellId?: string | null
  /** Preview state for iOS-like reordering during drag */
  previewState?: PreviewState | null
  /** Lookup of all orders by ID for preview rendering */
  allOrdersLookup?: Record<string, CalendarOrder>
  /** Whether edit mode (jiggle) is active - LOCAL ONLY */
  isEditMode?: boolean
  /** ID of the merge target (order-drop-* or run-drop-*) when dwell threshold reached */
  mergeTargetId?: string | null
}

export default function CalendarCell({
  date,
  truckId,
  orders,
  notes = [],
  allNotes = [],
  deliveryRuns = [],
  isToday,
  onOrderClick,
  onStatusChange,
  onNoteUpdate,
  onNoteDelete,
  onAddNote,
  onAddNoteToOrder,
  onAddNoteToRun,
  onViewNotes,
  onDissolveRun,
  variant = 'default',
  isValidDropTarget,
  isDragActive,
  hoveredCellId: _hoveredCellId, // Reserved for future use
  previewState,
  allOrdersLookup = {},
  isEditMode = false,
  mergeTargetId = null,
}: CalendarCellProps) {
  const cellId = `cell-${truckId ?? 'inbound'}-${date}`
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  // Track jiggle index for staggered animation
  let jiggleCounter = 0

  // Compute display orders - use preview state during drag for iOS-like reordering
  const displayOrders = useMemo(() => {
    // If preview state exists and has orders for this cell, use it
    if (previewState && previewState.cells[cellId]) {
      const previewOrderIds = previewState.cells[cellId]
      // Map order IDs to actual order objects, filtering out the actively dragged item
      return previewOrderIds
        .filter((id) => id !== previewState.activeId) // Don't show dragged item in cell
        .map((id) => allOrdersLookup[id])
        .filter((o): o is CalendarOrder => o !== undefined)
    }
    // Otherwise use actual orders (filtering out actively dragged item if applicable)
    if (previewState) {
      return orders.filter((o) => `${o.order_type}-${o.id}` !== previewState.activeId)
    }
    return orders
  }, [orders, previewState, cellId, allOrdersLookup])

  const { setNodeRef, isOver } = useDroppable({
    id: cellId,
    data: { date, truckId, position: 'cell' },
  })

  // NOTE: Top/bottom drop zones have been REMOVED in favor of iOS-style
  // fluid reflow where cards shift during drag based on Y-position

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
    // Only show context menu if clicking on empty space in the cell
    if ((e.target as HTMLElement).closest('[data-order-card], [data-note-card], [data-run-group]')) {
      return
    }
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleAddNoteClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const pos = contextMenu
    setContextMenu(null)
    if (pos && onAddNote) {
      onAddNote(pos)
    }
  }, [onAddNote, contextMenu])

  // Group orders by delivery run and by party (for combining same-customer orders)
  // Use displayOrders which respects preview state during drag
  const { ordersInRuns, unassignedOrders, partyGroups, sortedPartyNames } = useMemo(() => {
    const runsForCell = deliveryRuns.filter(
      (r) => r.truck_id === truckId && r.scheduled_date === date
    )
    const runIdSet = new Set(runsForCell.map((r) => r.id))

    const inRuns: Record<number, CalendarOrder[]> = {}
    const unassigned: CalendarOrder[] = []

    // When preview state is active, preserve the preview order instead of sorting by sequence
    // This allows the iOS-like visual reordering during drag
    const ordersToProcess = previewState && previewState.cells[cellId]
      ? displayOrders // Already in correct preview order
      : [...displayOrders].sort((a, b) => (a.scheduler_sequence ?? 0) - (b.scheduler_sequence ?? 0))

    ordersToProcess.forEach((order) => {
      if (order.delivery_run_id && runIdSet.has(order.delivery_run_id)) {
        if (!inRuns[order.delivery_run_id]) {
          inRuns[order.delivery_run_id] = []
        }
        inRuns[order.delivery_run_id].push(order)
      } else {
        unassigned.push(order)
      }
    })

    // Group unassigned orders by party_name for combining
    // When preview state is active, preserve order from displayOrders
    const byParty: Record<string, CalendarOrder[]> = {}
    const partyFirstIndex: Record<string, number> = {} // Track first order index per party
    unassigned.forEach((order, index) => {
      const key = order.party_name
      if (!byParty[key]) {
        byParty[key] = []
        partyFirstIndex[key] = index // Use index to preserve preview order
      }
      byParty[key].push(order)
    })

    // Sort party names by the index of their first order (preserves preview order)
    const sortedNames = Object.keys(byParty).sort(
      (a, b) => partyFirstIndex[a] - partyFirstIndex[b]
    )

    return {
      ordersInRuns: inRuns,
      unassignedOrders: unassigned,
      partyGroups: byParty,
      sortedPartyNames: sortedNames,
      runsForCell,
    }
  }, [displayOrders, deliveryRuns, truckId, date, previewState, cellId])

  const runsForCell = deliveryRuns.filter(
    (r) => r.truck_id === truckId && r.scheduled_date === date
  ).sort((a, b) => a.sequence - b.sequence)

  const showRuns = variant !== 'inbound' && truckId !== null

  // Sort notes: pinned first, then by created_at descending
  // Only include cell notes (not attached to orders)
  const sortedCellNotes = useMemo(() => {
    return [...notes]
      .filter((n) => !n.sales_order_id && !n.purchase_order_id && !n.delivery_run_id)
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [notes])

  // Build note counts by order (uses allNotes because order notes don't have scheduled_date)
  const orderNoteCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    allNotes.forEach((note) => {
      if (note.sales_order_id) {
        const key = `SO-${note.sales_order_id}`
        counts[key] = (counts[key] || 0) + 1
      }
      if (note.purchase_order_id) {
        const key = `PO-${note.purchase_order_id}`
        counts[key] = (counts[key] || 0) + 1
      }
    })
    return counts
  }, [allNotes])

  // Build note counts by delivery run (uses allNotes)
  const runNoteCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    allNotes.forEach((note) => {
      if (note.delivery_run_id) {
        counts[note.delivery_run_id] = (counts[note.delivery_run_id] || 0) + 1
      }
    })
    return counts
  }, [allNotes])

  // Build sortable IDs: orders + cell notes
  const sortableIds = useMemo(() => {
    const orderIds = showRuns
      ? unassignedOrders.map((o) => `${o.order_type}-${o.id}`)
      : Object.values(partyGroups).flat().map((o) => `${o.order_type}-${o.id}`)
    const noteIds = sortedCellNotes.map((n) => `note-${n.id}`)
    return [...orderIds, ...noteIds]
  }, [showRuns, unassignedOrders, partyGroups, sortedCellNotes])

  return (
    <div
      ref={setNodeRef}
      onContextMenu={handleContextMenu}
      className={cn(
        'min-h-[60px] p-1 border-r border-gray-100 transition-colors group/cell flex flex-col relative',
        variant === 'inbound' ? 'bg-green-50/30' : 'bg-white',
        isToday && 'bg-blue-50/50',
        isValidDropTarget && variant === 'inbound' && 'bg-green-100/70',
        isValidDropTarget && variant !== 'inbound' && 'bg-blue-50/70',
        isOver && 'bg-blue-200 ring-2 ring-blue-500'
      )}
    >
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
      <SortableContext
        items={sortableIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="w-full">
          {/* Show orders grouped by delivery run */}
          {showRuns && runsForCell.length > 0 ? (
            <>
              {/* Orders in runs - draggable as a group */}
              {runsForCell.map((run, runIndex) => {
                const runOrders = ordersInRuns[run.id] || []
                if (runOrders.length === 0) return null
                const currentJiggleIndex = jiggleCounter++
                const isMergeTarget = mergeTargetId === `run-drop-${run.id}`
                return (
                  <DeliveryRunGroup
                    key={run.id}
                    run={run}
                    orders={runOrders}
                    onOrderClick={onOrderClick}
                    onStatusChange={onStatusChange}
                    onAddNote={onAddNoteToOrder}
                    onAddRunNote={onAddNoteToRun}
                    onDissolveRun={onDissolveRun}
                    onViewNotes={onViewNotes}
                    noteCounts={orderNoteCounts}
                    runNoteCount={runNoteCounts[run.id] || 0}
                    isDragActive={isDragActive}
                    isFirst={runIndex === 0}
                    isEditMode={isEditMode}
                    jiggleIndex={currentJiggleIndex}
                    isMergeTarget={isMergeTarget}
                  />
                )
              })}
              {/* Unassigned orders - grouped by party when 2+ orders from same customer */}
              {unassignedOrders.length > 0 && runsForCell.length > 0 && (
                <div className="mt-1.5" />
              )}
              {sortedPartyNames.map((partyName) => {
                const partyOrders = partyGroups[partyName]
                // If only 1 order for this party, show individual card
                if (partyOrders.length === 1) {
                  const order = partyOrders[0]
                  const orderKey = `${order.order_type}-${order.id}`
                  const currentJiggleIndex = jiggleCounter++
                  const isMergeTarget = mergeTargetId === `order-drop-${orderKey}`
                  return (
                    <OrderCard
                      key={orderKey}
                      order={order}
                      onClick={() => onOrderClick?.(order)}
                      onStatusChange={onStatusChange}
                      onAddNote={onAddNoteToOrder}
                      onViewNotes={(order) => onViewNotes?.({ type: 'order', order })}
                      noteCount={orderNoteCounts[orderKey] || 0}
                      isDragActive={isDragActive}
                      isEditMode={isEditMode}
                      jiggleIndex={currentJiggleIndex}
                      isMergeTarget={isMergeTarget}
                    />
                  )
                }
                // Multiple orders for same party - show combined card
                const currentJiggleIndex = jiggleCounter++
                return (
                  <CombinedOrderCard
                    key={`combined-${partyName}`}
                    orders={partyOrders}
                    partyName={partyName}
                    onOrderClick={onOrderClick}
                    onStatusChange={onStatusChange}
                    onAddNote={onAddNoteToOrder}
                    onViewNotes={(order) => onViewNotes?.({ type: 'order', order })}
                    noteCounts={orderNoteCounts}
                    isDragActive={isDragActive}
                    isEditMode={isEditMode}
                    jiggleIndex={currentJiggleIndex}
                  />
                )
              })}
            </>
          ) : (
            /* No runs - show orders grouped by party when 2+ from same customer */
            sortedPartyNames.map((partyName) => {
              const partyOrders = partyGroups[partyName]
              // If only 1 order for this party, show individual card
              if (partyOrders.length === 1) {
                const order = partyOrders[0]
                const orderKey = `${order.order_type}-${order.id}`
                const currentJiggleIndex = jiggleCounter++
                const isMergeTarget = mergeTargetId === `order-drop-${orderKey}`
                return (
                  <OrderCard
                    key={orderKey}
                    order={order}
                    onClick={() => onOrderClick?.(order)}
                    onStatusChange={onStatusChange}
                    onAddNote={onAddNoteToOrder}
                    onViewNotes={(order) => onViewNotes?.({ type: 'order', order })}
                    noteCount={orderNoteCounts[orderKey] || 0}
                    isDragActive={isDragActive}
                    isEditMode={isEditMode}
                    jiggleIndex={currentJiggleIndex}
                    isMergeTarget={isMergeTarget}
                  />
                )
              }
              // Multiple orders for same party - show combined card
              const currentJiggleIndex = jiggleCounter++
              return (
                <CombinedOrderCard
                  key={`combined-${partyName}`}
                  orders={partyOrders}
                  partyName={partyName}
                  onOrderClick={onOrderClick}
                  onStatusChange={onStatusChange}
                  onAddNote={onAddNoteToOrder}
                  onViewNotes={(order) => onViewNotes?.({ type: 'order', order })}
                  noteCounts={orderNoteCounts}
                  isDragActive={isDragActive}
                  isEditMode={isEditMode}
                  jiggleIndex={currentJiggleIndex}
                />
              )
            })
          )}

          {/* Cell notes - rendered inline with orders, draggable */}
          {sortedCellNotes.map((note) => (
            <NoteCard
              key={`note-${note.id}`}
              note={note}
              onUpdate={onNoteUpdate}
              onDelete={onNoteDelete}
              isDragActive={isDragActive}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
