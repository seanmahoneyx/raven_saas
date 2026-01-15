import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import { format, addWeeks, startOfWeek } from 'date-fns'
import CalendarGrid from '@/components/scheduler/CalendarGrid'
import UnscheduledSidebar from '@/components/scheduler/UnscheduledSidebar'
import OrderDetailPanel from '@/components/scheduler/OrderDetailPanel'
import OrderCard from '@/components/scheduler/OrderCard'
import { useCalendarRange, useUnscheduledOrders, useTrucks, useDeliveryRuns, useUpdateSchedule, useUpdateStatus, useCreateDeliveryRun } from '@/api/scheduling'
import type { CalendarOrder, DeliveryRun, OrderStatus } from '@/types/api'

// Type for active drag state - either an order or a run group
type ActiveDragItem =
  | { type: 'order'; order: CalendarOrder }
  | { type: 'run'; run: DeliveryRun; orders: CalendarOrder[] }

// Custom collision detection that prioritizes order/run droppables over cell droppables
// IMPORTANT: For order-on-order and run-on-run merging, we use pointerWithin (strict)
// so that merging only happens when the cursor is directly over the target.
// For cell drops, we use rectIntersection (lenient) for easier dropping.
const orderFirstCollision: CollisionDetection = (args) => {
  // Get the active (dragged) item's ID to exclude it from drop targets
  const activeId = String(args.active.id)
  const activeOrderDropId = `order-drop-${activeId}` // The droppable ID if dragging an order
  // If dragging a run, extract the run ID and build its droppable ID
  const activeRunDropId = activeId.startsWith('run-') ? `run-drop-${activeId.slice(4)}` : null

  // Get pointer-within collisions (strict - cursor must be inside the element)
  const pointerCollisions = pointerWithin(args).filter((c) => {
    const id = String(c.id)
    return id !== activeOrderDropId && id !== activeRunDropId
  })

  // Get rect intersection collisions (lenient - any overlap)
  const rectCollisions = rectIntersection(args).filter((c) => {
    const id = String(c.id)
    return id !== activeOrderDropId && id !== activeRunDropId
  })

  // For order-drop and run-drop targets, ONLY use pointerWithin (strict)
  // This ensures merging only happens when cursor is directly over the target
  const orderCollision = pointerCollisions.find((c) => String(c.id).startsWith('order-drop-'))
  if (orderCollision) {
    return [orderCollision]
  }

  const runCollision = pointerCollisions.find((c) => String(c.id).startsWith('run-drop-'))
  if (runCollision) {
    return [runCollision]
  }

  // For cell/unscheduled drops, use rectIntersection (more lenient)
  // Prioritize unscheduled if pointer is within it
  const unscheduledPointer = pointerCollisions.find((c) => c.id === 'unscheduled')
  if (unscheduledPointer) {
    return [unscheduledPointer]
  }

  // Otherwise return the first rect collision (cell)
  if (rectCollisions.length > 0) {
    // Prefer cell droppables over nested elements
    const cellCollision = rectCollisions.find((c) => String(c.id).startsWith('cell-'))
    if (cellCollision) {
      return [cellCollision]
    }
    return [rectCollisions[0]]
  }

  return []
}

