import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import type { CalendarOrder } from '@/types/api'
import OrderCard from './OrderCard'
import { Package } from 'lucide-react'

interface UnscheduledSidebarProps {
  orders: CalendarOrder[]
  onOrderClick?: (order: CalendarOrder) => void
}

export default function UnscheduledSidebar({ orders, onOrderClick }: UnscheduledSidebarProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unscheduled',
    data: { date: null, truckId: null },
  })

  const orderIds = orders.map((o) => `${o.order_type}-${o.id}`)

  // Separate sales orders and purchase orders
  const salesOrders = orders.filter((o) => o.order_type === 'SO')
  const purchaseOrders = orders.filter((o) => o.order_type === 'PO')

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col',
        isOver && 'bg-blue-50'
      )}
    >
      <div className="p-3 border-b border-gray-200 bg-white">
        <h2 className="font-semibold flex items-center gap-2">
          <Package className="h-4 w-4" />
          Unscheduled
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {orders.length} order{orders.length !== 1 ? 's' : ''} waiting
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          {salesOrders.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-medium text-gray-500 mb-2 px-1">
                Sales Orders ({salesOrders.length})
              </div>
              <div className="space-y-1">
                {salesOrders.map((order) => (
                  <OrderCard
                    key={`${order.order_type}-${order.id}`}
                    order={order}
                    onClick={() => onOrderClick?.(order)}
                  />
                ))}
              </div>
            </div>
          )}

          {purchaseOrders.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-2 px-1">
                Purchase Orders ({purchaseOrders.length})
              </div>
              <div className="space-y-1">
                {purchaseOrders.map((order) => (
                  <OrderCard
                    key={`${order.order_type}-${order.id}`}
                    order={order}
                    onClick={() => onOrderClick?.(order)}
                  />
                ))}
              </div>
            </div>
          )}

          {orders.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-8">
              All orders scheduled
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  )
}
