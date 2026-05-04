import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import { getApiErrorMessage } from '@/lib/errors'
import type {
  Item, UnitOfMeasure, PaginatedResponse,
  CorrugatedFeature, DCItem, RSCItem, HSCItem, FOLItem, TeleItem,
  PackagingItem,
  ItemVendor, ApiError
} from '@/types/api'

// =============================================================================
// ITEMS (BASE)
// =============================================================================

export function useItems(params?: { search?: string; is_active?: boolean; division?: string; lifecycle_status?: string }) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Item>>('/items/', { params })
      return data
    },
  })
}

export function useItem(id: number | null) {
  return useQuery({
    queryKey: ['items', id],
    queryFn: async () => {
      const { data } = await api.get<Item>(`/items/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useNextMspn() {
  return useQuery({
    queryKey: ['items', 'next_mspn'],
    queryFn: async () => {
      const { data } = await api.get<{ next_mspn: string }>('/items/next_mspn/')
      return data.next_mspn
    },
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: Partial<Item>) => {
      const { data } = await api.post<Item>('/items/', item)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create item'))
    },
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...item }: Partial<Item> & { id: number }) => {
      const { data } = await api.patch<Item>(`/items/${id}/`, item)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to save changes'))
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/items/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item deleted')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete item'))
    },
  })
}

// =============================================================================
// UNITS OF MEASURE
// =============================================================================

export function useUnitsOfMeasure() {
  return useQuery({
    queryKey: ['uom'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<UnitOfMeasure>>('/uom/')
      return data
    },
  })
}

export function useCreateUnitOfMeasure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (uom: Partial<UnitOfMeasure>) => {
      const { data } = await api.post<UnitOfMeasure>('/uom/', uom)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uom'] })
      toast.success('Unit of measure created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create unit of measure'))
    },
  })
}

export function useUpdateUnitOfMeasure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...uom }: Partial<UnitOfMeasure> & { id: number }) => {
      const { data } = await api.patch<UnitOfMeasure>(`/uom/${id}/`, uom)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uom'] })
      toast.success('Unit of measure updated')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to update unit of measure'))
    },
  })
}

// =============================================================================
// CORRUGATED FEATURES
// =============================================================================

export function useCorrugatedFeatures() {
  return useQuery({
    queryKey: ['corrugated-features'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<CorrugatedFeature>>('/corrugated-features/')
      return data
    },
  })
}

// =============================================================================
// CORRUGATED ITEMS
// =============================================================================

type BoxType = 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele'
type BoxItem = DCItem | RSCItem | HSCItem | FOLItem | TeleItem

const boxEndpoints: Record<BoxType, string> = {
  dc: '/dc-items/',
  rsc: '/rsc-items/',
  hsc: '/hsc-items/',
  fol: '/fol-items/',
  tele: '/tele-items/',
}

export function useCreateBoxItem(boxType: BoxType) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: Partial<BoxItem>) => {
      const { data } = await api.post<BoxItem>(boxEndpoints[boxType], item)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: [`${boxType}-items`] })
      toast.success('Item created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create item'))
    },
  })
}

export function useUpdateBoxItem(boxType: BoxType) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...item }: Partial<BoxItem> & { id: number }) => {
      const { data } = await api.patch<BoxItem>(`${boxEndpoints[boxType]}${id}/`, item)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: [`${boxType}-items`] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to save changes'))
    },
  })
}

// DC Items
export function useDCItems(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['dc-items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<DCItem>>('/dc-items/', { params })
      return data
    },
  })
}

export function useDCItem(id: number | null) {
  return useQuery({
    queryKey: ['dc-items', id],
    queryFn: async () => {
      const { data } = await api.get<DCItem>(`/dc-items/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

// RSC Items
export function useRSCItems(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['rsc-items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<RSCItem>>('/rsc-items/', { params })
      return data
    },
  })
}

export function useRSCItem(id: number | null) {
  return useQuery({
    queryKey: ['rsc-items', id],
    queryFn: async () => {
      const { data } = await api.get<RSCItem>(`/rsc-items/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

// HSC Items
export function useHSCItems(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['hsc-items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<HSCItem>>('/hsc-items/', { params })
      return data
    },
  })
}

// FOL Items
export function useFOLItems(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['fol-items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<FOLItem>>('/fol-items/', { params })
      return data
    },
  })
}

// Tele Items
export function useTeleItems(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ['tele-items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<TeleItem>>('/tele-items/', { params })
      return data
    },
  })
}

// Generic hook to fetch any box item by type and id
export function useBoxItem(boxType: BoxType | null, id: number | null) {
  return useQuery({
    queryKey: [boxType ? `${boxType}-items` : 'box-items', id],
    queryFn: async () => {
      if (!boxType || !id) return null
      const { data } = await api.get<BoxItem>(`${boxEndpoints[boxType]}${id}/`)
      return data
    },
    enabled: !!boxType && !!id,
  })
}

// =============================================================================
// PACKAGING ITEMS
// =============================================================================

export function usePackagingItems(params?: { search?: string; is_active?: boolean; sub_type?: string }) {
  return useQuery({
    queryKey: ['packaging-items', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<PackagingItem>>('/packaging-items/', { params })
      return data
    },
  })
}

export function usePackagingItem(id: number | null) {
  return useQuery({
    queryKey: ['packaging-items', id],
    queryFn: async () => {
      const { data } = await api.get<PackagingItem>(`/packaging-items/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreatePackagingItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: Partial<PackagingItem>) => {
      const { data } = await api.post<PackagingItem>('/packaging-items/', item)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['packaging-items'] })
      toast.success('Packaging item created')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to create packaging item'))
    },
  })
}

export function useUpdatePackagingItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...item }: Partial<PackagingItem> & { id: number }) => {
      const { data } = await api.patch<PackagingItem>(`/packaging-items/${id}/`, item)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['packaging-items'] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to save changes'))
    },
  })
}

