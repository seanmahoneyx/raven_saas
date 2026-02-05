import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// ─── Dev Mode Validation ─────────────────────────────────────────────────────

/**
 * Validates that cellLooseItemOrder is in sync with cells[].looseOrderIds.
 * Only runs in development mode. Logs warnings if divergence is detected.
 */
function validateCellLooseItemOrderSync(
  cells: Record<string, { runIds: string[]; looseOrderIds: string[] }>,
  cellLooseItemOrder: Record<string, string[]>
): void {
  if (import.meta.env.PROD) return // Skip in production

  for (const [cellId, cellData] of Object.entries(cells)) {
    const looseOrderIds = new Set(cellData.looseOrderIds)
    const looseItems = cellLooseItemOrder[cellId] || []
    const orderIdsInLooseItems = new Set(
      looseItems
        .filter(item => item.startsWith('order:'))
        .map(item => item.slice(6))
    )

    // Check for orders in cells but not in cellLooseItemOrder
    for (const orderId of looseOrderIds) {
      if (!orderIdsInLooseItems.has(orderId)) {
        console.warn(
          `[Scheduler] cellLooseItemOrder desync: order "${orderId}" is in cells["${cellId}"].looseOrderIds but missing from cellLooseItemOrder`
        )
      }
    }

    // Check for orders in cellLooseItemOrder but not in cells
    for (const orderId of orderIdsInLooseItems) {
      if (!looseOrderIds.has(orderId)) {
        console.warn(
          `[Scheduler] cellLooseItemOrder desync: order "${orderId}" is in cellLooseItemOrder["${cellId}"] but missing from cells.looseOrderIds`
        )
      }
    }
  }
}

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
  cells: Set<CellId>       // Cell IDs affected by move operations (source + destination)
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

/**
 * Find optimal insert position for an order within a run.
 * Groups orders by customer - inserts next to same-customer orders if any exist.
 * Returns undefined to append to end if no same-customer orders found.
 */
