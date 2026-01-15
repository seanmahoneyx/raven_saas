// src/components/scheduler/OrderDetailPanel.test.tsx
/**
 * Tests for the OrderDetailPanel component.
 *
 * This panel shows order details when an order is selected,
 * or a global activity feed when no order is selected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import OrderDetailPanel from './OrderDetailPanel'
import { createMockOrder, createMockPurchaseOrder } from '@/test/mocks'

// Create mock functions
const mockMutateStatus = vi.fn()
const mockMutateNotes = vi.fn()

// Mock the API hooks
vi.mock('@/api/scheduling', () => ({
  useUpdateStatus: () => ({
    mutate: mockMutateStatus,
    isPending: false,
  }),
  useUpdateNotes: () => ({
    mutate: mockMutateNotes,
    isPending: false,
  }),
  useGlobalHistory: () => ({
    data: [],
    isLoading: false,
  }),
}))

// Test wrapper with providers
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {children}
        </BrowserRouter>
      </QueryClientProvider>
    )
  }
}

describe('OrderDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When no order selected (Activity Feed)', () => {
    it('shows Activity title', () => {
      render(<OrderDetailPanel order={null} />, { wrapper: createWrapper() })

      expect(screen.getByText('Activity')).toBeInTheDocument()
    })

    it('shows empty state when no history records', () => {
      render(<OrderDetailPanel order={null} />, { wrapper: createWrapper() })

      expect(screen.getByText('No recent activity')).toBeInTheDocument()
    })

    it('does not show back button when no order selected', () => {
      render(<OrderDetailPanel order={null} />, { wrapper: createWrapper() })

      expect(screen.queryByText('Back')).not.toBeInTheDocument()
    })
  })

  describe('When order selected (Order Details)', () => {
    const mockOrder = createMockOrder({
      number: 'SO-TEST-001',
      party_name: 'Test Customer Inc',
      order_type: 'SO',
      status: 'scheduled',
      priority: 3,
      num_lines: 5,
      total_quantity: 150,
      total_pallets: 8,
      scheduled_date: '2025-01-20',
      scheduled_truck_name: 'Truck A',
      notes: 'Handle with care',
    })

    it('shows order number in title', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      expect(screen.getByText('SO-TEST-001')).toBeInTheDocument()
    })

    it('shows party name', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      expect(screen.getByText('Test Customer Inc')).toBeInTheDocument()
    })

    it('shows order type label for sales order', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      expect(screen.getByText('Sales Order')).toBeInTheDocument()
    })

    it('shows order type label for purchase order', () => {
      const poOrder = createMockPurchaseOrder({ party_name: 'Vendor X' })
      render(<OrderDetailPanel order={poOrder} />, { wrapper: createWrapper() })

      expect(screen.getByText('Purchase Order')).toBeInTheDocument()
    })

    it('shows priority', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      expect(screen.getByText('Priority:')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('shows number of lines', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      expect(screen.getByText('Lines:')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('shows total quantity', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      expect(screen.getByText('Quantity:')).toBeInTheDocument()
      expect(screen.getByText('150')).toBeInTheDocument()
    })

    it('shows pallets when available', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      expect(screen.getByText('Pallets:')).toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
    })

    it('hides pallets when not available', () => {
      const orderWithoutPallets = createMockOrder({ total_pallets: undefined })
      render(<OrderDetailPanel order={orderWithoutPallets} />, { wrapper: createWrapper() })

      expect(screen.queryByText('Pallets:')).not.toBeInTheDocument()
    })

    it('shows schedule info when scheduled', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      expect(screen.getByText('Scheduled:')).toBeInTheDocument()
      expect(screen.getByText(/2025-01-20/)).toBeInTheDocument()
      expect(screen.getByText(/Truck A/)).toBeInTheDocument()
    })

    it('shows back button', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      expect(screen.getByText('Back')).toBeInTheDocument()
    })

    it('calls onClearSelection when back clicked', () => {
      const onClearSelection = vi.fn()
      render(
        <OrderDetailPanel order={mockOrder} onClearSelection={onClearSelection} />,
        { wrapper: createWrapper() }
      )

      fireEvent.click(screen.getByText('Back'))
      expect(onClearSelection).toHaveBeenCalledTimes(1)
    })
  })

  describe('Status buttons', () => {
    const mockOrder = createMockOrder({ status: 'scheduled' })

    it('renders all status options', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      expect(screen.getByText('Scheduled')).toBeInTheDocument()
      expect(screen.getByText('Pick Ticket')).toBeInTheDocument()
      expect(screen.getByText('Shipped')).toBeInTheDocument()
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('Crossdock')).toBeInTheDocument()
    })

    it('highlights current status', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      const scheduledButton = screen.getByText('Scheduled').closest('button')
      expect(scheduledButton).toHaveClass('bg-gray-100')
    })

    it('calls updateStatus when status button clicked', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByText('Pick Ticket'))

      expect(mockMutateStatus).toHaveBeenCalledWith({
        orderType: 'SO',
        orderId: mockOrder.id,
        status: 'picking',
      })
    })
  })

  describe('Notes section', () => {
    const mockOrder = createMockOrder({ notes: 'Existing notes' })

    it('shows notes textarea', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      expect(screen.getByPlaceholderText('Add delivery notes...')).toBeInTheDocument()
    })

    it('displays existing notes', () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      const textarea = screen.getByPlaceholderText('Add delivery notes...') as HTMLTextAreaElement
      expect(textarea.value).toBe('Existing notes')
    })

    it('shows saving indicator when notes changed', async () => {
      render(<OrderDetailPanel order={mockOrder} />, { wrapper: createWrapper() })

      const textarea = screen.getByPlaceholderText('Add delivery notes...')
      fireEvent.change(textarea, { target: { value: 'Updated notes' } })

      await waitFor(() => {
        expect(screen.getByText('saving...')).toBeInTheDocument()
      })
    })
  })
})
