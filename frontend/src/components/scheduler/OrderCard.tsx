import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { CalendarOrder, OrderStatus } from '@/types/api'
import { StickyNote, GripVertical } from 'lucide-react'

interface OrderCardProps {
  order: CalendarOrder
  onClick?: () => void
  isDragging?: boolean
}

const statusColors: Record<OrderStatus, string> = {
  draft: 'bg-gray-100 border-gray-300',
  confirmed: 'bg-white border-gray-300',
  scheduled: 'bg-white border-blue-300',
  picking: 'bg-yellow-50 border-yellow-400',
  shipped: 'bg-green-50 border-green-400',
  complete: 'bg-blue-50 border-blue-400',
  crossdock: 'bg-orange-50 border-orange-400',
  cancelled: 'bg-red-50 border-red-300 opacity-50',
}

const statusDotColors: Record<OrderStatus, string> = {
  draft: 'bg-gray-400',
  confirmed: 'bg-gray-500',
  scheduled: 'bg-blue-500',
  picking: 'bg-yellow-500',
  shipped: 'bg-green-500',
  complete: 'bg-blue-600',
  crossdock: 'bg-orange-500',
  cancelled: 'bg-red-500',
}

export default function OrderCard({ order, onClick, isDragging }: OrderCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: `${order.order_type}-${order.id}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded border px-2 py-1.5 text-xs cursor-pointer select-none',
        'hover:shadow-md transition-shadow',
        statusColors[order.status],
        isDragging && 'opacity-50 shadow-lg'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 hover:bg-black/5 rounded"
        >
          <GripVertical className="h-3 w-3 text-gray-400" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span
              className={cn('w-2 h-2 rounded-full flex-shrink-0', statusDotColors[order.status])}
              title={order.status}
            />
            <span className="font-medium truncate">
              {order.order_type === 'PO' ? 'PO' : ''}{order.number}
            </span>
            {order.notes && (
              <StickyNote className="h-3 w-3 text-yellow-600 flex-shrink-0" />
            )}
          </div>
          <div className="text-gray-600 truncate">{order.party_name}</div>
          <div className="text-gray-400 flex items-center gap-2">
            <span>{order.num_lines} lines</span>
            <span>{order.total_quantity} qty</span>
          </div>
        </div>
      </div>
    </div>
  )
}
