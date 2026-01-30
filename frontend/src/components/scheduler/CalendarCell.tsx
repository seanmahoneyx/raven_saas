import { useMemo, useState, useCallback, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import type { CalendarOrder, DeliveryRun, OrderStatus, SchedulerNote, NoteColor } from '@/types/api'
import BlockCard from './BlockCard'
import ContainerBlock from './ContainerBlock'
import CombinedOrderCard from './CombinedOrderCard'
import NoteBlock from './NoteBlock'

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
  /** Lookup of all orders by ID */
  allOrdersLookup?: Record<string, CalendarOrder>
  /** Set of expanded container IDs */
  expandedContainers?: Set<number>
  /** Toggle container expand/collapse */
  onToggleExpanded?: (runId: number) => void
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
  onAddNoteToRun: _onAddNoteToRun,
  onViewNotes,
  onDissolveRun,
  variant = 'default',
  isValidDropTarget,
  isDragActive,
  hoveredCellId: _hoveredCellId,
  allOrdersLookup: _allOrdersLookup = {},
  expandedContainers = new Set(),
  onToggleExpanded,
}: CalendarCellProps) {
  const cellId = `cell-${truckId ?? 'inbound'}-${date}`
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const { setNodeRef, isOver } = useDroppable({
    id: cellId,
    data: { date, truckId, position: 'cell' },
  })

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
    if ((e.target as HTMLElement).closest('[data-order-card], [data-note-card], [data-block-card]')) {
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
  const { ordersInContainers, unassignedOrders } = useMemo(() => {
    const inContainers: Record<number, CalendarOrder[]> = {}
    const unassigned: CalendarOrder[] = []

    orders.forEach((order) => {
      if (order.delivery_run_id) {
        if (!inContainers[order.delivery_run_id]) {
          inContainers[order.delivery_run_id] = []
        }
        inContainers[order.delivery_run_id].push(order)
      } else {
        unassigned.push(order)
      }
    })

    // Sort orders within containers by sequence
    Object.keys(inContainers).forEach((runId) => {
      inContainers[parseInt(runId)].sort((a, b) => (a.scheduler_sequence ?? 0) - (b.scheduler_sequence ?? 0))
    })

    // Sort unassigned orders by sequence
    unassigned.sort((a, b) => (a.scheduler_sequence ?? 0) - (b.scheduler_sequence ?? 0))

    return {
      ordersInContainers: inContainers,
      unassignedOrders: unassigned,
    }
  }, [orders])

  // Group unassigned orders by party for auto-combining
  const { partyGroups, sortedPartyNames } = useMemo(() => {
    const byParty: Record<string, CalendarOrder[]> = {}
    const partyFirstIndex: Record<string, number> = {}

    unassignedOrders.forEach((order, index) => {
      const key = order.party_name
      if (!byParty[key]) {
        byParty[key] = []
        partyFirstIndex[key] = index
      }
      byParty[key].push(order)
    })

    const sortedNames = Object.keys(byParty).sort(
      (a, b) => partyFirstIndex[a] - partyFirstIndex[b]
    )

    return {
      partyGroups: byParty,
      sortedPartyNames: sortedNames,
    }
  }, [unassignedOrders])

  const runsForCell = useMemo(() => {
    return deliveryRuns
      .filter((r) => r.truck_id === truckId && r.scheduled_date === date)
      .sort((a, b) => a.sequence - b.sequence)
  }, [deliveryRuns, truckId, date])

  const showRuns = variant !== 'inbound' && truckId !== null

  // Sort notes: pinned first, then by created_at descending
  const sortedCellNotes = useMemo(() => {
    return [...notes]
      .filter((n) => !n.sales_order_id && !n.purchase_order_id && !n.delivery_run_id)
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [notes])

  // Build note counts by order
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

  // TODO: Build note counts by delivery run (for future run note badges)
  // const runNoteCounts = useMemo(() => {
  //   const counts: Record<number, number> = {}
  //   allNotes.forEach((note) => {
  //     if (note.delivery_run_id) {
  //       counts[note.delivery_run_id] = (counts[note.delivery_run_id] || 0) + 1
  //     }
  //   })
  //   return counts
  // }, [allNotes])

  // CRITICAL: Build FLAT list of ALL sortable IDs in this cell
  // This includes: containers (as units), all individual orders, and notes
  const allSortableIds = useMemo(() => {
    // Containers themselves are sortable (can be dragged as units)
    const containerIds = runsForCell.map((r) => `container-${r.id}`)

    // ALL individual orders (both in and out of containers)
    const allOrderIds = orders.map((o) => `${o.order_type}-${o.id}`)

    // Notes
    const noteIds = sortedCellNotes.map((n) => `note-${n.id}`)

    return [...containerIds, ...allOrderIds, ...noteIds]
  }, [runsForCell, orders, sortedCellNotes])

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

      {/* SINGLE FLAT SortableContext for everything in this cell */}
      <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
        <div className="w-full">
          {/* Render containers - children inside are ALSO in this SortableContext */}
          {showRuns &&
            runsForCell.map((run) => {
              const runOrders = ordersInContainers[run.id] || []
              if (runOrders.length === 0 && !expandedContainers.has(run.id)) {
                // Skip rendering empty collapsed containers
                return null
              }
              return (
                <ContainerBlock
                  key={`container-${run.id}`}
                  run={run}
                  ordersInRun={runOrders}
                  isExpanded={expandedContainers.has(run.id)}
                  onToggleExpand={() => onToggleExpanded?.(run.id)}
                  onDissolve={() => onDissolveRun?.(run)}
                  onOrderClick={onOrderClick}
                  onStatusChange={onStatusChange}
                  onAddNote={onAddNoteToOrder}
                  onViewNotes={(order) => onViewNotes?.({ type: 'order', order })}
                  noteCounts={orderNoteCounts}
                />
              )
            })}

          {/* Render unassigned orders - auto-group by party */}
          {sortedPartyNames.map((partyName) => {
            const partyOrders = partyGroups[partyName]
            if (partyOrders.length === 1) {
              // Single order - show BlockCard
              const order = partyOrders[0]
              const orderKey = `${order.order_type}-${order.id}`
              return (
                <BlockCard
                  key={orderKey}
                  order={order}
                  onClick={() => onOrderClick?.(order)}
                  onStatusChange={onStatusChange}
                  onAddNote={onAddNoteToOrder}
                  onViewNotes={(order) => onViewNotes?.({ type: 'order', order })}
                  noteCount={orderNoteCounts[orderKey] || 0}
                />
              )
            }
            // Multiple orders from same party - show combined card
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
              />
            )
          })}

          {/* Render notes */}
          {sortedCellNotes.map((note) => (
            <NoteBlock
              key={`note-${note.id}`}
              note={note}
              onUpdate={onNoteUpdate}
              onDelete={onNoteDelete}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
