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

export type DivisionType = 'corrugated' | 'packaging' | 'tooling' | 'janitorial' | 'misc'
export type TestType = 'ect29' | 'ect32' | 'ect40' | 'ect44' | 'ect48' | 'ect51' | 'ect55' | 'ect112' | '200t'
export type FluteType = 'a' | 'b' | 'c' | 'e' | 'f' | 'bc' | 'eb' | 'tw'
export type PaperType = 'k' | 'mw'
export type ItemType = 'base' | 'corrugated' | 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele'

export interface Item {
  id: number
  sku: string
  name: string
  division: DivisionType
  revision: number | null
  description: string
  purch_desc: string
  sell_desc: string
  base_uom: number
  base_uom_code: string
  base_uom_name?: string
  customer: number | null
  customer_code?: string | null
  customer_name?: string | null
  // Unitizing
  units_per_layer: number | null
  layers_per_pallet: number | null
  units_per_pallet: number | null
  unit_height: string | null
  pallet_height: string | null
  pallet_footprint: string
  // Flags
  is_inventory: boolean
  is_active: boolean
  attachment: string | null
  // Type indicator
  item_type?: ItemType
  // Nested (detail view)
  uom_conversions?: ItemUOM[]
  vendors?: ItemVendor[]
  created_at: string
  updated_at: string
}

export interface ItemUOM {
  id: number
  item: number
  uom: number
  uom_code: string
  uom_name: string
  multiplier_to_base: number
  created_at: string
  updated_at: string
}

