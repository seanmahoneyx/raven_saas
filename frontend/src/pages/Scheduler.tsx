import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { format, addWeeks, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CalendarGrid from '@/components/scheduler/CalendarGrid'
import UnscheduledSidebar from '@/components/scheduler/UnscheduledSidebar'
import OrderDetailPanel from '@/components/scheduler/OrderDetailPanel'
import OrderCard from '@/components/scheduler/OrderCard'
import { useCalendarRange, useUnscheduledOrders, useTrucks, useUpdateSchedule } from '@/api/scheduling'
import type { CalendarOrder } from '@/types/api'

export default function Scheduler() {
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [selectedOrder, setSelectedOrder] = useState<CalendarOrder | null>(null)
  const [activeOrder, setActiveOrder] = useState<CalendarOrder | null>(null)

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
  const updateSchedule = useUpdateSchedule()

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

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const order = allOrdersLookup[event.active.id as string]
      if (order) {
        setActiveOrder(order)
      }
    },
    [allOrdersLookup]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveOrder(null)
      const { active, over } = event

      if (!over) return

      const order = allOrdersLookup[active.id as string]
      if (!order) return

      const dropData = over.data.current as { date: string | null; truckId: number | null } | undefined

      if (!dropData) return

      // If dropping on unscheduled area
      if (over.id === 'unscheduled') {
        updateSchedule.mutate({
          orderType: order.order_type,
          orderId: order.id,
          scheduledDate: null,
          scheduledTruckId: null,
        })
        return
      }

      // Otherwise dropping on a calendar cell
      const { date, truckId } = dropData

      // Only allow POs on inbound row (truckId === null)
      // and SOs on truck rows (truckId !== null)
      if (order.order_type === 'PO' && truckId !== null) {
        // POs should only go to inbound row
        return
      }
      if (order.order_type === 'SO' && truckId === null) {
        // SOs should only go to truck rows
        return
      }

      updateSchedule.mutate({
        orderType: order.order_type,
        orderId: order.id,
        scheduledDate: date,
        scheduledTruckId: truckId,
      })
    },
    [allOrdersLookup, updateSchedule]
  )

  const handleOrderClick = useCallback((order: CalendarOrder) => {
    setSelectedOrder(order)
  }, [])

  const handleClosePanel = useCallback(() => {
    setSelectedOrder(null)
  }, [])

  const handlePrevWeek = useCallback(() => {
    setAnchorDate((d) => addWeeks(d, -1))
  }, [])

  const handleNextWeek = useCallback(() => {
    setAnchorDate((d) => addWeeks(d, 1))
  }, [])

  const handleToday = useCallback(() => {
    setAnchorDate(new Date())
  }, [])

  const isLoading = calendarLoading || unscheduledLoading || trucksLoading

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Scheduler</h1>
            <p className="text-sm text-gray-500">
              Week of {format(anchorDate, 'MMMM d, yyyy')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              <CalendarDays className="h-4 w-4 mr-1" />
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={handleNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar - unscheduled orders */}
          <UnscheduledSidebar orders={unscheduledOrders} onOrderClick={handleOrderClick} />

          {/* Calendar grid */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Loading...</div>
              </div>
            ) : trucks.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <p>No trucks configured.</p>
                  <p className="text-sm">Add trucks in Settings to start scheduling.</p>
                </div>
              </div>
            ) : (
              <CalendarGrid
                trucks={trucks}
                calendarData={calendarData}
                anchorDate={anchorDate}
                onOrderClick={handleOrderClick}
              />
            )}
          </div>

          {/* Right panel - order details */}
          <OrderDetailPanel order={selectedOrder} onClose={handleClosePanel} />
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeOrder ? <OrderCard order={activeOrder} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
