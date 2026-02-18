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
  is_inventory: z.boolean().default(true),
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
  // Dimensions
  length: z.string().optional(),
  width: z.string().optional(),
  height: z.string().optional(),
  blank_length: z.string().optional(),
  blank_width: z.string().optional(),
  out_per_rotary: z.string().optional(),
  // Unitizing
  units_per_layer: z.string().optional(),
  layers_per_pallet: z.string().optional(),
  units_per_pallet: z.string().optional(),
  unit_height: z.string().optional(),
  pallet_height: z.string().optional(),
  pallet_footprint: z.string().optional(),
})

export type ItemFormData = z.infer<typeof itemSchema>
