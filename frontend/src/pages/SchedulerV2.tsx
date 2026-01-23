import { useEffect } from 'react'
import { ScheduleView } from '@/components/scheduler-v2/ScheduleView'
import { useSchedulerStore, type Order, type DeliveryRun, type CellData, type HydratePayload } from '@/components/scheduler-v2/useSchedulerStore'

// ─── Date Utility ─────────────────────────────────────────────────────────────

function getWeekDates(weekOffset: number): string[] {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7)
  const dates: string[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const TRUCKS = ['TR-01', 'TR-02', 'TR-03']

const W1 = getWeekDates(0) // This week
const W2 = getWeekDates(1) // Next week
const W3 = getWeekDates(2) // Week after
const W4 = getWeekDates(3) // 3 weeks out

const SEED_ORDERS: Order[] = [
  // ─── Week 1 ──────────────────────────────────────────────────
  // Inbound POs
  { id: 'po-1', orderNumber: 'PO-4001', customerCode: 'VITACOST', palletCount: 8, status: 'packed', color: '', notes: null, type: 'PO', isReadOnly: true, date: W1[0] },
  { id: 'po-2', orderNumber: 'PO-4002', customerCode: 'NATROL', palletCount: 12, status: 'picked', color: '', notes: 'Temp-controlled', type: 'PO', isReadOnly: true, date: W1[1] },

  // Week 1: TR-01 committed orders
  { id: 'so-1', orderNumber: 'SO-7001', customerCode: 'NBTY', palletCount: 5, status: 'picked', color: '', notes: null, type: 'SO', isReadOnly: false, date: W1[0] },
  { id: 'so-2', orderNumber: 'SO-7002', customerCode: 'NBTY', palletCount: 3, status: 'picked', color: '', notes: 'Dock B only', type: 'SO', isReadOnly: false, date: W1[0] },
  { id: 'so-3', orderNumber: 'SO-7003', customerCode: 'VITACOST', palletCount: 7, status: 'packed', color: '', notes: null, type: 'SO', isReadOnly: false, date: W1[0] },
  { id: 'so-4', orderNumber: 'SO-7004', customerCode: 'GNC', palletCount: 4, status: 'picked', color: '', notes: null, type: 'SO', isReadOnly: false, date: W1[0] },
  { id: 'so-5', orderNumber: 'SO-7005', customerCode: 'GNC', palletCount: 6, status: 'picked', color: '', notes: null, type: 'SO', isReadOnly: false, date: W1[0] },

  // Week 1: TR-01 Tue committed
  { id: 'so-14', orderNumber: 'SO-7014', customerCode: 'RITE-AID', palletCount: 11, status: 'packed', color: '', notes: null, type: 'SO', isReadOnly: false, date: W1[1] },

  // Week 1: TR-02 committed
  { id: 'so-6', orderNumber: 'SO-7006', customerCode: 'COSTCO', palletCount: 14, status: 'packed', color: '', notes: null, type: 'SO', isReadOnly: false, date: W1[0] },
  { id: 'so-7', orderNumber: 'SO-7007', customerCode: 'COSTCO', palletCount: 10, status: 'packed', color: '', notes: null, type: 'SO', isReadOnly: false, date: W1[0] },

  // Week 1: TR-02 Tue shipped (read-only)
  { id: 'so-8', orderNumber: 'SO-7008', customerCode: 'WALMART', palletCount: 8, status: 'shipped', color: '', notes: null, type: 'SO', isReadOnly: true, date: W1[1] },

  // Week 1: TR-03 invoiced (read-only)
  { id: 'so-9', orderNumber: 'SO-7009', customerCode: 'TARGET', palletCount: 6, status: 'invoiced', color: '', notes: null, type: 'SO', isReadOnly: true, date: W1[0] },

  // Week 1: Loose orders (unscheduled pool + workbench)
  { id: 'so-10', orderNumber: 'SO-7010', customerCode: 'NBTY', palletCount: 4, status: 'unscheduled', color: '', notes: null, type: 'SO', isReadOnly: false, date: W1[0] },
  { id: 'so-11', orderNumber: 'SO-7011', customerCode: 'COSTCO', palletCount: 18, status: 'unscheduled', color: '', notes: 'Bulk shipment', type: 'SO', isReadOnly: false, date: W1[0] },
  { id: 'so-12', orderNumber: 'SO-7012', customerCode: 'WALMART', palletCount: 22, status: 'unscheduled', color: '', notes: null, type: 'SO', isReadOnly: false, date: W1[1] },
  // Loose on TR-01 Mon (workbench)
  { id: 'so-20', orderNumber: 'SO-7020', customerCode: 'CVS', palletCount: 3, status: 'picked', color: '', notes: null, type: 'SO', isReadOnly: false, date: W1[0] },
  { id: 'so-21', orderNumber: 'SO-7021', customerCode: 'WALGREENS', palletCount: 5, status: 'picked', color: '', notes: 'Priority', type: 'SO', isReadOnly: false, date: W1[0] },

  // ─── Week 2 ──────────────────────────────────────────────────
  { id: 'po-3', orderNumber: 'PO-4003', customerCode: 'GNC', palletCount: 6, status: 'unscheduled', color: '', notes: null, type: 'PO', isReadOnly: true, date: W2[0] },

  { id: 'so-30', orderNumber: 'SO-7030', customerCode: 'TARGET', palletCount: 9, status: 'unscheduled', color: '', notes: null, type: 'SO', isReadOnly: false, date: W2[0] },
  { id: 'so-31', orderNumber: 'SO-7031', customerCode: 'COSTCO', palletCount: 15, status: 'unscheduled', color: '', notes: null, type: 'SO', isReadOnly: false, date: W2[1] },
  { id: 'so-32', orderNumber: 'SO-7032', customerCode: 'WALMART', palletCount: 20, status: 'picked', color: '', notes: null, type: 'SO', isReadOnly: false, date: W2[0] },
  { id: 'so-33', orderNumber: 'SO-7033', customerCode: 'NBTY', palletCount: 7, status: 'picked', color: '', notes: null, type: 'SO', isReadOnly: false, date: W2[0] },
  { id: 'so-34', orderNumber: 'SO-7034', customerCode: 'CVS', palletCount: 4, status: 'unscheduled', color: '', notes: null, type: 'SO', isReadOnly: false, date: W2[2] },

  // Week 2: TR-01 committed
  { id: 'so-35', orderNumber: 'SO-7035', customerCode: 'GNC', palletCount: 8, status: 'picked', color: '', notes: null, type: 'SO', isReadOnly: false, date: W2[0] },
  { id: 'so-36', orderNumber: 'SO-7036', customerCode: 'GNC', palletCount: 6, status: 'picked', color: '', notes: null, type: 'SO', isReadOnly: false, date: W2[0] },

  // ─── Week 3 ──────────────────────────────────────────────────
  { id: 'so-40', orderNumber: 'SO-7040', customerCode: 'RITE-AID', palletCount: 12, status: 'unscheduled', color: '', notes: null, type: 'SO', isReadOnly: false, date: W3[0] },
  { id: 'so-41', orderNumber: 'SO-7041', customerCode: 'WALGREENS', palletCount: 9, status: 'unscheduled', color: '', notes: null, type: 'SO', isReadOnly: false, date: W3[2] },

  // ─── Week 4 ──────────────────────────────────────────────────
  { id: 'so-50', orderNumber: 'SO-7050', customerCode: 'TARGET', palletCount: 16, status: 'unscheduled', color: '', notes: null, type: 'SO', isReadOnly: false, date: W4[0] },
  { id: 'so-51', orderNumber: 'SO-7051', customerCode: 'COSTCO', palletCount: 24, status: 'unscheduled', color: '', notes: 'Large order', type: 'SO', isReadOnly: false, date: W4[3] },
]

const SEED_RUNS: DeliveryRun[] = [
  // Week 1 inbound
  { id: 'inbound-w1-mon', name: 'Receiving', orderIds: ['po-1'], notes: null },
  { id: 'inbound-w1-tue', name: 'Receiving', orderIds: ['po-2'], notes: null },

  // Week 1: TR-01 Mon (2 runs — multi-run)
  { id: 'run-A', name: 'Run 1', orderIds: ['so-1', 'so-2', 'so-3'], notes: null },
  { id: 'run-B', name: 'Run 2', orderIds: ['so-4', 'so-5'], notes: 'Check dock availability' },

  // Week 1: TR-01 Tue
  { id: 'run-D', name: 'Run 1', orderIds: ['so-14'], notes: null },

  // Week 1: TR-02 Mon
  { id: 'run-C', name: 'Run 1', orderIds: ['so-6', 'so-7'], notes: null },

  // Week 1: TR-02 Tue
  { id: 'run-E', name: 'Run 1', orderIds: ['so-8'], notes: null },

  // Week 1: TR-03 Mon
  { id: 'run-F', name: 'Run 1', orderIds: ['so-9'], notes: null },

  // Week 2 inbound
  { id: 'inbound-w2-mon', name: 'Receiving', orderIds: ['po-3'], notes: null },

  // Week 2: TR-01 Mon
  { id: 'run-G', name: 'Run 1', orderIds: ['so-35', 'so-36'], notes: null },
]

const SEED_CELLS: Record<string, CellData> = {
  // ─── Week 1 ──────────────────────────────────────────────────
  [`inbound|${W1[0]}`]: { runIds: ['inbound-w1-mon'], looseOrderIds: [] },
  [`inbound|${W1[1]}`]: { runIds: ['inbound-w1-tue'], looseOrderIds: [] },

  // Unscheduled pool (loose orders in holding pen)
  [`unassigned|${W1[0]}`]: { runIds: [], looseOrderIds: ['so-10', 'so-11'] },
  [`unassigned|${W1[1]}`]: { runIds: [], looseOrderIds: ['so-12'] },

  // TR-01: Committed runs + Loose workbench orders
  [`TR-01|${W1[0]}`]: { runIds: ['run-A', 'run-B'], looseOrderIds: ['so-20', 'so-21'] },
  [`TR-01|${W1[1]}`]: { runIds: ['run-D'], looseOrderIds: [] },

  // TR-02
  [`TR-02|${W1[0]}`]: { runIds: ['run-C'], looseOrderIds: [] },
  [`TR-02|${W1[1]}`]: { runIds: ['run-E'], looseOrderIds: [] },

  // TR-03
  [`TR-03|${W1[0]}`]: { runIds: ['run-F'], looseOrderIds: [] },

  // ─── Week 2 ──────────────────────────────────────────────────
  [`inbound|${W2[0]}`]: { runIds: ['inbound-w2-mon'], looseOrderIds: [] },

  [`unassigned|${W2[0]}`]: { runIds: [], looseOrderIds: ['so-30'] },
  [`unassigned|${W2[1]}`]: { runIds: [], looseOrderIds: ['so-31'] },
  [`unassigned|${W2[2]}`]: { runIds: [], looseOrderIds: ['so-34'] },

  [`TR-01|${W2[0]}`]: { runIds: ['run-G'], looseOrderIds: ['so-32', 'so-33'] },

  // ─── Week 3 ──────────────────────────────────────────────────
  [`unassigned|${W3[0]}`]: { runIds: [], looseOrderIds: ['so-40'] },
  [`unassigned|${W3[2]}`]: { runIds: [], looseOrderIds: ['so-41'] },

  // ─── Week 4 ──────────────────────────────────────────────────
  [`unassigned|${W4[0]}`]: { runIds: [], looseOrderIds: ['so-50'] },
  [`unassigned|${W4[3]}`]: { runIds: [], looseOrderIds: ['so-51'] },
}

const SEED_PAYLOAD: HydratePayload = {
  orders: SEED_ORDERS,
  runs: SEED_RUNS,
  cells: SEED_CELLS,
  trucks: TRUCKS,
  visibleWeeks: 4,
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SchedulerV2() {
  const hydrate = useSchedulerStore((s) => s.hydrate)

  useEffect(() => {
    hydrate(SEED_PAYLOAD)
  }, [hydrate])

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="flex items-center px-4 py-2 border-b bg-white shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Scheduler V2</h1>
          <p className="text-xs text-slate-500">
            Multi-Week Workbench — Drag to cell = loose. Drag to run = committed. Right-click for notes/lock.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ScheduleView />
      </div>
    </div>
  )
}
