import { describe, it, expect, beforeEach } from 'vitest'
import {
  useSchedulerStore,
  getStatusColor,
  selectOrder,
  selectRun,
  selectCellRunIds,
  selectCellLooseOrderIds,
  selectIsDateLocked,
  type Order,
  type CellData,
  type HydratePayload,
} from './useSchedulerStore'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<Order> & { id: string }): Order {
  return {
    orderNumber: `SO-${overrides.id}`,
    customerCode: 'TEST',
    palletCount: 5,
    status: 'picked',
    color: '',
    notes: null,
    type: 'SO',
    isReadOnly: false,
    date: '2025-01-06',
    ...overrides,
  }
}

function makeSeedPayload(): HydratePayload {
  return {
    orders: [
      makeOrder({ id: 'o1', customerCode: 'ACME' }),
      makeOrder({ id: 'o2', customerCode: 'ACME' }),
      makeOrder({ id: 'o3', customerCode: 'BETA' }),
      makeOrder({ id: 'o4', customerCode: 'GAMMA', status: 'shipped', isReadOnly: true }),
      makeOrder({ id: 'o5', customerCode: 'DELTA', type: 'PO', isReadOnly: true }),
      makeOrder({ id: 'o6', customerCode: 'EPSILON' }), // loose order
    ],
    runs: [
      { id: 'r1', name: 'Run 1', orderIds: ['o1', 'o2'] },
      { id: 'r2', name: 'Run 2', orderIds: ['o3'] },
      { id: 'r3', name: 'Run 1', orderIds: ['o4'] },
      { id: 'r4', name: 'Receiving', orderIds: ['o5'] },
    ],
    cells: {
      'TR-01|2025-01-06': { runIds: ['r1', 'r2'], looseOrderIds: ['o6'] },
      'TR-02|2025-01-06': { runIds: ['r3'], looseOrderIds: [] },
      'inbound|2025-01-06': { runIds: ['r4'], looseOrderIds: [] },
    } as Record<string, CellData>,
    trucks: ['TR-01', 'TR-02'],
    truckNames: { 'TR-01': 'Truck 1', 'TR-02': 'Truck 2' },
  }
}

function getState() {
  return useSchedulerStore.getState()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useSchedulerStore.setState({
    orders: {},
    runs: {},
    cells: {},
    blockedDates: new Set(),
    trucks: [],
    visibleWeeks: 4,
    orderToRun: {},
    runToCell: {},
    looseOrderToCell: {},
  })
})

