import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  BoxType,
  PriorityLine,
  BoxTypeBin,
  PriorityListResponse,
  VendorKickAllotment,
  DailyKickOverride,
} from '@/types/api'

// ─── Types ───────────────────────────────────────────────────────────────────

export type BinId = string // Format: `${vendorId}|${date}|${boxType}`

export interface NormalizedPriorityLine extends PriorityLine {
  vendorId: number
  date: string
  boxType: BoxType
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function buildBinId(vendorId: number, date: string, boxType: BoxType): BinId {
  return `${vendorId}|${date}|${boxType}`
}

export function parseBinId(binId: BinId): { vendorId: number; date: string; boxType: BoxType } | null {
  const parts = binId.split('|')
  if (parts.length !== 3) return null
  return {
    vendorId: parseInt(parts[0], 10),
    date: parts[1],
    boxType: parts[2] as BoxType,
  }
}

// ─── Store Interface ─────────────────────────────────────────────────────────

interface PriorityListState {
  // Normalized data
  lines: Record<string, NormalizedPriorityLine>        // lineId -> line data
  bins: Record<BinId, BoxTypeBin>                      // binId -> bin data with line ordering
  vendors: Record<number, { id: number; name: string }>
  allotments: Record<string, VendorKickAllotment>     // `${vendorId}|${boxType}` -> allotment
  overrides: Record<string, DailyKickOverride>        // `${vendorId}|${boxType}|${date}` -> override

  // Derived lookup indices
  lineToBin: Record<string, BinId>                    // lineId -> binId
  vendorDates: Record<number, Set<string>>            // vendorId -> set of dates

  // UI state
  expandedVendors: Set<number>
  expandedDates: Set<string>    // Format: `${vendorId}|${date}`
  expandedBoxTypes: Set<string> // Format: `${vendorId}|${date}|${boxType}`
  selectedLineId: string | null
  isLoading: boolean
  error: string | null

  // Date range for current view
  startDate: string | null
  endDate: string | null
  filterVendorId: number | null

