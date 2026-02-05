import { memo } from 'react'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { PriorityLineRow } from './PriorityLineRow'
import { KicksIndicator } from './KicksIndicator'
import { buildBinId } from './usePriorityListStore'
import type { BoxType, BoxTypeBin as BoxTypeBinType } from '@/types/api'

interface BoxTypeBinProps {
  vendorId: number
  date: string
  bin: BoxTypeBinType
  onEditOverride: () => void
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
}

/**
 * A box type section containing sortable priority lines (always expanded).
 */
export const BoxTypeBin = memo(function BoxTypeBin({
  vendorId,
  date,
  bin,
  onEditOverride,
  selectedLineId,
  onSelectLine,
}: BoxTypeBinProps) {
  const binId = buildBinId(vendorId, date, bin.box_type as BoxType)

  const { setNodeRef, isOver } = useDroppable({
    id: `droppable-${binId}`,
    data: { binId, vendorId, date, boxType: bin.box_type },
  })

  const lineIds = bin.lines.map((l) => String(l.id))

  return (
    <div className={`border rounded bg-white overflow-hidden ${isOver ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'}`}>
      {/* Compact header with box type and kicks on same line */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-800">{bin.box_type_display}</span>
          <span className="text-xs text-gray-500">
            ({bin.lines.length} {bin.lines.length === 1 ? 'line' : 'lines'})
          </span>
        </div>

        {/* Kicks indicator */}
        <KicksIndicator
          scheduled={bin.scheduled_qty}
          allotment={bin.allotment}
          isOverride={bin.is_override}
          onEditOverride={(e) => {
            e?.stopPropagation?.()
            onEditOverride()
          }}
        />
      </div>

      {/* Lines - always visible */}
      <div ref={setNodeRef} className="min-h-[32px]">
        {bin.lines.length === 0 ? (
          <div className="px-3 py-2 text-center text-gray-400 text-xs">
            Drop lines here
          </div>
        ) : (
          <SortableContext items={lineIds} strategy={verticalListSortingStrategy}>
            {bin.lines.map((line) => (
              <PriorityLineRow
                key={line.id}
                line={line}
                scheduledDate={date}
                isSelected={selectedLineId === String(line.id)}
                onSelect={() => onSelectLine(String(line.id))}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  )
})
