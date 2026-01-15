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

    it('shows total count', () => {
      render(<UnscheduledSidebar orders={[...salesOrders, ...purchaseOrders]} />, { wrapper: DndWrapper })

      expect(screen.getByText('4')).toBeInTheDocument()
    })

    it('separates POs and SOs into sections', () => {
      render(<UnscheduledSidebar orders={[...salesOrders, ...purchaseOrders]} />, { wrapper: DndWrapper })

      expect(screen.getByText('Inbound POs')).toBeInTheDocument()
      expect(screen.getByText('Outbound SOs')).toBeInTheDocument()
    })

    it('shows PO count in section header', () => {
      render(<UnscheduledSidebar orders={purchaseOrders} />, { wrapper: DndWrapper })

      // Should show count next to "Inbound POs"
      const poSection = screen.getByText('Inbound POs').closest('div')
      expect(poSection).toHaveTextContent('2')
    })

    it('shows SO count in section header', () => {
      render(<UnscheduledSidebar orders={salesOrders} />, { wrapper: DndWrapper })

      // Should show count next to "Outbound SOs"
      const soSection = screen.getByText('Outbound SOs').closest('div')
      expect(soSection).toHaveTextContent('2')
    })

    it('renders order cards for each order', () => {
      render(<UnscheduledSidebar orders={salesOrders} />, { wrapper: DndWrapper })

      expect(screen.getByText('Customer A')).toBeInTheDocument()
      expect(screen.getByText('Customer B')).toBeInTheDocument()
      expect(screen.getByText('SO-001')).toBeInTheDocument()
      expect(screen.getByText('SO-002')).toBeInTheDocument()
    })

    it('only shows PO section when only POs exist', () => {
      render(<UnscheduledSidebar orders={purchaseOrders} />, { wrapper: DndWrapper })

      expect(screen.getByText('Inbound POs')).toBeInTheDocument()
      expect(screen.queryByText('Outbound SOs')).not.toBeInTheDocument()
    })

    it('only shows SO section when only SOs exist', () => {
      render(<UnscheduledSidebar orders={salesOrders} />, { wrapper: DndWrapper })

      expect(screen.queryByText('Inbound POs')).not.toBeInTheDocument()
      expect(screen.getByText('Outbound SOs')).toBeInTheDocument()
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
