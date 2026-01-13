// API Response types

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// Party types
export interface Party {
  id: number
  party_type: 'CUSTOMER' | 'VENDOR' | 'BOTH' | 'OTHER'
  code: string
  display_name: string
  legal_name: string
  is_active: boolean
  notes: string
  is_customer: boolean
  is_vendor: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: number
  party: number
  party_display_name: string
  party_code: string
  payment_terms: string
  default_ship_to: number | null
  default_bill_to: number | null
  sales_rep: number | null
  created_at: string
  updated_at: string
}

export interface Vendor {
  id: number
  party: number
  party_display_name: string
  party_code: string
  payment_terms: string
  default_ship_from: number | null
  buyer: number | null
  created_at: string
  updated_at: string
}

export interface Location {
  id: number
  party: number
  location_type: 'SHIP_TO' | 'BILL_TO' | 'WAREHOUSE' | 'OFFICE'
  name: string
  code: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  phone: string
  email: string
  loading_dock_hours: string
  special_instructions: string
  is_default: boolean
  is_active: boolean
  full_address: string
  created_at: string
  updated_at: string
}

export interface Truck {
  id: number
  name: string
  license_plate: string
  capacity_pallets: number | null
  is_active: boolean
  notes: string
  created_at: string
  updated_at: string
}

// Item types
export interface UnitOfMeasure {
  id: number
  code: string
  name: string
  description: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Item {
  id: number
  sku: string
  name: string
  description: string
  base_uom: number
  base_uom_code: string
  base_uom_name: string
  is_inventory: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// Order types
export type OrderStatus = 'draft' | 'confirmed' | 'scheduled' | 'picking' | 'shipped' | 'complete' | 'crossdock' | 'cancelled'

export interface PurchaseOrderLine {
  id: number
  purchase_order: number
  line_number: number
  item: number
  item_sku: string
  item_name: string
  quantity_ordered: number
  uom: number
  uom_code: string
  unit_cost: string
  line_total: string
  quantity_in_base_uom: number
  notes: string
  created_at: string
  updated_at: string
}

export interface PurchaseOrder {
  id: number
  po_number: string
  status: OrderStatus
  vendor: number
  vendor_name: string
  order_date: string
  expected_date: string | null
  scheduled_date: string | null
  scheduled_truck: number | null
  ship_to: number
  ship_to_name: string
  notes: string
  priority: number
  num_lines: number
  subtotal: string
  is_editable: boolean
  lines?: PurchaseOrderLine[]
  created_at: string
  updated_at: string
}

export interface SalesOrderLine {
  id: number
  sales_order: number
  line_number: number
  item: number
  item_sku: string
  item_name: string
  quantity_ordered: number
  uom: number
  uom_code: string
  unit_price: string
  line_total: string
  quantity_in_base_uom: number
  notes: string
  created_at: string
  updated_at: string
}

export interface SalesOrder {
  id: number
  order_number: string
  status: OrderStatus
  customer: number
  customer_name: string
  order_date: string
  scheduled_date: string | null
  scheduled_truck: number | null
  ship_to: number
  ship_to_name: string
  bill_to: number | null
  bill_to_name: string | null
  customer_po: string
  notes: string
  priority: number
  num_lines: number
  subtotal: string
  is_editable: boolean
  lines?: SalesOrderLine[]
  created_at: string
  updated_at: string
}

// Calendar types
export interface CalendarOrder {
  id: number
  order_type: 'SO' | 'PO'
  number: string
  status: OrderStatus
  party_name: string
  scheduled_date: string | null
  scheduled_truck_id: number | null
  scheduled_truck_name: string | null
  num_lines: number
  total_quantity: number
  priority: number
  notes: string
}

export interface CalendarDay {
  date: string
  orders: CalendarOrder[]
  total_orders: number
}

export interface TruckCalendar {
  truck_id: number | null
  truck_name: string | null
  days: CalendarDay[]
}
