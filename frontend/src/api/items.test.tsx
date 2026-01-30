// src/api/items.test.tsx
/**
 * Tests for Item API hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from './client'
import {
  useItems,
  useItem,
  useCreateItem,
  useUpdateItem,
  useDeleteItem,
  useUnitsOfMeasure,
  useCorrugatedFeatures,
  useItemVendors,
  useCreateBoxItem,
  useUpdateBoxItem,
  useDCItems,
  useRSCItems,
} from './items'
import type { Item, UnitOfMeasure, CorrugatedFeature, ItemVendor, DCItem, RSCItem } from '@/types/api'

// Mock the API client
vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

// Test wrapper with fresh QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

// =============================================================================
// MOCK DATA
// =============================================================================

const mockUOM: UnitOfMeasure = {
  id: 1,
  code: 'ea',
  name: 'Each',
  description: 'Single unit',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}

const mockItem: Item = {
  id: 1,
  sku: 'ITEM-001',
  name: 'Test Item',
  division: 'misc',
  revision: null,
  description: 'Test description',
  purch_desc: '',
  sell_desc: '',
  base_uom: 1,
  base_uom_code: 'ea',
  customer: null,
  units_per_layer: null,
  layers_per_pallet: null,
  units_per_pallet: null,
  unit_height: null,
  pallet_height: null,
  pallet_footprint: '',
  is_inventory: true,
  is_active: true,
  attachment: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}

const mockRSCItem: RSCItem = {
  ...mockItem,
  id: 2,
  sku: 'RSC-001',
  name: 'RSC Box 12x10x8',
  division: 'corrugated',
  test: 'ect32',
  flute: 'c',
  paper: 'k',
  is_printed: false,
  panels_printed: null,
  colors_printed: null,
  ink_list: '',
  length: '12.0000',
  width: '10.0000',
  height: '8.0000',
}

const mockDCItem: DCItem = {
  ...mockItem,
  id: 3,
  sku: 'DC-001',
  name: 'Die Cut Tray',
  division: 'corrugated',
  test: 'ect32',
  flute: 'b',
  paper: 'k',
  is_printed: true,
  panels_printed: 1,
  colors_printed: 2,
  ink_list: 'Black, Red',
  length: '12.5000',
  width: '8.2500',
  blank_length: '24.0000',
  blank_width: '18.0000',
  out_per_rotary: 4,
}

const mockFeature: CorrugatedFeature = {
  id: 1,
  code: 'handhole',
  name: 'Handholes',
  requires_details: false,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}

const mockItemVendor: ItemVendor = {
  id: 1,
  item: 1,
  vendor: 1,
  vendor_code: 'VND001',
  vendor_name: 'Test Vendor',
  mpn: 'ABC-12345',
  lead_time_days: 14,
  min_order_qty: 100,
  is_preferred: true,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}

// =============================================================================
// TESTS
// =============================================================================

describe('Items API Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useItems', () => {
    it('fetches items list', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 1, next: null, previous: null, results: [mockItem] },
      })

      const { result } = renderHook(() => useItems(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/items/', { params: undefined })
      expect(result.current.data?.results).toHaveLength(1)
      expect(result.current.data?.results[0].sku).toBe('ITEM-001')
    })

    it('passes search params', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 0, next: null, previous: null, results: [] },
      })

      const { result } = renderHook(
        () => useItems({ search: 'widget', is_active: true }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/items/', {
        params: { search: 'widget', is_active: true },
      })
    })

    it('filters by division', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 1, next: null, previous: null, results: [mockRSCItem] },
      })

      const { result } = renderHook(
        () => useItems({ division: 'corrugated' }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/items/', {
        params: { division: 'corrugated' },
      })
    })
  })

  describe('useItem', () => {
    it('fetches single item by id', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: mockItem })

      const { result } = renderHook(() => useItem(1), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/items/1/')
      expect(result.current.data?.sku).toBe('ITEM-001')
    })

    it('does not fetch when id is null', async () => {
      const { result } = renderHook(() => useItem(null), { wrapper: createWrapper() })

      expect(result.current.isLoading).toBe(false)
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  describe('useCreateItem', () => {
    it('creates a new item', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockItem })

      const { result } = renderHook(() => useCreateItem(), { wrapper: createWrapper() })

      await result.current.mutateAsync({
        sku: 'ITEM-001',
        name: 'Test Item',
        division: 'misc',
        base_uom: 1,
      })

      expect(api.post).toHaveBeenCalledWith('/items/', {
        sku: 'ITEM-001',
        name: 'Test Item',
        division: 'misc',
        base_uom: 1,
      })
    })
  })

  describe('useUpdateItem', () => {
    it('updates an existing item', async () => {
      vi.mocked(api.patch).mockResolvedValue({
        data: { ...mockItem, name: 'Updated Name' },
      })

      const { result } = renderHook(() => useUpdateItem(), { wrapper: createWrapper() })

      await result.current.mutateAsync({ id: 1, name: 'Updated Name' })

      expect(api.patch).toHaveBeenCalledWith('/items/1/', { name: 'Updated Name' })
    })
  })

  describe('useDeleteItem', () => {
    it('deletes an item', async () => {
      vi.mocked(api.delete).mockResolvedValue({})

      const { result } = renderHook(() => useDeleteItem(), { wrapper: createWrapper() })

      await result.current.mutateAsync(1)

      expect(api.delete).toHaveBeenCalledWith('/items/1/')
    })
  })

  describe('useUnitsOfMeasure', () => {
    it('fetches UOM list', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 1, next: null, previous: null, results: [mockUOM] },
      })

      const { result } = renderHook(() => useUnitsOfMeasure(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/uom/')
      expect(result.current.data?.results[0].code).toBe('ea')
    })
  })

  describe('useCorrugatedFeatures', () => {
    it('fetches corrugated features', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 1, next: null, previous: null, results: [mockFeature] },
      })

      const { result } = renderHook(() => useCorrugatedFeatures(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/corrugated-features/')
      expect(result.current.data?.results[0].code).toBe('handhole')
    })
  })

  describe('useItemVendors', () => {
    it('fetches vendors for an item', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: [mockItemVendor] })

      const { result } = renderHook(() => useItemVendors(1), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/items/1/vendors/')
      expect(result.current.data?.[0].mpn).toBe('ABC-12345')
    })

    it('does not fetch when itemId is null', async () => {
      const { result } = renderHook(() => useItemVendors(null), { wrapper: createWrapper() })

      expect(result.current.isLoading).toBe(false)
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  describe('useRSCItems', () => {
    it('fetches RSC items list', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 1, next: null, previous: null, results: [mockRSCItem] },
      })

      const { result } = renderHook(() => useRSCItems(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/rsc-items/', { params: undefined })
      expect(result.current.data?.results[0].length).toBe('12.0000')
    })
  })

  describe('useDCItems', () => {
    it('fetches DC items list', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 1, next: null, previous: null, results: [mockDCItem] },
      })

      const { result } = renderHook(() => useDCItems(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/dc-items/', { params: undefined })
      expect(result.current.data?.results[0].out_per_rotary).toBe(4)
    })
  })

  describe('useCreateBoxItem', () => {
    it('creates RSC item via rsc-items endpoint', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockRSCItem })

      const { result } = renderHook(() => useCreateBoxItem('rsc'), { wrapper: createWrapper() })

      await result.current.mutateAsync({
        sku: 'RSC-001',
        name: 'RSC Box',
        base_uom: 1,
        length: '12.0',
        width: '10.0',
        height: '8.0',
      })

      expect(api.post).toHaveBeenCalledWith('/rsc-items/', expect.objectContaining({
        sku: 'RSC-001',
        length: '12.0',
      }))
    })

    it('creates DC item via dc-items endpoint', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockDCItem })

      const { result } = renderHook(() => useCreateBoxItem('dc'), { wrapper: createWrapper() })

      await result.current.mutateAsync({
        sku: 'DC-001',
        name: 'DC Tray',
        base_uom: 1,
        length: '12.5',
        width: '8.25',
        blank_length: '24.0',
        blank_width: '18.0',
        out_per_rotary: 4,
      })

      expect(api.post).toHaveBeenCalledWith('/dc-items/', expect.objectContaining({
        sku: 'DC-001',
        out_per_rotary: 4,
      }))
    })
  })

  describe('useUpdateBoxItem', () => {
    it('updates RSC item via rsc-items endpoint', async () => {
      vi.mocked(api.patch).mockResolvedValue({
        data: { ...mockRSCItem, name: 'Updated RSC' },
      })

      const { result } = renderHook(() => useUpdateBoxItem('rsc'), { wrapper: createWrapper() })

      await result.current.mutateAsync({ id: 2, name: 'Updated RSC' })

      expect(api.patch).toHaveBeenCalledWith('/rsc-items/2/', { name: 'Updated RSC' })
    })

    it('updates HSC item via hsc-items endpoint', async () => {
      vi.mocked(api.patch).mockResolvedValue({ data: {} })

      const { result } = renderHook(() => useUpdateBoxItem('hsc'), { wrapper: createWrapper() })

      await result.current.mutateAsync({ id: 5, length: '15.0' })

      expect(api.patch).toHaveBeenCalledWith('/hsc-items/5/', { length: '15.0' })
    })
  })
})
