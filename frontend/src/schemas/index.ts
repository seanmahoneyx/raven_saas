import { z } from 'zod'

// ─── Sales Order ─────────────────────────────────────────────────
export const salesOrderLineSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  quantity_ordered: z.string().min(1, 'Quantity is required')
    .refine(val => Number(val) > 0, 'Quantity must be positive'),
  uom: z.string().min(1, 'UOM is required'),
  unit_price: z.string().min(1, 'Price is required')
    .refine(val => Number(val) >= 0, 'Price must be non-negative'),
})

export const salesOrderSchema = z.object({
  order_number: z.string().optional(),
  status: z.string().default('draft'),
  priority: z.string().default('5'),
  customer: z.string().min(1, 'Customer is required'),
  customer_po: z.string().optional(),
  order_date: z.string().min(1, 'Order date is required'),
  scheduled_date: z.string().optional(),
  ship_to: z.string().optional(),
  bill_to: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(salesOrderLineSchema).min(1, 'At least one line item is required'),
})

export type SalesOrderFormData = z.infer<typeof salesOrderSchema>

// ─── Purchase Order ──────────────────────────────────────────────
export const purchaseOrderLineSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  quantity_ordered: z.string().min(1, 'Quantity is required')
    .refine(val => Number(val) > 0, 'Quantity must be positive'),
  uom: z.string().min(1, 'UOM is required'),
  unit_cost: z.string().min(1, 'Cost is required')
    .refine(val => Number(val) >= 0, 'Cost must be non-negative'),
})

export const purchaseOrderSchema = z.object({
  po_number: z.string().optional(),
  status: z.string().default('draft'),
  priority: z.string().default('5'),
  vendor: z.string().min(1, 'Vendor is required'),
  ship_to: z.string().min(1, 'Ship-to warehouse is required'),
  order_date: z.string().min(1, 'Order date is required'),
  expected_date: z.string().optional(),
  scheduled_date: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(purchaseOrderLineSchema).min(1, 'At least one line item is required'),
})

export type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>

// ─── Item ────────────────────────────────────────────────────────
export const itemSchema = z.object({
  // Base item fields
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  division: z.string().default('misc'),
  description: z.string().optional(),
  purch_desc: z.string().optional(),
  sell_desc: z.string().optional(),
  base_uom: z.string().min(1, 'Unit of measure is required'),
  customer: z.string().optional(),
  item_type: z.enum(['inventory', 'non_stockable', 'crossdock', 'other_charge']).default('inventory'),
  is_active: z.boolean().default(true),
  // Corrugated fields
  box_type: z.string().default('rsc'),
  test: z.string().optional(),
  flute: z.string().optional(),
  paper: z.string().optional(),
  is_printed: z.boolean().default(false),
  panels_printed: z.string().optional(),
  colors_printed: z.string().optional(),
  ink_list: z.string().optional(),
  // Dimensions (shared by corrugated and packaging)
  length: z.string().optional(),
  width: z.string().optional(),
  height: z.string().optional(),
  blank_length: z.string().optional(),
  blank_width: z.string().optional(),
  out_per_rotary: z.string().optional(),
  // Packaging fields
  pkg_sub_type: z.string().default('bags'),
  material_type: z.string().optional(),
  color: z.string().optional(),
  thickness: z.string().optional(),
  thickness_unit: z.string().default('mil'),
  diameter: z.string().optional(),
  pieces_per_case: z.string().optional(),
  weight_capacity_lbs: z.string().optional(),
  roll_length: z.string().optional(),
  roll_width: z.string().optional(),
  rolls_per_case: z.string().optional(),
  core_diameter: z.string().optional(),
  sheets_per_bundle: z.string().optional(),
  bubble_size: z.string().optional(),
  perforated: z.boolean().default(false),
  perforation_interval: z.string().optional(),
  lip_style: z.string().optional(),
  density: z.string().optional(),
  cells_x: z.string().optional(),
  cells_y: z.string().optional(),
  adhesive_type: z.string().optional(),
  tape_type: z.string().optional(),
  break_strength_lbs: z.string().optional(),
  stretch_pct: z.string().optional(),
  inner_diameter: z.string().optional(),
  lid_included: z.boolean().default(false),
  label_type: z.string().optional(),
  labels_per_roll: z.string().optional(),
  // Unitizing
  units_per_layer: z.string().optional(),
  layers_per_pallet: z.string().optional(),
  units_per_pallet: z.string().optional(),
  unit_height: z.string().optional(),
  pallet_height: z.string().optional(),
  pallet_footprint: z.string().optional(),
})

export type ItemFormData = z.infer<typeof itemSchema>
