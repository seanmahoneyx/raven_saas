import { memo, useMemo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSchedulerStore, selectRun } from './useSchedulerStore'
import { ManifestLine, type CollapsedGroup } from './ManifestLine'

// ─── RunContainer ────────────────────────────────────────────────────────────

interface RunContainerProps {
  runId: string
  isInbound: boolean
}

export const RunContainer = memo(function RunContainer({ runId, isInbound }: RunContainerProps) {
  const run = useSchedulerStore(selectRun(runId))

  // Make the run itself sortable (for reordering runs within a cell)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `run:${runId}`,
    disabled: isInbound,
    data: { type: 'run', runId },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  // Build render list: collapse same-customer groups
  const renderItems = useMemo(() => {
    if (!run || run.orderIds.length === 0) return []
    const orders = useSchedulerStore.getState().orders
    const items: RenderItem[] = []
    let i = 0

    while (i < run.orderIds.length) {
      const order = orders[run.orderIds[i]]
      if (!order) { i++; continue }

      // Look ahead for same-customer consecutive orders
      let j = i + 1
      while (j < run.orderIds.length) {
        const next = orders[run.orderIds[j]]
        if (!next || next.customerCode !== order.customerCode) break
        j++
      }

      const groupSize = j - i
      if (groupSize >= 2) {
        let totalPallets = 0
        for (let k = i; k < j; k++) {
          const o = orders[run.orderIds[k]]
          if (o) totalPallets += o.palletCount
        }
        items.push({
          type: 'collapsed',
          orderId: run.orderIds[i],
          collapsed: { customerCode: order.customerCode, orderCount: groupSize, totalPallets },
        })
        i = j
      } else {
        items.push({ type: 'order', orderId: run.orderIds[i] })
        i++
      }
    }
    return items
  }, [run])

  if (!run) return null

  const sortableOrderIds = run.orderIds

  return (
    <div ref={setNodeRef} style={style} className="mb-1">
      {/* Run Header */}
      <div
        {...attributes}
        {...listeners}
        className={`
          flex items-center gap-1 px-1.5 py-0.5 rounded-t
          text-[10px] font-bold uppercase tracking-wide select-none
          ${isInbound
            ? 'bg-slate-600 text-slate-300'
            : 'bg-indigo-100 text-indigo-700 border border-b-0 border-indigo-200 cursor-grab'
          }
        `}
      >
        <span>{run.name}</span>
        <span className="ml-auto font-normal text-[9px] opacity-70">
          {run.orderIds.length} orders
        </span>
      </div>

      {/* Order List */}
      <div className={`
        rounded-b px-0.5 py-0.5 min-h-[20px]
        ${isInbound
          ? 'bg-slate-200/50'
          : 'border border-t-0 border-indigo-200 bg-white'
        }
      `}>
        <SortableContext items={sortableOrderIds} strategy={verticalListSortingStrategy}>
          {renderItems.map((item) => (
            <ManifestLine
              key={item.orderId}
              orderId={item.orderId}
              collapsed={item.collapsed}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
})

type RenderItem = {
  type: 'order' | 'collapsed'
  orderId: string
  collapsed?: CollapsedGroup
}
