import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import type { CalendarOrder, DeliveryRun, OrderStatus } from '@/types/api'
import OrderCard from './OrderCard'
import DeliveryRunGroup from './DeliveryRunGroup'

interface CalendarCellProps {
  date: string
  truckId: number | null
  orders: CalendarOrder[]
  deliveryRuns?: DeliveryRun[]
  isToday?: boolean
  onOrderClick?: (order: CalendarOrder) => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  variant?: 'default' | 'inbound'
  isValidDropTarget?: boolean
  /** Whether a drag is currently active */
  isDragActive?: boolean
}

export default function CalendarCell({
  date,
  truckId,
  orders,
  deliveryRuns = [],
  isToday,
  onOrderClick,
  onStatusChange,
  variant = 'default',
  isValidDropTarget,
  isDragActive,
}: CalendarCellProps) {
  const cellId = `cell-${truckId ?? 'inbound'}-${date}`

  const { setNodeRef, isOver } = useDroppable({
    id: cellId,
    data: { date, truckId },
  })

  // Group orders by delivery run
  const { ordersInRuns, unassignedOrders } = useMemo(() => {
    const runsForCell = deliveryRuns.filter(
      (r) => r.truck_id === truckId && r.scheduled_date === date
    )
    const runIdSet = new Set(runsForCell.map((r) => r.id))

    const inRuns: Record<number, CalendarOrder[]> = {}
    const unassigned: CalendarOrder[] = []

    orders.forEach((order) => {
      if (order.delivery_run_id && runIdSet.has(order.delivery_run_id)) {
        if (!inRuns[order.delivery_run_id]) {
          inRuns[order.delivery_run_id] = []
        }
        inRuns[order.delivery_run_id].push(order)
      } else {
        unassigned.push(order)
      }
    })

    return {
      ordersInRuns: inRuns,
      unassignedOrders: unassigned,
      runsForCell,
    }
  }, [orders, deliveryRuns, truckId, date])

  const runsForCell = deliveryRuns.filter(
    (r) => r.truck_id === truckId && r.scheduled_date === date
  ).sort((a, b) => a.sequence - b.sequence)

  const showRuns = variant !== 'inbound' && truckId !== null

  // Build sortable IDs: run groups + individual unassigned orders
  const sortableIds = useMemo(() => {
    const ids: string[] = []
    // Add run group IDs
    runsForCell.forEach((run) => {
      if (ordersInRuns[run.id]?.length > 0) {
        ids.push(`run-${run.id}`)
      }
    })
    // Add unassigned order IDs
    unassignedOrders.forEach((o) => {
      ids.push(`${o.order_type}-${o.id}`)
    })
    return ids
  }, [runsForCell, ordersInRuns, unassignedOrders])

  // For cells without runs, just use order IDs
  const orderIds = orders.map((o) => `${o.order_type}-${o.id}`)

  const hasContent = orders.length > 0

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[60px] p-1 border-r border-gray-100 transition-colors group/cell flex flex-col',
        variant === 'inbound' ? 'bg-green-50/30' : 'bg-white',
        isToday && 'bg-blue-50/50',
        isValidDropTarget && variant === 'inbound' && 'bg-green-100/70',
        isValidDropTarget && variant !== 'inbound' && 'bg-blue-50/70',
        isOver && 'bg-blue-200 ring-2 ring-blue-500'
      )}
    >
      <SortableContext
        items={showRuns ? sortableIds : orderIds}
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
                return (
                  <DeliveryRunGroup
                    key={run.id}
                    run={run}
                    orders={runOrders}
                    onOrderClick={onOrderClick}
                    onStatusChange={onStatusChange}
                    isDragActive={isDragActive}
                    isFirst={runIndex === 0}
                  />
                )
              })}
              {/* Unassigned orders */}
              {unassignedOrders.length > 0 && runsForCell.length > 0 && (
                <div className="mt-1.5" />
              )}
              {unassignedOrders.map((order) => (
                <OrderCard
                  key={`${order.order_type}-${order.id}`}
                  order={order}
                  onClick={() => onOrderClick?.(order)}
                  onStatusChange={onStatusChange}
                  isDragActive={isDragActive}
                />
              ))}
            </>
          ) : (
            /* No runs - show all orders flat */
            orders.map((order) => (
              <OrderCard
                key={`${order.order_type}-${order.id}`}
                order={order}
                onClick={() => onOrderClick?.(order)}
                onStatusChange={onStatusChange}
                isDragActive={isDragActive}
              />
            ))
          )}
        </div>
      </SortableContext>

      {/* Drop zone indicator - only shows when hovering over this cell while dragging */}
      {isOver && hasContent && isValidDropTarget && (
        <div className={cn(
          'mt-1 min-h-[24px] rounded border-2 border-dashed flex items-center justify-center text-[10px]',
          variant === 'inbound'
            ? 'border-green-400 text-green-600 bg-green-50/50'
            : 'border-blue-400 text-blue-600 bg-blue-50/50'
        )}>
          Drop here
        </div>
      )}
    </div>
  )
}
