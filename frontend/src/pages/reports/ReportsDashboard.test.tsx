// src/pages/reports/ReportsDashboard.test.tsx
/**
 * Tests for ReportsDashboard page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import ReportsDashboard from './ReportsDashboard'

// Mock usePageTitle hook
vi.mock('@/hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}))

// Mock useNavigate so we can spy on navigation calls
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// =============================================================================
// HELPERS
// =============================================================================

function renderDashboard() {
  return render(
    <MemoryRouter>
      <ReportsDashboard />
    </MemoryRouter>
  )
}

// =============================================================================
// TESTS
// =============================================================================

describe('ReportsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page title', () => {
    renderDashboard()
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument()
  })

  it('renders all section titles', () => {
    renderDashboard()
    expect(screen.getByText('Sales')).toBeInTheDocument()
    expect(screen.getByText('Purchasing')).toBeInTheDocument()
    expect(screen.getByText('Warehouse & Inventory')).toBeInTheDocument()
    expect(screen.getByText('Financial')).toBeInTheDocument()
  })

  it('renders all report cards', () => {
    renderDashboard()

    // Sales section (4 reports)
    expect(screen.getByText('Sales by Customer')).toBeInTheDocument()
    expect(screen.getByText('Sales by Item')).toBeInTheDocument()
    expect(screen.getByText('Open Orders')).toBeInTheDocument()
    expect(screen.getByText('Backorders')).toBeInTheDocument()

    // Purchasing section (3 reports)
    expect(screen.getByText('Open POs')).toBeInTheDocument()
    expect(screen.getByText('Vendor Performance')).toBeInTheDocument()
    expect(screen.getByText('Purchase History')).toBeInTheDocument()

    // Warehouse & Inventory section (4 reports)
    expect(screen.getByText('Inventory Valuation')).toBeInTheDocument()
    expect(screen.getByText('Stock Status')).toBeInTheDocument()
    expect(screen.getByText('Low Stock Alerts')).toBeInTheDocument()
    expect(screen.getByText('Dead Stock')).toBeInTheDocument()

    // Financial section (2 reports)
    expect(screen.getByText('Sales Tax Liability')).toBeInTheDocument()
    expect(screen.getByText('Gross Margin Detail')).toBeInTheDocument()
  })

  it('navigates when report card clicked', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.click(screen.getByText('Sales by Customer'))

    expect(mockNavigate).toHaveBeenCalledWith('/reports/sales-by-customer')
  })

  it('navigates to correct path for each section', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.click(screen.getByText('Open POs'))
    expect(mockNavigate).toHaveBeenCalledWith('/reports/open-pos')
  })

  it('renders report descriptions', () => {
    renderDashboard()
    expect(screen.getByText('Revenue, orders, and margin by customer')).toBeInTheDocument()
    expect(screen.getByText('Incoming stock sorted by expected date')).toBeInTheDocument()
    expect(screen.getByText('Qty x Cost = Total Value')).toBeInTheDocument()
    expect(screen.getByText('Tax collected by zone')).toBeInTheDocument()
  })
})
