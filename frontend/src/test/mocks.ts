// src/test/mocks.ts
/**
 * Mock data and factory functions for testing.
 */
import type { CalendarOrder, TruckCalendar, Truck, HistoryRecord, OrderStatus } from '@/types/api'

/**
 * Create a mock order with default values.
 */
export function createMockOrder(overrides: Partial<CalendarOrder> = {}): CalendarOrder {
  return {
    id: 1,
    order_type: 'SO',
    number: 'SO-001',
    status: 'scheduled',
    party_name: 'Test Customer',
    scheduled_date: '2025-01-15',
    scheduled_truck_id: 1,
    scheduled_truck_name: 'Truck 1',
    delivery_run_id: null,
    delivery_run_name: null,
    requested_date: '2025-01-15',
    num_lines: 3,
    total_quantity: 100,
    total_pallets: 5,
    priority: 5,
    notes: '',
    scheduler_sequence: 1000,
    ...overrides,
  }
}

/**
 * Create a mock purchase order.
 */
export function createMockPurchaseOrder(overrides: Partial<CalendarOrder> = {}): CalendarOrder {
  return createMockOrder({
    order_type: 'PO',
    number: 'PO-001',
    party_name: 'Test Vendor',
    scheduled_truck_id: null,
    scheduled_truck_name: null,
    ...overrides,
  })
}

/**
 * Create a mock unscheduled order.
 */
export function createMockUnscheduledOrder(overrides: Partial<CalendarOrder> = {}): CalendarOrder {
  return createMockOrder({
    scheduled_date: null,
    scheduled_truck_id: null,
    scheduled_truck_name: null,
    status: 'confirmed',
    ...overrides,
  })
}

/**
 * Create a mock truck.
 */
export function createMockTruck(overrides: Partial<Truck> = {}): Truck {
  return {
    id: 1,
    name: 'Truck 1',
    license_plate: 'ABC-123',
    capacity_pallets: 20,
    is_active: true,
    notes: '',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Create mock calendar data for a single truck.
 */
export function createMockTruckCalendar(
  truck: Partial<Truck> | null,
  orders: CalendarOrder[] = [],
  dates: string[] = ['2025-01-15', '2025-01-16', '2025-01-17']
): TruckCalendar {
  return {
    truck_id: truck?.id ?? null,
    truck_name: truck?.name ?? 'Inbound',
    days: dates.map(date => ({
      date,
      orders: orders.filter(o => o.scheduled_date === date),
      total_orders: orders.filter(o => o.scheduled_date === date).length,
    })),
  }
}

/**
 * Create mock history record.
 */
export function createMockHistoryRecord(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: 1,
    order_type: 'SO',
    order_id: 1,
    number: 'SO-001',
    party_name: 'Test Customer',
    history_type: '~',
    history_type_display: 'Changed',
    history_date: new Date().toISOString(),
    history_user: 'testuser',
    status: 'scheduled',
    scheduled_date: '2025-01-15',
    scheduled_truck_id: 1,
    changed_fields: ['scheduled_date'],
    ...overrides,
  }
}

/**
 * Generate multiple mock orders.
 */
export function createMockOrders(count: number, template: Partial<CalendarOrder> = {}): CalendarOrder[] {
  return Array.from({ length: count }, (_, i) => createMockOrder({
    id: i + 1,
    number: `SO-${String(i + 1).padStart(3, '0')}`,
    party_name: `Customer ${i + 1}`,
    priority: (i % 10) + 1,
    ...template,
  }))
}

/**
 * Generate multiple mock trucks.
 */
export function createMockTrucks(count: number): Truck[] {
  return Array.from({ length: count }, (_, i) => createMockTruck({
    id: i + 1,
    name: `Truck ${i + 1}`,
    capacity_pallets: 20 + i * 5,
  }))
}

/**
 * Generate mock calendar data with trucks and orders.
 */
export function createMockCalendarData(
  trucks: Truck[],
  dates: string[],
  ordersPerDay = 2
): TruckCalendar[] {
  const result: TruckCalendar[] = []

  // Inbound row (POs)
  const inboundOrders: CalendarOrder[] = []
  dates.forEach((date, dateIndex) => {
    for (let i = 0; i < ordersPerDay; i++) {
      inboundOrders.push(createMockPurchaseOrder({
        id: 1000 + dateIndex * ordersPerDay + i,
        number: `PO-${String(dateIndex * ordersPerDay + i + 1).padStart(3, '0')}`,
        scheduled_date: date,
      }))
    }
  })
  result.push(createMockTruckCalendar(null, inboundOrders, dates))

  // Truck rows (SOs)
  trucks.forEach((truck, truckIndex) => {
    const truckOrders: CalendarOrder[] = []
    dates.forEach((date, dateIndex) => {
      for (let i = 0; i < ordersPerDay; i++) {
        truckOrders.push(createMockOrder({
          id: (truckIndex + 1) * 100 + dateIndex * ordersPerDay + i,
          number: `SO-${truckIndex + 1}-${String(dateIndex * ordersPerDay + i + 1).padStart(3, '0')}`,
          scheduled_date: date,
          scheduled_truck_id: truck.id,
          scheduled_truck_name: truck.name,
        }))
      }
    })
    result.push(createMockTruckCalendar(truck, truckOrders, dates))
  })

  return result
}

/**
 * Status options used in tests.
 */
export const statusOptions: { value: OrderStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'picking', label: 'Pick Ticket' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'complete', label: 'Completed' },
  { value: 'crossdock', label: 'Crossdock' },
]
