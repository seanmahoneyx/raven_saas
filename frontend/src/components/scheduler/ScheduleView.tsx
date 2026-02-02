import { useMemo, useCallback, useState, useEffect, useRef, memo } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useSchedulerStore } from './useSchedulerStore'
import { useSchedulerMutations } from './useSchedulerMutations'
import { WeekGroup } from './WeekGroup'
import { RunContainer } from './RunContainer'
import { ManifestLine } from './ManifestLine'

// ─── Date Utility ─────────────────────────────────────────────────────────────

function getWeekBands(startOffset: number, endOffset: number): { dates: string[]; label: string; isCurrentWeek: boolean }[] {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))

  const bands: { dates: string[]; label: string; isCurrentWeek: boolean }[] = []
  for (let w = startOffset; w <= endOffset; w++) {
    const week: string[] = []
    for (let d = 0; d < 5; d++) { // Mon-Fri only
      const day = new Date(monday)
      day.setDate(monday.getDate() + w * 7 + d)
      week.push(day.toISOString().slice(0, 10))
    }
    const isCurrentWeek = week.includes(todayStr)
    const label = `Week of ${week[0].slice(5)} to ${week[4].slice(5)}`
    bands.push({ dates: week, label, isCurrentWeek })
  }
  return bands
}

// ─── ScheduleView ─────────────────────────────────────────────────────────────

export const ScheduleView = memo(function ScheduleView() {
  // Store actions for local reordering (no API needed for same-container reorder)
  const reorderInRun = useSchedulerStore((s) => s.reorderInRun)
  const reorderRunsInCell = useSchedulerStore((s) => s.reorderRunsInCell)

  // Mutations hook for API-persisted operations
  const { scheduleOrderToCell, addOrderToRun, moveRunToCell } = useSchedulerMutations()

  const [activeDrag, setActiveDrag] = useState<{ type: 'order' | 'run'; id: string } | null>(null)

  // Infinite scroll: week range relative to current week (0 = this week)
  const [weekRange, setWeekRange] = useState({ start: 0, end: 3 })
  const scrollRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef(0)
  const isPrependingRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const weekBands = useMemo(() => getWeekBands(weekRange.start, weekRange.end), [weekRange])

  // IntersectionObserver for loading more weeks
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          if (entry.target === bottomSentinelRef.current) {
            setWeekRange((prev) => ({ ...prev, end: prev.end + 2 }))
          } else if (entry.target === topSentinelRef.current) {
            isPrependingRef.current = true
            prevScrollHeightRef.current = scrollEl.scrollHeight
            setWeekRange((prev) => ({ ...prev, start: prev.start - 2 }))
          }
        }
      },
      { root: scrollEl, rootMargin: '100px' }
    )

    if (topSentinelRef.current) observer.observe(topSentinelRef.current)
    if (bottomSentinelRef.current) observer.observe(bottomSentinelRef.current)
    return () => observer.disconnect()
  }, [])

  // Fix scroll position after prepending weeks
  useEffect(() => {
    if (isPrependingRef.current && scrollRef.current) {
      const diff = scrollRef.current.scrollHeight - prevScrollHeightRef.current
      scrollRef.current.scrollTop += diff
      isPrependingRef.current = false
    }
  })

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { type: string; orderId?: string; runId?: string } | undefined
    if (data?.type === 'order' && data.orderId) {
      setActiveDrag({ type: 'order', id: data.orderId })
    } else if (data?.type === 'run' && data.runId) {
      setActiveDrag({ type: 'run', id: data.runId })
    }
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDrag(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const overId = String(over.id)
    const activeData = active.data.current as { type: string; orderId?: string; runId?: string } | undefined

    if (!activeData) return

    const state = useSchedulerStore.getState()

    if (activeData.type === 'order' && activeData.orderId) {
      const orderId = activeData.orderId

      // Dropping on another order (within same or different run)
      const overData = over.data.current as { type?: string; orderId?: string } | undefined
      if (overData?.type === 'order' && overData.orderId) {
        const overOrderId = overData.orderId
        const sourceRunId = state.orderToRun[orderId]
        const targetRunId = state.orderToRun[overOrderId]

        if (sourceRunId && targetRunId && sourceRunId === targetRunId) {
          // Reorder within same run (local only, no API needed)
          const run = state.runs[sourceRunId]
          if (run) {
            const fromIdx = run.orderIds.indexOf(orderId)
            const toIdx = run.orderIds.indexOf(overOrderId)
            if (fromIdx !== -1 && toIdx !== -1) {
              reorderInRun(sourceRunId, fromIdx, toIdx)
            }
          }
        } else if (targetRunId) {
          // Move to different run - use API mutation
          const targetRun = state.runs[targetRunId]
          const insertIdx = targetRun ? targetRun.orderIds.indexOf(overOrderId) : undefined
          addOrderToRun(orderId, targetRunId, insertIdx !== -1 ? insertIdx : undefined)
        }
        return
      }

      // Dropping on a cell (droppable) → LOOSE - use API mutation
      if (overId.includes('|') && !overId.startsWith('run:')) {
        scheduleOrderToCell(orderId, overId)
        return
      }

      // Dropping on a run container → COMMITTED - use API mutation
      if (overId.startsWith('run:')) {
        const targetRunId = overId.slice(4)
        addOrderToRun(orderId, targetRunId)
        return
      }
    }

    if (activeData.type === 'run' && activeData.runId) {
      const runId = activeData.runId

      // Dropping run on a cell - use API mutation
      if (overId.includes('|') && !overId.startsWith('run:')) {
        moveRunToCell(runId, overId)
        return
      }

      // Dropping run on another run (reorder within cell or move across cells)
      if (overId.startsWith('run:')) {
        const overRunId = overId.slice(4)
        const sourceCellId = state.runToCell[runId]
        const targetCellId = state.runToCell[overRunId]

        if (sourceCellId && targetCellId && sourceCellId === targetCellId) {
          // Reorder within same cell (local only)
          const cell = state.cells[sourceCellId]
          if (cell) {
            const fromIdx = cell.runIds.indexOf(runId)
            const toIdx = cell.runIds.indexOf(overRunId)
            if (fromIdx !== -1 && toIdx !== -1) {
              reorderRunsInCell(sourceCellId, fromIdx, toIdx)
            }
          }
        } else if (targetCellId) {
          // Move to different cell - use API mutation
          moveRunToCell(runId, targetCellId)
        }
      }
    }
  }, [scheduleOrderToCell, addOrderToRun, moveRunToCell, reorderInRun, reorderRunsInCell])

  const handleDragCancel = useCallback(() => { setActiveDrag(null) }, [])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div ref={scrollRef} className="overflow-auto h-full w-full bg-stone-50">
        <div ref={topSentinelRef} className="h-1" />
        {weekBands.map((band) => (
          <WeekGroup
            key={band.dates[0]}
            dates={band.dates}
            weekLabel={band.label}
            isCurrentWeek={band.isCurrentWeek}
          />
        ))}
        <div ref={bottomSentinelRef} className="h-1" />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag?.type === 'order' ? <ManifestLine orderId={activeDrag.id} /> : null}
        {activeDrag?.type === 'run' ? <RunContainer runId={activeDrag.id} isInbound={false} /> : null}
      </DragOverlay>
    </DndContext>
  )
})
