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
  flat?: boolean
  onEditOverride: () => void
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
}

/**
 * A box type section containing sortable priority lines.
 * In flat mode, renders lines directly without a card wrapper (used when filtered to one type).
 */
export const BoxTypeBin = memo(function BoxTypeBin({
  vendorId,
  date,
  bin,
  flat,
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

  // Column header row (shared between flat and card modes)
  const columnHeader = bin.lines.length > 0 ? (
    <div className="flex items-center gap-3 px-3 py-1 border-b border-border/50 bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
      <span className="w-4" />
      <span className="w-7 text-center">#</span>
      <span className="w-28">PO #</span>
      <span className="w-28">MSPN</span>
      <span className="flex-1 min-w-0">Item</span>
      <span className="w-36">Cust. Request Date</span>
      <span className="w-20 text-right">Qty</span>
    </div>
  ) : null

  // Lines content (shared between flat and card modes)
  const linesContent = (
    <div ref={setNodeRef} className="min-h-[32px]">
      {bin.lines.length === 0 ? (
        <div className="px-3 py-2 text-center text-muted-foreground text-xs">
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
  )

  // Flat mode: no card wrapper, lines flow directly under date header
  if (flat) {
    return (
      <>
        {columnHeader}
        {linesContent}
      </>
    )
  }

  // Card mode: bordered wrapper with header (used when multiple box types shown)
  return (
    <div className={`border rounded bg-background overflow-hidden ${isOver ? 'border-blue-400 ring-1 ring-blue-200' : 'border-border'}`}>
      {/* Header with box type label and kicks */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground">{bin.box_type_display}</span>
          <span className="text-xs text-muted-foreground">
            ({bin.lines.length} {bin.lines.length === 1 ? 'line' : 'lines'})
          </span>
        </div>

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

      {columnHeader}
      {linesContent}
    </div>
  )
})
