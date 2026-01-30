// src/components/scheduler/UnscheduledSidebar.test.tsx
/**
 * Tests for the UnscheduledSidebar component.
 *
 * This sidebar shows orders that haven't been scheduled yet,
 * separated into POs (inbound) and SOs (outbound) sections.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import UnscheduledSidebar from './UnscheduledSidebar'
import { createMockUnscheduledOrder, createMockPurchaseOrder } from '@/test/mocks'

// Wrapper with DnD context
function DndWrapper({ children }: { children: ReactNode }) {
  return <DndContext>{children}</DndContext>
}

describe('UnscheduledSidebar', () => {
  describe('Empty state', () => {
    it('shows empty message when no orders', () => {
      render(<UnscheduledSidebar orders={[]} />, { wrapper: DndWrapper })

      expect(screen.getByText('All orders scheduled')).toBeInTheDocument()
    })

    it('shows count of zero', () => {
      render(<UnscheduledSidebar orders={[]} />, { wrapper: DndWrapper })

      expect(screen.getByText('0')).toBeInTheDocument()
    })
  })

  describe('With orders', () => {
    const salesOrders = [
      createMockUnscheduledOrder({ id: 1, order_type: 'SO', number: 'SO-001', party_name: 'Customer A' }),
      createMockUnscheduledOrder({ id: 2, order_type: 'SO', number: 'SO-002', party_name: 'Customer B' }),
    ]

    const purchaseOrders = [
      createMockPurchaseOrder({ id: 3, order_type: 'PO', number: 'PO-001', party_name: 'Vendor X', scheduled_date: null }),
      createMockPurchaseOrder({ id: 4, order_type: 'PO', number: 'PO-002', party_name: 'Vendor Y', scheduled_date: null }),
    ]

    it('shows count of sales orders only', () => {
      // Sidebar only shows SOs, so count should be 2 even with 4 total orders
      render(<UnscheduledSidebar orders={[...salesOrders, ...purchaseOrders]} />, { wrapper: DndWrapper })

      // Count appears in header (displayed as "2" for SO count only, not all 4 orders)
      const countElements = screen.getAllByText('2')
      expect(countElements.length).toBeGreaterThan(0)
    })

    it('shows SO section header', () => {
      render(<UnscheduledSidebar orders={salesOrders} />, { wrapper: DndWrapper })

      expect(screen.getByText('Outbound SOs')).toBeInTheDocument()
    })

    it('shows SO count in section header', () => {
      render(<UnscheduledSidebar orders={salesOrders} />, { wrapper: DndWrapper })

      // Should show count next to "Outbound SOs"
      const soSection = screen.getByText('Outbound SOs').closest('div')
      expect(soSection).toHaveTextContent('2')
    })

    it('renders order cards for sales orders', () => {
      render(<UnscheduledSidebar orders={salesOrders} />, { wrapper: DndWrapper })

      expect(screen.getByText('Customer A')).toBeInTheDocument()
      expect(screen.getByText('Customer B')).toBeInTheDocument()
      expect(screen.getByText('SO-001')).toBeInTheDocument()
      expect(screen.getByText('SO-002')).toBeInTheDocument()
    })

    it('does not render purchase orders', () => {
      // POs are not shown in the unscheduled sidebar
      render(<UnscheduledSidebar orders={[...salesOrders, ...purchaseOrders]} />, { wrapper: DndWrapper })

      expect(screen.queryByText('Vendor X')).not.toBeInTheDocument()
      expect(screen.queryByText('Vendor Y')).not.toBeInTheDocument()
    })

    it('shows empty state when only POs exist', () => {
      // Since sidebar only shows SOs, having only POs means empty state
      render(<UnscheduledSidebar orders={purchaseOrders} />, { wrapper: DndWrapper })

      expect(screen.getByText('All orders scheduled')).toBeInTheDocument()
    })
  })

  describe('Click handling', () => {
    const orders = [
      createMockUnscheduledOrder({ id: 1, order_type: 'SO', number: 'SO-001', party_name: 'Test Customer' }),
    ]

    it('calls onOrderClick when order clicked', () => {
      const onOrderClick = vi.fn()
      render(<UnscheduledSidebar orders={orders} onOrderClick={onOrderClick} />, { wrapper: DndWrapper })

      fireEvent.click(screen.getByText('Test Customer'))
      expect(onOrderClick).toHaveBeenCalledWith(orders[0])
    })
  })

  describe('Styling', () => {
    it('has correct width', () => {
      const { container } = render(<UnscheduledSidebar orders={[]} />, { wrapper: DndWrapper })

      const sidebar = container.querySelector('.w-56')
      expect(sidebar).toBeInTheDocument()
    })

    it('has shadow styling', () => {
      const { container } = render(<UnscheduledSidebar orders={[]} />, { wrapper: DndWrapper })

      const sidebar = container.querySelector('.shadow-lg')
      expect(sidebar).toBeInTheDocument()
    })
  })
})
