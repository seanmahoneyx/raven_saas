import type {
  CalendarOrder,
  TruckCalendar,
  DeliveryRun as ApiDeliveryRun,
  Truck,
  OrderStatus as ApiOrderStatus,
} from '@/types/api'
import type {
  Order,
  DeliveryRun,
  CellData,
  HydratePayload,
  OrderStatus,
  CellId,
} from './useSchedulerStore'
import { getStatusColor } from './useSchedulerStore'

// ─── Status Mapping ──────────────────────────────────────────────────────────

export function mapApiStatusToSchedulerStatus(apiStatus: ApiOrderStatus): OrderStatus {
  switch (apiStatus) {
    case 'draft':
    case 'confirmed':
    case 'cancelled':
      return 'unscheduled'
    case 'scheduled':
    case 'picking':
      return 'picked'
    case 'crossdock':
      return 'packed'
    case 'shipped':
      return 'shipped'
    case 'complete':
      return 'invoiced'
    default:
      return 'unscheduled'
  }
}

// ─── Order Transform ─────────────────────────────────────────────────────────

export function transformOrder(apiOrder: CalendarOrder): Order {
  const status = mapApiStatusToSchedulerStatus(apiOrder.status)
  const color = getStatusColor(status)
  const isReadOnly = apiOrder.status === 'shipped' || apiOrder.status === 'complete'

  return {
    id: apiOrder.id.toString(),
    orderNumber: apiOrder.number,
    customerCode: apiOrder.party_name,
    palletCount: apiOrder.total_pallets ?? 0,
    status,
    color,
    notes: apiOrder.notes || null,
    type: apiOrder.order_type,
    isReadOnly,
    date: apiOrder.scheduled_date ?? '',
  }
}

// ─── Delivery Run Transform ──────────────────────────────────────────────────

export function transformDeliveryRun(
  apiRun: ApiDeliveryRun,
  orderIds: string[]
): DeliveryRun {
  return {
    id: apiRun.id.toString(),
    name: apiRun.name,
    orderIds,
    notes: apiRun.notes || null,
  }
}

// ─── Main Transform ──────────────────────────────────────────────────────────

export function transformApiToHydratePayload(
  calendarData: TruckCalendar[],
  deliveryRuns: ApiDeliveryRun[],
  trucks: Truck[]
): HydratePayload {
  // 1. Transform all orders
  const orders: Order[] = []
  const allCalendarOrders: CalendarOrder[] = []

  for (const truckCalendar of calendarData) {
    for (const day of truckCalendar.days) {
      allCalendarOrders.push(...day.orders)
    }
  }

  for (const apiOrder of allCalendarOrders) {
    orders.push(transformOrder(apiOrder))
  }

  // 2. Build delivery runs with order IDs
  const runs: DeliveryRun[] = []
  const runIdSet = new Set<number>()

  for (const apiRun of deliveryRuns) {
    runIdSet.add(apiRun.id)
    const orderIds = allCalendarOrders
      .filter((o) => o.delivery_run_id === apiRun.id)
      .map((o) => o.id.toString())

    runs.push(transformDeliveryRun(apiRun, orderIds))
  }

  // 3. Build cells map
  const cells: Record<CellId, CellData> = {}

  for (const truckCalendar of calendarData) {
    const truckId = truckCalendar.truck_id?.toString() ?? 'unassigned'

    for (const day of truckCalendar.days) {
      const cellId: CellId = `${truckId}|${day.date}`

      // Collect run IDs for this cell
      const runIds = new Set<string>()
      const looseOrderIds: string[] = []

      for (const order of day.orders) {
        // POs should go to "inbound" row, not the truck row
        if (order.order_type === 'PO') {
          // Skip - POs will be handled separately below
          continue
        }
        if (order.delivery_run_id && runIdSet.has(order.delivery_run_id)) {
          runIds.add(order.delivery_run_id.toString())
        } else {
          // Order is scheduled to this cell but not in a run
          looseOrderIds.push(order.id.toString())
        }
      }

      cells[cellId] = {
        runIds: Array.from(runIds),
        looseOrderIds,
      }
    }
  }

  // 3b. Route POs to "inbound" row cells (deduplicated)
  // POs may appear in multiple truck calendars if they have scheduled_truck_id set,
  // so we track which POs we've already added to avoid duplicates
  const addedPoIds = new Set<string>()

  for (const truckCalendar of calendarData) {
    for (const day of truckCalendar.days) {
      for (const order of day.orders) {
        if (order.order_type === 'PO') {
          const poId = order.id.toString()
          // Skip if already added (deduplication)
          if (addedPoIds.has(poId)) continue
          addedPoIds.add(poId)

          const inboundCellId: CellId = `inbound|${day.date}`
          // Initialize inbound cell if not exists
          if (!cells[inboundCellId]) {
            cells[inboundCellId] = { runIds: [], looseOrderIds: [] }
          }
          // POs go to inbound row as loose orders (they can't be in runs)
          cells[inboundCellId].looseOrderIds.push(poId)
        }
      }
    }
  }

  // 4. Build truck list and names
  const truckNames: Record<string, string> = {}
  const truckList = trucks
    .filter((t) => t.is_active)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => {
      truckNames[t.id.toString()] = t.name
      return t.id.toString()
    })

  return {
    orders,
    runs,
    cells,
    trucks: truckList,
    truckNames,
    visibleWeeks: 4,
  }
}

// ─── Sidebar Extended Order ──────────────────────────────────────────────────

// Extended order type that preserves requested_date for sidebar display
export interface SidebarOrder extends Order {
  requestedDate: string | null
}

export function transformUnscheduledOrder(apiOrder: CalendarOrder): SidebarOrder {
  return {
    ...transformOrder(apiOrder),
    requestedDate: apiOrder.requested_date,
  }
}

export function transformUnscheduledOrders(apiOrders: CalendarOrder[]): SidebarOrder[] {
  return apiOrders.map(transformUnscheduledOrder)
}
