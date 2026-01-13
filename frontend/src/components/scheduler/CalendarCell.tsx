import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import type { CalendarOrder } from '@/types/api'
import OrderCard from './OrderCard'

interface CalendarCellProps {
  date: string
  truckId: number | null
  orders: CalendarOrder[]
  isToday?: boolean
  onOrderClick?: (order: CalendarOrder) => void
}

export default function CalendarCell({
  date,
  truckId,
  orders,
  isToday,
  onOrderClick,
}: CalendarCellProps) {
  const cellId = `cell-${truckId ?? 'inbound'}-${date}`

  const { setNodeRef, isOver } = useDroppable({
    id: cellId,
    data: { date, truckId },
  })

  const orderIds = orders.map((o) => `${o.order_type}-${o.id}`)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[80px] p-1 border-r border-b border-gray-200',
        'transition-colors',
        isToday && 'bg-blue-50/50',
        isOver && 'bg-blue-100'
      )}
    >
      <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {orders.map((order) => (
            <OrderCard
              key={`${order.order_type}-${order.id}`}
              order={order}
              onClick={() => onOrderClick?.(order)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