describe('useSchedulerStore', () => {
  // ── hydrate ─────────────────────────────────────────────────────────────────

  describe('hydrate', () => {
    it('normalizes orders into a record', () => {
      getState().hydrate(makeSeedPayload())
      const s = getState()
      expect(Object.keys(s.orders)).toHaveLength(6)
      expect(s.orders['o1']).toBeDefined()
      expect(s.orders['o1'].customerCode).toBe('ACME')
    })

    it('derives color from status', () => {
      getState().hydrate(makeSeedPayload())
      const s = getState()
      expect(s.orders['o1'].color).toBe(getStatusColor('picked'))
      expect(s.orders['o4'].color).toBe(getStatusColor('shipped'))
    })

    it('enforces isReadOnly for shipped/invoiced', () => {
      const payload = makeSeedPayload()
      payload.orders[3] = makeOrder({ id: 'o4', status: 'shipped', isReadOnly: false })
      getState().hydrate(payload)
      expect(getState().orders['o4'].isReadOnly).toBe(true)
    })

    it('normalizes runs into a record', () => {
      getState().hydrate(makeSeedPayload())
      const s = getState()
      expect(Object.keys(s.runs)).toHaveLength(4)
      expect(s.runs['r1'].orderIds).toEqual(['o1', 'o2'])
    })

    it('clones input runs (no mutation)', () => {
      const payload = makeSeedPayload()
      const origRunIds = [...payload.runs[0].orderIds]
      getState().hydrate(payload)
      getState().reorderInRun('r1', 0, 1)
      expect(payload.runs[0].orderIds).toEqual(origRunIds)
    })

    it('builds orderToRun index', () => {
      getState().hydrate(makeSeedPayload())
      const s = getState()
      expect(s.orderToRun['o1']).toBe('r1')
      expect(s.orderToRun['o2']).toBe('r1')
      expect(s.orderToRun['o3']).toBe('r2')
      expect(s.orderToRun['o5']).toBe('r4')
    })

    it('builds runToCell index', () => {
      getState().hydrate(makeSeedPayload())
      const s = getState()
      expect(s.runToCell['r1']).toBe('TR-01|2025-01-06')
      expect(s.runToCell['r2']).toBe('TR-01|2025-01-06')
      expect(s.runToCell['r3']).toBe('TR-02|2025-01-06')
      expect(s.runToCell['r4']).toBe('inbound|2025-01-06')
    })

    it('builds looseOrderToCell index', () => {
      getState().hydrate(makeSeedPayload())
      const s = getState()
      expect(s.looseOrderToCell['o6']).toBe('TR-01|2025-01-06')
    })

    it('clones input cells (no mutation)', () => {
      const payload = makeSeedPayload()
      const originalRunIds = [...(payload.cells['TR-01|2025-01-06'] as CellData).runIds]
      getState().hydrate(payload)
      getState().reorderRunsInCell('TR-01|2025-01-06', 0, 1)
      expect((payload.cells['TR-01|2025-01-06'] as CellData).runIds).toEqual(originalRunIds)
    })

    it('sets trucks list and visibleWeeks', () => {
      getState().hydrate({ ...makeSeedPayload(), visibleWeeks: 6 })
      expect(getState().trucks).toEqual(['TR-01', 'TR-02'])
      expect(getState().visibleWeeks).toBe(6)
    })

    it('defaults visibleWeeks to 4', () => {
      getState().hydrate(makeSeedPayload())
      expect(getState().visibleWeeks).toBe(4)
    })

    it('preserves order date field', () => {
      getState().hydrate(makeSeedPayload())
      expect(getState().orders['o1'].date).toBe('2025-01-06')
    })
  })

  // ── moveOrder ───────────────────────────────────────────────────────────────

  describe('moveOrder', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('moves an order between runs', () => {
      const result = getState().moveOrder('o3', 'r1')
      expect(result.success).toBe(true)

      const s = getState()
      expect(s.runs['r1'].orderIds).toContain('o3')
      expect(s.runs['r2'].orderIds).not.toContain('o3')
      expect(s.orderToRun['o3']).toBe('r1')
    })

    it('moves a loose order into a run (commit)', () => {
      const result = getState().moveOrder('o6', 'r1')
      expect(result.success).toBe(true)

      const s = getState()
      expect(s.runs['r1'].orderIds).toContain('o6')
      expect(s.orderToRun['o6']).toBe('r1')
      expect(s.looseOrderToCell['o6']).toBeUndefined()
      expect(s.cells['TR-01|2025-01-06'].looseOrderIds).not.toContain('o6')
    })

    it('updates order date to match target cell', () => {
      // Setup a run on a different date
      useSchedulerStore.setState((prev) => ({
        runs: { ...prev.runs, 'r-other': { id: 'r-other', name: 'Other', orderIds: [] } },
        cells: { ...prev.cells, 'TR-01|2025-01-07': { runIds: ['r-other'], looseOrderIds: [] } },
        runToCell: { ...prev.runToCell, 'r-other': 'TR-01|2025-01-07' },
      }))

      getState().moveOrder('o1', 'r-other')
      expect(getState().orders['o1'].date).toBe('2025-01-07')
    })

    it('respects insertIndex', () => {
      const result = getState().moveOrder('o3', 'r1', 0)
      expect(result.success).toBe(true)
      expect(getState().runs['r1'].orderIds[0]).toBe('o3')
    })

    it('appends when insertIndex is out of range', () => {
      const result = getState().moveOrder('o3', 'r1', 999)
      expect(result.success).toBe(true)
      const orderIds = getState().runs['r1'].orderIds
      expect(orderIds[orderIds.length - 1]).toBe('o3')
    })

    it('rejects PO orders', () => {
      const result = getState().moveOrder('o5', 'r1')
      expect(result).toEqual({ success: false, reason: 'INBOUND_ZONE' })
    })

    it('rejects read-only (shipped) orders', () => {
      const result = getState().moveOrder('o4', 'r1')
      expect(result).toEqual({ success: false, reason: 'READ_ONLY' })
    })

    it('rejects move to nonexistent run', () => {
      const result = getState().moveOrder('o1', 'nonexistent')
      expect(result).toEqual({ success: false, reason: 'INVALID_TARGET' })
    })

    it('allows move within same locked date', () => {
      getState().toggleDateLock('2025-01-06')
      const sameDate = getState().moveOrder('o3', 'r1')
      expect(sameDate.success).toBe(true)
    })

    it('blocks moving INTO locked date from outside', () => {
      useSchedulerStore.setState((prev) => ({
        orders: { ...prev.orders, 'o-ext': makeOrder({ id: 'o-ext', date: '2025-01-07' }) },
        runs: { ...prev.runs, 'r-ext': { id: 'r-ext', name: 'Ext', orderIds: ['o-ext'] } },
        cells: { ...prev.cells, 'TR-01|2025-01-07': { runIds: ['r-ext'], looseOrderIds: [] } },
        orderToRun: { ...prev.orderToRun, 'o-ext': 'r-ext' },
        runToCell: { ...prev.runToCell, 'r-ext': 'TR-01|2025-01-07' },
      }))

      getState().toggleDateLock('2025-01-06')
      const result = getState().moveOrder('o-ext', 'r1')
      expect(result).toEqual({ success: false, reason: 'CAPACITY_LOCKED' })
    })

    it('allows moving OUT from locked date', () => {
      useSchedulerStore.setState((prev) => ({
        runs: { ...prev.runs, 'r-target': { id: 'r-target', name: 'Target', orderIds: [] } },
        cells: { ...prev.cells, 'TR-01|2025-01-07': { runIds: ['r-target'], looseOrderIds: [] } },
        runToCell: { ...prev.runToCell, 'r-target': 'TR-01|2025-01-07' },
      }))

      getState().toggleDateLock('2025-01-06')
      const result = getState().moveOrder('o1', 'r-target')
      expect(result.success).toBe(true)
    })

    it('removes order from source run', () => {
      getState().moveOrder('o1', 'r2')
      expect(getState().runs['r1'].orderIds).not.toContain('o1')
    })

    it('returns READ_ONLY for nonexistent order', () => {
      const result = getState().moveOrder('nonexistent', 'r1')
      expect(result.success).toBe(false)
    })
  })

  // ── moveOrderLoose ──────────────────────────────────────────────────────────

  describe('moveOrderLoose', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('places a committed order as loose in a cell', () => {
      const result = getState().moveOrderLoose('o1', 'TR-02|2025-01-06')
      expect(result.success).toBe(true)

      const s = getState()
      expect(s.cells['TR-02|2025-01-06'].looseOrderIds).toContain('o1')
      expect(s.looseOrderToCell['o1']).toBe('TR-02|2025-01-06')
      expect(s.orderToRun['o1']).toBeUndefined()
      expect(s.runs['r1'].orderIds).not.toContain('o1')
    })

    it('moves a loose order to a different cell', () => {
      const result = getState().moveOrderLoose('o6', 'TR-02|2025-01-06')
      expect(result.success).toBe(true)

      const s = getState()
      expect(s.cells['TR-02|2025-01-06'].looseOrderIds).toContain('o6')
      expect(s.cells['TR-01|2025-01-06'].looseOrderIds).not.toContain('o6')
      expect(s.looseOrderToCell['o6']).toBe('TR-02|2025-01-06')
    })

    it('creates cell if it does not exist', () => {
      const result = getState().moveOrderLoose('o1', 'TR-01|2025-01-07')
      expect(result.success).toBe(true)
      expect(getState().cells['TR-01|2025-01-07'].looseOrderIds).toContain('o1')
    })

    it('updates order date to match target cell', () => {
      getState().moveOrderLoose('o1', 'TR-01|2025-01-07')
      expect(getState().orders['o1'].date).toBe('2025-01-07')
    })

    it('rejects PO orders', () => {
      const result = getState().moveOrderLoose('o5', 'TR-01|2025-01-06')
      expect(result).toEqual({ success: false, reason: 'INBOUND_ZONE' })
    })

    it('rejects read-only orders', () => {
      const result = getState().moveOrderLoose('o4', 'TR-01|2025-01-06')
      expect(result).toEqual({ success: false, reason: 'READ_ONLY' })
    })

    it('rejects invalid cell ID', () => {
      const result = getState().moveOrderLoose('o1', 'nopipe')
      expect(result).toEqual({ success: false, reason: 'INVALID_TARGET' })
    })

    it('blocks moving into locked date from outside', () => {
      useSchedulerStore.setState((prev) => ({
        orders: { ...prev.orders, 'o-ext': makeOrder({ id: 'o-ext', date: '2025-01-07' }) },
        runs: { ...prev.runs, 'r-ext': { id: 'r-ext', name: 'Ext', orderIds: ['o-ext'] } },
        cells: { ...prev.cells, 'TR-01|2025-01-07': { runIds: ['r-ext'], looseOrderIds: [] } },
        orderToRun: { ...prev.orderToRun, 'o-ext': 'r-ext' },
        runToCell: { ...prev.runToCell, 'r-ext': 'TR-01|2025-01-07' },
      }))

      getState().toggleDateLock('2025-01-06')
      const result = getState().moveOrderLoose('o-ext', 'TR-01|2025-01-06')
      expect(result).toEqual({ success: false, reason: 'CAPACITY_LOCKED' })
    })

    it('allows within same locked date', () => {
      getState().toggleDateLock('2025-01-06')
      const result = getState().moveOrderLoose('o1', 'TR-02|2025-01-06')
      expect(result.success).toBe(true)
    })
  })

  // ── commitOrderToRun ────────────────────────────────────────────────────────

  describe('commitOrderToRun', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('commits a loose order into a run', () => {
      const result = getState().commitOrderToRun('o6', 'r2')
      expect(result.success).toBe(true)

      const s = getState()
      expect(s.runs['r2'].orderIds).toContain('o6')
      expect(s.orderToRun['o6']).toBe('r2')
      expect(s.looseOrderToCell['o6']).toBeUndefined()
      expect(s.cells['TR-01|2025-01-06'].looseOrderIds).not.toContain('o6')
    })

    it('respects insertIndex', () => {
      getState().commitOrderToRun('o6', 'r1', 0)
      expect(getState().runs['r1'].orderIds[0]).toBe('o6')
    })
  })

  // ── moveRun ─────────────────────────────────────────────────────────────────

  describe('moveRun', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('moves a run to a different cell', () => {
      const result = getState().moveRun('r2', 'TR-02|2025-01-06')
      expect(result.success).toBe(true)

      const s = getState()
      expect(s.cells['TR-01|2025-01-06'].runIds).not.toContain('r2')
      expect(s.cells['TR-02|2025-01-06'].runIds).toContain('r2')
      expect(s.runToCell['r2']).toBe('TR-02|2025-01-06')
    })

    it('updates order dates for all orders in the run', () => {
      getState().moveRun('r2', 'TR-02|2025-01-07')
      expect(getState().orders['o3'].date).toBe('2025-01-07')
    })

    it('respects insertIndex', () => {
      const result = getState().moveRun('r2', 'TR-02|2025-01-06', 0)
      expect(result.success).toBe(true)
      expect(getState().cells['TR-02|2025-01-06'].runIds[0]).toBe('r2')
    })

    it('creates cell if target does not exist', () => {
      const result = getState().moveRun('r2', 'TR-02|2025-01-07')
      expect(result.success).toBe(true)
      expect(getState().cells['TR-02|2025-01-07'].runIds).toEqual(['r2'])
    })

    it('rejects if run contains PO orders', () => {
      const result = getState().moveRun('r4', 'TR-01|2025-01-06')
      expect(result).toEqual({ success: false, reason: 'INBOUND_ZONE' })
    })

    it('rejects if run contains shipped orders', () => {
      const result = getState().moveRun('r3', 'TR-01|2025-01-06')
      expect(result).toEqual({ success: false, reason: 'READ_ONLY' })
    })

    it('rejects move to invalid cell ID', () => {
      const result = getState().moveRun('r2', 'invalid')
      expect(result).toEqual({ success: false, reason: 'INVALID_TARGET' })
    })

    it('rejects nonexistent run', () => {
      const result = getState().moveRun('nonexistent', 'TR-01|2025-01-06')
      expect(result).toEqual({ success: false, reason: 'INVALID_TARGET' })
    })

    it('allows move within same locked date', () => {
      getState().toggleDateLock('2025-01-06')
      const sameDate = getState().moveRun('r2', 'TR-02|2025-01-06')
      expect(sameDate.success).toBe(true)
    })

    it('blocks moving run from unlocked to locked date', () => {
      useSchedulerStore.setState((prev) => ({
        runs: { ...prev.runs, 'r-free': { id: 'r-free', name: 'Free', orderIds: [] } },
        cells: { ...prev.cells, 'TR-01|2025-01-07': { runIds: ['r-free'], looseOrderIds: [] } },
        runToCell: { ...prev.runToCell, 'r-free': 'TR-01|2025-01-07' },
      }))
      getState().toggleDateLock('2025-01-06')
      const result = getState().moveRun('r-free', 'TR-01|2025-01-06')
      expect(result).toEqual({ success: false, reason: 'CAPACITY_LOCKED' })
    })
  })

  // ── createRun ───────────────────────────────────────────────────────────────

  describe('createRun', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('creates a new empty run in an existing cell', () => {
      const runId = getState().createRun('TR-01|2025-01-06', 'Express')
      expect(runId).not.toBeNull()

      const s = getState()
      expect(s.runs[runId!]).toBeDefined()
      expect(s.runs[runId!].name).toBe('Express')
      expect(s.runs[runId!].orderIds).toEqual([])
      expect(s.cells['TR-01|2025-01-06'].runIds).toContain(runId)
      expect(s.runToCell[runId!]).toBe('TR-01|2025-01-06')
    })

    it('auto-names based on run count', () => {
      const runId = getState().createRun('TR-01|2025-01-06')
      expect(getState().runs[runId!].name).toBe('Run 3')
    })

    it('creates cell if it does not exist', () => {
      const runId = getState().createRun('TR-01|2025-01-08')
      expect(runId).not.toBeNull()
      expect(getState().cells['TR-01|2025-01-08'].runIds).toContain(runId)
      expect(getState().cells['TR-01|2025-01-08'].looseOrderIds).toEqual([])
    })

    it('returns null for invalid cell ID', () => {
      const runId = getState().createRun('nopipe')
      expect(runId).toBeNull()
    })
  })

  // ── dissolveRun ─────────────────────────────────────────────────────────────

  describe('dissolveRun', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('merges orders into the previous sibling run', () => {
      const result = getState().dissolveRun('r2')
      expect(result).toBe(true)

      const s = getState()
      expect(s.runs['r2']).toBeUndefined()
      expect(s.runs['r1'].orderIds).toContain('o3')
      expect(s.orderToRun['o3']).toBe('r1')
      expect(s.cells['TR-01|2025-01-06'].runIds).not.toContain('r2')
      expect(s.runToCell['r2']).toBeUndefined()
    })

    it('merges into next sibling when dissolving first run', () => {
      const result = getState().dissolveRun('r1')
      expect(result).toBe(true)

      const s = getState()
      expect(s.runs['r1']).toBeUndefined()
      expect(s.runs['r2'].orderIds).toContain('o1')
      expect(s.runs['r2'].orderIds).toContain('o2')
      expect(s.orderToRun['o1']).toBe('r2')
      expect(s.orderToRun['o2']).toBe('r2')
    })

    it('places orders as loose when dissolving the only run in a cell', () => {
      // r3 is the only run in TR-02|2025-01-06
      const result = getState().dissolveRun('r3')
      expect(result).toBe(true)

      const s = getState()
      expect(s.runs['r3']).toBeUndefined()
      const cell = s.cells['TR-02|2025-01-06']
      expect(cell.runIds).toHaveLength(0)
      expect(cell.looseOrderIds).toContain('o4')
      expect(s.looseOrderToCell['o4']).toBe('TR-02|2025-01-06')
      expect(s.orderToRun['o4']).toBeUndefined()
    })

    it('returns false for nonexistent run', () => {
      expect(getState().dissolveRun('nonexistent')).toBe(false)
    })

    it('returns false if run has no cell mapping', () => {
      useSchedulerStore.setState((prev) => ({
        runs: { ...prev.runs, 'orphan': { id: 'orphan', name: 'Orphan', orderIds: [] } },
      }))
      expect(getState().dissolveRun('orphan')).toBe(false)
    })
  })

  // ── toggleDateLock ──────────────────────────────────────────────────────────

  describe('toggleDateLock', () => {
    it('locks a date', () => {
      getState().toggleDateLock('2025-01-06')
      expect(getState().blockedDates.has('2025-01-06')).toBe(true)
    })

    it('unlocks a locked date', () => {
      getState().toggleDateLock('2025-01-06')
      getState().toggleDateLock('2025-01-06')
      expect(getState().blockedDates.has('2025-01-06')).toBe(false)
    })

    it('locks multiple dates independently', () => {
      getState().toggleDateLock('2025-01-06')
      getState().toggleDateLock('2025-01-07')
      expect(getState().blockedDates.has('2025-01-06')).toBe(true)
      expect(getState().blockedDates.has('2025-01-07')).toBe(true)
    })
  })

  // ── reorderInRun ────────────────────────────────────────────────────────────

  describe('reorderInRun', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('reorders orders within a run', () => {
      getState().reorderInRun('r1', 0, 1)
      expect(getState().runs['r1'].orderIds).toEqual(['o2', 'o1'])
    })

    it('does nothing for same index', () => {
      getState().reorderInRun('r1', 0, 0)
      expect(getState().runs['r1'].orderIds).toEqual(['o1', 'o2'])
    })

    it('does nothing for out-of-bounds fromIndex', () => {
      getState().reorderInRun('r1', -1, 0)
      expect(getState().runs['r1'].orderIds).toEqual(['o1', 'o2'])
    })

    it('does nothing for out-of-bounds toIndex', () => {
      getState().reorderInRun('r1', 0, 5)
      expect(getState().runs['r1'].orderIds).toEqual(['o1', 'o2'])
    })

    it('does nothing for nonexistent run', () => {
      getState().reorderInRun('nonexistent', 0, 1)
    })
  })

  // ── reorderRunsInCell ───────────────────────────────────────────────────────

  describe('reorderRunsInCell', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('reorders runs within a cell', () => {
      getState().reorderRunsInCell('TR-01|2025-01-06', 0, 1)
      expect(getState().cells['TR-01|2025-01-06'].runIds).toEqual(['r2', 'r1'])
    })

    it('does nothing for same index', () => {
      getState().reorderRunsInCell('TR-01|2025-01-06', 0, 0)
      expect(getState().cells['TR-01|2025-01-06'].runIds).toEqual(['r1', 'r2'])
    })

    it('does nothing for out-of-bounds', () => {
      getState().reorderRunsInCell('TR-01|2025-01-06', -1, 0)
      expect(getState().cells['TR-01|2025-01-06'].runIds).toEqual(['r1', 'r2'])
    })

    it('does nothing for nonexistent cell', () => {
      getState().reorderRunsInCell('nonexistent|2025-01-06', 0, 1)
    })
  })

  // ── Index Consistency ───────────────────────────────────────────────────────

  describe('index consistency', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('orderToRun stays consistent after moveOrder', () => {
      getState().moveOrder('o1', 'r2')
      const s = getState()
      for (const [runId, run] of Object.entries(s.runs)) {
        for (const orderId of run.orderIds) {
          expect(s.orderToRun[orderId]).toBe(runId)
        }
      }
    })

    it('runToCell stays consistent after moveRun', () => {
      getState().moveRun('r2', 'TR-02|2025-01-06')
      const s = getState()
      for (const [cellId, cell] of Object.entries(s.cells)) {
        for (const runId of cell.runIds) {
          expect(s.runToCell[runId]).toBe(cellId)
        }
      }
    })

    it('looseOrderToCell stays consistent after moveOrderLoose', () => {
      getState().moveOrderLoose('o1', 'TR-02|2025-01-06')
      const s = getState()
      for (const [cellId, cell] of Object.entries(s.cells)) {
        for (const orderId of cell.looseOrderIds) {
          expect(s.looseOrderToCell[orderId]).toBe(cellId)
        }
      }
    })

    it('indices consistent after dissolveRun', () => {
      getState().dissolveRun('r2')
      const s = getState()
      for (const [runId, run] of Object.entries(s.runs)) {
        for (const orderId of run.orderIds) {
          expect(s.orderToRun[orderId]).toBe(runId)
        }
      }
      for (const [cellId, cell] of Object.entries(s.cells)) {
        for (const runId of cell.runIds) {
          expect(s.runToCell[runId]).toBe(cellId)
        }
      }
    })

    it('indices consistent after moveOrderLoose + commitOrderToRun', () => {
      getState().moveOrderLoose('o1', 'TR-02|2025-01-06')
      getState().commitOrderToRun('o1', 'r3')
      const s = getState()
      for (const [runId, run] of Object.entries(s.runs)) {
        for (const orderId of run.orderIds) {
          expect(s.orderToRun[orderId]).toBe(runId)
        }
      }
      for (const [cellId, cell] of Object.entries(s.cells)) {
        for (const orderId of cell.looseOrderIds) {
          expect(s.looseOrderToCell[orderId]).toBe(cellId)
        }
      }
    })

    it('all indices consistent after complex multi-op sequence', () => {
      getState().moveOrder('o1', 'r2')
      getState().createRun('TR-02|2025-01-06', 'New')
      getState().moveOrderLoose('o2', 'TR-02|2025-01-06')
      getState().reorderInRun('r2', 0, 1)
      getState().toggleDateLock('2025-01-06')
      getState().toggleDateLock('2025-01-06')

      const s = getState()
      for (const [runId, run] of Object.entries(s.runs)) {
        for (const orderId of run.orderIds) {
          expect(s.orderToRun[orderId]).toBe(runId)
        }
      }
      for (const [cellId, cell] of Object.entries(s.cells)) {
        for (const runId of cell.runIds) {
          expect(s.runToCell[runId]).toBe(cellId)
        }
        for (const orderId of cell.looseOrderIds) {
          expect(s.looseOrderToCell[orderId]).toBe(cellId)
        }
      }
    })
  })

  // ── Selectors ───────────────────────────────────────────────────────────────

  describe('selectors', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('selectOrder returns specific order', () => {
      const order = selectOrder('o1')(getState())
      expect(order).toBeDefined()
      expect(order.orderNumber).toBe('SO-o1')
    })

    it('selectOrder returns undefined for missing', () => {
      const order = selectOrder('missing')(getState())
      expect(order).toBeUndefined()
    })

    it('selectRun returns specific run', () => {
      const run = selectRun('r1')(getState())
      expect(run).toBeDefined()
      expect(run.orderIds).toEqual(['o1', 'o2'])
    })

    it('selectCellRunIds returns run IDs for cell', () => {
      const runIds = selectCellRunIds('TR-01|2025-01-06')(getState())
      expect(runIds).toEqual(['r1', 'r2'])
    })

    it('selectCellRunIds returns empty array for missing cell', () => {
      const runIds = selectCellRunIds('TR-99|2025-01-06')(getState())
      expect(runIds).toEqual([])
    })

    it('selectCellLooseOrderIds returns loose IDs for cell', () => {
      const ids = selectCellLooseOrderIds('TR-01|2025-01-06')(getState())
      expect(ids).toEqual(['o6'])
    })

    it('selectCellLooseOrderIds returns empty array for missing cell', () => {
      const ids = selectCellLooseOrderIds('TR-99|2025-01-06')(getState())
      expect(ids).toEqual([])
    })

    it('selectIsDateLocked returns false by default', () => {
      expect(selectIsDateLocked('2025-01-06')(getState())).toBe(false)
    })

    it('selectIsDateLocked returns true for locked date', () => {
      getState().toggleDateLock('2025-01-06')
      expect(selectIsDateLocked('2025-01-06')(getState())).toBe(true)
    })
  })

  // ── getStatusColor ──────────────────────────────────────────────────────────

  describe('getStatusColor', () => {
    it('returns correct color for each status', () => {
      expect(getStatusColor('unscheduled')).toBe('#9ca3af')
      expect(getStatusColor('picked')).toBe('#facc15')
      expect(getStatusColor('packed')).toBe('#4ade80')
      expect(getStatusColor('shipped')).toBe('#60a5fa')
      expect(getStatusColor('invoiced')).toBe('#a78bfa')
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('cell with pipe in truck ID parses correctly', () => {
      useSchedulerStore.setState((prev) => ({
        runs: { ...prev.runs, 'r-pipe': { id: 'r-pipe', name: 'Run', orderIds: [] } },
        cells: { ...prev.cells, 'AB|CD|2025-01-06': { runIds: ['r-pipe'], looseOrderIds: [] } },
        runToCell: { ...prev.runToCell, 'r-pipe': 'AB|CD|2025-01-06' },
      }))

      const runId = getState().createRun('AB|CD|2025-01-06', 'Test')
      expect(runId).not.toBeNull()
    })

    it('empty run can be dissolved (orders go loose)', () => {
      const newRunId = getState().createRun('TR-01|2025-01-06', 'Empty')!
      const result = getState().dissolveRun(newRunId)
      expect(result).toBe(true)
      expect(getState().runs[newRunId]).toBeUndefined()
    })

    it('moveOrderLoose to same cell is idempotent', () => {
      getState().moveOrderLoose('o6', 'TR-01|2025-01-06')
      const s = getState()
      // Still in same cell, but re-added (may duplicate — check it doesn't)
      expect(s.cells['TR-01|2025-01-06'].looseOrderIds.filter((id) => id === 'o6')).toHaveLength(1)
    })

    it('commit a loose order then move it back to loose', () => {
      getState().commitOrderToRun('o6', 'r1')
      expect(getState().orderToRun['o6']).toBe('r1')

      getState().moveOrderLoose('o6', 'TR-02|2025-01-06')
      const s = getState()
      expect(s.looseOrderToCell['o6']).toBe('TR-02|2025-01-06')
      expect(s.orderToRun['o6']).toBeUndefined()
      expect(s.runs['r1'].orderIds).not.toContain('o6')
    })
  })

  // ── createRunWithOrder (Atomic Operation) ──────────────────────────────────

  describe('createRunWithOrder', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('atomically creates run and moves order in single transaction', () => {
      const runId = getState().createRunWithOrder('TR-01|2025-01-06', 'o6', 'Express')
      expect(runId).not.toBeNull()

      const s = getState()
      // Run was created
      expect(s.runs[runId!]).toBeDefined()
      expect(s.runs[runId!].name).toBe('Express')
      // Order is in the run
      expect(s.runs[runId!].orderIds).toEqual(['o6'])
      // Order is no longer loose
      expect(s.looseOrderToCell['o6']).toBeUndefined()
      expect(s.cells['TR-01|2025-01-06'].looseOrderIds).not.toContain('o6')
      // Index is correct
      expect(s.orderToRun['o6']).toBe(runId)
      expect(s.runToCell[runId!]).toBe('TR-01|2025-01-06')
    })

    it('moves order from existing run to new run atomically', () => {
      const runId = getState().createRunWithOrder('TR-02|2025-01-06', 'o1', 'New Run')
      expect(runId).not.toBeNull()

      const s = getState()
      // Order removed from old run
      expect(s.runs['r1'].orderIds).not.toContain('o1')
      // Order in new run
      expect(s.runs[runId!].orderIds).toEqual(['o1'])
      expect(s.orderToRun['o1']).toBe(runId)
    })

    it('updates order date to match target cell', () => {
      const runId = getState().createRunWithOrder('TR-01|2025-01-07', 'o6')
      expect(runId).not.toBeNull()
      expect(getState().orders['o6'].date).toBe('2025-01-07')
    })

    it('removes order from cellLooseItemOrder when moving from loose', () => {
      // Verify o6 is in loose item order
      const beforeState = getState()
      expect(beforeState.cellLooseItemOrder['TR-01|2025-01-06']).toContain('order:o6')

      getState().createRunWithOrder('TR-01|2025-01-06', 'o6')

      const afterState = getState()
      expect(afterState.cellLooseItemOrder['TR-01|2025-01-06']).not.toContain('order:o6')
    })

    it('returns null for invalid cell ID', () => {
      const runId = getState().createRunWithOrder('invalid', 'o6')
      expect(runId).toBeNull()
    })

    it('returns null for nonexistent order', () => {
      const runId = getState().createRunWithOrder('TR-01|2025-01-06', 'nonexistent')
      expect(runId).toBeNull()
    })

    it('returns null for PO orders', () => {
      const runId = getState().createRunWithOrder('TR-01|2025-01-06', 'o5')
      expect(runId).toBeNull()
    })

    it('returns null for read-only orders', () => {
      const runId = getState().createRunWithOrder('TR-01|2025-01-06', 'o4')
      expect(runId).toBeNull()
    })

    it('auto-names based on run count', () => {
      const runId = getState().createRunWithOrder('TR-01|2025-01-06', 'o6')
      expect(getState().runs[runId!].name).toBe('Run 3')
    })
  })

  // ── Surgical Mutation Tests (Reference Stability) ──────────────────────────

  describe('surgical mutations - reference stability', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('moveOrder only modifies affected runs, not unrelated runs', () => {
      const beforeState = getState()
      const unrelatedRunBefore = beforeState.runs['r3'] // TR-02 run, unaffected

      // Move o3 from r2 to r1 (both in TR-01)
      getState().moveOrder('o3', 'r1')

      const afterState = getState()
      // Unrelated run should have same reference (not cloned)
      expect(afterState.runs['r3']).toBe(unrelatedRunBefore)
    })

    it('moveOrder only modifies affected cells, not unrelated cells', () => {
      const beforeState = getState()
      const unrelatedCellBefore = beforeState.cells['TR-02|2025-01-06']

      // Move o3 from r2 to r1 (both in TR-01|2025-01-06)
      getState().moveOrder('o3', 'r1')

      const afterState = getState()
      // Cell in TR-02 should be same reference
      expect(afterState.cells['TR-02|2025-01-06']).toBe(unrelatedCellBefore)
    })

    it('moveOrderLoose only modifies source and target cells', () => {
      const beforeState = getState()
      const unrelatedCellBefore = beforeState.cells['inbound|2025-01-06']

      // Move o6 from TR-01 loose to TR-02 loose
      getState().moveOrderLoose('o6', 'TR-02|2025-01-06')

      const afterState = getState()
      // Inbound cell should be same reference
      expect(afterState.cells['inbound|2025-01-06']).toBe(unrelatedCellBefore)
    })

    it('moveRun only modifies source and target cells', () => {
      const beforeState = getState()
      const unrelatedCellBefore = beforeState.cells['inbound|2025-01-06']

      // Move r2 from TR-01 to TR-02
      getState().moveRun('r2', 'TR-02|2025-01-06')

      const afterState = getState()
      // Inbound cell should be same reference
      expect(afterState.cells['inbound|2025-01-06']).toBe(unrelatedCellBefore)
    })

    it('moveOrder does not modify orders if date unchanged', () => {
      const beforeState = getState()
      const unrelatedOrderBefore = beforeState.orders['o4'] // Different run

      // Move o3 within same date
      getState().moveOrder('o3', 'r1')

      const afterState = getState()
      // Unrelated order should be same reference
      expect(afterState.orders['o4']).toBe(unrelatedOrderBefore)
    })

    it('moveOrderLoose preserves orders state when date unchanged', () => {
      // Setup: Move o1 (from run) to loose in same cell/date
      const beforeState = getState()
      const unrelatedOrderBefore = beforeState.orders['o4']

      getState().moveOrderLoose('o1', 'TR-01|2025-01-06')

      const afterState = getState()
      expect(afterState.orders['o4']).toBe(unrelatedOrderBefore)
    })
  })

  // ── Cell Isolation Tests (Day A should not affect Day B) ───────────────────

  describe('cell isolation - cross-day integrity', () => {
    beforeEach(() => {
      // Extended payload with multiple dates
      const payload = makeSeedPayload()
      payload.orders.push(
        makeOrder({ id: 'o7', customerCode: 'ZETA', date: '2025-01-07' }),
        makeOrder({ id: 'o8', customerCode: 'ZETA', date: '2025-01-07' })
      )
      payload.runs.push(
        { id: 'r5', name: 'Day2 Run', orderIds: ['o7', 'o8'] }
      )
      payload.cells['TR-01|2025-01-07'] = { runIds: ['r5'], looseOrderIds: [] }
      getState().hydrate(payload)
      useSchedulerStore.setState((prev) => ({
        runToCell: { ...prev.runToCell, 'r5': 'TR-01|2025-01-07' },
        orderToRun: { ...prev.orderToRun, 'o7': 'r5', 'o8': 'r5' },
      }))
    })

    it('moving order on Day 1 does not affect Day 2 cell', () => {
      const day2CellBefore = getState().cells['TR-01|2025-01-07']
      const day2RunBefore = getState().runs['r5']

      // Operate on Day 1
      getState().moveOrder('o3', 'r1')

      const day2CellAfter = getState().cells['TR-01|2025-01-07']
      const day2RunAfter = getState().runs['r5']

      // Day 2 should be completely unchanged
      expect(day2CellAfter).toBe(day2CellBefore)
      expect(day2RunAfter).toBe(day2RunBefore)
      expect(day2RunAfter.orderIds).toEqual(['o7', 'o8'])
    })

    it('moving order on Day 1 does not affect Day 2 orders', () => {
      const o7Before = getState().orders['o7']
      const o8Before = getState().orders['o8']

      // Operate on Day 1
      getState().moveOrderLoose('o1', 'TR-02|2025-01-06')

      // Day 2 orders should be same reference
      expect(getState().orders['o7']).toBe(o7Before)
      expect(getState().orders['o8']).toBe(o8Before)
    })

    it('moveRun on Day 1 does not affect Day 2 run order', () => {
      const day2CellBefore = getState().cells['TR-01|2025-01-07']

      // Operate on Day 1
      getState().moveRun('r2', 'TR-02|2025-01-06')

      // Day 2 cell should be unchanged
      expect(getState().cells['TR-01|2025-01-07']).toBe(day2CellBefore)
    })

    it('creating run on Day 1 does not affect Day 2', () => {
      const day2RunIds = [...getState().cells['TR-01|2025-01-07'].runIds]

      getState().createRun('TR-01|2025-01-06', 'New Run')

      expect(getState().cells['TR-01|2025-01-07'].runIds).toEqual(day2RunIds)
    })

    it('dissolving run on Day 1 does not affect Day 2 orders', () => {
      const o7Before = getState().orders['o7']

      getState().dissolveRun('r2')

      expect(getState().orders['o7']).toBe(o7Before)
    })

    it('reordering within Day 1 run does not affect Day 2 run', () => {
      const r5Before = getState().runs['r5']

      getState().reorderInRun('r1', 0, 1)

      expect(getState().runs['r5']).toBe(r5Before)
    })
  })

  // ── cellLooseItemOrder Tests ───────────────────────────────────────────────

  describe('cellLooseItemOrder tracking', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('hydrate builds initial cellLooseItemOrder from loose orders', () => {
      const s = getState()
      expect(s.cellLooseItemOrder['TR-01|2025-01-06']).toContain('order:o6')
    })

    it('moveOrder removes from cellLooseItemOrder when committing loose order', () => {
      getState().moveOrder('o6', 'r1')
      expect(getState().cellLooseItemOrder['TR-01|2025-01-06']).not.toContain('order:o6')
    })

    it('moveOrderLoose adds to cellLooseItemOrder', () => {
      getState().moveOrderLoose('o1', 'TR-02|2025-01-06')
      expect(getState().cellLooseItemOrder['TR-02|2025-01-06']).toContain('order:o1')
    })

    it('moveOrderLoose removes from source cellLooseItemOrder', () => {
      getState().moveOrderLoose('o6', 'TR-02|2025-01-06')
      expect(getState().cellLooseItemOrder['TR-01|2025-01-06']).not.toContain('order:o6')
    })

    it('moveOrderLoose to same cell does not duplicate', () => {
      getState().moveOrderLoose('o6', 'TR-01|2025-01-06')
      const items = getState().cellLooseItemOrder['TR-01|2025-01-06']
      const count = items.filter(i => i === 'order:o6').length
      expect(count).toBe(1)
    })

    it('createRunWithOrder removes from cellLooseItemOrder', () => {
      getState().createRunWithOrder('TR-01|2025-01-06', 'o6')
      expect(getState().cellLooseItemOrder['TR-01|2025-01-06']).not.toContain('order:o6')
    })
  })

  // ── deleteRun Tests ────────────────────────────────────────────────────────

  describe('deleteRun', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('deletes an empty run', () => {
      const runId = getState().createRun('TR-01|2025-01-06', 'Empty')!
      const result = getState().deleteRun(runId)
      expect(result).toBe(true)
      expect(getState().runs[runId]).toBeUndefined()
      expect(getState().cells['TR-01|2025-01-06'].runIds).not.toContain(runId)
      expect(getState().runToCell[runId]).toBeUndefined()
    })

    it('refuses to delete run with orders', () => {
      const result = getState().deleteRun('r1')
      expect(result).toBe(false)
      expect(getState().runs['r1']).toBeDefined()
    })

    it('returns false for nonexistent run', () => {
      const result = getState().deleteRun('nonexistent')
      expect(result).toBe(false)
    })
  })

  // ── Concurrent Operations Simulation ───────────────────────────────────────

  describe('concurrent operation simulation', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('rapid successive moves maintain consistency', () => {
      // Simulate rapid drag operations
      getState().moveOrder('o1', 'r2')
      getState().moveOrder('o2', 'r2')
      getState().moveOrder('o3', 'r1')

      const s = getState()
      // All indices should be consistent
      expect(s.orderToRun['o1']).toBe('r2')
      expect(s.orderToRun['o2']).toBe('r2')
      expect(s.orderToRun['o3']).toBe('r1')
      expect(s.runs['r1'].orderIds).toContain('o3')
      expect(s.runs['r2'].orderIds).toContain('o1')
      expect(s.runs['r2'].orderIds).toContain('o2')
    })

    it('move order then immediately create run with same order', () => {
      // Move to loose first
      getState().moveOrderLoose('o1', 'TR-02|2025-01-06')
      expect(getState().looseOrderToCell['o1']).toBe('TR-02|2025-01-06')

      // Immediately create run with same order
      const runId = getState().createRunWithOrder('TR-02|2025-01-06', 'o1')
      expect(runId).not.toBeNull()

      const s = getState()
      expect(s.orderToRun['o1']).toBe(runId)
      expect(s.looseOrderToCell['o1']).toBeUndefined()
      expect(s.runs[runId!].orderIds).toEqual(['o1'])
    })

    it('alternating loose and commit operations', () => {
      // Commit -> Loose -> Commit -> Loose
      getState().moveOrderLoose('o1', 'TR-02|2025-01-06')
      getState().commitOrderToRun('o1', 'r3')
      getState().moveOrderLoose('o1', 'TR-01|2025-01-06')
      getState().commitOrderToRun('o1', 'r2')

      const s = getState()
      expect(s.orderToRun['o1']).toBe('r2')
      expect(s.looseOrderToCell['o1']).toBeUndefined()
      expect(s.runs['r2'].orderIds).toContain('o1')
      expect(s.runs['r3'].orderIds).not.toContain('o1')
    })
  })

  // ── Smart Insert Position Tests ────────────────────────────────────────────

  describe('smart insert position (customer grouping)', () => {
    beforeEach(() => {
      getState().hydrate(makeSeedPayload())
    })

    it('groups same-customer orders together when no position specified', () => {
      // o1 and o2 are ACME, o3 is BETA - move o3 to r1
      getState().moveOrder('o3', 'r1')
      // BETA order should go to end (no other BETA orders)
      const orderIds = getState().runs['r1'].orderIds
      expect(orderIds[orderIds.length - 1]).toBe('o3')
    })

    it('inserts near same-customer orders', () => {
      // Create a new ACME order
      useSchedulerStore.setState((prev) => ({
        orders: { ...prev.orders, 'o-acme': makeOrder({ id: 'o-acme', customerCode: 'ACME' }) },
        looseOrderToCell: { ...prev.looseOrderToCell, 'o-acme': 'TR-02|2025-01-06' },
        cells: {
          ...prev.cells,
          'TR-02|2025-01-06': {
            ...prev.cells['TR-02|2025-01-06'],
            looseOrderIds: [...prev.cells['TR-02|2025-01-06'].looseOrderIds, 'o-acme'],
          },
        },
      }))

      // Move the new ACME order to r1 (which has o1, o2 both ACME)
      getState().moveOrder('o-acme', 'r1')
      const orderIds = getState().runs['r1'].orderIds

      // Should be grouped with other ACME orders
      const acmeIndices = orderIds
        .map((id, i) => ({ id, i }))
        .filter(({ id }) => getState().orders[id]?.customerCode === 'ACME')
        .map(({ i }) => i)

      // All ACME orders should be consecutive
      for (let i = 1; i < acmeIndices.length; i++) {
        expect(acmeIndices[i] - acmeIndices[i - 1]).toBe(1)
      }
    })

    it('forcePosition=true overrides smart positioning', () => {
      // Move o3 (BETA) to position 0 with forcePosition
      getState().moveOrder('o3', 'r1', 0, true)
      expect(getState().runs['r1'].orderIds[0]).toBe('o3')
    })
  })

  // ─── mergeHydrate Tests ───────────────────────────────────────────────────────

  describe('mergeHydrate', () => {
    it('keeps cellLooseItemOrder in sync with cells.looseOrderIds', () => {
      // Initial state with loose order o6 in cell
      const initialPayload = makeSeedPayload()
      getState().hydrate(initialPayload)

      // Verify initial sync
      const cellId = 'TR-01|2025-01-06'
      expect(getState().cells[cellId].looseOrderIds).toContain('o6')
      expect(getState().cellLooseItemOrder[cellId]).toContain('order:o6')

      // Simulate server update that removes o6 from the cell and adds o7
      const updatedPayload: HydratePayload = {
        ...initialPayload,
        orders: [
          ...initialPayload.orders,
          makeOrder({ id: 'o7', customerCode: 'NEW' }),
        ],
        cells: {
          ...initialPayload.cells,
          [cellId]: { runIds: ['r1', 'r2'], looseOrderIds: ['o7'] }, // o6 removed, o7 added
        },
      }

      getState().mergeHydrate(updatedPayload)

      // cellLooseItemOrder should be updated to reflect new looseOrderIds
      const looseItems = getState().cellLooseItemOrder[cellId]
      expect(looseItems).not.toContain('order:o6') // o6 should be removed
      expect(looseItems).toContain('order:o7') // o7 should be present
      expect(getState().cells[cellId].looseOrderIds).toEqual(['o7'])
    })

    it('preserves notes in cellLooseItemOrder during merge', () => {
      const initialPayload = makeSeedPayload()
      getState().hydrate(initialPayload)

      const cellId = 'TR-01|2025-01-06'

      // Simulate adding a note to the cell
      getState().addNote({
        id: 'n1',
        content: 'Test note',
        color: 'yellow',
        scheduledDate: '2025-01-06',
        truckId: 'TR-01',
        deliveryRunId: null,
        isPinned: false,
        createdBy: 'test',
      })

      // Verify note is in cellLooseItemOrder
      expect(getState().cellLooseItemOrder[cellId]).toContain('note:n1')

      // Simulate server update
      const updatedPayload: HydratePayload = {
        ...initialPayload,
        cells: {
          ...initialPayload.cells,
          [cellId]: { runIds: ['r1', 'r2'], looseOrderIds: ['o6', 'o8'] },
        },
        orders: [
          ...initialPayload.orders,
          makeOrder({ id: 'o8', customerCode: 'NEWCUST' }),
        ],
      }

      getState().mergeHydrate(updatedPayload)

      // Note should still be present after merge
      const looseItems = getState().cellLooseItemOrder[cellId]
      expect(looseItems).toContain('note:n1')
      expect(looseItems).toContain('order:o6')
      expect(looseItems).toContain('order:o8')
    })

    it('does not merge when pendingApiCalls > 0', () => {
      const initialPayload = makeSeedPayload()
      getState().hydrate(initialPayload)

      const cellId = 'TR-01|2025-01-06'
      const originalLooseOrders = [...getState().cells[cellId].looseOrderIds]

      // Simulate pending API call
      getState().incrementPendingApiCalls()

      // Try to merge with different data
      const updatedPayload: HydratePayload = {
        ...initialPayload,
        cells: {
          ...initialPayload.cells,
          [cellId]: { runIds: ['r1', 'r2'], looseOrderIds: ['different'] },
        },
      }

      getState().mergeHydrate(updatedPayload)

      // Should not have changed due to pending API call
      expect(getState().cells[cellId].looseOrderIds).toEqual(originalLooseOrders)
    })

    it('updates looseOrderToCell mapping correctly', () => {
      const initialPayload = makeSeedPayload()
      getState().hydrate(initialPayload)

      const cellId1 = 'TR-01|2025-01-06'
      const cellId2 = 'TR-02|2025-01-07'

      // Verify initial mapping
      expect(getState().looseOrderToCell['o6']).toBe(cellId1)

      // Simulate server moving o6 to a different cell
      const updatedPayload: HydratePayload = {
        ...initialPayload,
        cells: {
          [cellId1]: { runIds: ['r1', 'r2'], looseOrderIds: [] }, // o6 removed
          [cellId2]: { runIds: [], looseOrderIds: ['o6'] }, // o6 added here
          'TR-02|2025-01-06': initialPayload.cells['TR-02|2025-01-06'],
        },
      }

      getState().mergeHydrate(updatedPayload)

      // Mapping should be updated
      expect(getState().looseOrderToCell['o6']).toBe(cellId2)
      expect(getState().cellLooseItemOrder[cellId2]).toContain('order:o6')
      expect(getState().cellLooseItemOrder[cellId1]).not.toContain('order:o6')
    })
  })
})
