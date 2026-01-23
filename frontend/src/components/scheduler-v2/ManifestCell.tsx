import { memo, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  useSchedulerStore,
  selectCellRunIds,
  selectCellLooseOrderIds,
  selectIsDateLocked,
  type CellId,
} from './useSchedulerStore'
import { RunContainer } from './RunContainer'
import { ManifestLine } from './ManifestLine'

// ─── ManifestCell ─────────────────────────────────────────────────────────────

interface ManifestCellProps {
  cellId: CellId
  isInbound: boolean
  isUnassigned?: boolean
}

export const ManifestCell = memo(function ManifestCell({ cellId, isInbound, isUnassigned }: ManifestCellProps) {
  const runIds = useSchedulerStore(selectCellRunIds(cellId))
  const looseOrderIds = useSchedulerStore(selectCellLooseOrderIds(cellId))
  const isLocked = useSchedulerStore(selectIsDateLocked(cellId.split('|')[1]))
  const createRun = useSchedulerStore((s) => s.createRun)
  const { setNodeRef, isOver } = useDroppable({ id: cellId })

  // Sortable IDs for run reordering (prefixed with "run:")
  const sortableRunIds = useMemo(
    () => runIds.map((id) => `run:${id}`),
    [runIds]
  )

  const handleAddRun = () => {
    createRun(cellId)
  }

  return (
    <div
      ref={setNodeRef}
      className={`
        min-h-[40px] p-0.5 border-r border-b border-slate-200 relative flex flex-col
        ${isInbound ? 'bg-slate-100' : ''}
        ${isUnassigned ? 'bg-teal-100' : ''}
        ${isLocked && !isInbound ? 'bg-[repeating-linear-gradient(-45deg,transparent,transparent_5px,rgba(239,68,68,0.18)_5px,rgba(239,68,68,0.18)_7px)]' : ''}
        ${isOver ? 'ring-2 ring-inset ring-blue-400' : ''}
      `}
    >
      {/* Section A: Committed Runs */}
      <SortableContext items={sortableRunIds} strategy={verticalListSortingStrategy}>
        {runIds.map((runId) => (
          <RunContainer key={runId} runId={runId} isInbound={isInbound} />
        ))}
      </SortableContext>

      {/* Separator (only if runs exist) */}
      {runIds.length > 0 && (
        <div className="border-t border-dashed border-slate-300 my-0.5" />
      )}

      {/* Section B: Loose Orders Drop Zone (always visible for non-inbound) */}
      {!isInbound && (
        <div className="flex-1 flex flex-col px-0.5 py-0.5 rounded">
          <SortableContext items={looseOrderIds} strategy={verticalListSortingStrategy}>
            {looseOrderIds.map((orderId) => (
              <ManifestLine key={orderId} orderId={orderId} isLoose />
            ))}
          </SortableContext>
          {/* Empty slot — always visible, same height as an order line */}
          <div className={`h-[22px] mt-0.5 rounded ${isOver ? 'bg-blue-50' : ''}`} />
        </div>
      )}

      {/* Footer: Add Run Button (not for inbound or unassigned) */}
      {!isInbound && !isUnassigned && (
        <button
          type="button"
          onClick={handleAddRun}
          className="
            w-full pt-0.5 pb-0.5 text-[9px] text-indigo-400
            hover:text-indigo-600 hover:bg-indigo-50 rounded
            border border-dashed border-transparent hover:border-indigo-300
            transition-colors select-none
          "
        >
          + Add Run
        </button>
      )}
    </div>
  )
})
