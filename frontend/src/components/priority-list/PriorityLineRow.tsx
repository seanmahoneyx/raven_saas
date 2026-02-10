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
  const getDaysDiff = () => {
    if (!line.customer_request_date) return null
    const scheduled = new Date(scheduledDate + 'T00:00:00')
    const requested = new Date(line.customer_request_date + 'T00:00:00')
    const diffTime = scheduled.getTime() - requested.getTime()
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }
  const daysDiff = getDaysDiff()
  const isLate = daysDiff !== null && daysDiff > 0

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
        flex items-center gap-3 px-3 py-2 border-b border-gray-50
        hover:bg-gray-50/80 cursor-pointer select-none transition-colors
        even:bg-gray-50/40
        ${isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}
        ${isLate ? 'border-l-[3px] border-l-red-400' : 'border-l-[3px] border-l-transparent'}
        ${isDragging ? 'shadow-lg z-50 bg-white' : ''}
      `}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
        </svg>
      </div>

      {/* Sequence */}
      <span className="w-7 text-center text-xs text-gray-400 font-mono tabular-nums">
        {line.sequence + 1}
      </span>

      {/* PO Number */}
      <span className="w-28 font-medium text-sm text-gray-900 truncate">
        {line.po_number}
      </span>

      {/* Item MSPN */}
      <span className="w-28 text-sm text-gray-500 font-mono truncate">
        {line.item_sku}
      </span>

      {/* Item Name */}
      <span className="flex-1 min-w-0 text-sm text-gray-700 truncate" title={line.item_name}>
        {line.item_name}
      </span>

      {/* Customer Request Date with urgency */}
      <span className="w-36 text-sm flex items-center gap-1.5">
        {line.customer_request_date ? (
          <>
            <span className="text-gray-600 tabular-nums">
              {new Date(line.customer_request_date + 'T00:00:00').toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
              })}
            </span>
            {daysDiff !== null && daysDiff > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                {daysDiff}d late
              </span>
            )}
            {daysDiff !== null && daysDiff < 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">
                {Math.abs(daysDiff)}d early
              </span>
            )}
            {daysDiff === 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                on time
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </span>

      {/* Quantity */}
      <span className="w-20 text-right text-sm font-semibold text-gray-900 font-mono tabular-nums">
        {line.quantity_ordered.toLocaleString()}
      </span>
    </div>
  )
})