function findSmartInsertPosition(
  orderIds: string[],
  orders: Record<string, Order>,
  customerCode: string
): number | undefined {
  // Find existing orders from the same customer
  let lastSameCustomerIndex = -1

  for (let i = 0; i < orderIds.length; i++) {
    const order = orders[orderIds[i]]
    if (order?.customerCode === customerCode) {
      lastSameCustomerIndex = i
    }
  }

  // If same-customer orders exist, insert after the last one
  if (lastSameCustomerIndex >= 0) {
    return lastSameCustomerIndex + 1
  }

  // No same-customer orders - return undefined to append at end
  return undefined
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
  cellNoteOrders: Record<CellId, string[]>  // cellId → ordered noteIds (legacy, kept for compatibility)
  cellLooseItemOrder: Record<CellId, string[]>  // cellId → unified order of loose items (prefixed: "note:123", "order:456")

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
  moveOrder: (orderId: string, targetRunId: string, insertIndex?: number, forcePosition?: boolean) => MoveResult
  moveOrderLoose: (orderId: string, targetCellId: CellId) => MoveResult
  commitOrderToRun: (orderId: string, targetRunId: string, insertIndex?: number, forcePosition?: boolean) => MoveResult
  moveRun: (runId: string, targetCellId: CellId, insertIndex?: number) => MoveResult
  createRun: (cellId: CellId, name?: string) => string | null
  createRunWithOrder: (cellId: CellId, orderId: string, name?: string) => string | null
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
  moveNote: (noteId: string, targetCellId: CellId, insertIndex?: number) => void
  reorderNotesInCell: (cellId: CellId, fromIndex: number, toIndex: number) => void
  getCellNoteIds: (cellId: CellId) => string[]
  // Unified loose item ordering (notes + loose orders interleaved)
  reorderLooseItem: (cellId: CellId, fromIndex: number, toIndex: number) => void
  getCellLooseItemOrder: (cellId: CellId) => string[]
  // Dirty state management
  markOrderDirty: (orderId: string) => void
  markOrderClean: (orderId: string) => void
  markRunDirty: (runId: string) => void
  markRunClean: (runId: string) => void
  markNoteDirty: (noteId: string) => void
  markNoteClean: (noteId: string) => void
  markCellDirty: (cellId: CellId) => void
  markCellClean: (cellId: CellId) => void
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
    cellNoteOrders: {},
    cellLooseItemOrder: {},
    dirty: {
      orders: new Set(),
      runs: new Set(),
      notes: new Set(),
      cells: new Set(),
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

      // Build initial cellLooseItemOrder from existing cell loose orders
      // Notes will be added when hydrateNotes is called
      // IMPORTANT: Filter out non-PO orders from inbound cells
      const cellLooseItemOrder: Record<CellId, string[]> = {}
      for (const [cellId, cellData] of Object.entries(cellsCopy)) {
        const isInboundCell = cellId.startsWith('inbound|')
        // Start with loose orders prefixed, filtering SOs from inbound cells
        cellLooseItemOrder[cellId] = (cellData.looseOrderIds || [])
          .filter(id => {
            if (!isInboundCell) return true
            // For inbound cells, only include POs
            const order = ordersMap[id]
            return order?.type === 'PO'
          })
          .map(id => `order:${id}`)
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
        cellLooseItemOrder,
        // Clear dirty state on full hydrate (initial load)
        dirty: {
          orders: new Set(),
          runs: new Set(),
          notes: new Set(),
          cells: new Set(),
          pendingApiCalls: 0,
        },
      })

      // Dev mode validation: detect desync between cells and cellLooseItemOrder
      validateCellLooseItemOrderSync(cellsCopy, cellLooseItemOrder)
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

        // Check if this cell is dirty (was involved in a recent move operation)
        const isCellDirty = dirty.cells.has(cellId as CellId)
        // Check if any runs in this cell are dirty (both existing AND incoming)
        const existingRunsDirty = existingCell?.runIds.some(id => dirty.runs.has(id)) ?? false
        const incomingRunsDirty = cellData.runIds.some(id => dirty.runs.has(id))
        const hasDirtyRuns = existingRunsDirty || incomingRunsDirty
        // Check if any loose orders are dirty (both existing AND incoming)
        // This prevents stale poll data from overwriting cells that contain recently-moved orders
        const existingLooseOrdersDirty = existingCell?.looseOrderIds.some(id => dirty.orders.has(id)) ?? false
        const incomingLooseOrdersDirty = (cellData.looseOrderIds || []).some(id => dirty.orders.has(id))
        const hasDirtyLooseOrders = existingLooseOrdersDirty || incomingLooseOrdersDirty

        if (existingCell && (isCellDirty || hasDirtyRuns || hasDirtyLooseOrders)) {
          // Preserve existing cell structure if cell is dirty or has dirty items
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

      // Preserve cells that are dirty or have dirty items but aren't in incoming data
      for (const [cellId, cellData] of Object.entries(state.cells)) {
        if (!cellsCopy[cellId]) {
          const isCellDirty = dirty.cells.has(cellId as CellId)
          const hasDirtyRuns = cellData.runIds.some(id => dirty.runs.has(id))
          const hasDirtyLooseOrders = cellData.looseOrderIds.some(id => dirty.orders.has(id))

          if (isCellDirty || hasDirtyRuns || hasDirtyLooseOrders) {
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

      // Build cellLooseItemOrder with strict separation of concerns:
      // - INBOUND CELLS: Read-only, always trust server (no reconciliation)
      // - STANDARD CELLS: Reconcile to preserve user's manual sort order
      const prevCellLooseItemOrder = state.cellLooseItemOrder
      const cellLooseItemOrder: Record<CellId, string[]> = {}

      for (const [cellId, cellData] of Object.entries(cellsCopy)) {
        const isInboundCell = cellId.startsWith('inbound|')

        if (isInboundCell) {
          // ═══════════════════════════════════════════════════════════════════
          // INBOUND CELLS: READ-ONLY - Always rebuild fresh from server
          // ═══════════════════════════════════════════════════════════════════
          // Inbound row is driven by backend Priority List. Client must NEVER
          // try to preserve local state, as this causes "ghost" POs that reject
          // valid server updates. Just map raw looseOrderIds (POs) directly.
          cellLooseItemOrder[cellId] = (cellData.looseOrderIds || [])
            .filter(id => {
              // Extra safety: only include POs in inbound cells
              const order = ordersMap[id]
              return order?.type === 'PO'
            })
            .map(id => `order:${id}`)
        } else {
          // ═══════════════════════════════════════════════════════════════════
          // STANDARD CELLS (Trucks/Unassigned): Reconcile to preserve sort order
          // ═══════════════════════════════════════════════════════════════════
          const existingItems = prevCellLooseItemOrder[cellId] || []

          // Build set of valid order IDs that SHOULD be in this cell
          const validOrderIds = new Set(cellData.looseOrderIds || [])

          // Step 1: Keep existing items that are still valid in this cell
          // This preserves the user's manual sort order from drag operations
          const preservedItems = existingItems.filter(item => {
            if (item.startsWith('note:')) return true // Always keep notes (managed separately)
            if (item.startsWith('order:')) {
              const orderId = item.slice(6) // Remove "order:" prefix
              return validOrderIds.has(orderId)
            }
            return false
          })

          // Step 2: Find new items from server that aren't in preserved list
          const existingOrderIds = new Set(
            preservedItems
              .filter(item => item.startsWith('order:'))
              .map(item => item.slice(6))
          )
          const newItems = (cellData.looseOrderIds || [])
            .filter(id => !existingOrderIds.has(id))
            .map(id => `order:${id}`)

          cellLooseItemOrder[cellId] = [...preservedItems, ...newItems]
        }
      }

      // Also preserve cellLooseItemOrder for cells not in incoming data (dirty cells)
      for (const cellId of Object.keys(prevCellLooseItemOrder)) {
        if (!cellLooseItemOrder[cellId] && cellsCopy[cellId]) {
          cellLooseItemOrder[cellId] = prevCellLooseItemOrder[cellId]
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
        cellLooseItemOrder,
      })

      // Dev mode validation: detect desync between cells and cellLooseItemOrder
      validateCellLooseItemOrderSync(cellsCopy, cellLooseItemOrder)
    },

    /**
     * Move an order into a target run (commit it).
     * Removes from loose if previously loose, or from source run.
     * By default, uses smart positioning to group same-customer orders together.
     * Pass forcePosition=true to use exact insertIndex (e.g., Shift+drag).
     *
     * SURGICAL MUTATION: Only modifies the specific source and target objects.
     * Does not spread/clone entire state collections unnecessarily.
     */
    moveOrder: (orderId, targetRunId, insertIndex, forcePosition) => {
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
        // Identify sources BEFORE any mutations
        const sourceRunId = prev.orderToRun[orderId]
        const looseCellId = prev.looseOrderToCell[orderId]
        const orderItem = `order:${orderId}`

        // Build surgical updates - only for objects that actually change
        const runUpdates: Record<string, DeliveryRun> = {}
        const cellUpdates: Record<CellId, CellData> = {}
        const looseItemOrderUpdates: Record<CellId, string[]> = {}

        // 1. Remove from source run (if committed to a different run)
        if (sourceRunId && sourceRunId !== targetRunId && prev.runs[sourceRunId]) {
          runUpdates[sourceRunId] = {
            ...prev.runs[sourceRunId],
            orderIds: prev.runs[sourceRunId].orderIds.filter((id) => id !== orderId),
          }
        }

        // 2. Remove from loose cell (if was loose)
        if (looseCellId && prev.cells[looseCellId]) {
          cellUpdates[looseCellId] = {
            ...prev.cells[looseCellId],
            looseOrderIds: prev.cells[looseCellId].looseOrderIds.filter((id) => id !== orderId),
          }
          if (prev.cellLooseItemOrder[looseCellId]) {
            looseItemOrderUpdates[looseCellId] = prev.cellLooseItemOrder[looseCellId].filter(item => item !== orderItem)
          }
        }

        // 3. Add to target run
        const targetRun = prev.runs[targetRunId]
        if (targetRun) {
          // Start from existing or already-updated run state
          const baseRun = runUpdates[targetRunId] ?? targetRun
          const newOrderIds = [...baseRun.orderIds]

          // Determine insert position
          let idx: number
          if (forcePosition && insertIndex !== undefined && insertIndex >= 0 && insertIndex <= newOrderIds.length) {
            idx = insertIndex
          } else if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= newOrderIds.length) {
            const smartIdx = findSmartInsertPosition(newOrderIds, prev.orders, order.customerCode)
            idx = smartIdx !== undefined ? smartIdx : insertIndex
          } else {
            const smartIdx = findSmartInsertPosition(newOrderIds, prev.orders, order.customerCode)
            idx = smartIdx !== undefined ? smartIdx : newOrderIds.length
          }

          newOrderIds.splice(idx, 0, orderId)
          runUpdates[targetRunId] = { ...baseRun, orderIds: newOrderIds }
        }

        // 4. Build final state - only merge what changed
        const hasRunUpdates = Object.keys(runUpdates).length > 0
        const hasCellUpdates = Object.keys(cellUpdates).length > 0
        const hasLooseItemUpdates = Object.keys(looseItemOrderUpdates).length > 0

        // 5. Update indices surgically
        const nextOrderToRun = { ...prev.orderToRun, [orderId]: targetRunId }
        const nextLooseOrderToCell = looseCellId
          ? (({ [orderId]: _, ...rest }) => rest)(prev.looseOrderToCell)
          : prev.looseOrderToCell

        // 6. Update order date if changed
        const orderNeedsDateUpdate = order.date !== parsed.date
        const nextOrders = orderNeedsDateUpdate
          ? { ...prev.orders, [orderId]: { ...order, date: parsed.date } }
          : prev.orders

        return {
          runs: hasRunUpdates ? { ...prev.runs, ...runUpdates } : prev.runs,
          cells: hasCellUpdates ? { ...prev.cells, ...cellUpdates } : prev.cells,
          cellLooseItemOrder: hasLooseItemUpdates ? { ...prev.cellLooseItemOrder, ...looseItemOrderUpdates } : prev.cellLooseItemOrder,
          orderToRun: nextOrderToRun,
          looseOrderToCell: nextLooseOrderToCell,
          orders: nextOrders,
        }
      })

      return { success: true }
    },

    /**
     * Place an order as "loose" in a cell (workbench/mockup area).
     * Removes from any run or previous loose cell.
     *
     * SURGICAL MUTATION: Only modifies the specific source and target objects.
     * Does not spread/clone entire state collections unnecessarily.
     */
    moveOrderLoose: (orderId, targetCellId) => {
      const state = get()
      const order = state.orders[orderId]
      if (!order) return { success: false, reason: 'READ_ONLY' }
      // Block POs from moving anywhere (they stay in inbound) AND
      // Block non-PO orders from moving TO inbound cells
      if (order.type === 'PO' || targetCellId.startsWith('inbound|')) {
        return { success: false, reason: 'INBOUND_ZONE' }
      }
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
        // Identify sources BEFORE any mutations
        const sourceRunId = prev.orderToRun[orderId]
        const prevLooseCellId = prev.looseOrderToCell[orderId]
        const orderItem = `order:${orderId}`

        // Track source cell for dirty marking (either from run or loose)
        const sourceCellId = sourceRunId
          ? prev.runToCell[sourceRunId]
          : prevLooseCellId

        // Build surgical updates - only for objects that actually change
        const runUpdates: Record<string, DeliveryRun> = {}
        const cellUpdates: Record<CellId, CellData> = {}
        const looseItemOrderUpdates: Record<CellId, string[]> = {}

        // 1. Remove from source run (if committed)
        if (sourceRunId && prev.runs[sourceRunId]) {
          runUpdates[sourceRunId] = {
            ...prev.runs[sourceRunId],
            orderIds: prev.runs[sourceRunId].orderIds.filter((id) => id !== orderId),
          }
        }

        // 2. Remove from previous loose cell (if loose elsewhere and different from target)
        if (prevLooseCellId && prevLooseCellId !== targetCellId && prev.cells[prevLooseCellId]) {
          cellUpdates[prevLooseCellId] = {
            ...prev.cells[prevLooseCellId],
            looseOrderIds: prev.cells[prevLooseCellId].looseOrderIds.filter((id) => id !== orderId),
          }
          if (prev.cellLooseItemOrder[prevLooseCellId]) {
            looseItemOrderUpdates[prevLooseCellId] = prev.cellLooseItemOrder[prevLooseCellId].filter(item => item !== orderItem)
          }
        }

        // 3. Add to target cell as loose (skip if already in this cell as loose)
        const targetCell = prev.cells[targetCellId]
        const alreadyInTargetCell = prevLooseCellId === targetCellId

        if (!alreadyInTargetCell) {
          if (!targetCell) {
            // Create new cell
            cellUpdates[targetCellId] = { runIds: [], looseOrderIds: [orderId] }
          } else {
            // Add to existing cell (merge with any prior updates to this cell)
            const baseCell = cellUpdates[targetCellId] ?? targetCell
            cellUpdates[targetCellId] = {
              ...baseCell,
              looseOrderIds: [...baseCell.looseOrderIds, orderId],
            }
          }

          // Add to unified loose item order
          const existingLooseItems = looseItemOrderUpdates[targetCellId] ?? prev.cellLooseItemOrder[targetCellId] ?? []
          if (!existingLooseItems.includes(orderItem)) {
            looseItemOrderUpdates[targetCellId] = [...existingLooseItems, orderItem]
          }
        }

        // 4. Build final state - only merge what changed
        const hasRunUpdates = Object.keys(runUpdates).length > 0
        const hasCellUpdates = Object.keys(cellUpdates).length > 0
        const hasLooseItemUpdates = Object.keys(looseItemOrderUpdates).length > 0

        // 5. Update indices surgically
        const nextOrderToRun = sourceRunId
          ? (({ [orderId]: _, ...rest }) => rest)(prev.orderToRun)
          : prev.orderToRun
        const nextLooseOrderToCell = { ...prev.looseOrderToCell, [orderId]: targetCellId }

        // 6. Update order date if changed
        const orderNeedsDateUpdate = order.date !== parsed.date
        const nextOrders = orderNeedsDateUpdate
          ? { ...prev.orders, [orderId]: { ...order, date: parsed.date } }
          : prev.orders

        // 7. Mark BOTH source and destination cells as dirty
        // This prevents mergeHydrate from overwriting these cells with stale server data
        const nextDirtyCells = new Set(prev.dirty.cells)
        if (sourceCellId) nextDirtyCells.add(sourceCellId)
        nextDirtyCells.add(targetCellId)

        return {
          runs: hasRunUpdates ? { ...prev.runs, ...runUpdates } : prev.runs,
          cells: hasCellUpdates ? { ...prev.cells, ...cellUpdates } : prev.cells,
          cellLooseItemOrder: hasLooseItemUpdates ? { ...prev.cellLooseItemOrder, ...looseItemOrderUpdates } : prev.cellLooseItemOrder,
          orderToRun: nextOrderToRun,
          looseOrderToCell: nextLooseOrderToCell,
          orders: nextOrders,
          dirty: { ...prev.dirty, cells: nextDirtyCells },
        }
      })

      return { success: true }
    },

    /**
     * Commit a loose order into a run. Alias for moveOrder but semantically
     * explicit about the loose → committed transition.
     */
    commitOrderToRun: (orderId, targetRunId, insertIndex, forcePosition) => {
      return get().moveOrder(orderId, targetRunId, insertIndex, forcePosition)
    },

    /**
     * Move an entire run to a different cell.
     *
     * SURGICAL MUTATION: Only modifies the specific source and target cells.
     * Does not spread/clone entire state collections unnecessarily.
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
        // Identify source BEFORE any mutations
        const sourceCellId = prev.runToCell[runId]

        // Skip if already in target cell at same position (no-op)
        if (sourceCellId === targetCellId) {
          // Still in same cell - might just be reordering, which is handled by reorderRunsInCell
          // But if insertIndex is specified, we may need to reorder
          const cell = prev.cells[targetCellId]
          if (cell && insertIndex !== undefined) {
            const currentIdx = cell.runIds.indexOf(runId)
            if (currentIdx === insertIndex || currentIdx === insertIndex - 1) {
              // No actual change needed
              return {}
            }
          }
        }

        // Build surgical updates - only for cells that actually change
        const cellUpdates: Record<CellId, CellData> = {}

        // 1. Remove from source cell (if different from target)
        if (sourceCellId && sourceCellId !== targetCellId && prev.cells[sourceCellId]) {
          cellUpdates[sourceCellId] = {
            ...prev.cells[sourceCellId],
            runIds: prev.cells[sourceCellId].runIds.filter((id) => id !== runId),
          }
        }

        // 2. Add to target cell
        const targetCell = prev.cells[targetCellId]
        if (!targetCell) {
          // Create new cell
          cellUpdates[targetCellId] = { runIds: [runId], looseOrderIds: [] }
        } else if (sourceCellId !== targetCellId) {
          // Add to existing cell (different from source)
          const baseCell = cellUpdates[targetCellId] ?? targetCell
          const newRunIds = [...baseCell.runIds]
          const idx = insertIndex !== undefined && insertIndex >= 0 && insertIndex <= newRunIds.length
            ? insertIndex
            : newRunIds.length
          newRunIds.splice(idx, 0, runId)
          cellUpdates[targetCellId] = { ...baseCell, runIds: newRunIds }
        } else {
          // Same cell - reorder within cell
          const newRunIds = targetCell.runIds.filter((id) => id !== runId)
          const idx = insertIndex !== undefined && insertIndex >= 0 && insertIndex <= newRunIds.length
            ? insertIndex
            : newRunIds.length
          newRunIds.splice(idx, 0, runId)
          cellUpdates[targetCellId] = { ...targetCell, runIds: newRunIds }
        }

        // 3. Update order dates for all orders in the run (only if date changed)
        const sourceParsed = sourceCellId ? parseCellId(sourceCellId) : null
        const dateChanged = !sourceParsed || sourceParsed.date !== parsed.date

        let nextOrders = prev.orders
        if (dateChanged && run.orderIds.length > 0) {
          const orderUpdates: Record<string, Order> = {}
          for (const orderId of run.orderIds) {
            const order = prev.orders[orderId]
            if (order && order.date !== parsed.date) {
              orderUpdates[orderId] = { ...order, date: parsed.date }
            }
          }
          if (Object.keys(orderUpdates).length > 0) {
            nextOrders = { ...prev.orders, ...orderUpdates }
          }
        }

        // 4. Build final state - only merge what changed
        const hasCellUpdates = Object.keys(cellUpdates).length > 0

        return {
          cells: hasCellUpdates ? { ...prev.cells, ...cellUpdates } : prev.cells,
          runToCell: { ...prev.runToCell, [runId]: targetCellId },
          orders: nextOrders,
        }
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
     * Atomically create a new run AND move an order into it in a single transaction.
     * This prevents the "disappearing order" bug where separate create + move operations
     * could race condition and lose the order.
     */
    createRunWithOrder: (cellId, orderId, name) => {
      const parsed = parseCellId(cellId)
      if (!parsed) return null

      const state = get()
      const order = state.orders[orderId]
      if (!order) return null
      if (order.type === 'PO') return null // POs can't go in runs
      if (order.isReadOnly) return null

      const newRunId = generateRunId()
      const cell = state.cells[cellId]
      const runCount = cell ? cell.runIds.length : 0
      const runName = name ?? `Run ${runCount + 1}`

      set((prev) => {
        // 1. Create the new run WITH the order already in it
        const newRun: DeliveryRun = { id: newRunId, name: runName, orderIds: [orderId], notes: null }
        const nextRuns = { ...prev.runs, [newRunId]: newRun }
        const nextCells = { ...prev.cells }
        const nextRunToCell = { ...prev.runToCell }
        const nextOrderToRun = { ...prev.orderToRun }
        const nextLooseOrderToCell = { ...prev.looseOrderToCell }
        const nextOrders = { ...prev.orders }
        const nextCellLooseItemOrder = { ...prev.cellLooseItemOrder }
        const orderItem = `order:${orderId}`

        // 2. Remove order from source run (if committed elsewhere)
        const sourceRunId = prev.orderToRun[orderId]
        if (sourceRunId && nextRuns[sourceRunId]) {
          nextRuns[sourceRunId] = {
            ...nextRuns[sourceRunId],
            orderIds: nextRuns[sourceRunId].orderIds.filter((id) => id !== orderId),
          }
        }

        // 3. Remove order from loose (if loose)
        const looseCellId = prev.looseOrderToCell[orderId]
        if (looseCellId && nextCells[looseCellId]) {
          nextCells[looseCellId] = {
            ...nextCells[looseCellId],
            looseOrderIds: nextCells[looseCellId].looseOrderIds.filter((id) => id !== orderId),
          }
          if (nextCellLooseItemOrder[looseCellId]) {
            nextCellLooseItemOrder[looseCellId] = nextCellLooseItemOrder[looseCellId].filter(item => item !== orderItem)
          }
          delete nextLooseOrderToCell[orderId]
        }

        // 4. Add run to cell
        if (!nextCells[cellId]) {
          nextCells[cellId] = { runIds: [newRunId], looseOrderIds: [] }
        } else {
          nextCells[cellId] = { ...nextCells[cellId], runIds: [...nextCells[cellId].runIds, newRunId] }
        }

        // 5. Update indices
        nextRunToCell[newRunId] = cellId
        nextOrderToRun[orderId] = newRunId

        // 6. Update order date to match cell
        if (nextOrders[orderId]) {
          nextOrders[orderId] = { ...nextOrders[orderId], date: parsed.date }
        }

        return {
          runs: nextRuns,
          cells: nextCells,
          runToCell: nextRunToCell,
          orderToRun: nextOrderToRun,
          looseOrderToCell: nextLooseOrderToCell,
          orders: nextOrders,
          cellLooseItemOrder: nextCellLooseItemOrder,
        }
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

        // Mark the moved run as dirty to preserve order during mergeHydrate
        const nextDirty = {
          ...prev.dirty,
          runs: new Set(prev.dirty.runs).add(moved),
        }

        return {
          cells: { ...prev.cells, [cellId]: { ...cell, runIds: next } },
          dirty: nextDirty,
        }
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
      const state = get()
      const notesMap: Record<string, SchedulerNote> = {}
      const noteToCell: Record<string, CellId> = {}
      const cellNoteOrders: Record<CellId, string[]> = {}
      // Build a map of notes per cell for unified ordering
      const notesByCell: Record<CellId, string[]> = {}

      for (const note of notesArr) {
        notesMap[note.id] = note
        // Build cellId from note's truck and date
        if (note.scheduledDate) {
          const truckId = note.truckId ?? 'unassigned'
          const cellId: CellId = `${truckId}|${note.scheduledDate}`
          noteToCell[note.id] = cellId
          // Track order per cell
          if (!cellNoteOrders[cellId]) {
            cellNoteOrders[cellId] = []
          }
          cellNoteOrders[cellId].push(note.id)
          // Also track for unified ordering
          if (!notesByCell[cellId]) {
            notesByCell[cellId] = []
          }
          notesByCell[cellId].push(note.id)
        }
      }

      // Build unified cellLooseItemOrder: notes first, then existing orders
      const cellLooseItemOrder: Record<CellId, string[]> = { ...state.cellLooseItemOrder }
      for (const [cellId, noteIds] of Object.entries(notesByCell)) {
        const isInboundCell = cellId.startsWith('inbound|')
        const existingItems = cellLooseItemOrder[cellId] || []
        // Filter out any existing note entries (shouldn't happen on fresh hydrate)
        // IMPORTANT: Also filter out non-PO orders from inbound cells
        const orderItems = existingItems.filter(item => {
          if (!item.startsWith('order:')) return false
          if (!isInboundCell) return true
          // For inbound cells, only keep POs
          const orderId = item.slice(6) // Remove "order:" prefix
          const order = state.orders[orderId]
          return order?.type === 'PO'
        })
        // Notes go first, then orders
        cellLooseItemOrder[cellId] = [
          ...noteIds.map(id => `note:${id}`),
          ...orderItems,
        ]
      }

      set({ notes: notesMap, noteToCell, cellNoteOrders, cellLooseItemOrder })
    },

    addNote: (note) => {
      set((prev) => {
        const nextNotes = { ...prev.notes, [note.id]: note }
        const nextNoteToCell = { ...prev.noteToCell }
        const nextCellNoteOrders = { ...prev.cellNoteOrders }
        const nextCellLooseItemOrder = { ...prev.cellLooseItemOrder }

        if (note.scheduledDate) {
          const truckId = note.truckId ?? 'unassigned'
          const cellId: CellId = `${truckId}|${note.scheduledDate}`
          nextNoteToCell[note.id] = cellId
          // Add to end of cell's note order (legacy)
          if (!nextCellNoteOrders[cellId]) {
            nextCellNoteOrders[cellId] = []
          }
          if (!nextCellNoteOrders[cellId].includes(note.id)) {
            nextCellNoteOrders[cellId] = [...nextCellNoteOrders[cellId], note.id]
          }
          // Add to unified loose item order at the END
          const noteItem = `note:${note.id}`
          if (!nextCellLooseItemOrder[cellId]) {
            nextCellLooseItemOrder[cellId] = []
          }
          if (!nextCellLooseItemOrder[cellId].includes(noteItem)) {
            nextCellLooseItemOrder[cellId] = [...nextCellLooseItemOrder[cellId], noteItem]
          }
        }

        return { notes: nextNotes, noteToCell: nextNoteToCell, cellNoteOrders: nextCellNoteOrders, cellLooseItemOrder: nextCellLooseItemOrder }
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
        const nextCellNoteOrders = { ...prev.cellNoteOrders }
        const nextCellLooseItemOrder = { ...prev.cellLooseItemOrder }

        // Remove from cell order
        const cellId = prev.noteToCell[noteId]
        if (cellId) {
          if (nextCellNoteOrders[cellId]) {
            nextCellNoteOrders[cellId] = nextCellNoteOrders[cellId].filter(id => id !== noteId)
          }
          // Remove from unified loose item order
          if (nextCellLooseItemOrder[cellId]) {
            nextCellLooseItemOrder[cellId] = nextCellLooseItemOrder[cellId].filter(item => item !== `note:${noteId}`)
          }
        }

        delete nextNotes[noteId]
        delete nextNoteToCell[noteId]
        return { notes: nextNotes, noteToCell: nextNoteToCell, cellNoteOrders: nextCellNoteOrders, cellLooseItemOrder: nextCellLooseItemOrder }
      })
    },

    moveNote: (noteId, targetCellId, insertIndex) => {
      const parsed = parseCellId(targetCellId)
      if (!parsed) return

      set((prev) => {
        const note = prev.notes[noteId]
        if (!note) return prev

        const sourceCellId = prev.noteToCell[noteId]
        const nextCellNoteOrders = { ...prev.cellNoteOrders }
        const nextCellLooseItemOrder = { ...prev.cellLooseItemOrder }
        const noteItem = `note:${noteId}`

        // Remove from source cell order (legacy)
        if (sourceCellId && nextCellNoteOrders[sourceCellId]) {
          nextCellNoteOrders[sourceCellId] = nextCellNoteOrders[sourceCellId].filter(id => id !== noteId)
        }

        // Remove from source cell's unified order
        if (sourceCellId && nextCellLooseItemOrder[sourceCellId]) {
          nextCellLooseItemOrder[sourceCellId] = nextCellLooseItemOrder[sourceCellId].filter(item => item !== noteItem)
        }

        // Add to target cell order at specified position or end (legacy)
        if (!nextCellNoteOrders[targetCellId]) {
          nextCellNoteOrders[targetCellId] = []
        }
        if (!nextCellNoteOrders[targetCellId].includes(noteId)) {
          nextCellNoteOrders[targetCellId] = [...nextCellNoteOrders[targetCellId], noteId]
        }

        // Add to target cell's unified order at specified position or end
        if (!nextCellLooseItemOrder[targetCellId]) {
          nextCellLooseItemOrder[targetCellId] = []
        }
        if (!nextCellLooseItemOrder[targetCellId].includes(noteItem)) {
          const newOrder = [...nextCellLooseItemOrder[targetCellId]]
          if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= newOrder.length) {
            newOrder.splice(insertIndex, 0, noteItem)
          } else {
            newOrder.push(noteItem)
          }
          nextCellLooseItemOrder[targetCellId] = newOrder
        }

        const updatedNote: SchedulerNote = {
          ...note,
          scheduledDate: parsed.date,
          truckId: parsed.truckId === 'unassigned' ? null : parsed.truckId,
        }

        return {
          notes: { ...prev.notes, [noteId]: updatedNote },
          noteToCell: { ...prev.noteToCell, [noteId]: targetCellId },
          cellNoteOrders: nextCellNoteOrders,
          cellLooseItemOrder: nextCellLooseItemOrder,
        }
      })
    },

    reorderNotesInCell: (cellId, fromIndex, toIndex) => {
      set((prev) => {
        const noteIds = prev.cellNoteOrders[cellId]
        if (!noteIds) return prev
        if (fromIndex < 0 || fromIndex >= noteIds.length) return prev
        if (toIndex < 0 || toIndex >= noteIds.length) return prev
        if (fromIndex === toIndex) return prev

        const next = [...noteIds]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)

        return { cellNoteOrders: { ...prev.cellNoteOrders, [cellId]: next } }
      })
    },

    getCellNoteIds: (cellId) => {
      const state = get()
      return state.cellNoteOrders[cellId] ?? []
    },

    reorderLooseItem: (cellId, fromIndex, toIndex) => {
      set((prev) => {
        const items = prev.cellLooseItemOrder[cellId]
        if (!items) return prev
        if (fromIndex < 0 || fromIndex >= items.length) return prev
        if (toIndex < 0 || toIndex >= items.length) return prev
        if (fromIndex === toIndex) return prev

        const next = [...items]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)

        return { cellLooseItemOrder: { ...prev.cellLooseItemOrder, [cellId]: next } }
      })
    },

    getCellLooseItemOrder: (cellId) => {
      const state = get()
      return state.cellLooseItemOrder[cellId] ?? []
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

    markCellDirty: (cellId) => {
      set((prev) => {
        const next = new Set(prev.dirty.cells)
        next.add(cellId)
        return { dirty: { ...prev.dirty, cells: next } }
      })
    },

    markCellClean: (cellId) => {
      set((prev) => {
        const next = new Set(prev.dirty.cells)
        next.delete(cellId)
        return { dirty: { ...prev.dirty, cells: next } }
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
          cells: new Set(),
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
  // Use ordered note IDs if available, otherwise fall back to unordered
  return state.cellNoteOrders[cellId] ?? []
}

export const selectCellNoteOrders = (cellId: CellId) => (state: SchedulerState) =>
  state.cellNoteOrders[cellId] ?? EMPTY_ARRAY

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
