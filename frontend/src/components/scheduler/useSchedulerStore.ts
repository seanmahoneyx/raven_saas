import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// ─── Types ───────────────────────────────────────────────────────────────────

export type OrderStatus = 'unscheduled' | 'picked' | 'packed' | 'shipped' | 'invoiced'
export type OrderType = 'PO' | 'SO'

export interface Order {
  id: string
  orderNumber: string
  customerCode: string
  palletCount: number
  status: OrderStatus
  color: string
  notes: string | null
  type: OrderType
  isReadOnly: boolean
  date: string // YYYY-MM-DD (updated on cross-week moves)
}

export interface DeliveryRun {
  id: string
  name: string
  orderIds: string[]
  notes?: string | null
}

export interface CellData {
  runIds: string[]
  looseOrderIds: string[] // Orders not in any run ("workbench" area)
}

/** cellId format: `${truckId}|${date}` */
export type CellId = string

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<OrderStatus, string> = {
  unscheduled: '#9ca3af',
  picked: '#facc15',
  packed: '#4ade80',
  shipped: '#60a5fa',
  invoiced: '#a78bfa',
}

export function getStatusColor(status: OrderStatus): string {
  return STATUS_COLORS[status]
}

function parseCellId(cellId: CellId): { truckId: string; date: string } | null {
  const pipeIdx = cellId.lastIndexOf('|')
  if (pipeIdx === -1) return null
  return { truckId: cellId.slice(0, pipeIdx), date: cellId.slice(pipeIdx + 1) }
}

let _runCounter = 0
function generateRunId(): string {
  return `run-${Date.now()}-${++_runCounter}`
}

// ─── Result Types ────────────────────────────────────────────────────────────

export type MoveResult =
  | { success: true }
  | { success: false; reason: 'CAPACITY_LOCKED' | 'READ_ONLY' | 'INBOUND_ZONE' | 'INVALID_TARGET' }

// ─── Store Interface ─────────────────────────────────────────────────────────

interface SchedulerState {
  // Normalized data
  orders: Record<string, Order>
  runs: Record<string, DeliveryRun>
  cells: Record<CellId, CellData>
  blockedDates: Set<string>
  trucks: string[]
  truckNames: Record<string, string>  // truckId → truck name
  visibleWeeks: number

  // Reverse-lookup indices
  orderToRun: Record<string, string>        // orderId → runId (for committed orders)
  runToCell: Record<string, CellId>         // runId → cellId
  looseOrderToCell: Record<string, CellId>  // orderId → cellId (for loose orders)

  // Actions
  hydrate: (data: HydratePayload) => void
  moveOrder: (orderId: string, targetRunId: string, insertIndex?: number) => MoveResult
  moveOrderLoose: (orderId: string, targetCellId: CellId) => MoveResult
  commitOrderToRun: (orderId: string, targetRunId: string, insertIndex?: number) => MoveResult
  moveRun: (runId: string, targetCellId: CellId, insertIndex?: number) => MoveResult
  createRun: (cellId: CellId, name?: string) => string | null
  dissolveRun: (runId: string) => boolean
  toggleDateLock: (date: string) => void
  reorderInRun: (runId: string, fromIndex: number, toIndex: number) => void
  reorderRunsInCell: (cellId: CellId, fromIndex: number, toIndex: number) => void
  updateOrderNotes: (orderId: string, notes: string | null) => void
  updateRunNotes: (runId: string, notes: string | null) => void
}

