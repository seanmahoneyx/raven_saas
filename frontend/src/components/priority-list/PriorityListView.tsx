import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
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
import { arrayMove } from '@dnd-kit/sortable'
import { VendorSection } from './VendorSection'
import { PriorityLineRow } from './PriorityLineRow'
import { AllotmentConfigModal } from './AllotmentConfigModal'
import {
  usePriorityListStore,
  parseBinId,
} from './usePriorityListStore'
import {
  usePriorityList,
  useReorderPriorityLines,
  useMovePriorityLine,
  useVendorAllotments,
  useDailyOverrides,
} from '@/api/priorityList'
import type { PriorityLine } from '@/types/api'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'

interface PriorityListViewProps {
  startDate: string
  endDate: string
  initialVendorId?: number | null
}

/**
 * Main priority list view with drag-and-drop reordering.
 */
export const PriorityListView = memo(function PriorityListView({
  startDate,
  endDate,
  initialVendorId,
}: PriorityListViewProps) {
  // Local filter state (not from store to avoid re-render loops)
  const [filterVendorId, setFilterVendorId] = useState<number | null>(initialVendorId ?? null)

  // Store actions only (stable references)
  const hydrate = usePriorityListStore((s) => s.hydrate)
  const hydrateAllotments = usePriorityListStore((s) => s.hydrateAllotments)
  const hydrateOverrides = usePriorityListStore((s) => s.hydrateOverrides)
  const setSelectedLineId = usePriorityListStore((s) => s.setSelectedLineId)
  const reorderInBin = usePriorityListStore((s) => s.reorderInBin)
  const moveLineToDate = usePriorityListStore((s) => s.moveLineToDate)

  // Store state (read with care)
  const vendors = usePriorityListStore((s) => s.vendors)
  const selectedLineId = usePriorityListStore((s) => s.selectedLineId)
  const bins = usePriorityListStore((s) => s.bins)
  const lines = usePriorityListStore((s) => s.lines)
  const lineToBin = usePriorityListStore((s) => s.lineToBin)

  // Derive vendor IDs from vendors object (memoized to prevent re-renders)
  const vendorIds = useMemo(() => {
    return Object.keys(vendors).map(Number).sort((a, b) => {
      const nameA = vendors[a]?.name ?? ''
      const nameB = vendors[b]?.name ?? ''
      return nameA.localeCompare(nameB)
    })
  }, [vendors])

  // API queries
  const { data: priorityData, isLoading: dataLoading, error: dataError } = usePriorityList(startDate, endDate, filterVendorId)
  const { data: allotmentsData } = useVendorAllotments(filterVendorId)
  const { data: overridesData } = useDailyOverrides(filterVendorId, startDate, endDate)
  // API mutations
  const reorderMutation = useReorderPriorityLines()
  const moveMutation = useMovePriorityLine()

  // UI state
  const [showAllotmentModal, setShowAllotmentModal] = useState(false)
  const [activeDragLine, setActiveDragLine] = useState<PriorityLine | null>(null)
  const [dragWidth, setDragWidth] = useState<number>(0)

  // Sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Track previous data to prevent unnecessary hydrations
  const prevPriorityDataRef = useRef<typeof priorityData>(null)
  const prevAllotmentsDataRef = useRef<typeof allotmentsData>(null)
  const prevOverridesDataRef = useRef<typeof overridesData>(null)

  // Hydrate store when data changes
  useEffect(() => {
    if (priorityData && priorityData !== prevPriorityDataRef.current) {
      prevPriorityDataRef.current = priorityData
      hydrate(priorityData)
    }
  }, [priorityData, hydrate])

  useEffect(() => {
    if (allotmentsData && allotmentsData !== prevAllotmentsDataRef.current) {
      prevAllotmentsDataRef.current = allotmentsData
      hydrateAllotments(allotmentsData)
    }
  }, [allotmentsData, hydrateAllotments])

  useEffect(() => {
    if (overridesData && overridesData !== prevOverridesDataRef.current) {
      prevOverridesDataRef.current = overridesData
      hydrateOverrides(overridesData)
    }
  }, [overridesData, hydrateOverrides])

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const lineId = String(event.active.id)
    const line = lines[lineId]
    if (line) {
      // Capture the width of the original element for the DragOverlay
      const rect = event.active.rect.current.initial
      if (rect) {
        setDragWidth(rect.width)
      }
      const binId = lineToBin[lineId]
      if (binId) {
        const bin = bins[binId]
        const fullLine = bin?.lines.find((l) => String(l.id) === lineId)
        if (fullLine) {
          setActiveDragLine(fullLine)
        }
      }
    }
  }, [lines, lineToBin, bins])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragLine(null)

    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeLineId = String(active.id)
    const overData = over.data.current as { isEmpty?: boolean; vendorId?: number; date?: string; binId?: string } | undefined

    // Check if dropping onto an empty day zone
    if (overData?.isEmpty && overData.date) {
      // Optimistic update first
      moveLineToDate(activeLineId, overData.date, 0)
      // Then API call (no query invalidation - optimistic update handles UI)
      moveMutation.mutate({
        line_id: parseInt(activeLineId, 10),
        target_date: overData.date,
        insert_at_sequence: 0,
      })
      return
    }

    // Check if dropping onto an existing bin (box type section)
    if (overData?.binId) {
      const parsed = parseBinId(overData.binId)
      if (parsed) {
        // Optimistic update first
        moveLineToDate(activeLineId, parsed.date, 0)
        // Then API call
        moveMutation.mutate({
          line_id: parseInt(activeLineId, 10),
          target_date: parsed.date,
          insert_at_sequence: 0,
        })
        return
      }
    }

    const overLineId = String(over.id)
    const activeBinId = lineToBin[activeLineId]
    const overBinId = lineToBin[overLineId]

    if (!activeBinId) return

    if (activeBinId === overBinId) {
      // Same bin - reorder within bin
      const bin = bins[activeBinId]
      if (!bin) return

      const oldIndex = bin.lines.findIndex((l) => String(l.id) === activeLineId)
      const newIndex = bin.lines.findIndex((l) => String(l.id) === overLineId)

      if (oldIndex !== -1 && newIndex !== -1) {
        // Optimistic update first
        reorderInBin(activeBinId, oldIndex, newIndex)

        const parsed = parseBinId(activeBinId)
        if (parsed) {
          const reorderedLines = arrayMove(bin.lines, oldIndex, newIndex)
          reorderMutation.mutate({
            vendor_id: parsed.vendorId,
            date: parsed.date,
            box_type: parsed.boxType,
            line_ids: reorderedLines.map((l) => l.id),
          })
        }
      }
    } else if (overBinId) {
      // Different bin - move to different date
      const overBin = bins[overBinId]
      if (!overBin) return

      const insertIndex = overBin.lines.findIndex((l) => String(l.id) === overLineId)
      const parsed = parseBinId(overBinId)

      if (parsed) {
        // Optimistic update first
        moveLineToDate(activeLineId, parsed.date, insertIndex >= 0 ? insertIndex : 0)
        // Then API call
        moveMutation.mutate({
          line_id: parseInt(activeLineId, 10),
          target_date: parsed.date,
          insert_at_sequence: insertIndex >= 0 ? insertIndex : 0,
        })
      }
    }
  }, [lineToBin, bins, reorderInBin, moveLineToDate, reorderMutation, moveMutation])

  // Filter displayed vendors
  const displayedVendorIds = useMemo(() => {
    if (filterVendorId) {
      return vendorIds.filter((id) => id === filterVendorId)
    }
    return vendorIds
  }, [vendorIds, filterVendorId])

  // Derive loading state
  const isLoading = dataLoading
  const error = dataError?.message ?? null

  // Navbar mode: no initialVendorId provided — require vendor selection before showing data
  const isNavbarMode = initialVendorId == null

  return (
    <div className="space-y-4">
      {/* Header / Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SearchableCombobox
            entityType="vendor"
            value={filterVendorId}
            onChange={(id) => setFilterVendorId(id)}
            placeholder={initialVendorId != null ? "All Vendors" : "Select a vendor..."}
            allowClear={initialVendorId != null}
            className="min-w-[240px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAllotmentModal(true)}
            className={primaryBtnClass}
            style={primaryBtnStyle}
          >
            Configure Allotments
          </button>
        </div>
      </div>

      {/* Navbar mode empty state — prompt user to select a vendor */}
      {isNavbarMode && !filterVendorId ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-[15px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>
            Select a vendor to view their priority list
          </p>
          <SearchableCombobox
            entityType="vendor"
            value={filterVendorId}
            onChange={(id) => setFilterVendorId(id)}
            placeholder="Select a vendor..."
            className="min-w-[260px]"
          />
        </div>
      ) : isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading priority list...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-600">Error: {error}</div>
          </div>
        ) : displayedVendorIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>No priority lines found for this date range.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-3">
              {displayedVendorIds.map((vendorId) => (
                <VendorSection
                  key={vendorId}
                  vendorId={vendorId}
                  startDate={startDate}
                  endDate={endDate}
                  selectedLineId={selectedLineId}
                  onSelectLine={setSelectedLineId}
                />
              ))}
            </div>

            {/* Drag overlay */}
            <DragOverlay>
              {activeDragLine && (
                <div
                  className="bg-white shadow-lg rounded border border-blue-400 opacity-90"
                  style={dragWidth ? { width: dragWidth } : undefined}
                >
                  <PriorityLineRow line={activeDragLine} scheduledDate={startDate} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}

      {/* Allotment config modal */}
      <AllotmentConfigModal
        isOpen={showAllotmentModal}
        onClose={() => setShowAllotmentModal(false)}
      />
    </div>
  )
})
