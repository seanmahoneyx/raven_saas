import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// ─── Types ───────────────────────────────────────────────────────────────────

export type OrderStatus = 'unscheduled' | 'picked' | 'packed' | 'shipped' | 'invoiced'
export type OrderType = 'PO' | 'SO'
export type NoteColor = 'yellow' | 'blue' | 'green' | 'red' | 'purple' | 'orange'

export interface SchedulerNote {
  id: string
  content: string
  color: NoteColor
  scheduledDate: string | null
  truckId: string | null
  deliveryRunId: string | null
  isPinned: boolean
  createdBy: string | null
}

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
  // Multi-user collaboration fields
  updatedAt?: string // ISO timestamp from server for conflict detection
}

// Dirty state tracking for optimistic updates
export interface DirtyState {
  orders: Set<string>      // Order IDs with local uncommitted changes
  runs: Set<string>        // Run IDs with local uncommitted changes
  notes: Set<string>       // Note IDs with local uncommitted changes
  pendingApiCalls: number  // Count of in-flight API calls
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
  notes: Record<string, SchedulerNote>
  blockedDates: Set<string>
  trucks: string[]
  truckNames: Record<string, string>  // truckId → truck name
  visibleWeeks: number

  // Reverse-lookup indices
  orderToRun: Record<string, string>        // orderId → runId (for committed orders)
  runToCell: Record<string, CellId>         // runId → cellId
  looseOrderToCell: Record<string, CellId>  // orderId → cellId (for loose orders)
  noteToCell: Record<string, CellId>        // noteId → cellId

  // Multi-user collaboration state
  dirty: DirtyState                         // Track locally modified items

  // Filter state
  filterCustomerCode: string | null
  filterStatus: OrderStatus | null

  // UI state
  selectedOrderId: string | null

