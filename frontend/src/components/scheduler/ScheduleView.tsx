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
import { useUpdateNote } from '@/api/scheduling'
import { WeekGroup } from './WeekGroup'
import { RunContainer } from './RunContainer'
import { ManifestLine } from './ManifestLine'
import { NoteCard } from './NoteCard'

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
  const moveNote = useSchedulerStore((s) => s.moveNote)
  const reorderLooseItem = useSchedulerStore((s) => s.reorderLooseItem)

  // Mutations hook for API-persisted operations
  const { scheduleOrderToCell, addOrderToRun, moveRunToCell } = useSchedulerMutations()
  const updateNoteMutation = useUpdateNote()

  // Track Shift key for force-position mode (bypasses smart customer grouping)
  const shiftHeldRef = useRef(false)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = true
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = false
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const [activeDrag, setActiveDrag] = useState<{ type: 'order' | 'run' | 'note'; id: string } | null>(null)

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
    const data = event.active.data.current as { type: string; orderId?: string; runId?: string; noteId?: string } | undefined
    if (data?.type === 'order' && data.orderId) {
      setActiveDrag({ type: 'order', id: data.orderId })
    } else if (data?.type === 'run' && data.runId) {
      setActiveDrag({ type: 'run', id: data.runId })
    } else if (data?.type === 'note' && data.noteId) {
      setActiveDrag({ type: 'note', id: data.noteId })
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

      // Dropping on another order (within same or different run, or loose-to-loose)
      const overData = over.data.current as { type?: string; orderId?: string } | undefined
      if (overData?.type === 'order' && overData.orderId) {
        const overOrderId = overData.orderId
        const sourceRunId = state.orderToRun[orderId]
        const targetRunId = state.orderToRun[overOrderId]

        // Determine if we're dropping above or below the target order
        // by comparing the drag delta and active/over positions
        const activeRect = active.rect.current.translated
        const overRect = over.rect
        let insertBelow = false
        if (activeRect && overRect) {
          // If dragged item's center is below target's center, insert after target
          const activeCenterY = activeRect.top + activeRect.height / 2
          const overCenterY = overRect.top + overRect.height / 2
          insertBelow = activeCenterY > overCenterY
        }

        if (sourceRunId && targetRunId && sourceRunId === targetRunId) {
          // Reorder within same run (local only, no API needed)
          const run = state.runs[sourceRunId]
          if (run) {
            const fromIdx = run.orderIds.indexOf(orderId)
            let toIdx = run.orderIds.indexOf(overOrderId)
            if (fromIdx !== -1 && toIdx !== -1) {
              // Adjust for direction: if dragging down and inserting below, add 1
              // If dragging from above to below the target, insert after target
              if (insertBelow && fromIdx < toIdx) {
                // Already moving down, toIdx is correct
              } else if (insertBelow && fromIdx > toIdx) {
                // Moving up but landing below center - insert after target
                toIdx = toIdx + 1
              } else if (!insertBelow && fromIdx > toIdx) {
                // Moving up and landing above center - toIdx is correct
              } else if (!insertBelow && fromIdx < toIdx) {
                // Moving down but landing above center - insert before target
                toIdx = toIdx - 1
              }
              if (toIdx >= 0 && toIdx < run.orderIds.length) {
                reorderInRun(sourceRunId, fromIdx, toIdx)
              }
            }
          }
        } else if (targetRunId) {
          // Move to different run - use API mutation
          // Shift+drag forces exact position (bypasses smart customer grouping)
          const targetRun = state.runs[targetRunId]
          let insertIdx = targetRun ? targetRun.orderIds.indexOf(overOrderId) : -1
          // If dropping below the target order, insert after it
          if (insertIdx !== -1 && insertBelow) {
            insertIdx = insertIdx + 1
          }
          addOrderToRun(orderId, targetRunId, insertIdx !== -1 ? insertIdx : undefined, shiftHeldRef.current)
        } else if (!sourceRunId && !targetRunId) {
          // Both orders are loose - reorder within unified loose item list
          const orderItem = `order:${orderId}`
          const overItem = `order:${overOrderId}`
          const sourceCellId = state.looseOrderToCell[orderId]
          const targetCellId = state.looseOrderToCell[overOrderId]

          if (sourceCellId && targetCellId && sourceCellId === targetCellId) {
            // Reorder within same cell's unified loose item list
            const cellItems = state.cellLooseItemOrder[sourceCellId]
            if (cellItems) {
              const fromIdx = cellItems.indexOf(orderItem)
              const toIdx = cellItems.indexOf(overItem)
              if (fromIdx !== -1 && toIdx !== -1) {
                reorderLooseItem(sourceCellId, fromIdx, toIdx)
              }
            }
          } else if (targetCellId) {
            // Move to different cell as loose
            scheduleOrderToCell(orderId, targetCellId)
          }
        }
        return
      }

      // Dropping loose order on a note - reorder in unified loose item list
      if (overId.startsWith('note:')) {
        const orderItem = `order:${orderId}`
        const overNoteId = overId.slice(5)
        const sourceCellId = state.looseOrderToCell[orderId]
        const targetCellId = state.noteToCell[overNoteId]

        if (sourceCellId && targetCellId && sourceCellId === targetCellId) {
          // Reorder within same cell's unified loose item list
          const cellItems = state.cellLooseItemOrder[sourceCellId]
          if (cellItems) {
            const fromIdx = cellItems.indexOf(orderItem)
            const toIdx = cellItems.indexOf(overId)
            if (fromIdx !== -1 && toIdx !== -1) {
              reorderLooseItem(sourceCellId, fromIdx, toIdx)
            }
          }
        } else if (targetCellId) {
          // Move to different cell as loose
          scheduleOrderToCell(orderId, targetCellId)
        }
        return
      }

      // Dropping on a cell (droppable) → LOOSE - use API mutation
      if (overId.includes('|') && !overId.startsWith('run:') && !overId.startsWith('note:') && !overId.startsWith('order:')) {
        scheduleOrderToCell(orderId, overId)
        return
      }

      // Dropping on a run container → COMMITTED - use API mutation
      // Shift+drag forces append to end (bypasses smart customer grouping)
      if (overId.startsWith('run:')) {
        const targetRunId = overId.slice(4)
        addOrderToRun(orderId, targetRunId, undefined, shiftHeldRef.current)
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

    // Handle note drag-and-drop (move between date columns or reorder within unified loose items)
    if (activeData.type === 'note' && activeData.noteId) {
      const noteId = activeData.noteId
      const noteItem = `note:${noteId}`

      // Dropping note on another loose item (note or order) - reorder in unified list
      if (overId.startsWith('note:') || overId.startsWith('order:')) {
        const sourceCellId = state.noteToCell[noteId]
        // Find target cell from either noteToCell or looseOrderToCell
        let targetCellId: string | undefined
        if (overId.startsWith('note:')) {
          const overNoteId = overId.slice(5)
          targetCellId = state.noteToCell[overNoteId]
        } else if (overId.startsWith('order:')) {
          const overOrderId = overId.slice(6)
          targetCellId = state.looseOrderToCell[overOrderId]
        }

        if (sourceCellId && targetCellId && sourceCellId === targetCellId) {
          // Reorder within same cell's unified loose item list
          const cellItems = state.cellLooseItemOrder[sourceCellId]
          if (cellItems) {
            const fromIdx = cellItems.indexOf(noteItem)
            const toIdx = cellItems.indexOf(overId)
            if (fromIdx !== -1 && toIdx !== -1) {
              reorderLooseItem(sourceCellId, fromIdx, toIdx)
            }
          }
        } else if (targetCellId) {
          // Move to different cell - use API mutation
          const targetCellItems = state.cellLooseItemOrder[targetCellId] ?? []
          const insertIdx = targetCellItems.indexOf(overId)

          const pipeIdx = targetCellId.lastIndexOf('|')
          if (pipeIdx !== -1) {
            const truckIdStr = targetCellId.slice(0, pipeIdx)
            const date = targetCellId.slice(pipeIdx + 1)
            const truckId = truckIdStr === 'unassigned' ? null : parseInt(truckIdStr, 10)

            moveNote(noteId, targetCellId, insertIdx !== -1 ? insertIdx : undefined)
            updateNoteMutation.mutate({
              noteId: parseInt(noteId, 10),
              scheduledDate: date,
              truckId: truckId,
            })
          }
        }
        return
      }

      // Dropping note on a cell - move to that cell
      if (overId.includes('|') && !overId.startsWith('run:') && !overId.startsWith('note:') && !overId.startsWith('order:')) {
        // Parse cell ID to get truckId and date
        const pipeIdx = overId.lastIndexOf('|')
        if (pipeIdx !== -1) {
          const truckIdStr = overId.slice(0, pipeIdx)
          const date = overId.slice(pipeIdx + 1)
          const truckId = truckIdStr === 'unassigned' ? null : parseInt(truckIdStr, 10)

          // Optimistic update in store
          moveNote(noteId, overId)

          // Persist to API
          updateNoteMutation.mutate({
            noteId: parseInt(noteId, 10),
            scheduledDate: date,
            truckId: truckId,
          })
        }
      }
    }
  }, [scheduleOrderToCell, addOrderToRun, moveRunToCell, reorderInRun, reorderRunsInCell, moveNote, reorderLooseItem, updateNoteMutation])

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
        {activeDrag?.type === 'note' ? <NoteCard noteId={activeDrag.id} /> : null}
      </DragOverlay>
    </DndContext>
  )
})
