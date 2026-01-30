import { useState, useMemo, useCallback, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
// import { arrayMove } from '@dnd-kit/sortable'
import { format, addWeeks, startOfWeek } from 'date-fns'
import { Package, StickyNote, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import CalendarGrid from '@/components/scheduler/CalendarGrid'
import UnscheduledSidebar from '@/components/scheduler/UnscheduledSidebar'
import OrderDetailPanel from '@/components/scheduler/OrderDetailPanel'
import OrderCard from '@/components/scheduler/OrderCard'
import NoteCard from '@/components/scheduler/NoteCard'
import StickyNotePopup from '@/components/scheduler/StickyNotePopup'
import NoteListDialog, { type ViewNotesTarget } from '@/components/scheduler/NoteListDialog'
// import TemplateToolbar from '@/components/scheduler/TemplateToolbar'
import { useCalendarRange, useUnscheduledOrders, useTrucks, useDeliveryRuns, useUpdateSchedule, useUpdateStatus, useCreateDeliveryRun, useUpdateDeliveryRun, useDeleteDeliveryRun, useBatchUpdateSchedule, useSchedulerNotes, useCreateNote, useUpdateNote, useDeleteNote } from '@/api/scheduling'
import type { CalendarOrder, DeliveryRun, OrderStatus, SchedulerNote } from '@/types/api'

// Type for active drag state - order, run group, combined customer orders, note, or template
type ActiveDragItem =
  | { type: 'order'; order: CalendarOrder }
  | { type: 'run'; run: DeliveryRun; orders: CalendarOrder[] }
  | { type: 'combined'; orders: CalendarOrder[]; partyName: string }
  | { type: 'note'; note: SchedulerNote }
  | { type: 'template'; templateType: 'container' | 'note' }

/**
 * Build set of droppable IDs to exclude (self and children)
 */
function buildExclusionSet(
  activeId: string,
  activeData: { type?: string; orders?: CalendarOrder[] } | undefined
): Set<string> {
  const excluded = new Set<string>()

  // Exclude self
  excluded.add(`order-drop-${activeId}`)

  // If dragging a run, exclude its droppable
  if (activeId.startsWith('run-')) {
    excluded.add(`run-drop-${activeId.slice(4)}`)
  }

  // If dragging a note, exclude its droppable
  if (activeId.startsWith('note-')) {
    excluded.add(`note-drop-${activeId}`)
  }

  // Exclude child orders within runs or combined groups
  if ((activeData?.type === 'run' || activeData?.type === 'combined') && activeData.orders) {
    activeData.orders.forEach((order) => {
      excluded.add(`order-drop-${order.order_type}-${order.id}`)
    })
  }

  return excluded
}

/**
 * Custom collision detection with clear priority order:
 * 1. Unscheduled sidebar (always wins for unscheduling)
 * 2. Order-on-order / Order-on-run (for dwell-based grouping - single orders only)
 * 3. Main cell (for fluid reordering via preview state)
 *
 * NOTE: Drop zones (top/bottom) have been REMOVED in favor of iOS-style
 * fluid reflow where cards shift during drag and insertion point is
 * determined by Y-position of dragged card relative to other cards.
 */
const schedulerCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id)
  const activeData = args.active.data.current as { type?: string; orders?: CalendarOrder[] } | undefined

  // Build exclusion set
  const excluded = buildExclusionSet(activeId, activeData)
  const isValid = (id: string) => !excluded.has(id)

  // Get collisions using both strategies
  const pointer = pointerWithin(args).filter((c) => isValid(String(c.id)))
  const rects = rectIntersection(args).filter((c) => isValid(String(c.id)))

  // PRIORITY 1: Unscheduled sidebar (strict pointer detection)
  const unscheduled = pointer.find((c) => c.id === 'unscheduled')
  if (unscheduled) return [unscheduled]

  // PRIORITY 2: Grouping targets (order-drop, run-drop) - ONLY for single orders
  // These are used for DWELL-BASED grouping detection (600ms hover to merge)
  const isDraggingSingleOrder = activeData?.type === 'order' || (!activeData?.type && !activeId.startsWith('run-') && !activeId.startsWith('combined-') && !activeId.startsWith('note-'))

  if (isDraggingSingleOrder) {
    // Use rect intersection for grouping detection
    const orderDrop = rects.find((c) => String(c.id).startsWith('order-drop-'))
    if (orderDrop) return [orderDrop]

    const runDrop = rects.find((c) => String(c.id).startsWith('run-drop-'))
    if (runDrop) return [runDrop]
  }

  // PRIORITY 3: Main cell (for fluid reordering - no drop zones)
  const mainCell = rects.find((c) => {
    const id = String(c.id)
    return id.startsWith('cell-') && !id.includes('-top-') && !id.includes('-bottom-')
  })
  if (mainCell) return [mainCell]

  return rects.length > 0 ? [rects[0]] : []
}

// Layout measuring config for smooth animations
const measuringConfig = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
}

// Auto-scroll configuration
const SCROLL_EDGE_THRESHOLD = 60 // pixels from edge to trigger
const SCROLL_DELAY_MS = 800 // delay before scrolling starts
const SCROLL_SPEED = 3 // pixels per frame