  // Actions
  hydrate: (data: HydratePayload) => void
  mergeHydrate: (data: HydratePayload) => void  // Merge-based hydration for polling
  moveOrder: (orderId: string, targetRunId: string, insertIndex?: number) => MoveResult
  moveOrderLoose: (orderId: string, targetCellId: CellId) => MoveResult
  commitOrderToRun: (orderId: string, targetRunId: string, insertIndex?: number) => MoveResult
  moveRun: (runId: string, targetCellId: CellId, insertIndex?: number) => MoveResult
  createRun: (cellId: CellId, name?: string) => string | null
  dissolveRun: (runId: string) => boolean
  deleteRun: (runId: string) => boolean
  toggleDateLock: (date: string) => void
  reorderInRun: (runId: string, fromIndex: number, toIndex: number) => void
  reorderRunsInCell: (cellId: CellId, fromIndex: number, toIndex: number) => void
  updateOrderNotes: (orderId: string, notes: string | null) => void
  updateRunNotes: (runId: string, notes: string | null) => void
  setFilterCustomerCode: (code: string | null) => void
  setFilterStatus: (status: OrderStatus | null) => void
  setSelectedOrderId: (orderId: string | null) => void
  // Note actions
  hydrateNotes: (notes: SchedulerNote[]) => void
  addNote: (note: SchedulerNote) => void
  updateNote: (noteId: string, updates: Partial<SchedulerNote>) => void
  deleteNote: (noteId: string) => void
  moveNote: (noteId: string, targetCellId: CellId) => void
  // Dirty state management
  markOrderDirty: (orderId: string) => void
  markOrderClean: (orderId: string) => void
  markRunDirty: (runId: string) => void
  markRunClean: (runId: string) => void
  markNoteDirty: (noteId: string) => void
  markNoteClean: (noteId: string) => void
  incrementPendingApiCalls: () => void
  decrementPendingApiCalls: () => void
  clearAllDirty: () => void
  // WebSocket real-time update handlers
  applyOrderUpdate: (action: string, orderData: Record<string, unknown>) => void
  applyRunUpdate: (action: string, runData: Record<string, unknown>) => void
  applyNoteUpdate: (action: string, noteData: Record<string, unknown>) => void
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
    notes: {},
    blockedDates: new Set(),
    trucks: [],
    truckNames: {},
    visibleWeeks: 4,
    orderToRun: {},
    runToCell: {},
    looseOrderToCell: {},
    noteToCell: {},
    dirty: {
      orders: new Set(),
      runs: new Set(),
      notes: new Set(),
      pendingApiCalls: 0,
    },
    filterCustomerCode: null,
    filterStatus: null,
    selectedOrderId: null,

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
        // Clear dirty state on full hydrate (initial load)
        dirty: {
          orders: new Set(),
          runs: new Set(),
          notes: new Set(),
          pendingApiCalls: 0,
        },
      })
    },

    /**
     * Merge-based hydration for polling updates.
     * Preserves locally modified (dirty) items to avoid overwriting in-progress changes.
     * This enables multi-user collaboration without losing local state.
     */
    mergeHydrate: (data) => {
      const state = get()
      const { dirty } = state

      // Skip merge entirely if there are pending API calls (user is actively making changes)
      if (dirty.pendingApiCalls > 0) {
        return
      }

      const ordersMap: Record<string, Order> = { ...state.orders }
      const runsMap: Record<string, DeliveryRun> = { ...state.runs }
      const orderToRun: Record<string, string> = {}
      const runToCell: Record<string, CellId> = {}
      const looseOrderToCell: Record<string, CellId> = {}

      // Track which orders/runs exist in new data (for detecting deletions)
      const incomingOrderIds = new Set<string>()
      const incomingRunIds = new Set<string>()

      // Merge orders: only update if not dirty
      for (const order of data.orders) {
        incomingOrderIds.add(order.id)

        if (dirty.orders.has(order.id)) {
          // Keep local version - it has uncommitted changes
          continue
        }

        const existingOrder = state.orders[order.id]

        // Check if order actually changed (compare key fields)
        if (existingOrder) {
          const hasChanged =
            existingOrder.date !== order.date ||
            existingOrder.status !== order.status ||
            existingOrder.notes !== order.notes ||
            existingOrder.palletCount !== order.palletCount

          if (!hasChanged) {
            // No change, keep existing to preserve reference stability
            continue
          }
        }

        // Update with server data
        ordersMap[order.id] = {
          ...order,
          color: getStatusColor(order.status),
          isReadOnly: order.status === 'shipped' || order.status === 'invoiced',
        }
      }

      // Remove orders that no longer exist on server (unless dirty)
      for (const orderId of Object.keys(ordersMap)) {
        if (!incomingOrderIds.has(orderId) && !dirty.orders.has(orderId)) {
          delete ordersMap[orderId]
        }
      }

      // Merge runs: only update if not dirty
      for (const run of data.runs) {
        incomingRunIds.add(run.id)

        if (dirty.runs.has(run.id)) {
          // Keep local version
          const existingRun = state.runs[run.id]
          if (existingRun) {
            runsMap[run.id] = existingRun
            for (const orderId of existingRun.orderIds) {
              orderToRun[orderId] = run.id
            }
          }
          continue
        }

        const existingRun = state.runs[run.id]

        // Check if run actually changed
        if (existingRun) {
          const orderIdsMatch =
            existingRun.orderIds.length === run.orderIds.length &&
            existingRun.orderIds.every((id, i) => id === run.orderIds[i])
          const notesMatch = existingRun.notes === (run.notes ?? null)

          if (orderIdsMatch && notesMatch && existingRun.name === run.name) {
            // No change, keep existing
            runsMap[run.id] = existingRun
            for (const orderId of existingRun.orderIds) {
              orderToRun[orderId] = run.id
            }
            continue
          }
        }

        // Update with server data
        runsMap[run.id] = { ...run, notes: run.notes ?? null }
        for (const orderId of run.orderIds) {
          orderToRun[orderId] = run.id
        }
      }

      // Remove runs that no longer exist on server (unless dirty)
      for (const runId of Object.keys(runsMap)) {
        if (!incomingRunIds.has(runId) && !dirty.runs.has(runId)) {
          delete runsMap[runId]
        }
      }

      // Build cells - merge carefully to preserve local order arrangements
      const cellsCopy: Record<CellId, CellData> = {}

      for (const [cellId, cellData] of Object.entries(data.cells)) {
        const existingCell = state.cells[cellId]

        // Check if any runs in this cell are dirty
        const hasDirtyRuns = cellData.runIds.some(id => dirty.runs.has(id))
        const hasDirtyLooseOrders = (cellData.looseOrderIds || []).some(id => dirty.orders.has(id))

        if (existingCell && (hasDirtyRuns || hasDirtyLooseOrders)) {
          // Preserve existing cell structure if it has dirty items
          cellsCopy[cellId] = {
            runIds: [...existingCell.runIds],
            looseOrderIds: [...existingCell.looseOrderIds],
          }
        } else {
          cellsCopy[cellId] = {
            runIds: [...cellData.runIds],
            looseOrderIds: [...(cellData.looseOrderIds || [])],
          }
        }

        for (const runId of cellsCopy[cellId].runIds) {
          runToCell[runId] = cellId
        }
        for (const orderId of cellsCopy[cellId].looseOrderIds) {
          looseOrderToCell[orderId] = cellId
        }
      }

      // Preserve cells that have dirty items but aren't in incoming data
      for (const [cellId, cellData] of Object.entries(state.cells)) {
        if (!cellsCopy[cellId]) {
          const hasDirtyRuns = cellData.runIds.some(id => dirty.runs.has(id))
          const hasDirtyLooseOrders = cellData.looseOrderIds.some(id => dirty.orders.has(id))

          if (hasDirtyRuns || hasDirtyLooseOrders) {
            cellsCopy[cellId] = {
              runIds: [...cellData.runIds],
              looseOrderIds: [...cellData.looseOrderIds],
            }
            for (const runId of cellData.runIds) {
              runToCell[runId] = cellId
            }
            for (const orderId of cellData.looseOrderIds) {
              looseOrderToCell[orderId] = cellId
            }
          }
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

    /**
     * Delete an empty run completely. Returns false if run has orders.
     */
    deleteRun: (runId) => {
      const state = get()
      const run = state.runs[runId]
      if (!run) return false

      // Only allow deleting empty runs
      if (run.orderIds.length > 0) return false

      const cellId = state.runToCell[runId]
      if (!cellId) return false

      set((prev) => {
        const nextRuns = { ...prev.runs }
        const nextCells = { ...prev.cells }
        const nextRunToCell = { ...prev.runToCell }

        // Remove run from cell
        const cell = prev.cells[cellId]
        if (cell) {
          nextCells[cellId] = {
            ...cell,
            runIds: cell.runIds.filter((id) => id !== runId),
          }
        }

        // Remove run from store
        delete nextRuns[runId]
        delete nextRunToCell[runId]

        return { runs: nextRuns, cells: nextCells, runToCell: nextRunToCell }
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

    setFilterCustomerCode: (code) => {
      set({ filterCustomerCode: code })
    },

    setFilterStatus: (status) => {
      set({ filterStatus: status })
    },

    setSelectedOrderId: (orderId) => {
      set({ selectedOrderId: orderId })
    },

    hydrateNotes: (notesArr) => {
      const notesMap: Record<string, SchedulerNote> = {}
      const noteToCell: Record<string, CellId> = {}

      for (const note of notesArr) {
        notesMap[note.id] = note
        // Build cellId from note's truck and date
        if (note.scheduledDate) {
          const truckId = note.truckId ?? 'unassigned'
          const cellId: CellId = `${truckId}|${note.scheduledDate}`
          noteToCell[note.id] = cellId
        }
      }

      set({ notes: notesMap, noteToCell })
    },

    addNote: (note) => {
      set((prev) => {
        const nextNotes = { ...prev.notes, [note.id]: note }
        const nextNoteToCell = { ...prev.noteToCell }

        if (note.scheduledDate) {
          const truckId = note.truckId ?? 'unassigned'
          nextNoteToCell[note.id] = `${truckId}|${note.scheduledDate}`
        }

        return { notes: nextNotes, noteToCell: nextNoteToCell }
      })
    },

    updateNote: (noteId, updates) => {
      set((prev) => {
        const note = prev.notes[noteId]
        if (!note) return prev

        const updatedNote = { ...note, ...updates }
        const nextNotes = { ...prev.notes, [noteId]: updatedNote }
        const nextNoteToCell = { ...prev.noteToCell }

        // Update cell mapping if date or truck changed
        if (updatedNote.scheduledDate) {
          const truckId = updatedNote.truckId ?? 'unassigned'
          nextNoteToCell[noteId] = `${truckId}|${updatedNote.scheduledDate}`
        } else {
          delete nextNoteToCell[noteId]
        }

        return { notes: nextNotes, noteToCell: nextNoteToCell }
      })
    },

    deleteNote: (noteId) => {
      set((prev) => {
        const nextNotes = { ...prev.notes }
        const nextNoteToCell = { ...prev.noteToCell }
        delete nextNotes[noteId]
        delete nextNoteToCell[noteId]
        return { notes: nextNotes, noteToCell: nextNoteToCell }
      })
    },

    moveNote: (noteId, targetCellId) => {
      const parsed = parseCellId(targetCellId)
      if (!parsed) return

      set((prev) => {
        const note = prev.notes[noteId]
        if (!note) return prev

        const updatedNote: SchedulerNote = {
          ...note,
          scheduledDate: parsed.date,
          truckId: parsed.truckId === 'unassigned' ? null : parsed.truckId,
        }

        return {
          notes: { ...prev.notes, [noteId]: updatedNote },
          noteToCell: { ...prev.noteToCell, [noteId]: targetCellId },
        }
      })
    },

    // ─── Dirty State Management ─────────────────────────────────────────────────
    // These actions track locally modified items to preserve them during polling sync

    markOrderDirty: (orderId) => {
      set((prev) => {
        const next = new Set(prev.dirty.orders)
        next.add(orderId)
        return { dirty: { ...prev.dirty, orders: next } }
      })
    },

    markOrderClean: (orderId) => {
      set((prev) => {
        const next = new Set(prev.dirty.orders)
        next.delete(orderId)
        return { dirty: { ...prev.dirty, orders: next } }
      })
    },

    markRunDirty: (runId) => {
      set((prev) => {
        const next = new Set(prev.dirty.runs)
        next.add(runId)
        return { dirty: { ...prev.dirty, runs: next } }
      })
    },

    markRunClean: (runId) => {
      set((prev) => {
        const next = new Set(prev.dirty.runs)
        next.delete(runId)
        return { dirty: { ...prev.dirty, runs: next } }
      })
    },

    markNoteDirty: (noteId) => {
      set((prev) => {
        const next = new Set(prev.dirty.notes)
        next.add(noteId)
        return { dirty: { ...prev.dirty, notes: next } }
      })
    },

    markNoteClean: (noteId) => {
      set((prev) => {
        const next = new Set(prev.dirty.notes)
        next.delete(noteId)
        return { dirty: { ...prev.dirty, notes: next } }
      })
    },

    incrementPendingApiCalls: () => {
      set((prev) => ({
        dirty: { ...prev.dirty, pendingApiCalls: prev.dirty.pendingApiCalls + 1 },
      }))
    },

    decrementPendingApiCalls: () => {
      set((prev) => ({
        dirty: { ...prev.dirty, pendingApiCalls: Math.max(0, prev.dirty.pendingApiCalls - 1) },
      }))
    },

    clearAllDirty: () => {
      set({
        dirty: {
          orders: new Set(),
          runs: new Set(),
          notes: new Set(),
          pendingApiCalls: 0,
        },
      })
    },

    // ─── WebSocket Real-Time Update Handlers ────────────────────────────────────
    // These actions apply incremental updates from WebSocket messages

    applyOrderUpdate: (action, orderData) => {
      const state = get()
      const orderId = String(orderData.id)

      // Skip if this order is dirty (user is actively editing it)
      if (state.dirty.orders.has(orderId)) {
        if (import.meta.env.DEV) console.log(`[WS] Skipping order update for dirty order ${orderId}`)
        return
      }

      if (action === 'deleted') {
        // Remove order from store
        set((prev) => {
          const { [orderId]: _, ...restOrders } = prev.orders
          const nextOrderToRun = { ...prev.orderToRun }
          const nextLooseOrderToCell = { ...prev.looseOrderToCell }
          delete nextOrderToRun[orderId]
          delete nextLooseOrderToCell[orderId]

          // Also remove from any runs
          const nextRuns = { ...prev.runs }
          for (const [runId, run] of Object.entries(nextRuns)) {
            if (run.orderIds.includes(orderId)) {
              nextRuns[runId] = {
                ...run,
                orderIds: run.orderIds.filter((id) => id !== orderId),
              }
            }
          }

          // Remove from cell loose lists
          const nextCells = { ...prev.cells }
          for (const [cellId, cell] of Object.entries(nextCells)) {
            if (cell.looseOrderIds.includes(orderId)) {
              nextCells[cellId] = {
                ...cell,
                looseOrderIds: cell.looseOrderIds.filter((id) => id !== orderId),
              }
            }
          }

          return {
            orders: restOrders,
            orderToRun: nextOrderToRun,
            looseOrderToCell: nextLooseOrderToCell,
            runs: nextRuns,
            cells: nextCells,
          }
        })
      } else {
        // Transform server data to client format and upsert
        const transformed: Order = {
          id: orderId,
          orderNumber: String(orderData.number || ''),
          customerCode: String(orderData.party_name || ''),
          palletCount: Number(orderData.total_pallets) || 0,
          status: (orderData.status as OrderStatus) || 'unscheduled',
          color: getStatusColor((orderData.status as OrderStatus) || 'unscheduled'),
          notes: orderData.notes as string | null,
          type: (orderData.order_type as OrderType) || 'SO',
          isReadOnly: orderData.status === 'shipped' || orderData.status === 'invoiced',
          date: orderData.scheduled_date ? String(orderData.scheduled_date) : '',
        }

        set((prev) => {
          const nextOrders = { ...prev.orders, [orderId]: transformed }
          const nextOrderToRun = { ...prev.orderToRun }
          const nextLooseOrderToCell = { ...prev.looseOrderToCell }
          const nextCells = { ...prev.cells }

          // Update run membership if delivery_run_id changed
          const runId = orderData.delivery_run_id ? String(orderData.delivery_run_id) : null
          const truckId = orderData.scheduled_truck_id ? String(orderData.scheduled_truck_id) : 'unassigned'
          const date = orderData.scheduled_date ? String(orderData.scheduled_date) : null

          // Remove from old run if necessary (handled by run updates from server)
          const oldRunId = prev.orderToRun[orderId]
          if (oldRunId && oldRunId !== runId) {
            // Run membership changes are handled by server-side run updates
          }

          if (runId) {
            nextOrderToRun[orderId] = runId
            delete nextLooseOrderToCell[orderId]
          } else if (date) {
            // Order is loose (no run) but has a date
            delete nextOrderToRun[orderId]
            const cellId = `${truckId}|${date}`
            nextLooseOrderToCell[orderId] = cellId

            // Ensure cell exists and contains this order
            if (!nextCells[cellId]) {
              nextCells[cellId] = { runIds: [], looseOrderIds: [orderId] }
            } else if (!nextCells[cellId].looseOrderIds.includes(orderId)) {
              nextCells[cellId] = {
                ...nextCells[cellId],
                looseOrderIds: [...nextCells[cellId].looseOrderIds, orderId],
              }
            }
          } else {
            // Unscheduled order
            delete nextOrderToRun[orderId]
            delete nextLooseOrderToCell[orderId]
          }

          return {
            orders: nextOrders,
            orderToRun: nextOrderToRun,
            looseOrderToCell: nextLooseOrderToCell,
            cells: nextCells,
          }
        })
      }
    },

    applyRunUpdate: (action, runData) => {
      const state = get()
      const runId = String(runData.id)

      // Skip if this run is dirty (user is actively editing it)
      if (state.dirty.runs.has(runId)) {
        if (import.meta.env.DEV) console.log(`[WS] Skipping run update for dirty run ${runId}`)
        return
      }

      if (action === 'deleted') {
        set((prev) => {
          const { [runId]: _, ...restRuns } = prev.runs
          const nextRunToCell = { ...prev.runToCell }
          const nextOrderToRun = { ...prev.orderToRun }
          delete nextRunToCell[runId]

          // Clear run reference from orders
          for (const [orderId, oRunId] of Object.entries(prev.orderToRun)) {
            if (oRunId === runId) {
              delete nextOrderToRun[orderId]
            }
          }

          // Remove from cells
          const nextCells = { ...prev.cells }
          for (const [cellId, cell] of Object.entries(nextCells)) {
            if (cell.runIds.includes(runId)) {
              nextCells[cellId] = {
                ...cell,
                runIds: cell.runIds.filter((id) => id !== runId),
              }
            }
          }

          return {
            runs: restRuns,
            runToCell: nextRunToCell,
            orderToRun: nextOrderToRun,
            cells: nextCells,
          }
        })
      } else {
        // Transform and upsert run
        const transformed: DeliveryRun = {
          id: runId,
          name: String(runData.name || ''),
          orderIds: [], // Order membership comes from order updates
          notes: runData.notes as string | null ?? null,
        }

        // Preserve existing orderIds if we have them (server doesn't always send full order list)
        const existingRun = state.runs[runId]
        if (existingRun) {
          transformed.orderIds = existingRun.orderIds
        }

        set((prev) => {
          const nextRuns = { ...prev.runs, [runId]: transformed }
          const nextRunToCell = { ...prev.runToCell }
          const nextCells = { ...prev.cells }

          // Build cell ID from run data
          const truckId = runData.truck_id ? String(runData.truck_id) : 'unassigned'
          const date = runData.scheduled_date ? String(runData.scheduled_date) : null

          if (date) {
            const cellId = `${truckId}|${date}`

            // Remove from old cell if moved
            const oldCellId = prev.runToCell[runId]
            if (oldCellId && oldCellId !== cellId && nextCells[oldCellId]) {
              nextCells[oldCellId] = {
                ...nextCells[oldCellId],
                runIds: nextCells[oldCellId].runIds.filter((id) => id !== runId),
              }
            }

            // Add to new cell
            nextRunToCell[runId] = cellId
            if (!nextCells[cellId]) {
              nextCells[cellId] = { runIds: [runId], looseOrderIds: [] }
            } else if (!nextCells[cellId].runIds.includes(runId)) {
              nextCells[cellId] = {
                ...nextCells[cellId],
                runIds: [...nextCells[cellId].runIds, runId],
              }
            }
          }

          return {
            runs: nextRuns,
            runToCell: nextRunToCell,
            cells: nextCells,
          }
        })
      }
    },

    applyNoteUpdate: (action, noteData) => {
      const state = get()
      const noteId = String(noteData.id)

      // Skip if this note is dirty (user is actively editing it)
      if (state.dirty.notes.has(noteId)) {
        if (import.meta.env.DEV) console.log(`[WS] Skipping note update for dirty note ${noteId}`)
        return
      }

      if (action === 'deleted') {
        set((prev) => {
          const { [noteId]: _, ...restNotes } = prev.notes
          const nextNoteToCell = { ...prev.noteToCell }
          delete nextNoteToCell[noteId]
          return { notes: restNotes, noteToCell: nextNoteToCell }
        })
      } else {
        // Transform and upsert note
        const transformed: SchedulerNote = {
          id: noteId,
          content: String(noteData.content || ''),
          color: (noteData.color as NoteColor) || 'yellow',
          scheduledDate: noteData.scheduled_date ? String(noteData.scheduled_date) : null,
          truckId: noteData.truck_id ? String(noteData.truck_id) : null,
          deliveryRunId: noteData.delivery_run_id ? String(noteData.delivery_run_id) : null,
          isPinned: Boolean(noteData.is_pinned),
          createdBy: noteData.created_by ? String(noteData.created_by) : null,
        }

        set((prev) => {
          const nextNotes = { ...prev.notes, [noteId]: transformed }
          const nextNoteToCell = { ...prev.noteToCell }

          // Update cell mapping
          if (transformed.scheduledDate) {
            const truckId = transformed.truckId ?? 'unassigned'
            nextNoteToCell[noteId] = `${truckId}|${transformed.scheduledDate}`
          } else {
            delete nextNoteToCell[noteId]
          }

          return { notes: nextNotes, noteToCell: nextNoteToCell }
        })
      }
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

export const selectFilterCustomerCode = (state: SchedulerState) =>
  state.filterCustomerCode

export const selectFilterStatus = (state: SchedulerState) =>
  state.filterStatus

export const selectUniqueCustomerCodes = (state: SchedulerState) => {
  const codes = new Set<string>()
  for (const order of Object.values(state.orders)) {
    if (order.customerCode) {
      codes.add(order.customerCode)
    }
  }
  return Array.from(codes).sort()
}

export const selectOrderMatchesFilter = (orderId: string) => (state: SchedulerState) => {
  const order = state.orders[orderId]
  if (!order) return true

  const { filterCustomerCode, filterStatus } = state
  if (!filterCustomerCode && !filterStatus) return true

  if (filterCustomerCode && order.customerCode !== filterCustomerCode) return false
  if (filterStatus && order.status !== filterStatus) return false

  return true
}

export const selectNotesForCell = (cellId: CellId) => (state: SchedulerState) => {
  const noteIds: string[] = []
  for (const [noteId, noteCellId] of Object.entries(state.noteToCell)) {
    if (noteCellId === cellId) {
      noteIds.push(noteId)
    }
  }
  return noteIds
}

export const selectNote = (noteId: string) => (state: SchedulerState) =>
  state.notes[noteId]

export const selectSelectedOrderId = (state: SchedulerState) =>
  state.selectedOrderId

export const selectSelectedOrder = (state: SchedulerState) =>
  state.selectedOrderId ? state.orders[state.selectedOrderId] : null

export const selectDirtyState = (state: SchedulerState) => state.dirty

export const selectHasPendingChanges = (state: SchedulerState) =>
  state.dirty.orders.size > 0 ||
  state.dirty.runs.size > 0 ||
  state.dirty.notes.size > 0 ||
  state.dirty.pendingApiCalls > 0

const EMPTY_ARRAY: string[] = []