export interface ItemVendor {
  id: number
  item: number
  vendor: number
  vendor_code: string
  vendor_name: string
  mpn: string
  lead_time_days: number | null
  min_order_qty: number | null
  is_preferred: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// Corrugated Feature types
export interface CorrugatedFeature {
  id: number
  code: string
  name: string
  requires_details: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ItemFeature {
  id: number
  corrugated_item: number
  feature: number
  feature_code: string
  feature_name: string
  requires_details: boolean
  details: string
}

// Corrugated Item types
export interface CorrugatedItem extends Item {
  test: TestType | ''
  flute: FluteType | ''
  paper: PaperType | ''
  is_printed: boolean
  panels_printed: number | null
  colors_printed: number | null
  ink_list: string
  item_features?: ItemFeature[]
}

export interface DCItem extends CorrugatedItem {
  length: string
  width: string
  blank_length: string | null
  blank_width: string | null
  out_per_rotary: number | null
}

export interface RSCItem extends CorrugatedItem {
  length: string
  width: string
  height: string
}

export interface HSCItem extends CorrugatedItem {
  length: string
  width: string
  height: string
}

export interface FOLItem extends CorrugatedItem {
  length: string
  width: string
  height: string
}

export interface TeleItem extends CorrugatedItem {
  length: string
  width: string
  height: string
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
  // Contract reference (for lines released from contracts)
  contract_id?: number | null
  contract_number?: string | null
  created_at: string
  updated_at: string
}

// Contract reference for order-level summary
export interface ContractReference {
  contract_id: number
  contract_number: string
  blanket_po?: string
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
  // Contract reference (from first line's contract release)
  contract_reference?: ContractReference | null
  created_at: string
  updated_at: string
}

// Delivery Run types
export interface DeliveryRun {
  id: number
  name: string
  truck_id: number
  truck_name: string
  scheduled_date: string
  sequence: number
  departure_time: string | null
  notes: string
  is_complete: boolean
  order_count: number
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
  delivery_run_id: number | null
  delivery_run_name: string | null
  requested_date: string | null
  num_lines: number
  total_quantity: number
  total_pallets?: number
  priority: number
  scheduler_sequence: number
  notes: string
  // Contract reference (for orders released from contracts)
  contract_id?: number | null
  contract_number?: string | null
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

// Scheduler Note types
export type NoteColor = 'yellow' | 'blue' | 'green' | 'red' | 'purple' | 'orange'
export type NoteAttachmentType = 'sales_order' | 'purchase_order' | 'delivery_run' | 'cell' | 'date' | 'floating'

export interface SchedulerNote {
  id: number
  content: string
  color: NoteColor
  scheduled_date: string | null
  truck_id: number | null
  delivery_run_id: number | null
  sales_order_id: number | null
  purchase_order_id: number | null
  created_by: number | null
  created_by_username: string | null
  is_pinned: boolean
  attachment_type: NoteAttachmentType
  created_at: string
  updated_at: string
}

// Contract types
export type ContractStatus = 'draft' | 'active' | 'complete' | 'cancelled' | 'expired'

export interface ContractRelease {
  id: number
  contract_line: number
  sales_order_line: number
  sales_order_number: string
  sales_order_id: number
  sales_order_status: OrderStatus
  quantity_ordered: number
  release_date: string
  balance_before: number
  balance_after: number
  notes: string
  warning?: string
  created_at: string
  updated_at: string
}

export interface ContractLine {
  id: number
  contract: number
  line_number: number
  item: number
  item_sku: string
  item_name: string
  blanket_qty: number
  uom: number
  uom_code: string
  unit_price: string | null
  notes: string
  released_qty: number
  remaining_qty: number
  is_fully_released: boolean
  releases?: ContractRelease[]
  created_at: string
  updated_at: string
}

export interface Contract {
  id: number
  contract_number: string
  blanket_po: string
  status: ContractStatus
  customer: number
  customer_code: string
  customer_name: string
  issue_date: string
  start_date: string | null
  end_date: string | null
  ship_to: number | null
  ship_to_name: string | null
  notes: string
  is_active: boolean
  total_committed_qty: number
  total_released_qty: number
  total_remaining_qty: number
  completion_percentage: number
  num_lines: number
  lines?: ContractLine[]
  created_at: string
  updated_at: string
}

export interface ContractLineInput {
  line_number?: number
  item: number
  blanket_qty: number
  uom: number
  unit_price?: string | null
  notes?: string
}

export interface ContractInput {
  blanket_po?: string
  status?: ContractStatus
  customer: number
  issue_date?: string
  start_date?: string | null
  end_date?: string | null
  ship_to?: number | null
  notes?: string
  lines?: ContractLineInput[]
}

export interface CreateReleasePayload {
  contract_line_id: number
  quantity: number
  ship_to_id?: number | null
  scheduled_date?: string | null
  unit_price?: string | null
  notes?: string
}

// History types
export interface HistoryChange {
  field: string
  old: string
  new: string
}

export interface HistoryRecord {
  id: number
  order_type: 'SO' | 'PO'
  order_id: number
  number: string
  party_name: string
  history_type: '+' | '~' | '-'
  history_type_display: string
  history_date: string
  history_user: string | null
  status: OrderStatus
  scheduled_date: string | null
  scheduled_truck_id: number | null
  changed_fields: string[]
  changes?: HistoryChange[]
}

// Priority List types
export type BoxType = 'RSC' | 'DC' | 'HSC' | 'FOL' | 'TELE' | 'OTHER'

export interface PriorityLine {
  id: number
  po_line_id: number
  po_number: string
  item_sku: string
  item_name: string
  quantity_ordered: number
  sequence: number
  customer_request_date: string | null
}

export interface BoxTypeBin {
  box_type: BoxType
  box_type_display: string
  allotment: number
  is_override: boolean
  scheduled_qty: number
  remaining_kicks: number
  lines: PriorityLine[]
}

export interface DateSection {
  date: string
  box_types: BoxTypeBin[]
}

export interface VendorGroup {
  vendor_id: number
  vendor_name: string
  dates: DateSection[]
}

export interface PriorityListResponse {
  vendors: VendorGroup[]
}

export interface VendorKickAllotment {
  id: number
  vendor: number
  vendor_name: string
  box_type: BoxType
  box_type_display: string
  daily_allotment: number
  created_at: string
  updated_at: string
}

export interface DailyKickOverride {
  id: number
  vendor: number
  vendor_name: string
  box_type: BoxType
  box_type_display: string
  date: string
  allotment: number
  created_at: string
  updated_at: string
}

export interface PriorityLinePriority {
  id: number
  purchase_order_line: number
  vendor: number
  vendor_name: string
  scheduled_date: string
  box_type: BoxType
  sequence: number
  po_number: string
  item_sku: string
  item_name: string
  quantity_ordered: number
  created_at: string
  updated_at: string
}

// Priority List input types
export interface ReorderLinesInput {
  vendor_id: number
  date: string
  box_type: BoxType
  line_ids: number[]
}

export interface MoveLineInput {
  line_id: number
  target_date: string
  insert_at_sequence?: number
}

export interface VendorAllotmentInput {
  vendor_id: number
  box_type: BoxType
  daily_allotment: number
}

export interface DailyOverrideInput {
  vendor_id: number
  box_type: BoxType
  date: string
  allotment: number
}

export interface ClearOverrideInput {
  vendor_id: number
  box_type: BoxType
  date: string
}
