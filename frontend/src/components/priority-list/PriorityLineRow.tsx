import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PriorityLine } from '@/types/api'

interface PriorityLineRowProps {
  line: PriorityLine
  scheduledDate: string
  isSelected?: boolean
  onSelect?: () => void
}

/**
 * A single draggable row in the priority list representing a PO line.
 */
export const PriorityLineRow = memo(function PriorityLineRow({
  line,
  scheduledDate,
  isSelected,
  onSelect,
}: PriorityLineRowProps) {
  // Calculate days difference between scheduled and requested date
  const getDaysDiff = () => {
    if (!line.customer_request_date) return null
    const scheduled = new Date(scheduledDate + 'T00:00:00')
    const requested = new Date(line.customer_request_date + 'T00:00:00')
    const diffTime = scheduled.getTime() - requested.getTime()
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }
  const daysDiff = getDaysDiff()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(line.id) })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-3 px-3 py-2 bg-white border-b border-gray-100
        hover:bg-gray-50 cursor-pointer select-none
        ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}
        ${isDragging ? 'shadow-lg z-50' : ''}
      `}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
        </svg>
      </div>

      {/* Sequence indicator */}
      <span className="w-8 text-center text-xs text-gray-400 font-mono">
        #{line.sequence + 1}
      </span>

      {/* PO Number */}
      <span className="w-28 font-medium text-sm text-gray-900 truncate">
        {line.po_number}
      </span>

      {/* Item SKU */}
      <span className="w-28 text-sm text-gray-600 font-mono truncate">
        {line.item_sku}
      </span>

      {/* Item Name - flex-1 to fill available space */}
      <span className="flex-1 min-w-0 text-sm text-gray-700 truncate" title={line.item_name}>
        {line.item_name}
      </span>

      {/* Customer Request Date with Early/Late Indicator */}
      <span className="w-36 text-sm text-gray-600 flex items-center gap-1" title="Customer Request Date">
        {line.customer_request_date ? (
          <>
            <span>
              {new Date(line.customer_request_date + 'T00:00:00').toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric',
              })}
            </span>
            {daysDiff !== null && daysDiff !== 0 && (
              <span
                className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                  daysDiff > 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {daysDiff > 0 ? `${daysDiff}d late` : `${Math.abs(daysDiff)}d early`}
              </span>
            )}
            {daysDiff === 0 && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                on time
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </span>

      {/* Quantity - w-20 matches KicksIndicator numeric width for vertical alignment */}
      <span className="w-20 text-right text-sm font-medium text-gray-900 font-mono">
        {line.quantity_ordered.toLocaleString()}
      </span>
    </div>
  )
})
