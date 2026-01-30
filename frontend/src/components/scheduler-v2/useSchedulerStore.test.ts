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
})
