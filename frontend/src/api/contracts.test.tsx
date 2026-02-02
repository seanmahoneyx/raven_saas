// src/api/contracts.test.tsx
/**
 * Tests for Contract API hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from './client'
import {
  useContracts,
  useContract,
  useContractsByCustomer,
  useContractsByItem,
  useActiveContracts,
  useCreateContract,
  useUpdateContract,
  useDeleteContract,
  useActivateContract,
  useCompleteContract,
  useCancelContract,
  useContractLines,
  useAddContractLine,
  useCreateRelease,
} from './contracts'
import type { Contract, ContractLine, ContractRelease } from '@/types/api'

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

const mockContract: Contract = {
  id: 1,
  contract_number: '0001',
  blanket_po: 'PO-12345',
  status: 'draft',
  customer: 1,
  customer_code: 'CUST001',
  customer_name: 'Test Customer',
  issue_date: '2025-01-15',
  start_date: null,
  end_date: null,
  ship_to: null,
  ship_to_name: null,
  notes: 'Test contract notes',
  is_active: false,
  total_committed_qty: 100,
  total_released_qty: 25,
  total_remaining_qty: 75,
  completion_percentage: 25,
  num_lines: 1,
  created_at: '2025-01-15T00:00:00Z',
  updated_at: '2025-01-15T00:00:00Z',
}

const mockActiveContract: Contract = {
  ...mockContract,
  id: 2,
  contract_number: '0002',
  status: 'active',
}

const mockContractLine: ContractLine = {
  id: 1,
  contract: 1,
  line_number: 10,
  item: 1,
  item_sku: 'ITEM-001',
  item_name: 'Test Item',
  blanket_qty: 100,
  uom: 1,
  uom_code: 'ea',
  unit_price: '5.00',
  notes: '',
  released_qty: 25,
  remaining_qty: 75,
  is_fully_released: false,
  releases: [],
  created_at: '2025-01-15T00:00:00Z',
  updated_at: '2025-01-15T00:00:00Z',
}

const mockContractRelease: ContractRelease = {
  id: 1,
  contract_line: 1,
  sales_order_line: 1,
  sales_order_id: 1,
  sales_order_number: '00001',
  sales_order_status: 'confirmed',
  quantity_ordered: 25,
  release_date: '2025-01-20',
  balance_before: 100,
  balance_after: 75,
  notes: '',
  created_at: '2025-01-20T00:00:00Z',
  updated_at: '2025-01-20T00:00:00Z',
}

// =============================================================================
// TESTS
// =============================================================================

describe('Contracts API Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useContracts', () => {
    it('fetches contracts list', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 1, next: null, previous: null, results: [mockContract] },
      })

      const { result } = renderHook(() => useContracts(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/contracts/', { params: undefined })
      expect(result.current.data?.results).toHaveLength(1)
      expect(result.current.data?.results[0].contract_number).toBe('0001')
    })

    it('passes filter params', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 0, next: null, previous: null, results: [] },
      })

      const { result } = renderHook(
        () => useContracts({ status: 'active', customer: 1 }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/contracts/', {
        params: { status: 'active', customer: 1 },
      })
    })

    it('passes search param', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 0, next: null, previous: null, results: [] },
      })

      const { result } = renderHook(
        () => useContracts({ search: 'PO-123' }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/contracts/', {
        params: { search: 'PO-123' },
      })
    })
  })

  describe('useContract', () => {
    it('fetches single contract by id', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: mockContract })

      const { result } = renderHook(() => useContract(1), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/contracts/1/')
      expect(result.current.data?.contract_number).toBe('0001')
    })

    it('does not fetch when id is 0', async () => {
      const { result } = renderHook(() => useContract(0), { wrapper: createWrapper() })

      expect(result.current.isLoading).toBe(false)
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  describe('useContractsByCustomer', () => {
    it('fetches contracts for a customer', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: [mockContract] })

      const { result } = renderHook(() => useContractsByCustomer(1), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/contracts/by_customer/', {
        params: { customer: 1 },
      })
      expect(result.current.data).toHaveLength(1)
    })

    it('does not fetch when customerId is 0', async () => {
      const { result } = renderHook(() => useContractsByCustomer(0), { wrapper: createWrapper() })

      expect(result.current.isLoading).toBe(false)
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  describe('useContractsByItem', () => {
    it('fetches contracts containing an item', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: [mockContract] })

      const { result } = renderHook(() => useContractsByItem(1), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/contracts/by_item/', {
        params: { item: 1 },
      })
    })

    it('does not fetch when itemId is 0', async () => {
      const { result } = renderHook(() => useContractsByItem(0), { wrapper: createWrapper() })

      expect(result.current.isLoading).toBe(false)
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  describe('useActiveContracts', () => {
    it('fetches active contracts', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 1, next: null, previous: null, results: [mockActiveContract] },
      })

      const { result } = renderHook(() => useActiveContracts(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/contracts/active/')
      expect(result.current.data?.results[0].status).toBe('active')
    })
  })

  describe('useCreateContract', () => {
    it('creates a new contract', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockContract })

      const { result } = renderHook(() => useCreateContract(), { wrapper: createWrapper() })

      await result.current.mutateAsync({
        customer: 1,
        blanket_po: 'PO-12345',
        issue_date: '2025-01-15',
        lines: [
          {
            item: 1,
            blanket_qty: 100,
            uom: 1,
            unit_price: '5.00',
          },
        ],
      })

      expect(api.post).toHaveBeenCalledWith('/contracts/', {
        customer: 1,
        blanket_po: 'PO-12345',
        issue_date: '2025-01-15',
        lines: [
          {
            item: 1,
            blanket_qty: 100,
            uom: 1,
            unit_price: '5.00',
          },
        ],
      })
    })
  })

  describe('useUpdateContract', () => {
    it('updates an existing contract', async () => {
      vi.mocked(api.patch).mockResolvedValue({
        data: { ...mockContract, blanket_po: 'PO-UPDATED' },
      })

      const { result } = renderHook(() => useUpdateContract(), { wrapper: createWrapper() })

      await result.current.mutateAsync({ id: 1, blanket_po: 'PO-UPDATED' })

      expect(api.patch).toHaveBeenCalledWith('/contracts/1/', { blanket_po: 'PO-UPDATED' })
    })
  })

  describe('useDeleteContract', () => {
    it('deletes a contract', async () => {
      vi.mocked(api.delete).mockResolvedValue({})

      const { result } = renderHook(() => useDeleteContract(), { wrapper: createWrapper() })

      await result.current.mutateAsync(1)

      expect(api.delete).toHaveBeenCalledWith('/contracts/1/')
    })
  })

  describe('useActivateContract', () => {
    it('activates a draft contract', async () => {
      vi.mocked(api.post).mockResolvedValue({
        data: { ...mockContract, status: 'active' },
      })

      const { result } = renderHook(() => useActivateContract(), { wrapper: createWrapper() })

      await result.current.mutateAsync(1)

      expect(api.post).toHaveBeenCalledWith('/contracts/1/activate/')
    })
  })

  describe('useCompleteContract', () => {
    it('completes an active contract', async () => {
      vi.mocked(api.post).mockResolvedValue({
        data: { ...mockActiveContract, status: 'complete' },
      })

      const { result } = renderHook(() => useCompleteContract(), { wrapper: createWrapper() })

      await result.current.mutateAsync(2)

      expect(api.post).toHaveBeenCalledWith('/contracts/2/complete/')
    })
  })

  describe('useCancelContract', () => {
    it('cancels a contract', async () => {
      vi.mocked(api.post).mockResolvedValue({
        data: { ...mockContract, status: 'cancelled' },
      })

      const { result } = renderHook(() => useCancelContract(), { wrapper: createWrapper() })

      await result.current.mutateAsync(1)

      expect(api.post).toHaveBeenCalledWith('/contracts/1/cancel/')
    })
  })

  describe('useContractLines', () => {
    it('fetches lines for a contract', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: [mockContractLine] })

      const { result } = renderHook(() => useContractLines(1), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/contracts/1/lines/')
      expect(result.current.data).toHaveLength(1)
      expect(result.current.data?.[0].item_sku).toBe('ITEM-001')
    })

    it('does not fetch when contractId is 0', async () => {
      const { result } = renderHook(() => useContractLines(0), { wrapper: createWrapper() })

      expect(result.current.isLoading).toBe(false)
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  describe('useAddContractLine', () => {
    it('adds a line to a contract', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockContractLine })

      const { result } = renderHook(() => useAddContractLine(), { wrapper: createWrapper() })

      await result.current.mutateAsync({
        contractId: 1,
        item: 1,
        blanket_qty: 100,
        uom: 1,
      })

      expect(api.post).toHaveBeenCalledWith('/contracts/1/lines/', {
        item: 1,
        blanket_qty: 100,
        uom: 1,
      })
    })
  })

  describe('useCreateRelease', () => {
    it('creates a release from contract line', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockContractRelease })

      const { result } = renderHook(() => useCreateRelease(), { wrapper: createWrapper() })

      await result.current.mutateAsync({
        contractId: 1,
        contract_line_id: 1,
        quantity: 25,
      })

      expect(api.post).toHaveBeenCalledWith('/contracts/1/create_release/', {
        contract_line_id: 1,
        quantity: 25,
      })
    })

    it('creates a release with custom price', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockContractRelease })

      const { result } = renderHook(() => useCreateRelease(), { wrapper: createWrapper() })

      await result.current.mutateAsync({
        contractId: 1,
        contract_line_id: 1,
        quantity: 10,
        unit_price: '6.50',
      })

      expect(api.post).toHaveBeenCalledWith('/contracts/1/create_release/', {
        contract_line_id: 1,
        quantity: 10,
        unit_price: '6.50',
      })
    })

    it('creates a release with scheduled date', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockContractRelease })

      const { result } = renderHook(() => useCreateRelease(), { wrapper: createWrapper() })

      await result.current.mutateAsync({
        contractId: 1,
        contract_line_id: 1,
        quantity: 25,
        scheduled_date: '2025-02-01',
      })

      expect(api.post).toHaveBeenCalledWith('/contracts/1/create_release/', {
        contract_line_id: 1,
        quantity: 25,
        scheduled_date: '2025-02-01',
      })
    })

    it('creates a release with notes', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockContractRelease })

      const { result } = renderHook(() => useCreateRelease(), { wrapper: createWrapper() })

      await result.current.mutateAsync({
        contractId: 1,
        contract_line_id: 1,
        quantity: 25,
        notes: 'Urgent delivery requested',
      })

      expect(api.post).toHaveBeenCalledWith('/contracts/1/create_release/', {
        contract_line_id: 1,
        quantity: 25,
        notes: 'Urgent delivery requested',
      })
    })
  })
})
