// src/api/accounting.test.tsx
/**
 * Tests for Accounting API hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from './client'
import {
  useAccounts,
  useAccount,
  useCreateAccount,
  useUpdateAccount,
  useJournalEntries,
  useJournalEntry,
  useCreateJournalEntry,
  usePostJournalEntry,
  useReverseJournalEntry,
} from './accounting'
import type { GLAccount, JournalEntry } from '@/types/api'

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

const mockAccount: GLAccount = {
  id: 1,
  code: '1000',
  name: 'Cash',
  description: 'Cash on hand',
  account_type: 'ASSET_CURRENT',
  parent: null,
  parent_name: null,
  is_active: true,
  is_system: false,
  children_count: 2,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockJournalEntry: JournalEntry = {
  id: 1,
  entry_number: 'JE-2026-1',
  date: '2026-01-15',
  memo: 'Test journal entry',
  reference_number: 'REF-001',
  entry_type: 'standard',
  status: 'draft',
  total_debit: '1000.00',
  total_credit: '1000.00',
  is_balanced: true,
  lines: [
    {
      id: 1,
      entry: 1,
      line_number: 10,
      account: 1,
      account_code: '1100',
      account_name: 'Accounts Receivable',
      description: 'AR entry',
      debit: '1000.00',
      credit: '0.00',
    },
    {
      id: 2,
      entry: 1,
      line_number: 20,
      account: 2,
      account_code: '4000',
      account_name: 'Sales Revenue',
      description: 'Revenue entry',
      debit: '0.00',
      credit: '1000.00',
    },
  ],
  posted_at: null,
  posted_by: null,
  created_by: 1,
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
}

const mockPostedEntry: JournalEntry = {
  ...mockJournalEntry,
  id: 2,
  entry_number: 'JE-2026-2',
  status: 'posted',
  posted_at: '2026-01-16T10:00:00Z',
  posted_by: 1,
}

// =============================================================================
// TESTS
// =============================================================================

describe('Accounting API Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Account Hooks ──────────────────────────────────────────────────────────

  describe('useAccounts', () => {
    it('fetches accounts list', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 1, next: null, previous: null, results: [mockAccount] },
      })

      const { result } = renderHook(() => useAccounts(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/accounts/', { params: undefined })
      expect(result.current.data?.results).toHaveLength(1)
      expect(result.current.data?.results[0].code).toBe('1000')
    })

    it('passes filter params', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 0, next: null, previous: null, results: [] },
      })

      const { result } = renderHook(
        () => useAccounts({ account_type: 'ASSET_CURRENT', is_active: true }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/accounts/', {
        params: { account_type: 'ASSET_CURRENT', is_active: true },
      })
    })

    it('passes search param', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 0, next: null, previous: null, results: [] },
      })

      const { result } = renderHook(
        () => useAccounts({ search: 'Cash' }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/accounts/', {
        params: { search: 'Cash' },
      })
    })
  })

  describe('useAccount', () => {
    it('fetches single account by id', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: mockAccount })

      const { result } = renderHook(() => useAccount(1), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/accounts/1/')
      expect(result.current.data?.name).toBe('Cash')
    })

    it('does not fetch when id is 0', async () => {
      const { result } = renderHook(() => useAccount(0), { wrapper: createWrapper() })

      expect(result.current.isLoading).toBe(false)
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  describe('useCreateAccount', () => {
    it('creates a new account', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockAccount })

      const { result } = renderHook(() => useCreateAccount(), { wrapper: createWrapper() })

      await result.current.mutateAsync({
        code: '1000',
        name: 'Cash',
        account_type: 'ASSET_CURRENT',
      })

      expect(api.post).toHaveBeenCalledWith('/accounts/', {
        code: '1000',
        name: 'Cash',
        account_type: 'ASSET_CURRENT',
      })
    })
  })

  describe('useUpdateAccount', () => {
    it('updates an existing account', async () => {
      vi.mocked(api.patch).mockResolvedValue({
        data: { ...mockAccount, name: 'Updated Cash' },
      })

      const { result } = renderHook(() => useUpdateAccount(), { wrapper: createWrapper() })

      await result.current.mutateAsync({ id: 1, name: 'Updated Cash' })

      expect(api.patch).toHaveBeenCalledWith('/accounts/1/', { name: 'Updated Cash' })
    })
  })

  // ─── Journal Entry Hooks ────────────────────────────────────────────────────

  describe('useJournalEntries', () => {
    it('fetches journal entries list', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 1, next: null, previous: null, results: [mockJournalEntry] },
      })

      const { result } = renderHook(() => useJournalEntries(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/journal-entries/', { params: undefined })
      expect(result.current.data?.results).toHaveLength(1)
      expect(result.current.data?.results[0].entry_number).toBe('JE-2026-1')
    })

    it('passes status filter', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 0, next: null, previous: null, results: [] },
      })

      const { result } = renderHook(
        () => useJournalEntries({ status: 'draft' }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/journal-entries/', {
        params: { status: 'draft' },
      })
    })

    it('passes entry_type filter', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { count: 0, next: null, previous: null, results: [] },
      })

      const { result } = renderHook(
        () => useJournalEntries({ entry_type: 'adjusting' }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/journal-entries/', {
        params: { entry_type: 'adjusting' },
      })
    })
  })

  describe('useJournalEntry', () => {
    it('fetches single journal entry by id', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: mockJournalEntry })

      const { result } = renderHook(() => useJournalEntry(1), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/journal-entries/1/')
      expect(result.current.data?.memo).toBe('Test journal entry')
      expect(result.current.data?.is_balanced).toBe(true)
    })

    it('does not fetch when id is 0', async () => {
      const { result } = renderHook(() => useJournalEntry(0), { wrapper: createWrapper() })

      expect(result.current.isLoading).toBe(false)
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  describe('useCreateJournalEntry', () => {
    it('creates a new journal entry', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockJournalEntry })

      const { result } = renderHook(() => useCreateJournalEntry(), { wrapper: createWrapper() })

      const input = {
        date: '2026-01-15',
        memo: 'Test journal entry',
        reference_number: 'REF-001',
        entry_type: 'standard' as const,
        lines: [
          { account: 1, description: 'AR entry', debit: '1000.00', credit: '0.00' },
          { account: 2, description: 'Revenue entry', debit: '0.00', credit: '1000.00' },
        ],
      }

      await result.current.mutateAsync(input)

      expect(api.post).toHaveBeenCalledWith('/journal-entries/', input)
    })
  })

  describe('usePostJournalEntry', () => {
    it('posts a draft journal entry', async () => {
      vi.mocked(api.post).mockResolvedValue({
        data: mockPostedEntry,
      })

      const { result } = renderHook(() => usePostJournalEntry(), { wrapper: createWrapper() })

      await result.current.mutateAsync(1)

      expect(api.post).toHaveBeenCalledWith('/journal-entries/1/post/')
    })
  })

  describe('useReverseJournalEntry', () => {
    it('reverses a posted journal entry', async () => {
      const reversedEntry = { ...mockJournalEntry, id: 3, status: 'reversed' as const }
      vi.mocked(api.post).mockResolvedValue({ data: reversedEntry })

      const { result } = renderHook(() => useReverseJournalEntry(), { wrapper: createWrapper() })

      await result.current.mutateAsync({ id: 2, reversal_date: '2026-01-20', memo: 'Reverse it' })

      expect(api.post).toHaveBeenCalledWith('/journal-entries/2/reverse/', {
        reversal_date: '2026-01-20',
        memo: 'Reverse it',
      })
    })

    it('reverses without optional params', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: mockJournalEntry })

      const { result } = renderHook(() => useReverseJournalEntry(), { wrapper: createWrapper() })

      await result.current.mutateAsync({ id: 2 })

      expect(api.post).toHaveBeenCalledWith('/journal-entries/2/reverse/', {
        reversal_date: undefined,
        memo: undefined,
      })
    })
  })
})
