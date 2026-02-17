// src/components/reports/ReportViewer.test.tsx
/**
 * Tests for ReportViewer component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReportViewer from './ReportViewer'
import type { ReportColumn } from './ReportViewer'

// =============================================================================
// SHARED TEST DATA
// =============================================================================

const columns: ReportColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'amount', header: 'Amount', align: 'right', format: 'currency', summable: true },
  { key: 'pct', header: 'Percent', align: 'right', format: 'percent' },
]

const rows = [
  { name: 'Alpha Corp', amount: 1500, pct: 45 },
  { name: 'Beta Inc', amount: 2500, pct: 55 },
]

// =============================================================================
// TESTS
// =============================================================================

describe('ReportViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title', () => {
    render(<ReportViewer title="Test Report" columns={columns} rows={rows} />)
    expect(screen.getByText('Test Report')).toBeInTheDocument()
  })

  it('renders column headers', () => {
    const twoColumns: ReportColumn[] = [
      { key: 'name', header: 'Name' },
      { key: 'amount', header: 'Amount' },
    ]
    render(<ReportViewer title="Test Report" columns={twoColumns} rows={rows} />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Amount')).toBeInTheDocument()
  })

  it('renders row data', () => {
    render(<ReportViewer title="Test Report" columns={columns} rows={rows} />)
    expect(screen.getByText('Alpha Corp')).toBeInTheDocument()
    expect(screen.getByText('Beta Inc')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<ReportViewer title="Test Report" columns={columns} rows={[]} isLoading />)
    expect(screen.getByText('Loading report...')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    render(<ReportViewer title="Test Report" columns={columns} rows={[]} />)
    expect(screen.getByText('No data for this report')).toBeInTheDocument()
  })

  it('shows row count', () => {
    const threeRows = [
      { name: 'Alpha Corp', amount: 1000, pct: 30 },
      { name: 'Beta Inc', amount: 2000, pct: 40 },
      { name: 'Gamma LLC', amount: 3000, pct: 30 },
    ]
    render(<ReportViewer title="Test Report" columns={columns} rows={threeRows} />)
    expect(screen.getByText('(3 rows)')).toBeInTheDocument()
  })

  it('formats currency values', () => {
    const currencyColumns: ReportColumn[] = [
      { key: 'name', header: 'Name' },
      { key: 'amount', header: 'Amount', format: 'currency' },
    ]
    render(<ReportViewer title="Test Report" columns={currencyColumns} rows={rows} />)
    // Intl.NumberFormat formats 1500 as $1,500
    expect(screen.getByText('$1,500')).toBeInTheDocument()
    expect(screen.getByText('$2,500')).toBeInTheDocument()
  })

  it('formats percent values', () => {
    render(<ReportViewer title="Test Report" columns={columns} rows={rows} />)
    expect(screen.getByText('45%')).toBeInTheDocument()
    expect(screen.getByText('55%')).toBeInTheDocument()
  })

  it('renders CSV button when onExportCsv provided', () => {
    render(<ReportViewer title="Test Report" columns={columns} rows={rows} onExportCsv={vi.fn()} />)
    expect(screen.getByRole('button', { name: /CSV/i })).toBeInTheDocument()
  })

  it('does not render CSV button when onExportCsv not provided', () => {
    render(<ReportViewer title="Test Report" columns={columns} rows={rows} />)
    expect(screen.queryByRole('button', { name: /CSV/i })).not.toBeInTheDocument()
  })

  it('calls onExportCsv when CSV button clicked', async () => {
    const user = userEvent.setup()
    const onExportCsv = vi.fn()
    render(<ReportViewer title="Test Report" columns={columns} rows={rows} onExportCsv={onExportCsv} />)

    await user.click(screen.getByRole('button', { name: /CSV/i }))

    expect(onExportCsv).toHaveBeenCalledOnce()
  })

  it('filters rows by text', async () => {
    const user = userEvent.setup()
    render(<ReportViewer title="Test Report" columns={columns} rows={rows} />)

    const filterInput = screen.getByPlaceholderText('Filter...')
    await user.type(filterInput, 'Alpha')

    expect(screen.getByText('Alpha Corp')).toBeInTheDocument()
    expect(screen.queryByText('Beta Inc')).not.toBeInTheDocument()
  })

  it('sorts by clicking column header', async () => {
    const user = userEvent.setup()
    const unsortedRows = [
      { name: 'Zebra Co', amount: 500, pct: 10 },
      { name: 'Alpha Corp', amount: 1500, pct: 45 },
    ]
    render(<ReportViewer title="Test Report" columns={columns} rows={unsortedRows} />)

    // Click the Name header to sort ascending
    await user.click(screen.getByText('Name'))

    const cells = screen.getAllByRole('cell')
    const nameCells = cells.filter(cell => ['Alpha Corp', 'Zebra Co'].includes(cell.textContent ?? ''))
    // After ascending sort: Alpha Corp should appear before Zebra Co
    expect(nameCells[0]).toHaveTextContent('Alpha Corp')
    expect(nameCells[1]).toHaveTextContent('Zebra Co')
  })

  it('renders summary row for summable columns', () => {
    render(<ReportViewer title="Test Report" columns={columns} rows={rows} />)
    // The summary row label
    expect(screen.getByText('TOTAL')).toBeInTheDocument()
    // Sum of amounts: 1500 + 2500 = 4000
    expect(screen.getByText('$4,000')).toBeInTheDocument()
  })
})