// =============================================================================
// LIFECYCLE TRANSITIONS
// =============================================================================

export function useTransitionItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, lifecycle_status }: { id: number; lifecycle_status: string }) => {
      const { data } = await api.post<Item>(`/items/${id}/transition/`, { lifecycle_status })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item status updated')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to update status'))
    },
  })
}

export function useBumpRevision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const { data } = await api.post<Item>(`/items/${id}/bump-revision/`, { reason })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Revision bumped')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to bump revision'))
    },
  })
}

// =============================================================================
// ITEM DUPLICATE
// =============================================================================

export function useDuplicateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<Item>(`/items/${id}/duplicate/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item duplicated')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to duplicate item'))
    },
  })
}

// =============================================================================
// ITEM VENDORS
// =============================================================================

export function useItemVendors(itemId: number | null) {
  return useQuery({
    queryKey: ['item-vendors', itemId],
    queryFn: async () => {
      const { data } = await api.get<ItemVendor[]>(`/items/${itemId}/vendors/`)
      return data
    },
    enabled: !!itemId,
  })
}

export function useCreateItemVendor(itemId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vendor: Partial<ItemVendor>) => {
      const { data } = await api.post<ItemVendor>(`/items/${itemId}/vendors/`, vendor)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-vendors', itemId] })
      queryClient.invalidateQueries({ queryKey: ['items', itemId] })
      toast.success('Vendor added')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to add vendor'))
    },
  })
}

export function useSetPreferredVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vendorLinkId }: { itemId: number; vendorLinkId: number }) => {
      const { data } = await api.post(`/item-vendors/${vendorLinkId}/set-preferred/`)
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['item-vendors', variables.itemId] })
      queryClient.invalidateQueries({ queryKey: ['items', variables.itemId] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Preferred vendor updated')
    },
    onError: (error: ApiError) => {
      toast.error(getApiErrorMessage(error, 'Failed to update preferred vendor'))
    },
  })
}

// =============================================================================
// ITEM HISTORY (Item 360)
// =============================================================================

export interface ItemHistoryEntry {
  type: 'ESTIMATE' | 'RFQ' | 'SO' | 'PO'
  date: string
  document_number: string
  document_id: number
  party_name: string
  quantity: number
  price: string | null
  line_total: string | null
  status: string
  status_display: string
}

// =============================================================================
// SIMILAR ITEMS
// =============================================================================

export interface SimilarItemEntry {
  id: number
  sku: string
  name: string
  item_type: string
  customer_name: string | null
  length: string | null
  width: string | null
  height: string | null
  dimension_diff: string
  test: string
  flute: string
  paper: string
}

export interface SimilarItemsResponse {
  exact_matches: SimilarItemEntry[]
  close_matches: SimilarItemEntry[]
}

export function useSimilarItems(itemId: number | null) {
  return useQuery({
    queryKey: ['similar-items', itemId],
    queryFn: async () => {
      const { data } = await api.get<SimilarItemsResponse>(`/items/${itemId}/similar/`)
      return data
    },
    enabled: !!itemId,
  })
}

// =============================================================================
// ITEM HISTORY (Item 360)
// =============================================================================

export function useItemHistory(itemId: number | null) {
  return useQuery({
    queryKey: ['item-history', itemId],
    queryFn: async () => {
      const { data } = await api.get<ItemHistoryEntry[]>(`/items/${itemId}/history/`)
      return data
    },
    enabled: !!itemId,
  })
}

// =============================================================================
// PRODUCT CARD
// =============================================================================

export interface ProductCardTier {
  min_quantity: number
  unit_price?: string
  unit_cost?: string
}

export interface ProductCardPriceList {
  id: number
  customer_name: string
  customer_code: string
  customer_id: number
  begin_date: string
  end_date: string | null
  is_active: boolean
  notes: string
  tiers: ProductCardTier[]
}

export interface ProductCardCostList {
  id: number
  vendor_name: string
  vendor_code: string
  vendor_id: number
  begin_date: string
  end_date: string | null
  is_active: boolean
  notes: string
  tiers: ProductCardTier[]
}

export interface ProductCardRFQQuote {
  rfq_id: number
  rfq_number: string
  vendor_name: string
  vendor_code: string
  vendor_id: number
  date: string
  status: string
  status_display: string
  quantity: number
  target_price: string | null
  quoted_price: string | null
  notes: string
}

export interface ProductCardEstimate {
  estimate_id: number
  estimate_number: string
  customer_name: string
  customer_code: string
  customer_id: number
  date: string
  expiration_date: string | null
  status: string
  status_display: string
  quantity: number
  unit_price: string
  notes: string
}

export interface ProductCardLastTransaction {
  price: string
  date: string
  vendor_name?: string
  customer_name?: string
  po_number?: string
  so_number?: string
}

export interface ProductCardVendorInfo {
  vendor_id: number
  vendor_name: string
  vendor_code: string
  mpn: string
  lead_time_days: number | null
  min_order_qty: number | null
  is_preferred: boolean
}

export interface ProductCardItemDetails {
  sku: string
  name: string
  description: string
  purch_desc: string
  sell_desc: string
  division: string
  item_type: string
  is_active: boolean
  customer_name: string | null
  customer_code: string | null
  reorder_point: number | null
  min_stock: number | null
  safety_stock: number | null
  base_uom_code: string
  product_card_notes: string
}

export interface ProductCardResponse {
  item_details: ProductCardItemDetails
  last_buy: ProductCardLastTransaction | null
  last_sell: ProductCardLastTransaction | null
  vendors: ProductCardVendorInfo[]
  price_lists: ProductCardPriceList[]
  cost_lists: ProductCardCostList[]
  rfq_quotes: ProductCardRFQQuote[]
  estimates: ProductCardEstimate[]
}

export function useItemProductCard(itemId: number | null) {
  return useQuery({
    queryKey: ['item-product-card', itemId],
    queryFn: async () => {
      const { data } = await api.get<ProductCardResponse>(`/items/${itemId}/product_card/`)
      return data
    },
    enabled: !!itemId,
  })
}