export default function Scheduler() {
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [selectedOrder, setSelectedOrder] = useState<CalendarOrder | null>(null)
  const [activeDragItem, setActiveDragItem] = useState<ActiveDragItem | null>(null)

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
  const updateSchedule = useUpdateSchedule()
  const updateStatus = useUpdateStatus()
  const createDeliveryRun = useCreateDeliveryRun()

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

  // DnD sensors - minimal activation distance for snappy response
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeId = String(event.active.id)

      // Check if this is a run group being dragged
      if (activeId.startsWith('run-')) {
        const runData = event.active.data.current as { type: string; run: DeliveryRun; orders: CalendarOrder[] } | undefined
        if (runData?.type === 'run') {
          setActiveDragItem({ type: 'run', run: runData.run, orders: runData.orders })
          return
        }
      }

      // Otherwise it's a single order
      const order = allOrdersLookup[activeId]
      if (order) {
        setActiveDragItem({ type: 'order', order })
      }
    },
    [allOrdersLookup]
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const currentDragItem = activeDragItem
      setActiveDragItem(null)
      const { active, over } = event

      if (!over) return

      const activeId = String(active.id)

      const overId = String(over.id)

      // Handle run group drag
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
            return
          }
        }

        // Dropping on a calendar cell - move the whole run
        const dropData = over.data.current as { date: string | null; truckId: number | null } | undefined
        if (!dropData) return

        const { date, truckId } = dropData

        // Runs contain SOs, so they can only go to truck rows (not inbound)
        if (truckId === null) return

        // Move all orders in the run to the new cell, keeping them in the same run
        try {
          for (const order of sourceOrders) {
            await updateSchedule.mutateAsync({
              orderType: order.order_type,
              orderId: order.id,
              scheduledDate: date,
              scheduledTruckId: truckId,
              deliveryRunId: sourceRun.id,
            })
          }
        } catch (error) {
          console.error('Failed to move delivery run:', error)
        }
        return
      }

      // Handle individual order drag
      const draggedOrder = allOrdersLookup[activeId]
      if (!draggedOrder) return

      // Check for unscheduled drop FIRST - any order can be unscheduled from any location
      if (over.id === 'unscheduled') {
        updateSchedule.mutate({
          orderType: draggedOrder.order_type,
          orderId: draggedOrder.id,
          scheduledDate: null,
          scheduledTruckId: null,
          deliveryRunId: null,
        })
        return
      }

      // Check if dropping on a run group (order-on-run to add to run)
      if (overId.startsWith('run-drop-')) {
        const targetRunData = over.data.current as { type: string; run: DeliveryRun; orders: CalendarOrder[] } | undefined
        if (targetRunData?.type === 'run') {
          const targetRun = targetRunData.run

          // Only SOs can be added to runs
          if (draggedOrder.order_type !== 'SO') {
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
          return
        }
      }

      // Check if dropping on another order (order-on-order to create/add to run)
      if (overId.startsWith('order-drop-')) {
        const dropData = over.data.current as { type: string; order: CalendarOrder } | undefined

        if (dropData?.type === 'order') {
          const targetOrder = dropData.order

          // Only allow grouping SOs with SOs (not POs)
          if (draggedOrder.order_type !== 'SO' || targetOrder.order_type !== 'SO') {
            return
          }

          // Don't drop on itself
          if (draggedOrder.id === targetOrder.id) {
            return
          }

          // Target must be scheduled (have a truck and date)
          if (!targetOrder.scheduled_truck_id || !targetOrder.scheduled_date) {
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
          return
        }
      }

      // For calendar cell drops, we need the drop data
      const dropData = over.data.current as { date: string | null; truckId: number | null } | undefined
      if (!dropData) return

      const { date, truckId } = dropData

      // Only allow POs on inbound row (truckId === null)
      // and SOs on truck rows (truckId !== null)
      if (draggedOrder.order_type === 'PO' && truckId !== null) {
        // POs should only go to inbound row
        return
      }
      if (draggedOrder.order_type === 'SO' && truckId === null) {
        // SOs should only go to truck rows
        return
      }

      // Clear delivery run when moving to a new cell
      updateSchedule.mutate({
        orderType: draggedOrder.order_type,
        orderId: draggedOrder.id,
        scheduledDate: date,
        scheduledTruckId: truckId,
        deliveryRunId: null,
      })
    },
    [activeDragItem, allOrdersLookup, updateSchedule, createDeliveryRun]
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


  const handleToday = useCallback(() => {
    setAnchorDate(new Date())
  }, [])

  const isLoading = calendarLoading || unscheduledLoading || trucksLoading || runsLoading

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={orderFirstCollision}
      onDragStart={handleDragStart}
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

          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Live
          </div>
        </header>

        {/* Main content - 3 panel layout */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left sidebar - unscheduled orders */}
          <UnscheduledSidebar orders={unscheduledOrders} onOrderClick={handleOrderClick} onStatusChange={handleStatusChange} />

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
                anchorDate={anchorDate}
                onOrderClick={handleOrderClick}
                onStatusChange={handleStatusChange}
                draggingOrderType={activeDragItem?.type === 'order' ? activeDragItem.order.order_type : 'SO'}
                isDragActive={activeDragItem !== null}
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

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeDragItem?.type === 'order' ? (
          <OrderCard order={activeDragItem.order} isOverlay />
        ) : activeDragItem?.type === 'run' ? (
          <div
            className="rounded-md border-2 bg-purple-50/50 shadow-xl ring-2 ring-purple-500 flex"
            style={{ borderColor: '#a855f7' }} // purple-500 inline to override global rule
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
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