// Scratch-style: no preview state needed - drag overlay handles visual feedback

// Type for note creation target
type NoteTarget =
  | { type: 'cell'; date: string; truckId: number | null }
  | { type: 'order'; order: CalendarOrder }
  | { type: 'run'; run: DeliveryRun }

export default function Scheduler() {
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [selectedOrder, setSelectedOrder] = useState<CalendarOrder | null>(null)
  const [activeDragItem, setActiveDragItem] = useState<ActiveDragItem | null>(null)
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null)
  const [notePopupPosition, setNotePopupPosition] = useState<{ x: number; y: number } | null>(null)
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false)
  const [viewNotesTarget, setViewNotesTarget] = useState<ViewNotesTarget | null>(null)
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null)

  // Scratch-style state: track expanded/collapsed containers
  const [expandedContainers, setExpandedContainers] = useState<Set<number>>(new Set())

  // Auto-scroll refs for delayed scrolling
  const scrollDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clear auto-scroll timers
  const clearScrollTimers = useCallback(() => {
    if (scrollDelayTimerRef.current) {
      clearTimeout(scrollDelayTimerRef.current)
      scrollDelayTimerRef.current = null
    }
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current)
      scrollIntervalRef.current = null
    }
  }, [])

  // Scratch-style helper: toggle container expand/collapse
  const handleToggleExpanded = useCallback((runId: number) => {
    setExpandedContainers((prev) => {
      const next = new Set(prev)
      if (next.has(runId)) {
        next.delete(runId)
      } else {
        next.add(runId)
      }
      return next
    })
  }, [])

  // Calculate date range for API query (8 weeks, starting 2 weeks before anchor)
  const dateRange = useMemo(() => {
    const start = startOfWeek(addWeeks(anchorDate, -2), { weekStartsOn: 1 })
    const end = addWeeks(start, 8)
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    }
  }, [anchorDate])

  // Fetch data
  const { data: calendarData = [], isLoading: calendarLoading } = useCalendarRange(
    dateRange.start,
    dateRange.end
  )
  const { data: unscheduledOrders = [], isLoading: unscheduledLoading } = useUnscheduledOrders()
  const { data: trucks = [], isLoading: trucksLoading } = useTrucks()
  const { data: deliveryRuns = [], isLoading: runsLoading } = useDeliveryRuns(
    dateRange.start,
    dateRange.end
  )
  const { data: schedulerNotes = [] } = useSchedulerNotes(
    dateRange.start,
    dateRange.end
  )
  const updateSchedule = useUpdateSchedule()
  const batchUpdateSchedule = useBatchUpdateSchedule()
  const updateStatus = useUpdateStatus()
  const createDeliveryRun = useCreateDeliveryRun()
  const updateDeliveryRun = useUpdateDeliveryRun()
  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const deleteDeliveryRun = useDeleteDeliveryRun()

  // Build a lookup of all orders for drag operations
  const allOrdersLookup = useMemo(() => {
    const lookup: Record<string, CalendarOrder> = {}
    // Add unscheduled
    unscheduledOrders.forEach((o) => {
      lookup[`${o.order_type}-${o.id}`] = o
    })
    // Add scheduled from calendar
    calendarData.forEach((truck) => {
      truck.days.forEach((day) => {
        day.orders.forEach((o) => {
          lookup[`${o.order_type}-${o.id}`] = o
        })
      })
    })
    return lookup
  }, [unscheduledOrders, calendarData])

  // DnD sensors - instant activation (distance-based)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Instant activation after 5px movement
      },
    })
  )

  // Build a lookup of all notes for drag operations
  const allNotesLookup = useMemo(() => {
    const lookup: Record<string, SchedulerNote> = {}
    schedulerNotes.forEach((n) => {
      lookup[`note-${n.id}`] = n
    })
    return lookup
  }, [schedulerNotes])

  // Build cell ID from truck/date
  const buildCellId = useCallback((truckId: number | null, date: string) => {
    return `cell-${truckId ?? 'inbound'}-${date}`
  }, [])

  // Preview state for optimistic drag feedback
  const [previewState, setPreviewState] = useState<{
    orderId: string
    targetCellId: string
    insertIndex: number
  } | null>(null)

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeId = String(event.active.id)

      // Check if this is a template being dragged
      if (activeId.startsWith('template-')) {
        const templateType = activeId.replace('template-', '')
        setActiveDragItem({
          type: 'template',
          templateType: templateType as 'container' | 'note'
        })
        return
      }

      // Check if this is a run group being dragged
      if (activeId.startsWith('run-')) {
        const runData = event.active.data.current as { type: string; run: DeliveryRun; orders: CalendarOrder[] } | undefined
        if (runData?.type === 'run') {
          setActiveDragItem({ type: 'run', run: runData.run, orders: runData.orders })
          return
        }
      }

      // Check if this is a combined card being dragged
      if (activeId.startsWith('combined-')) {
        const combinedData = event.active.data.current as { type: string; orders: CalendarOrder[]; partyName: string } | undefined
        if (combinedData?.type === 'combined') {
          setActiveDragItem({ type: 'combined', orders: combinedData.orders, partyName: combinedData.partyName })
          return
        }
      }

      // Check if this is a note being dragged
      if (activeId.startsWith('note-')) {
        const note = allNotesLookup[activeId]
        if (note) {
          setActiveDragItem({ type: 'note', note })
          return
        }
      }

      // Otherwise it's a single order
      const order = allOrdersLookup[activeId]
      if (order) {
        setActiveDragItem({ type: 'order', order })
      }
    },
    [allOrdersLookup, allNotesLookup]
  )

  // Track which cell the cursor is over during drag + custom auto-scroll
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const { collisions, activatorEvent } = event

    // Update hovered cell for visual feedback
    if (!collisions || collisions.length === 0) {
      setHoveredCellId(null)
    } else {
      const cellCollision = collisions.find((c) => String(c.id).startsWith('cell-'))
      setHoveredCellId(cellCollision ? String(cellCollision.id) : null)
    }

    // Custom auto-scroll with delay
    const mainCalendar = document.getElementById('main-calendar')
    if (!mainCalendar) return

    const pointerEvent = activatorEvent as PointerEvent | null
    if (!pointerEvent?.clientY) return

    const rect = mainCalendar.getBoundingClientRect()
    const pointerY = pointerEvent.clientY

    const nearTop = pointerY < rect.top + SCROLL_EDGE_THRESHOLD
    const nearBottom = pointerY > rect.bottom - SCROLL_EDGE_THRESHOLD

    if (nearTop || nearBottom) {
      // Start delay timer if not already running
      if (!scrollDelayTimerRef.current && !scrollIntervalRef.current) {
        scrollDelayTimerRef.current = setTimeout(() => {
          scrollDelayTimerRef.current = null
          const direction = nearTop ? -1 : 1
          scrollIntervalRef.current = setInterval(() => {
            mainCalendar.scrollBy({ top: direction * SCROLL_SPEED, behavior: 'instant' })
          }, 16) // ~60fps
        }, SCROLL_DELAY_MS)
      }
    } else {
      // Not near edges, clear timers
      clearScrollTimers()
    }
  }, [clearScrollTimers])

  // Handle drag over - minimal Scratch-style (no preview state needed)
  const handleDragOver = useCallback(
    (_event: DragOverEvent) => {
      // Scratch-style: no real-time preview, drag overlay handles visual feedback
      // Can add drop indicators here in the future if needed
    },
    []
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      // Clear auto-scroll timers
      clearScrollTimers()

      const currentDragItem = activeDragItem
      // DON'T clear activeDragItem yet - keep visual state during async operations
      setHoveredCellId(null)
      const { active, over } = event

      if (!over) {
        setActiveDragItem(null)
        return
      }

      const activeId = String(active.id)

      const overId = String(over.id)

      // ============================================
      // SCENARIO 1: Template Instantiation (Toolbar → Grid)
      // ============================================
      if (activeId.startsWith('template-')) {
        const templateType = activeId.replace('template-', '')

        // Only allow dropping on calendar cells
        if (overId.startsWith('cell-')) {
          const dropData = over.data.current as { date: string; truckId: number | null } | undefined

          if (templateType === 'container' && dropData?.date) {
            // Create new delivery run (container)
            // Only allow on truck rows (not inbound)
            if (dropData.truckId !== null) {
              try {
                const newRun = await createDeliveryRun.mutateAsync({
                  name: `Run ${deliveryRuns.length + 1}`,
                  truckId: dropData.truckId,
                  scheduledDate: dropData.date,
                })
                // Expand the new container
                setExpandedContainers(prev => new Set([...prev, newRun.id]))
              } catch (error) {
                console.error('Failed to create delivery run:', error)
              }
            }
          } else if (templateType === 'note' && dropData?.date) {
            // Create new note
            setNoteTarget({ type: 'cell', date: dropData.date, truckId: dropData.truckId })
            setNotePopupPosition({ x: window.innerWidth / 2 - 130, y: 200 })
            setIsNoteDialogOpen(true)
          }
        }
        setTimeout(() => setActiveDragItem(null), 100)
        return
      }

      // ============================================
      // SCENARIO 2: Run Group Drag (Moving entire delivery run)
      // ============================================
      if (activeId.startsWith('run-') && currentDragItem?.type === 'run') {
        const { run: sourceRun, orders: sourceOrders } = currentDragItem

        // Check if dropping on another run (merge runs)
        if (overId.startsWith('run-drop-')) {
          const targetRunData = over.data.current as { type: string; run: DeliveryRun; orders: CalendarOrder[] } | undefined
          if (targetRunData?.type === 'run') {
            const targetRun = targetRunData.run

            // Move all orders from source run to target run
            try {
              for (const order of sourceOrders) {
                await updateSchedule.mutateAsync({
                  orderType: order.order_type,
                  orderId: order.id,
                  scheduledDate: targetRun.scheduled_date,
                  scheduledTruckId: targetRun.truck_id,
                  deliveryRunId: targetRun.id,
                })
              }
            } catch (error) {
              console.error('Failed to merge delivery runs:', error)
            }
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }
        }

        // Dropping on a calendar cell - move the whole run
        // Cell IDs have format: cell-{truckId|inbound}-{date}
        if (overId.startsWith('cell-')) {
          const dropData = over.data.current as { date: string; truckId: number | null } | undefined
          if (!dropData || !dropData.date) {
            return
          }

          const { date, truckId } = dropData

          // Runs contain SOs, so they can only go to truck rows (not inbound)
          if (truckId === null) {
            return
          }

          // Update the run itself - this will also update all orders in the run
          try {
            await updateDeliveryRun.mutateAsync({
              runId: sourceRun.id,
              scheduledDate: date,
              truckId: truckId,
            })
          } catch (error) {
            console.error('Failed to move delivery run:', error)
          }
        }
        setTimeout(() => setActiveDragItem(null), 100)
        return
      }

      // Handle combined card drag (multiple orders from same customer)
      if (activeId.startsWith('combined-') && currentDragItem?.type === 'combined') {
        const { orders: combinedOrders } = currentDragItem

        // Check if dropping on unscheduled
        if (over.id === 'unscheduled') {
          try {
            await batchUpdateSchedule.mutateAsync({
              orders: combinedOrders.map((order) => ({
                orderType: order.order_type,
                orderId: order.id,
                scheduledDate: null,
                scheduledTruckId: null,
                deliveryRunId: null,
              })),
            })
          } catch (error) {
            console.error('Failed to unschedule combined orders:', error)
          }
          setTimeout(() => setActiveDragItem(null), 100)
          return
        }

        // Check if dropping on a calendar cell (or top/bottom zone)
        if (overId.startsWith('cell-')) {
          const dropData = over.data.current as { date: string; truckId: number | null; position?: 'top' | 'bottom' | 'cell' } | undefined
          if (!dropData || !dropData.date) {
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }

          const { date, truckId, position } = dropData

          // Validate: POs can only go to inbound (truckId === null), SOs can only go to trucks
          const orderType = combinedOrders[0]?.order_type
          if (orderType === 'PO' && truckId !== null) {
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }
          if (orderType === 'SO' && truckId === null) {
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }

          // For position-based drops, batch update ALL orders in the cell for correct sequencing
          if (position === 'top' || position === 'bottom') {
            const combinedOrderIds = new Set(combinedOrders.map((o) => `${o.order_type}-${o.id}`))
            const targetCellOrders = calendarData
              .flatMap((truck) => truck.days)
              .filter((day) => day.date === date)
              .flatMap((day) => day.orders)
              .filter((order) => {
                if (truckId === null) {
                  return order.scheduled_truck_id === null || order.scheduled_truck_id === undefined
                }
                return order.scheduled_truck_id === truckId
              })
              .filter((order) => !combinedOrderIds.has(`${order.order_type}-${order.id}`))
              .sort((a, b) => (a.scheduler_sequence ?? 0) - (b.scheduler_sequence ?? 0))

            // Build new ordering: insert combined orders at top or bottom
            const newOrdering = position === 'top'
              ? [...combinedOrders, ...targetCellOrders]
              : [...targetCellOrders, ...combinedOrders]

            // Create batch update with new sequences
            const batchUpdates = newOrdering.map((order, index) => ({
              orderType: order.order_type as 'SO' | 'PO',
              orderId: order.id,
              scheduledDate: date,
              scheduledTruckId: truckId,
              deliveryRunId: combinedOrderIds.has(`${order.order_type}-${order.id}`) ? null : order.delivery_run_id,
              schedulerSequence: (index + 1) * 1000,
            }))

            batchUpdateSchedule.mutate({ orders: batchUpdates })
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }

          // Regular cell drop - just move combined orders without specific sequencing
          batchUpdateSchedule.mutate({
            orders: combinedOrders.map((order) => ({
              orderType: order.order_type,
              orderId: order.id,
              scheduledDate: date,
              scheduledTruckId: truckId,
              deliveryRunId: null,
            })),
          })
        }
        setTimeout(() => setActiveDragItem(null), 100)
        return
      }

      // Handle note drag
      if (activeId.startsWith('note-') && currentDragItem?.type === 'note') {
        const { note } = currentDragItem

        // Check if dropping on a calendar cell
        if (overId.startsWith('cell-')) {
          const dropData = over.data.current as { date: string; truckId: number | null } | undefined
          if (dropData?.date) {
            updateNote.mutate({
              noteId: note.id,
              scheduledDate: dropData.date,
              truckId: dropData.truckId,
            })
          }
        }
        setTimeout(() => setActiveDragItem(null), 100)
        return
      }

      // Handle individual order drag
      const draggedOrder = allOrdersLookup[activeId]
      if (!draggedOrder) {
        setTimeout(() => setActiveDragItem(null), 100)
        return
      }

      // ============================================
      // SPECIAL CASE: Unscheduled Order from Sidebar → Grid (SCHEDULING)
      // ============================================
      // Detect if this is an UNSCHEDULED order being scheduled for the first time
      if (draggedOrder.scheduled_date === null && overId !== 'unscheduled') {
        // This is an unscheduled order being dropped on the grid - SCHEDULE it!

        // Check if dropping on a container
        if (overId.startsWith('container-drop-')) {
          const targetRunId = overId.replace('container-drop-', '')
          const targetRun = deliveryRuns.find((r) => r.id === parseInt(targetRunId))

          if (targetRun && draggedOrder.order_type === 'SO') {
            // Schedule order directly into the container
            updateSchedule.mutate({
              orderType: draggedOrder.order_type,
              orderId: draggedOrder.id,
              scheduledDate: targetRun.scheduled_date,
              scheduledTruckId: targetRun.truck_id,
              deliveryRunId: targetRun.id,
            })
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }
        }

        // Check if dropping on a calendar cell
        if (overId.startsWith('cell-')) {
          const dropData = over.data.current as { date: string; truckId: number | null } | undefined
          if (dropData?.date !== undefined) {
            // Validate: POs can only go to inbound, SOs can only go to trucks
            if (draggedOrder.order_type === 'PO' && dropData.truckId !== null) {
              setTimeout(() => setActiveDragItem(null), 100)
              return
            }
            if (draggedOrder.order_type === 'SO' && dropData.truckId === null) {
              setTimeout(() => setActiveDragItem(null), 100)
              return
            }

            // Schedule the order!
            updateSchedule.mutate({
              orderType: draggedOrder.order_type,
              orderId: draggedOrder.id,
              scheduledDate: dropData.date,
              scheduledTruckId: dropData.truckId,
              deliveryRunId: null, // Not in a container yet
            })
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }
        }

        // If we got here, invalid drop target for unscheduled order
        setTimeout(() => setActiveDragItem(null), 100)
        return
      }

      // ============================================
      // Already Scheduled Order Movement (grid → grid or grid → unscheduled)
      // ============================================
      // From here on, we're handling orders that are already on the grid

      // Check for unscheduled drop FIRST - any order can be unscheduled from any location
      if (over.id === 'unscheduled') {
        updateSchedule.mutate({
          orderType: draggedOrder.order_type,
          orderId: draggedOrder.id,
          scheduledDate: null,
          scheduledTruckId: null,
          deliveryRunId: null,
        })
        setTimeout(() => setActiveDragItem(null), 100)
        return
      }

      // Check if dropping on a run group (order-on-run to add to run)
      // Scratch-style: instant drop, no dwell timer needed
      if (overId.startsWith('run-drop-')) {
        const targetRunData = over.data.current as { type: string; run: DeliveryRun; orders: CalendarOrder[] } | undefined
        if (targetRunData?.type === 'run') {
          const targetRun = targetRunData.run

          // Only SOs can be added to runs
          if (draggedOrder.order_type !== 'SO') {
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }

          // Add the order to the run
          updateSchedule.mutate({
            orderType: draggedOrder.order_type,
            orderId: draggedOrder.id,
            scheduledDate: targetRun.scheduled_date,
            scheduledTruckId: targetRun.truck_id,
            deliveryRunId: targetRun.id,
          })
          setTimeout(() => setActiveDragItem(null), 100)
          return
        }
      }

      // Check if dropping on another order (order-on-order to create/add to run)
      // Scratch-style: instant drop, no dwell timer needed
      if (overId.startsWith('order-drop-')) {
        const dropData = over.data.current as { type: string; order: CalendarOrder } | undefined

        if (dropData?.type === 'order') {
          const targetOrder = dropData.order

          // Only allow grouping SOs with SOs (not POs)
          if (draggedOrder.order_type !== 'SO' || targetOrder.order_type !== 'SO') {
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }

          // Don't drop on itself
          if (draggedOrder.id === targetOrder.id) {
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }

          // Target must be scheduled (have a truck and date)
          if (!targetOrder.scheduled_truck_id || !targetOrder.scheduled_date) {
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }

          // Target already has a run - add dragged order to it (moving it to target's day/truck)
          if (targetOrder.delivery_run_id) {
            updateSchedule.mutate({
              orderType: draggedOrder.order_type,
              orderId: draggedOrder.id,
              scheduledDate: targetOrder.scheduled_date,
              scheduledTruckId: targetOrder.scheduled_truck_id,
              deliveryRunId: targetOrder.delivery_run_id,
            })
            setTimeout(() => setActiveDragItem(null), 100)
            return
          }

          // Neither has a run - create a new one with both orders
          // Use mutateAsync to ensure we wait for the run to be created before updating orders
          const runName = `Run ${Date.now() % 1000}` // Simple unique name
          try {
            const newRun = await createDeliveryRun.mutateAsync({
              name: runName,
              truckId: targetOrder.scheduled_truck_id,
              scheduledDate: targetOrder.scheduled_date,
            })

            // Add both orders to the new run sequentially to avoid race conditions
            await updateSchedule.mutateAsync({
              orderType: targetOrder.order_type,
              orderId: targetOrder.id,
              scheduledDate: targetOrder.scheduled_date,
              scheduledTruckId: targetOrder.scheduled_truck_id,
              deliveryRunId: newRun.id,
            })
            await updateSchedule.mutateAsync({
              orderType: draggedOrder.order_type,
              orderId: draggedOrder.id,
              scheduledDate: targetOrder.scheduled_date,
              scheduledTruckId: targetOrder.scheduled_truck_id,
              deliveryRunId: newRun.id,
            })
          } catch (error) {
            console.error('Failed to create delivery run:', error)
          }
          setTimeout(() => setActiveDragItem(null), 100)
          return
        }
      }

      // For calendar cell drops, we need the drop data
      const dropData = over.data.current as { date: string | null; truckId: number | null; position?: 'top' | 'bottom' | 'cell' } | undefined
      if (!dropData) {
        setTimeout(() => setActiveDragItem(null), 100)
        return
      }

      const { date, truckId, position } = dropData

      // Only allow POs on inbound row (truckId === null)
      // and SOs on truck rows (truckId !== null)
      if (draggedOrder.order_type === 'PO' && truckId !== null) {
        // POs should only go to inbound row
        setTimeout(() => setActiveDragItem(null), 100)
        return
      }
      if (draggedOrder.order_type === 'SO' && truckId === null) {
        // SOs should only go to truck rows
        setTimeout(() => setActiveDragItem(null), 100)
        return
      }

      // For position-based drops (top/bottom zones), we batch update ALL orders in the cell
      // to ensure correct sequencing in a single atomic operation
      if (position === 'top' || position === 'bottom') {
        // Get existing orders in the target cell
        const targetCellOrders = calendarData
          .flatMap((truck) => truck.days)
          .filter((day) => day.date === date)
          .flatMap((day) => day.orders)
          .filter((order) => {
            if (truckId === null) {
              return order.scheduled_truck_id === null || order.scheduled_truck_id === undefined
            }
            return order.scheduled_truck_id === truckId
          })
          // Exclude the order being dragged
          .filter((order) => !(order.order_type === draggedOrder.order_type && order.id === draggedOrder.id))
          // Sort by current sequence to maintain relative order
          .sort((a, b) => (a.scheduler_sequence ?? 0) - (b.scheduler_sequence ?? 0))

        // Build the new ordering: insert dropped order at top or bottom
        const newOrdering = position === 'top'
          ? [draggedOrder, ...targetCellOrders]
          : [...targetCellOrders, draggedOrder]

        // Create batch update with new sequences (1000, 2000, 3000, etc.)
        const batchUpdates = newOrdering.map((order, index) => ({
          orderType: order.order_type as 'SO' | 'PO',
          orderId: order.id,
          scheduledDate: date,
          scheduledTruckId: truckId,
          // Keep delivery_run_id for existing orders, clear for dropped order
          deliveryRunId: order === draggedOrder ? null : order.delivery_run_id,
          schedulerSequence: (index + 1) * 1000,
        }))

        batchUpdateSchedule.mutate({ orders: batchUpdates })
        setTimeout(() => setActiveDragItem(null), 100)
        return
      }

      // Regular cell drop (no specific position) - just move the order
      updateSchedule.mutate({
        orderType: draggedOrder.order_type,
        orderId: draggedOrder.id,
        scheduledDate: date,
        scheduledTruckId: truckId,
        deliveryRunId: null,
      })

      // Clear drag state after operation completes
      setTimeout(() => setActiveDragItem(null), 100)
    },
    [activeDragItem, allOrdersLookup, calendarData, updateSchedule, batchUpdateSchedule, createDeliveryRun, updateDeliveryRun, updateNote, clearScrollTimers, deliveryRuns, setExpandedContainers]
  )

  const handleOrderClick = useCallback((order: CalendarOrder) => {
    setSelectedOrder(order)
    // Scroll to the order card in the grid
    setTimeout(() => {
      const cardElement = document.querySelector(`[data-order-id="${order.order_type}-${order.id}"]`)
      if (cardElement) {
        cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Add a brief highlight effect
        cardElement.classList.add('ring-2', 'ring-yellow-400')
        setTimeout(() => {
          cardElement.classList.remove('ring-2', 'ring-yellow-400')
        }, 2000)
      }
    }, 100)
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedOrder(null)
  }, [])

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    // Only clear if clicking directly on the background, not on an order card
    if ((e.target as HTMLElement).closest('[data-order-card]')) return
    setSelectedOrder(null)
  }, [])

  // Handle status change from dropdown
  const handleStatusChange = useCallback((order: CalendarOrder, newStatus: OrderStatus) => {
    updateStatus.mutate({
      orderType: order.order_type,
      orderId: order.id,
      status: newStatus,
    })
  }, [updateStatus])

  // Handle dissolving a delivery run (ungroup orders - keeps orders in place, just removes run)
  const handleDissolveRun = useCallback((run: DeliveryRun) => {
    deleteDeliveryRun.mutate(run.id)
  }, [deleteDeliveryRun])

  const handleToday = useCallback(() => {
    setAnchorDate(new Date())
  }, [])

  // Handler for viewing notes from yellow indicators
  const handleViewNotes = useCallback((target: ViewNotesTarget) => {
    setViewNotesTarget(target)
  }, [])

  // Compute notes for the current view target
  const notesForViewTarget = useMemo(() => {
    if (!viewNotesTarget) return []

    if (viewNotesTarget.type === 'order') {
      const order = viewNotesTarget.order
      return schedulerNotes.filter(n =>
        (order.order_type === 'SO' && n.sales_order_id === order.id) ||
        (order.order_type === 'PO' && n.purchase_order_id === order.id)
      )
    } else {
      return schedulerNotes.filter(n => n.delivery_run_id === viewNotesTarget.run.id)
    }
  }, [viewNotesTarget, schedulerNotes])

  // Handler to add note from the NoteListDialog
  const handleAddNoteFromDialog = useCallback(() => {
    if (viewNotesTarget?.type === 'order') {
      setNoteTarget({ type: 'order', order: viewNotesTarget.order })
      setNotePopupPosition({ x: window.innerWidth / 2 - 130, y: 200 })
      setIsNoteDialogOpen(true)
    } else if (viewNotesTarget?.type === 'run') {
      setNoteTarget({ type: 'run', run: viewNotesTarget.run })
      setNotePopupPosition({ x: window.innerWidth / 2 - 130, y: 200 })
      setIsNoteDialogOpen(true)
    }
  }, [viewNotesTarget])

  const isLoading = calendarLoading || unscheduledLoading || trucksLoading || runsLoading

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={schedulerCollision}
      measuring={measuringConfig}
      autoScroll={false}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen flex flex-col overflow-hidden bg-gray-100">
        {/* Header */}
        <header className="bg-white border-b h-14 flex items-center px-6 justify-between shrink-0 z-20 relative shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">
              RAVEN <span className="text-blue-600 font-light">SCHEDULIZER</span>
            </h1>

            <div className="flex items-center text-sm ml-8 bg-gray-100 rounded-md p-1">
              <button
                onClick={handleToday}
                className="px-3 py-1 bg-white shadow-sm rounded text-gray-700 font-medium hover:text-blue-600"
              >
                Jump to Today
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Live
            </div>
          </div>
        </header>

        {/* Main content - 3 panel layout */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left sidebar - unscheduled orders */}
          <UnscheduledSidebar
            orders={unscheduledOrders}
            onOrderClick={handleOrderClick}
            onStatusChange={handleStatusChange}
            onViewNotes={(order) => handleViewNotes({ type: 'order', order })}
          />

          {/* Calendar grid - main area */}
          <main
            className="flex-1 overflow-y-auto bg-gray-100 relative"
            id="main-calendar"
            onClick={handleBackgroundClick}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Loading...</div>
              </div>
            ) : trucks.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <p>No trucks configured.</p>
                  <p className="text-sm">Add trucks in the Parties page to start scheduling.</p>
                </div>
              </div>
            ) : (
              <CalendarGrid
                trucks={trucks}
                calendarData={calendarData}
                deliveryRuns={deliveryRuns}
                schedulerNotes={schedulerNotes}
                anchorDate={anchorDate}
                onOrderClick={handleOrderClick}
                onStatusChange={handleStatusChange}
                onNoteUpdate={(noteId, updates) => {
                  updateNote.mutate({ noteId, ...updates })
                }}
                onNoteDelete={(noteId) => {
                  deleteNote.mutate(noteId)
                }}
                onAddNote={(target, position) => {
                  setNoteTarget(target)
                  setNotePopupPosition(position)
                  setIsNoteDialogOpen(true)
                }}
                onViewNotes={handleViewNotes}
                onDissolveRun={handleDissolveRun}
                draggingOrderType={activeDragItem?.type === 'order' ? activeDragItem.order.order_type : 'SO'}
                isDragActive={activeDragItem !== null}
                hoveredCellId={hoveredCellId}
                allOrdersLookup={allOrdersLookup}
                expandedContainers={expandedContainers}
                onToggleExpanded={handleToggleExpanded}
              />
            )}
          </main>

          {/* Right panel - order details / activity feed */}
          <OrderDetailPanel
            order={selectedOrder}
            onClearSelection={handleClearSelection}
            allOrdersLookup={allOrdersLookup}
            onHistoryItemClick={handleOrderClick}
          />
        </div>
      </div>

      {/* Drag overlay - instant disappear for templates, smooth animation for others */}
      <DragOverlay
        dropAnimation={
          // Templates should instantly disappear on drop (they "become" the new grid item)
          // Other items animate back if drop fails
          activeDragItem?.type === 'template' ? null : {
            duration: 200,
            easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
          }
        }
        style={{
          filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.15))',
        }}
      >
        {activeDragItem?.type === 'order' ? (
          <div className="scale-[1.02]">
            <OrderCard order={activeDragItem.order} isOverlay />
          </div>
        ) : activeDragItem?.type === 'run' ? (
          <div
            className="rounded-lg border-2 bg-purple-50/80 shadow-2xl ring-2 ring-purple-500 flex scale-[1.02]"
            style={{ borderColor: '#a855f7' }}
          >
            {/* Drag handle on the left */}
            <div className="flex items-center justify-center w-5 bg-purple-200/50 rounded-l shrink-0">
              <svg className="h-4 w-4 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
                <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
              </svg>
            </div>
            {/* Orders */}
            <div className="flex-1 p-0.5 min-w-0">
              {activeDragItem.orders.map((order) => (
                <OrderCard
                  key={`${order.order_type}-${order.id}`}
                  order={order}
                  disableDrag
                />
              ))}
            </div>
            {/* Pallet count on the right */}
            <div className="flex items-center justify-center w-5 bg-purple-500 rounded-r shrink-0">
              <span className="text-[10px] font-bold text-white">
                {activeDragItem.orders.reduce((sum, o) => sum + (o.total_pallets ?? o.total_quantity ?? 0), 0)}
              </span>
            </div>
          </div>
        ) : activeDragItem?.type === 'combined' ? (
          <div
            className={`rounded-lg border-2 shadow-2xl ring-2 flex scale-[1.02] ${
              activeDragItem.orders[0]?.order_type === 'PO'
                ? 'bg-green-50/80 ring-green-500'
                : 'bg-blue-50/80 ring-blue-500'
            }`}
            style={{ borderColor: activeDragItem.orders[0]?.order_type === 'PO' ? '#4ade80' : '#60a5fa' }}
          >
            {/* Drag handle on the left */}
            <div className={`flex items-center justify-center w-4 shrink-0 ${
              activeDragItem.orders[0]?.order_type === 'PO' ? 'bg-green-200/50' : 'bg-blue-200/50'
            }`}>
              <svg className={`h-3 w-3 ${activeDragItem.orders[0]?.order_type === 'PO' ? 'text-green-600' : 'text-blue-600'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
                <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
              </svg>
            </div>
            {/* Content */}
            <div className="flex-1 px-1.5 py-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className={`text-white text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center ${
                  activeDragItem.orders[0]?.order_type === 'PO' ? 'bg-green-600' : 'bg-blue-600'
                }`}>
                  {activeDragItem.orders.length}
                </span>
                <span className="font-semibold text-gray-800 truncate">{activeDragItem.partyName}</span>
                <span className="font-bold text-gray-700 ml-auto">
                  {activeDragItem.orders.reduce((sum, o) => sum + (o.total_pallets ?? o.total_quantity ?? 0), 0)}
                </span>
              </div>
            </div>
          </div>
        ) : activeDragItem?.type === 'note' ? (
          <div className="scale-[1.02]">
            <NoteCard note={activeDragItem.note} isOverlay disableDrag />
          </div>
        ) : activeDragItem?.type === 'template' ? (
          <div className="scale-[1.05]">
            <div className={cn(
              'flex items-center gap-2 px-3 py-2.5 rounded-xl border-3 border-dashed',
              'font-bold text-xs shadow-[0_8px_16px_rgba(0,0,0,0.4)]',
              activeDragItem.templateType === 'container'
                ? 'bg-gradient-to-br from-purple-100 to-purple-200 border-purple-500 text-purple-800'
                : 'bg-gradient-to-br from-yellow-100 to-yellow-200 border-yellow-500 text-yellow-800'
            )}>
              {activeDragItem.templateType === 'container' ? (
                <>
                  <Package className="w-4 h-4" />
                  <span>Truck Run</span>
                </>
              ) : (
                <>
                  <StickyNote className="w-4 h-4" />
                  <span>Note</span>
                </>
              )}
              <Plus className="w-4 h-4 ml-auto opacity-70" />
            </div>
          </div>
        ) : null}
      </DragOverlay>

      {/* Sticky Note Popup - floating like Windows sticky notes */}
      <StickyNotePopup
        isOpen={isNoteDialogOpen}
        position={notePopupPosition}
        onClose={() => {
          setIsNoteDialogOpen(false)
          setNoteTarget(null)
          setNotePopupPosition(null)
        }}
        onSubmit={(data) => {
          // Create note with target info
          if (noteTarget?.type === 'cell') {
            createNote.mutate({
              content: data.content,
              color: data.color,
              scheduledDate: noteTarget.date,
              truckId: noteTarget.truckId,
            })
          } else if (noteTarget?.type === 'order') {
            createNote.mutate({
              content: data.content,
              color: data.color,
              salesOrderId: noteTarget.order.order_type === 'SO' ? noteTarget.order.id : undefined,
              purchaseOrderId: noteTarget.order.order_type === 'PO' ? noteTarget.order.id : undefined,
            })
          } else if (noteTarget?.type === 'run') {
            createNote.mutate({
              content: data.content,
              color: data.color,
              deliveryRunId: noteTarget.run.id,
            })
          } else {
            // No target - shouldn't happen but handle gracefully
            createNote.mutate({
              content: data.content,
              color: data.color,
            })
          }
          setNoteTarget(null)
        }}
      />

      {/* Note List Dialog - for viewing notes on an order or run */}
      <NoteListDialog
        open={viewNotesTarget !== null}
        onOpenChange={(open) => !open && setViewNotesTarget(null)}
        notes={notesForViewTarget}
        target={viewNotesTarget}
        onNoteUpdate={(noteId, updates) => updateNote.mutate({ noteId, ...updates })}
        onNoteDelete={(noteId) => deleteNote.mutate(noteId)}
        onAddNote={handleAddNoteFromDialog}
      />
    </DndContext>
  )
}
