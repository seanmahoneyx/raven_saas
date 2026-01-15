import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import type { CalendarOrder, OrderStatus } from '@/types/api'
import OrderCard from './OrderCard'
import { Package, Truck } from 'lucide-react'

interface UnscheduledSidebarProps {
  orders: CalendarOrder[]
  onOrderClick?: (order: CalendarOrder) => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
}

export default function UnscheduledSidebar({ orders, onOrderClick, onStatusChange }: UnscheduledSidebarProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unscheduled',
    data: { date: null, truckId: null },
  })

  // Separate POs and SOs
  const { purchaseOrders, salesOrders } = useMemo(() => {
    const pos: CalendarOrder[] = []
    const sos: CalendarOrder[] = []
    orders.forEach((o) => {
      if (o.order_type === 'PO') pos.push(o)
      else sos.push(o)
    })
    return { purchaseOrders: pos, salesOrders: sos }
  }, [orders])

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-56 bg-white border-r flex flex-col shrink-0 z-10 shadow-lg h-full relative',
        isOver && 'ring-2 ring-inset ring-blue-500 bg-blue-50'
      )}
    >
      {/* Drop zone overlay indicator */}
      {isOver && (
        <div className="absolute inset-0 bg-blue-100/50 z-20 flex items-center justify-center pointer-events-none">
          <div className="bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium">
            Drop to unschedule
          </div>
        </div>
      )}

      <div className="p-2 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-700 text-xs uppercase tracking-wide">Unscheduled</h2>
          <span className="font-mono text-[10px] bg-gray-200 px-1 rounded">{orders.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {orders.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            All orders scheduled
          </div>
        ) : (
          <>
            {/* Purchase Orders Section - Green */}
            {purchaseOrders.length > 0 && (
              <div className="border-b border-green-200">
                <div className="px-2 py-1 bg-green-50 flex items-center gap-1 sticky top-0 z-10">
                  <Package className="h-3 w-3 text-green-600" />
                  <span className="text-[10px] font-semibold text-green-700 uppercase">
                    Inbound POs
                  </span>
                  <span className="ml-auto text-[10px] text-green-600 font-mono">
                    {purchaseOrders.length}
                  </span>
                </div>
                <div className="p-1">
                  {purchaseOrders.map((order) => (
                    <OrderCard
                      key={`${order.order_type}-${order.id}`}
                      order={order}
                      onClick={() => onOrderClick?.(order)}
                      onStatusChange={onStatusChange}
                      showRequestedDate
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Sales Orders Section - Blue */}
            {salesOrders.length > 0 && (
              <div>
                <div className="px-2 py-1 bg-blue-50 flex items-center gap-1 sticky top-0 z-10">
                  <Truck className="h-3 w-3 text-blue-600" />
                  <span className="text-[10px] font-semibold text-blue-700 uppercase">
                    Outbound SOs
                  </span>
                  <span className="ml-auto text-[10px] text-blue-600 font-mono">
                    {salesOrders.length}
                  </span>
                </div>
                <div className="p-1">
                  {salesOrders.map((order) => (
                    <OrderCard
                      key={`${order.order_type}-${order.id}`}
                      order={order}
                      onClick={() => onOrderClick?.(order)}
                      onStatusChange={onStatusChange}
                      showRequestedDate
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