export interface HydratePayload {
  orders: Order[]
  runs: DeliveryRun[]
  cells: Record<CellId, CellData>
  trucks: string[]
  truckNames: Record<string, string>  // truckId → truck name
  visibleWeeks?: number
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useSchedulerStore = create<SchedulerState>()(
  subscribeWithSelector((set, get) => ({
    orders: {},
    runs: {},
    cells: {},
    blockedDates: new Set(),
    trucks: [],
    truckNames: {},
    visibleWeeks: 4,
    orderToRun: {},
    runToCell: {},
    looseOrderToCell: {},

    hydrate: (data) => {
      const ordersMap: Record<string, Order> = {}
      const runsMap: Record<string, DeliveryRun> = {}
      const orderToRun: Record<string, string> = {}
      const runToCell: Record<string, CellId> = {}
      const looseOrderToCell: Record<string, CellId> = {}

      // Normalize orders (clone + derive)
      for (const order of data.orders) {
        ordersMap[order.id] = {
          ...order,
          color: getStatusColor(order.status),
          isReadOnly: order.status === 'shipped' || order.status === 'invoiced',
        }
      }

      // Normalize runs
      for (const run of data.runs) {
        runsMap[run.id] = { ...run, notes: run.notes ?? null }
        for (const orderId of run.orderIds) {
          orderToRun[orderId] = run.id
        }
      }

      // Build indices from cells
      const cellsCopy: Record<CellId, CellData> = {}
      for (const [cellId, cellData] of Object.entries(data.cells)) {
        cellsCopy[cellId] = {
          runIds: [...cellData.runIds],
          looseOrderIds: [...(cellData.looseOrderIds || [])],
        }
        for (const runId of cellData.runIds) {
          runToCell[runId] = cellId
        }
        for (const orderId of (cellData.looseOrderIds || [])) {
          looseOrderToCell[orderId] = cellId
        }
      }

      set({
        orders: ordersMap,
        runs: runsMap,
        cells: cellsCopy,
        trucks: data.trucks,
        truckNames: data.truckNames,
        visibleWeeks: data.visibleWeeks ?? 4,
        orderToRun,
        runToCell,
        looseOrderToCell,
      })
    },

    /**
     * Move an order into a target run (commit it).
     * Removes from loose if previously loose, or from source run.
     */
    moveOrder: (orderId, targetRunId, insertIndex) => {
      const state = get()
      const order = state.orders[orderId]
      if (!order) return { success: false, reason: 'READ_ONLY' }
      if (order.type === 'PO') return { success: false, reason: 'INBOUND_ZONE' }
      if (order.isReadOnly) return { success: false, reason: 'READ_ONLY' }

      const targetCellId = state.runToCell[targetRunId]
      if (!targetCellId) return { success: false, reason: 'INVALID_TARGET' }

      // Capacity lock check
      const parsed = parseCellId(targetCellId)
      if (!parsed) return { success: false, reason: 'INVALID_TARGET' }

      if (state.blockedDates.has(parsed.date)) {
        // Determine source date
        const sourceRunId = state.orderToRun[orderId]
        const sourceCellId = sourceRunId
          ? state.runToCell[sourceRunId]
          : state.looseOrderToCell[orderId]
        const sourceParsed = sourceCellId ? parseCellId(sourceCellId) : null
        if (!sourceParsed || sourceParsed.date !== parsed.date) {
          return { success: false, reason: 'CAPACITY_LOCKED' }
        }
      }

      set((prev) => {
        const nextRuns = { ...prev.runs }
        const nextCells = { ...prev.cells }
        const nextOrderToRun = { ...prev.orderToRun }
        const nextLooseOrderToCell = { ...prev.looseOrderToCell }
        const nextOrders = { ...prev.orders }

        // Remove from source run (if committed)
        const sourceRunId = prev.orderToRun[orderId]
        if (sourceRunId && nextRuns[sourceRunId]) {
          nextRuns[sourceRunId] = {
            ...nextRuns[sourceRunId],
            orderIds: nextRuns[sourceRunId].orderIds.filter((id) => id !== orderId),
          }
        }

        // Remove from loose (if loose)
        const looseCellId = prev.looseOrderToCell[orderId]
        if (looseCellId && nextCells[looseCellId]) {
          nextCells[looseCellId] = {
            ...nextCells[looseCellId],
            looseOrderIds: nextCells[looseCellId].looseOrderIds.filter((id) => id !== orderId),
          }
          delete nextLooseOrderToCell[orderId]
        }

        // Add to target run
        if (nextRuns[targetRunId]) {
          const newOrderIds = [...nextRuns[targetRunId].orderIds]
          const idx = insertIndex !== undefined && insertIndex >= 0 && insertIndex <= newOrderIds.length
            ? insertIndex
            : newOrderIds.length
          newOrderIds.splice(idx, 0, orderId)
          nextRuns[targetRunId] = { ...nextRuns[targetRunId], orderIds: newOrderIds }
        }

        // Update order date to match target cell
        if (parsed && nextOrders[orderId]) {
          nextOrders[orderId] = { ...nextOrders[orderId], date: parsed.date }
        }

        nextOrderToRun[orderId] = targetRunId
        return { runs: nextRuns, cells: nextCells, orderToRun: nextOrderToRun, looseOrderToCell: nextLooseOrderToCell, orders: nextOrders }
      })

      return { success: true }
    },

    /**
     * Place an order as "loose" in a cell (workbench/mockup area).
     * Removes from any run or previous loose cell.
     */
    moveOrderLoose: (orderId, targetCellId) => {
      const state = get()
      const order = state.orders[orderId]
      if (!order) return { success: false, reason: 'READ_ONLY' }
      if (order.type === 'PO') return { success: false, reason: 'INBOUND_ZONE' }
      if (order.isReadOnly) return { success: false, reason: 'READ_ONLY' }

      const parsed = parseCellId(targetCellId)
      if (!parsed) return { success: false, reason: 'INVALID_TARGET' }

      // Capacity lock
      if (state.blockedDates.has(parsed.date)) {
        const sourceRunId = state.orderToRun[orderId]
        const sourceCellId = sourceRunId
          ? state.runToCell[sourceRunId]
          : state.looseOrderToCell[orderId]
        const sourceParsed = sourceCellId ? parseCellId(sourceCellId) : null
        if (!sourceParsed || sourceParsed.date !== parsed.date) {
          return { success: false, reason: 'CAPACITY_LOCKED' }
        }
      }

      set((prev) => {
        const nextRuns = { ...prev.runs }
        const nextCells = { ...prev.cells }
        const nextOrderToRun = { ...prev.orderToRun }
        const nextLooseOrderToCell = { ...prev.looseOrderToCell }
        const nextOrders = { ...prev.orders }

        // Remove from source run (if committed)
        const sourceRunId = prev.orderToRun[orderId]
        if (sourceRunId && nextRuns[sourceRunId]) {
          nextRuns[sourceRunId] = {
            ...nextRuns[sourceRunId],
            orderIds: nextRuns[sourceRunId].orderIds.filter((id) => id !== orderId),
          }
          delete nextOrderToRun[orderId]
        }

        // Remove from previous loose cell (if loose elsewhere)
        const prevLooseCellId = prev.looseOrderToCell[orderId]
        if (prevLooseCellId && nextCells[prevLooseCellId]) {
          nextCells[prevLooseCellId] = {
            ...nextCells[prevLooseCellId],
            looseOrderIds: nextCells[prevLooseCellId].looseOrderIds.filter((id) => id !== orderId),
          }
        }

        // Add to target cell as loose
        if (!nextCells[targetCellId]) {
          nextCells[targetCellId] = { runIds: [], looseOrderIds: [orderId] }
        } else {
          nextCells[targetCellId] = {
            ...nextCells[targetCellId],
            looseOrderIds: [...nextCells[targetCellId].looseOrderIds, orderId],
          }
        }

        // Update order date
        if (nextOrders[orderId]) {
          nextOrders[orderId] = { ...nextOrders[orderId], date: parsed.date }
        }

        nextLooseOrderToCell[orderId] = targetCellId
        return { runs: nextRuns, cells: nextCells, orderToRun: nextOrderToRun, looseOrderToCell: nextLooseOrderToCell, orders: nextOrders }
      })

      return { success: true }
    },

    /**
     * Commit a loose order into a run. Alias for moveOrder but semantically
     * explicit about the loose → committed transition.
     */
    commitOrderToRun: (orderId, targetRunId, insertIndex) => {
      return get().moveOrder(orderId, targetRunId, insertIndex)
    },

    /**
     * Move an entire run to a different cell.
     */
    moveRun: (runId, targetCellId, insertIndex) => {
      const state = get()
      const run = state.runs[runId]
      if (!run) return { success: false, reason: 'INVALID_TARGET' }

      const parsed = parseCellId(targetCellId)
      if (!parsed) return { success: false, reason: 'INVALID_TARGET' }

      // Check if any order in the run is read-only
      for (const orderId of run.orderIds) {
        const order = state.orders[orderId]
        if (order?.type === 'PO') return { success: false, reason: 'INBOUND_ZONE' }
        if (order?.isReadOnly) return { success: false, reason: 'READ_ONLY' }
      }

      // Capacity lock: block INTO locked day from outside
      if (state.blockedDates.has(parsed.date)) {
        const sourceCellId = state.runToCell[runId]
        const sourceParsed = sourceCellId ? parseCellId(sourceCellId) : null
        if (!sourceParsed || sourceParsed.date !== parsed.date) {
          return { success: false, reason: 'CAPACITY_LOCKED' }
        }
      }

      set((prev) => {
        const nextCells = { ...prev.cells }
        const nextRunToCell = { ...prev.runToCell }
        const nextOrders = { ...prev.orders }

        // Remove from source cell
        const sourceCellId = prev.runToCell[runId]
        if (sourceCellId && nextCells[sourceCellId]) {
          nextCells[sourceCellId] = {
            ...nextCells[sourceCellId],
            runIds: nextCells[sourceCellId].runIds.filter((id) => id !== runId),
          }
        }

        // Add to target cell
        if (!nextCells[targetCellId]) {
          nextCells[targetCellId] = { runIds: [runId], looseOrderIds: [] }
        } else {
          const newRunIds = [...nextCells[targetCellId].runIds]
          const idx = insertIndex !== undefined && insertIndex >= 0 && insertIndex <= newRunIds.length
            ? insertIndex
            : newRunIds.length
          newRunIds.splice(idx, 0, runId)
          nextCells[targetCellId] = { ...nextCells[targetCellId], runIds: newRunIds }
        }

        // Update order dates for all orders in the run
        const run = prev.runs[runId]
        if (run) {
          for (const orderId of run.orderIds) {
            if (nextOrders[orderId]) {
              nextOrders[orderId] = { ...nextOrders[orderId], date: parsed.date }
            }
          }
        }

        nextRunToCell[runId] = targetCellId
        return { cells: nextCells, runToCell: nextRunToCell, orders: nextOrders }
      })

      return { success: true }
    },

    /**
     * Create an empty run in a cell. Returns the new run ID.
     */
    createRun: (cellId, name) => {
      const parsed = parseCellId(cellId)
      if (!parsed) return null

      const newRunId = generateRunId()
      const state = get()
      const cell = state.cells[cellId]
      const runCount = cell ? cell.runIds.length : 0
      const runName = name ?? `Run ${runCount + 1}`

      set((prev) => {
        const newRun: DeliveryRun = { id: newRunId, name: runName, orderIds: [], notes: null }
        const nextRuns = { ...prev.runs, [newRunId]: newRun }
        const nextCells = { ...prev.cells }
        const nextRunToCell = { ...prev.runToCell }

        if (!nextCells[cellId]) {
          nextCells[cellId] = { runIds: [newRunId], looseOrderIds: [] }
        } else {
          nextCells[cellId] = { ...nextCells[cellId], runIds: [...nextCells[cellId].runIds, newRunId] }
        }
        nextRunToCell[newRunId] = cellId

        return { runs: nextRuns, cells: nextCells, runToCell: nextRunToCell }
      })

      return newRunId
    },

    /**
     * Dissolve a run — moves its orders to the previous run in the cell,
     * or places them as loose if it's the only run.
     */
    dissolveRun: (runId) => {
      const state = get()
      const run = state.runs[runId]
      if (!run) return false

      const cellId = state.runToCell[runId]
      if (!cellId) return false

      const cell = state.cells[cellId]
      if (!cell) return false

      set((prev) => {
        const nextRuns = { ...prev.runs }
        const nextCells = { ...prev.cells }
        const nextRunToCell = { ...prev.runToCell }
        const nextOrderToRun = { ...prev.orderToRun }
        const nextLooseOrderToCell = { ...prev.looseOrderToCell }
        const runIdx = cell.runIds.indexOf(runId)

        // Find a sibling run to absorb orders
        let targetRunId: string | null = null
        if (cell.runIds.length > 1) {
          targetRunId = runIdx > 0 ? cell.runIds[runIdx - 1] : cell.runIds[1]
        }

        if (targetRunId && nextRuns[targetRunId]) {
          // Move all orders to sibling run
          const absorbed = [...nextRuns[targetRunId].orderIds, ...run.orderIds]
          nextRuns[targetRunId] = { ...nextRuns[targetRunId], orderIds: absorbed }
          for (const oid of run.orderIds) {
            nextOrderToRun[oid] = targetRunId
          }
        } else {
          // Only run in cell — place orders as loose
          const looseIds = [...(nextCells[cellId]?.looseOrderIds || []), ...run.orderIds]
          nextCells[cellId] = { ...nextCells[cellId], runIds: [], looseOrderIds: looseIds }
          for (const oid of run.orderIds) {
            delete nextOrderToRun[oid]
            nextLooseOrderToCell[oid] = cellId
          }
          delete nextRuns[runId]
          delete nextRunToCell[runId]
          return { runs: nextRuns, cells: nextCells, runToCell: nextRunToCell, orderToRun: nextOrderToRun, looseOrderToCell: nextLooseOrderToCell }
        }

        // Remove dissolved run
        delete nextRuns[runId]
        delete nextRunToCell[runId]
        nextCells[cellId] = { ...nextCells[cellId], runIds: cell.runIds.filter((id) => id !== runId) }

        return { runs: nextRuns, cells: nextCells, runToCell: nextRunToCell, orderToRun: nextOrderToRun, looseOrderToCell: nextLooseOrderToCell }
      })

      return true
    },

    toggleDateLock: (date) => {
      set((prev) => {
        const next = new Set(prev.blockedDates)
        if (next.has(date)) { next.delete(date) } else { next.add(date) }
        return { blockedDates: next }
      })
    },

    reorderInRun: (runId, fromIndex, toIndex) => {
      set((prev) => {
        const run = prev.runs[runId]
        if (!run) return prev
        if (fromIndex < 0 || fromIndex >= run.orderIds.length) return prev
        if (toIndex < 0 || toIndex >= run.orderIds.length) return prev
        if (fromIndex === toIndex) return prev

        const next = [...run.orderIds]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)

        return { runs: { ...prev.runs, [runId]: { ...run, orderIds: next } } }
      })
    },

    reorderRunsInCell: (cellId, fromIndex, toIndex) => {
      set((prev) => {
        const cell = prev.cells[cellId]
        if (!cell) return prev
        if (fromIndex < 0 || fromIndex >= cell.runIds.length) return prev
        if (toIndex < 0 || toIndex >= cell.runIds.length) return prev
        if (fromIndex === toIndex) return prev

        const next = [...cell.runIds]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)

        return { cells: { ...prev.cells, [cellId]: { ...cell, runIds: next } } }
      })
    },

    updateOrderNotes: (orderId, notes) => {
      set((prev) => {
        const order = prev.orders[orderId]
        if (!order) return prev
        return { orders: { ...prev.orders, [orderId]: { ...order, notes } } }
      })
    },

    updateRunNotes: (runId, notes) => {
      set((prev) => {
        const run = prev.runs[runId]
        if (!run) return prev
        return { runs: { ...prev.runs, [runId]: { ...run, notes } } }
      })
    },
  }))
)

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectOrder = (id: string) => (state: SchedulerState) =>
  state.orders[id]

export const selectRun = (id: string) => (state: SchedulerState) =>
  state.runs[id]

export const selectCellRunIds = (cellId: CellId) => (state: SchedulerState) =>
  state.cells[cellId]?.runIds ?? EMPTY_ARRAY

export const selectCellLooseOrderIds = (cellId: CellId) => (state: SchedulerState) =>
  state.cells[cellId]?.looseOrderIds ?? EMPTY_ARRAY

export const selectIsDateLocked = (date: string) => (state: SchedulerState) =>
  state.blockedDates.has(date)

export const selectTruckName = (truckId: string) => (state: SchedulerState) =>
  state.truckNames[truckId] ?? truckId

const EMPTY_ARRAY: string[] = []