  // Actions
  hydrate: (data: PriorityListResponse) => void
  setDateRange: (startDate: string, endDate: string) => void
  setFilterVendorId: (vendorId: number | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // Expand/collapse actions
  toggleExpandVendor: (vendorId: number) => void
  toggleExpandDate: (vendorId: number, date: string) => void
  toggleExpandBoxType: (vendorId: number, date: string, boxType: BoxType) => void
  expandAll: () => void
  collapseAll: () => void

  // Reorder actions (optimistic updates)
  reorderInBin: (binId: BinId, fromIndex: number, toIndex: number) => void
  moveLine: (lineId: string, targetBinId: BinId, insertIndex?: number) => void
  moveLineToDate: (lineId: string, targetDate: string, insertIndex?: number) => void

  // Selection
  setSelectedLineId: (lineId: string | null) => void

  // Allotment management
  setAllotment: (vendorId: number, boxType: BoxType, allotment: number) => void
  setOverride: (vendorId: number, boxType: BoxType, date: string, allotment: number) => void
  clearOverride: (vendorId: number, boxType: BoxType, date: string) => void
  hydrateAllotments: (allotments: VendorKickAllotment[]) => void
  hydrateOverrides: (overrides: DailyKickOverride[]) => void

  // Kick calculations
  getEffectiveAllotment: (vendorId: number, boxType: BoxType, date: string) => { allotment: number; isOverride: boolean }
  recalculateBinKicks: (binId: BinId) => void
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const usePriorityListStore = create<PriorityListState>()(
  subscribeWithSelector((set, get) => ({
    lines: {},
    bins: {},
    vendors: {},
    allotments: {},
    overrides: {},
    lineToBin: {},
    vendorDates: {},
    expandedVendors: new Set(),
    expandedDates: new Set(),
    expandedBoxTypes: new Set(),
    selectedLineId: null,
    isLoading: false,
    error: null,
    startDate: null,
    endDate: null,
    filterVendorId: null,

    hydrate: (data) => {
      const lines: Record<string, NormalizedPriorityLine> = {}
      const bins: Record<BinId, BoxTypeBin> = {}
      const vendors: Record<number, { id: number; name: string }> = {}
      const lineToBin: Record<string, BinId> = {}
      const vendorDates: Record<number, Set<string>> = {}

      for (const vendorGroup of data.vendors) {
        vendors[vendorGroup.vendor_id] = {
          id: vendorGroup.vendor_id,
          name: vendorGroup.vendor_name,
        }

        if (!vendorDates[vendorGroup.vendor_id]) {
          vendorDates[vendorGroup.vendor_id] = new Set()
        }

        for (const dateSection of vendorGroup.dates) {
          vendorDates[vendorGroup.vendor_id].add(dateSection.date)

          for (const boxTypeBin of dateSection.box_types) {
            const binId = buildBinId(vendorGroup.vendor_id, dateSection.date, boxTypeBin.box_type as BoxType)

            bins[binId] = {
              ...boxTypeBin,
              box_type: boxTypeBin.box_type as BoxType,
            }

            for (const line of boxTypeBin.lines) {
              const lineId = String(line.id)
              lines[lineId] = {
                ...line,
                vendorId: vendorGroup.vendor_id,
                date: dateSection.date,
                boxType: boxTypeBin.box_type as BoxType,
              }
              lineToBin[lineId] = binId
            }
          }
        }
      }

      set({
        lines,
        bins,
        vendors,
        lineToBin,
        vendorDates,
        isLoading: false,
        error: null,
      })
    },

    setDateRange: (startDate, endDate) => {
      set({ startDate, endDate })
    },

    setFilterVendorId: (vendorId) => {
      set({ filterVendorId: vendorId })
    },

    setLoading: (loading) => {
      set({ isLoading: loading })
    },

    setError: (error) => {
      set({ error, isLoading: false })
    },

    toggleExpandVendor: (vendorId) => {
      set((prev) => {
        const next = new Set(prev.expandedVendors)
        if (next.has(vendorId)) {
          next.delete(vendorId)
        } else {
          next.add(vendorId)
        }
        return { expandedVendors: next }
      })
    },

    toggleExpandDate: (vendorId, date) => {
      const key = `${vendorId}|${date}`
      set((prev) => {
        const next = new Set(prev.expandedDates)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return { expandedDates: next }
      })
    },

    toggleExpandBoxType: (vendorId, date, boxType) => {
      const key = `${vendorId}|${date}|${boxType}`
      set((prev) => {
        const next = new Set(prev.expandedBoxTypes)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return { expandedBoxTypes: next }
      })
    },

    expandAll: () => {
      const state = get()
      const expandedVendors = new Set<number>()
      const expandedDates = new Set<string>()
      const expandedBoxTypes = new Set<string>()

      for (const vendorId of Object.keys(state.vendors)) {
        const vId = parseInt(vendorId, 10)
        expandedVendors.add(vId)
        const dates = state.vendorDates[vId]
        if (dates) {
          for (const date of dates) {
            expandedDates.add(`${vId}|${date}`)
            // Expand all box types for this vendor/date
            for (const binId of Object.keys(state.bins)) {
              if (binId.startsWith(`${vId}|${date}|`)) {
                expandedBoxTypes.add(binId)
              }
            }
          }
        }
      }

      set({ expandedVendors, expandedDates, expandedBoxTypes })
    },

    collapseAll: () => {
      set({
        expandedVendors: new Set(),
        expandedDates: new Set(),
        expandedBoxTypes: new Set(),
      })
    },

    reorderInBin: (binId, fromIndex, toIndex) => {
      set((prev) => {
        const bin = prev.bins[binId]
        if (!bin) return prev
        if (fromIndex < 0 || fromIndex >= bin.lines.length) return prev
        if (toIndex < 0 || toIndex >= bin.lines.length) return prev
        if (fromIndex === toIndex) return prev

        const newLines = [...bin.lines]
        const [moved] = newLines.splice(fromIndex, 1)
        newLines.splice(toIndex, 0, moved)

        // Update sequences
        const updatedLines = newLines.map((line, idx) => ({
          ...line,
          sequence: idx,
        }))

        return {
          bins: {
            ...prev.bins,
            [binId]: { ...bin, lines: updatedLines },
          },
        }
      })
    },

    moveLine: (lineId, targetBinId, insertIndex) => {
      set((prev) => {
        const line = prev.lines[lineId]
        if (!line) return prev

        const sourceBinId = prev.lineToBin[lineId]
        if (!sourceBinId) return prev

        const sourceBin = prev.bins[sourceBinId]
        const targetBin = prev.bins[targetBinId]

        if (!sourceBin || !targetBin) return prev

        // Remove from source bin
        const sourceLines = sourceBin.lines.filter((l) => String(l.id) !== lineId)

        // Add to target bin
        const targetLines = [...targetBin.lines]
        const lineData = sourceBin.lines.find((l) => String(l.id) === lineId)
        if (!lineData) return prev

        const idx = insertIndex !== undefined && insertIndex >= 0 && insertIndex <= targetLines.length
          ? insertIndex
          : targetLines.length
        targetLines.splice(idx, 0, lineData)

        // Update sequences in both bins
        const updatedSourceLines = sourceLines.map((l, i) => ({ ...l, sequence: i }))
        const updatedTargetLines = targetLines.map((l, i) => ({ ...l, sequence: i }))

        // Recalculate kick totals
        const sourceScheduledQty = updatedSourceLines.reduce((sum, l) => sum + l.quantity_ordered, 0)
        const targetScheduledQty = updatedTargetLines.reduce((sum, l) => sum + l.quantity_ordered, 0)

        // Parse target bin to update line metadata
        const parsed = parseBinId(targetBinId)
        if (!parsed) return prev

        const updatedLine: NormalizedPriorityLine = {
          ...line,
          vendorId: parsed.vendorId,
          date: parsed.date,
          boxType: parsed.boxType,
        }

        return {
          lines: { ...prev.lines, [lineId]: updatedLine },
          lineToBin: { ...prev.lineToBin, [lineId]: targetBinId },
          bins: {
            ...prev.bins,
            [sourceBinId]: {
              ...sourceBin,
              lines: updatedSourceLines,
              scheduled_qty: sourceScheduledQty,
              remaining_kicks: Math.max(0, sourceBin.allotment - sourceScheduledQty),
            },
            [targetBinId]: {
              ...targetBin,
              lines: updatedTargetLines,
              scheduled_qty: targetScheduledQty,
              remaining_kicks: Math.max(0, targetBin.allotment - targetScheduledQty),
            },
          },
        }
      })
    },

    moveLineToDate: (lineId, targetDate, insertIndex) => {
      set((prev) => {
        const line = prev.lines[lineId]
        if (!line) return prev

        const sourceBinId = prev.lineToBin[lineId]
        if (!sourceBinId) return prev

        const sourceBin = prev.bins[sourceBinId]
        if (!sourceBin) return prev

        // Get the line data from source bin
        const lineData = sourceBin.lines.find((l) => String(l.id) === lineId)
        if (!lineData) return prev

        // Build target bin ID using the line's vendor and box type
        const targetBinId = buildBinId(line.vendorId, targetDate, line.boxType)

        // If same bin, no move needed
        if (sourceBinId === targetBinId) return prev

        // Remove from source bin
        const sourceLines = sourceBin.lines.filter((l) => String(l.id) !== lineId)
        const updatedSourceLines = sourceLines.map((l, i) => ({ ...l, sequence: i }))
        const sourceScheduledQty = updatedSourceLines.reduce((sum, l) => sum + l.quantity_ordered, 0)

        // Get or create target bin
        let targetBin = prev.bins[targetBinId]
        const isNewBin = !targetBin

        if (isNewBin) {
          // Create new bin for the target date
          const { allotment, isOverride } = get().getEffectiveAllotment(line.vendorId, line.boxType, targetDate)
          targetBin = {
            box_type: line.boxType,
            box_type_display: line.boxType,
            allotment,
            is_override: isOverride,
            scheduled_qty: 0,
            remaining_kicks: allotment,
            lines: [],
          }
        }

        // Add to target bin
        const targetLines = [...targetBin.lines]
        const idx = insertIndex !== undefined && insertIndex >= 0 && insertIndex <= targetLines.length
          ? insertIndex
          : targetLines.length

        // Update line data with new date
        const movedLineData = { ...lineData, sequence: idx }
        targetLines.splice(idx, 0, movedLineData)

        const updatedTargetLines = targetLines.map((l, i) => ({ ...l, sequence: i }))
        const targetScheduledQty = updatedTargetLines.reduce((sum, l) => sum + l.quantity_ordered, 0)

        // Update line metadata
        const updatedLine: NormalizedPriorityLine = {
          ...line,
          date: targetDate,
        }

        // Update vendorDates if needed
        const vendorDates = { ...prev.vendorDates }
        if (!vendorDates[line.vendorId]) {
          vendorDates[line.vendorId] = new Set()
        }
        vendorDates[line.vendorId] = new Set(vendorDates[line.vendorId])
        vendorDates[line.vendorId].add(targetDate)

        return {
          lines: { ...prev.lines, [lineId]: updatedLine },
          lineToBin: { ...prev.lineToBin, [lineId]: targetBinId },
          vendorDates,
          bins: {
            ...prev.bins,
            [sourceBinId]: {
              ...sourceBin,
              lines: updatedSourceLines,
              scheduled_qty: sourceScheduledQty,
              remaining_kicks: Math.max(0, sourceBin.allotment - sourceScheduledQty),
            },
            [targetBinId]: {
              ...targetBin,
              lines: updatedTargetLines,
              scheduled_qty: targetScheduledQty,
              remaining_kicks: Math.max(0, targetBin.allotment - targetScheduledQty),
            },
          },
        }
      })
    },

    setSelectedLineId: (lineId) => {
      set({ selectedLineId: lineId })
    },

    setAllotment: (vendorId, boxType, allotment) => {
      const key = `${vendorId}|${boxType}`
      set((prev) => {
        const existing = prev.allotments[key]
        return {
          allotments: {
            ...prev.allotments,
            [key]: {
              ...existing,
              id: existing?.id ?? 0,
              vendor: vendorId,
              vendor_name: prev.vendors[vendorId]?.name ?? '',
              box_type: boxType,
              box_type_display: boxType,
              daily_allotment: allotment,
              created_at: existing?.created_at ?? new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
        }
      })
    },

    setOverride: (vendorId, boxType, date, allotment) => {
      const key = `${vendorId}|${boxType}|${date}`
      set((prev) => {
        const existing = prev.overrides[key]
        return {
          overrides: {
            ...prev.overrides,
            [key]: {
              ...existing,
              id: existing?.id ?? 0,
              vendor: vendorId,
              vendor_name: prev.vendors[vendorId]?.name ?? '',
              box_type: boxType,
              box_type_display: boxType,
              date,
              allotment,
              created_at: existing?.created_at ?? new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
        }
      })
    },

    clearOverride: (vendorId, boxType, date) => {
      const key = `${vendorId}|${boxType}|${date}`
      set((prev) => {
        const { [key]: _, ...rest } = prev.overrides
        return { overrides: rest }
      })
    },

    hydrateAllotments: (allotments) => {
      const allotmentsMap: Record<string, VendorKickAllotment> = {}
      for (const allotment of allotments) {
        const key = `${allotment.vendor}|${allotment.box_type}`
        allotmentsMap[key] = allotment
      }
      set({ allotments: allotmentsMap })
    },

    hydrateOverrides: (overrides) => {
      const overridesMap: Record<string, DailyKickOverride> = {}
      for (const override of overrides) {
        const key = `${override.vendor}|${override.box_type}|${override.date}`
        overridesMap[key] = override
      }
      set({ overrides: overridesMap })
    },

    getEffectiveAllotment: (vendorId, boxType, date) => {
      const state = get()
      const overrideKey = `${vendorId}|${boxType}|${date}`
      const override = state.overrides[overrideKey]

      if (override) {
        return { allotment: override.allotment, isOverride: true }
      }

      const allotmentKey = `${vendorId}|${boxType}`
      const allotment = state.allotments[allotmentKey]

      return {
        allotment: allotment?.daily_allotment ?? 0,
        isOverride: false,
      }
    },

    recalculateBinKicks: (binId) => {
      set((prev) => {
        const bin = prev.bins[binId]
        if (!bin) return prev

        const parsed = parseBinId(binId)
        if (!parsed) return prev

        const { allotment } = get().getEffectiveAllotment(
          parsed.vendorId,
          parsed.boxType,
          parsed.date
        )

        const scheduledQty = bin.lines.reduce((sum, l) => sum + l.quantity_ordered, 0)

        return {
          bins: {
            ...prev.bins,
            [binId]: {
              ...bin,
              allotment,
              scheduled_qty: scheduledQty,
              remaining_kicks: Math.max(0, allotment - scheduledQty),
            },
          },
        }
      })
    },
  }))
)

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectLine = (lineId: string) => (state: PriorityListState) =>
  state.lines[lineId]

export const selectBin = (binId: BinId) => (state: PriorityListState) =>
  state.bins[binId]

export const selectVendorIds = (state: PriorityListState) =>
  Object.keys(state.vendors).map(Number).sort((a, b) => {
    const nameA = state.vendors[a]?.name ?? ''
    const nameB = state.vendors[b]?.name ?? ''
    return nameA.localeCompare(nameB)
  })

export const selectVendor = (vendorId: number) => (state: PriorityListState) =>
  state.vendors[vendorId]

export const selectVendorDates = (vendorId: number) => (state: PriorityListState) =>
  state.vendorDates[vendorId] ? Array.from(state.vendorDates[vendorId]).sort() : []

export const selectBinsForVendorDate = (vendorId: number, date: string) => (state: PriorityListState) => {
  const binIds: BinId[] = []
  for (const binId of Object.keys(state.bins)) {
    if (binId.startsWith(`${vendorId}|${date}|`)) {
      binIds.push(binId)
    }
  }
  return binIds.sort()
}

export const selectIsVendorExpanded = (vendorId: number) => (state: PriorityListState) =>
  state.expandedVendors.has(vendorId)

export const selectIsDateExpanded = (vendorId: number, date: string) => (state: PriorityListState) =>
  state.expandedDates.has(`${vendorId}|${date}`)

export const selectIsBoxTypeExpanded = (vendorId: number, date: string, boxType: BoxType) => (state: PriorityListState) =>
  state.expandedBoxTypes.has(`${vendorId}|${date}|${boxType}`)

export const selectIsLoading = (state: PriorityListState) => state.isLoading
export const selectError = (state: PriorityListState) => state.error
export const selectSelectedLineId = (state: PriorityListState) => state.selectedLineId
