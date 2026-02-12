import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react'
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
  useSyncPriorityList,
  useVendorAllotments,
  useDailyOverrides,
} from '@/api/priorityList'
import { useVendors } from '@/api/parties'
import type { PriorityLine } from '@/types/api'

interface PriorityListViewProps {
  startDate: string
  endDate: string
}

/**
 * Main priority list view with drag-and-drop reordering.
 */
export const PriorityListView = memo(function PriorityListView({
  startDate,
  endDate,
}: PriorityListViewProps) {
  // Local filter state (not from store to avoid re-render loops)
  const [filterVendorId, setFilterVendorId] = useState<number | null>(null)

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
  const { data: vendorsData } = useVendors()

  // API mutations
  const reorderMutation = useReorderPriorityLines()
  const moveMutation = useMovePriorityLine()
  const syncMutation = useSyncPriorityList()

  // UI state
  const [showAllotmentModal, setShowAllotmentModal] = useState(false)
  const [activeDragLine, setActiveDragLine] = useState<PriorityLine | null>(null)

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

  const handleSync = useCallback(() => {
    syncMutation.mutate()
  }, [syncMutation])

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

  return (
    <div className="space-y-4">
      {/* Header / Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Filter chips */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterVendorId(null)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                filterVendorId === null
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Vendors
            </button>
            {vendorsData?.results?.map((vendor) => (
              <button
                key={vendor.id}
                onClick={() => setFilterVendorId(
                  filterVendorId === vendor.id ? null : vendor.id
                )}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  filterVendorId === vendor.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {vendor.party_display_name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md border border-gray-200 disabled:opacity-50 transition-colors"
            title="Sync PO lines from orders"
          >
            {syncMutation.isPending ? 'Syncing...' : 'Sync Lines'}
          </button>
          <button
            onClick={() => setShowAllotmentModal(true)}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Configure Allotments
          </button>
        </div>
      </div>

      {/* Main content */}
      {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading priority list...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-600">Error: {error}</div>
          </div>
        ) : displayedVendorIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="mb-2">No priority lines found for this date range.</p>
            <p className="text-sm">
              Click "Sync Lines" to import scheduled PO lines.
            </p>
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
                <div className="bg-white shadow-lg rounded border border-blue-400 opacity-90">
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
