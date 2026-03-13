import { memo, useMemo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { parseLocalDate } from '@/lib/dates'
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
  const daysDiff = useMemo(() => {
    if (!line.customer_request_date) return null
    const scheduled = parseLocalDate(scheduledDate)
    const requested = parseLocalDate(line.customer_request_date)
    const diffTime = scheduled.getTime() - requested.getTime()
    return Math.round(diffTime / (1000 * 60 * 60 * 24))
  }, [scheduledDate, line.customer_request_date])
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
        flex items-center gap-3 px-3 py-2 border-b border-border/50
        hover:bg-muted/50 cursor-pointer select-none transition-colors
        even:bg-muted/20
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
        className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Sequence */}
      <span className="w-7 text-center text-xs text-muted-foreground font-mono tabular-nums">
        {line.sequence + 1}
      </span>

      {/* PO Number */}
      <span className="w-28 font-medium text-sm text-foreground truncate">
        {line.po_number}
      </span>

      {/* Item MSPN */}
      <span className="w-28 text-sm text-muted-foreground font-mono truncate">
        {line.item_sku}
      </span>

      {/* Item Name */}
      <span className="flex-1 min-w-0 text-sm text-foreground truncate" title={line.item_name}>
        {line.item_name}
      </span>

      {/* Customer Request Date with urgency */}
      <span className="w-36 text-sm flex items-center gap-1.5">
        {line.customer_request_date ? (
          <>
            <span className="text-muted-foreground tabular-nums">
              {parseLocalDate(line.customer_request_date).toLocaleDateString('en-US', {
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
          <span className="text-muted-foreground/50">—</span>
        )}
      </span>

      {/* Quantity */}
      <span className="w-20 text-right text-sm font-semibold text-foreground font-mono tabular-nums">
        {line.quantity_ordered.toLocaleString()}
      </span>
    </div>
  )
})
