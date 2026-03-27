// src/pages/CreateItem.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CreateItem from './CreateItem'
import type { UnitOfMeasure, Party } from '@/types/api'

// ── Mocks ──

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))

const mockCreateItem = vi.fn()
const mockCreateBoxItem = vi.fn()
const mockCreatePkgItem = vi.fn()

vi.mock('@/api/items', () => ({
  useCreateItem: () => ({ mutateAsync: mockCreateItem, isPending: false }),
  useCreateBoxItem: () => ({ mutateAsync: mockCreateBoxItem, isPending: false }),
  useCreatePackagingItem: () => ({ mutateAsync: mockCreatePkgItem, isPending: false }),
  useUnitsOfMeasure: () => ({
    data: {
      results: [
        { id: 1, code: 'ea', name: 'Each' },
        { id: 2, code: 'cs', name: 'Case' },
      ] as UnitOfMeasure[],
    },
  }),
  useNextMspn: () => ({ data: 'MSPN-000042' }),
}))

vi.mock('@/api/parties', () => ({
  useParties: () => ({
    data: {
      results: [
        { id: 1, code: 'CUST001', display_name: 'Acme Corp' },
      ] as Party[],
    },
  }),
}))

// ── Helpers ──

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

function renderPage() {
  return render(<CreateItem />, { wrapper: createWrapper() })
}

// ── Tests ──

describe('CreateItem Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── 1. MSPN label shows "(Auto-generated)" inline ───

  describe('MSPN label', () => {
    it('shows Auto-generated text inline with MSPN label', () => {
      renderPage()
      const label = screen.getByText((_, el) =>
        el?.tagName === 'LABEL' && !!el?.textContent?.includes('MSPN') && !!el?.textContent?.includes('(Auto-generated)')
      )
      expect(label).toBeInTheDocument()
    })

    it('shows the next MSPN value in a disabled input', () => {
      renderPage()
      expect(screen.getByDisplayValue('MSPN-000042')).toBeInTheDocument()
      expect(screen.getByDisplayValue('MSPN-000042')).toBeDisabled()
    })

    it('does NOT show Auto-generated as standalone text below input', () => {
      renderPage()
      // Should not exist as a separate standalone element
      const standaloneAuto = screen.queryByText('Auto-generated')
      // It should only exist inside the label, not as separate text
      if (standaloneAuto) {
        expect(standaloneAuto.closest('label')).not.toBeNull()
      }
    })
  })

  // ─── 2. Row order: MSPN, Customer, Ident / Item Type, Division, UoM, Active ───

  describe('Row ordering', () => {
    it('row 1 has MSPN, Customer, Ident in correct order', () => {
      renderPage()
      const labels = screen.getAllByText((text, el) => {
        if (el?.tagName !== 'LABEL') return false
        return ['MSPN', 'Customer', 'Ident'].some(l => text.includes(l))
      })
      const labelTexts = labels.map(l => l.textContent?.trim() || '')
      const mspnIdx = labelTexts.findIndex(t => t.includes('MSPN'))
      const custIdx = labelTexts.findIndex(t => t === 'Customer')
      const identIdx = labelTexts.findIndex(t => t.includes('Ident'))
      expect(mspnIdx).toBeLessThan(custIdx)
      expect(custIdx).toBeLessThan(identIdx)
    })

    it('row 2 has Item Type, Division, UoM, Active Status', () => {
      renderPage()
      expect(screen.getByText('Item Type')).toBeInTheDocument()
      expect(screen.getByText('Division *')).toBeInTheDocument()
      expect(screen.getByText('UoM *')).toBeInTheDocument()
      expect(screen.getByText('Active Status')).toBeInTheDocument()
    })
  })

  // ─── 3. Ident placeholder ───

  describe('Ident placeholder', () => {
    it('has placeholder "Ident" not "Item identifier"', () => {
      renderPage()
      expect(screen.getByPlaceholderText('Ident')).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Item identifier')).not.toBeInTheDocument()
    })
  })

  // ─── 4. Dimension fraction/decimal support ───

  describe('Dimension fraction/decimal', () => {
    it('shows fraction display toggle button', () => {
      renderPage()
      // Default division is corrugated, so dimensions section is visible
      expect(screen.getByText('Dimensions (inches)')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Fraction/i })).toBeInTheDocument()
    })

    it('toggles display mode between fraction and decimal', async () => {
      const user = userEvent.setup()
      renderPage()
      const toggle = screen.getByRole('button', { name: /Fraction/i })
      await user.click(toggle)
      expect(screen.getByRole('button', { name: /Decimal/i })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /Decimal/i }))
      expect(screen.getByRole('button', { name: /Fraction/i })).toBeInTheDocument()
    })

    it('converts decimal to fraction on blur (fraction mode)', async () => {
      const user = userEvent.setup()
      renderPage()
      const lengthInput = screen.getByPlaceholderText('L')
      await user.type(lengthInput, '12.75')
      await user.tab() // blur
      await waitFor(() => {
        expect(lengthInput).toHaveValue('12+3/4')
      })
    })

    it('converts decimal to fraction rounded to 1/16th on blur', async () => {
      const user = userEvent.setup()
      renderPage()
      const lengthInput = screen.getByPlaceholderText('L')
      // 5.3 → nearest 1/16 = 5.3125 = 5+5/16
      await user.type(lengthInput, '5.3')
      await user.tab()
      await waitFor(() => {
        expect(lengthInput).toHaveValue('5+5/16')
      })
    })

    it('keeps fraction input as-is on blur in fraction mode', async () => {
      const user = userEvent.setup()
      renderPage()
      const lengthInput = screen.getByPlaceholderText('L')
      await user.type(lengthInput, '10+1/2')
      await user.tab()
      await waitFor(() => {
        expect(lengthInput).toHaveValue('10+1/2')
      })
    })

    it('converts decimal to decimal on blur (decimal mode)', async () => {
      const user = userEvent.setup()
      renderPage()
      // Switch to decimal mode
      await user.click(screen.getByRole('button', { name: /Fraction/i }))
      const lengthInput = screen.getByPlaceholderText('L')
      await user.type(lengthInput, '12.75')
      await user.tab()
      await waitFor(() => {
        expect(lengthInput).toHaveValue('12.75')
      })
    })

    it('converts fraction input to decimal on blur (decimal mode)', async () => {
      const user = userEvent.setup()
      renderPage()
      // Switch to decimal mode
      await user.click(screen.getByRole('button', { name: /Fraction/i }))
      const lengthInput = screen.getByPlaceholderText('L')
      await user.type(lengthInput, '10+1/2')
      await user.tab()
      await waitFor(() => {
        expect(lengthInput).toHaveValue('10.5')
      })
    })

    it('shows L, W, H for non-DC box types', () => {
      renderPage()
      expect(screen.getByPlaceholderText('L')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('W')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('H')).toBeInTheDocument()
    })

    it('converts whole numbers without fraction part', async () => {
      const user = userEvent.setup()
      renderPage()
      const lengthInput = screen.getByPlaceholderText('L')
      await user.type(lengthInput, '12')
      await user.tab()
      await waitFor(() => {
        expect(lengthInput).toHaveValue('12')
      })
    })
  })

  // ─── 5. Ink color boxes based on Colors count ───

  describe('Ink color boxes', () => {
    it('shows no ink color inputs when printing is off', () => {
      renderPage()
      expect(screen.queryByPlaceholderText('Color 1')).not.toBeInTheDocument()
    })

    it('shows no ink color inputs when Colors is 0', async () => {
      const user = userEvent.setup()
      renderPage()
      // Enable printing
      const printSwitch = screen.getByLabelText('Plain')
      await user.click(printSwitch)
      // Colors defaults to empty/0
      expect(screen.queryByPlaceholderText('Color 1')).not.toBeInTheDocument()
    })

    it('shows discrete ink color inputs matching Colors count', async () => {
      const user = userEvent.setup()
      renderPage()
      // Enable printing
      const printSwitch = screen.getByLabelText('Plain')
      await user.click(printSwitch)
      // Find the Colors input (second "0" placeholder after Panels Printed)
      const colorsInputs = screen.getAllByPlaceholderText('0')
      const colorCountInput = colorsInputs[1]
      await user.clear(colorCountInput)
      await user.type(colorCountInput, '3')
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Color 1')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Color 2')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Color 3')).toBeInTheDocument()
        expect(screen.queryByPlaceholderText('Color 4')).not.toBeInTheDocument()
      })
    })

    it('allows typing ink color names into discrete boxes', async () => {
      const user = userEvent.setup()
      renderPage()
      // Enable printing
      await user.click(screen.getByLabelText('Plain'))
      // Set 2 colors
      const colorsInputs = screen.getAllByPlaceholderText('0')
      await user.clear(colorsInputs[1])
      await user.type(colorsInputs[1], '2')
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Color 1')).toBeInTheDocument()
      })
      const color1 = screen.getByPlaceholderText('Color 1')
      const color2 = screen.getByPlaceholderText('Color 2')
      await user.type(color1, 'PMS 286')
      await user.type(color2, 'Black')
      expect(color1).toHaveValue('PMS 286')
      expect(color2).toHaveValue('Black')
    })

    it('reduces ink color boxes when Colors count decreases', async () => {
      const user = userEvent.setup()
      renderPage()
      await user.click(screen.getByLabelText('Plain'))
      const colorsInputs = screen.getAllByPlaceholderText('0')
      await user.clear(colorsInputs[1])
      await user.type(colorsInputs[1], '3')
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Color 3')).toBeInTheDocument()
      })
      // Reduce to 1
      await user.clear(colorsInputs[1])
      await user.type(colorsInputs[1], '1')
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Color 1')).toBeInTheDocument()
        expect(screen.queryByPlaceholderText('Color 2')).not.toBeInTheDocument()
        expect(screen.queryByPlaceholderText('Color 3')).not.toBeInTheDocument()
      })
    })
  })

  // ─── General rendering ───

  // ─── 6. Packaging division support ───

  describe('Packaging division', () => {
    async function switchToPackaging() {
      const user = userEvent.setup()
      renderPage()
      // The Division dropdown is the second Select on the page (row 2)
      // Find the Division select and change it
      const divisionTrigger = screen.getByText('Corrugated') // default value shown
      await user.click(divisionTrigger)
      const packagingOption = await screen.findByRole('option', { name: 'Packaging' })
      await user.click(packagingOption)
      return user
    }

    it('shows Packaging Specifications section when division is Packaging', async () => {
      await switchToPackaging()
      await waitFor(() => {
        expect(screen.getByText('Packaging Specifications')).toBeInTheDocument()
      })
    })

    it('hides Board Specifications when division is Packaging', async () => {
      await switchToPackaging()
      await waitFor(() => {
        expect(screen.queryByText('Board Specifications')).not.toBeInTheDocument()
      })
    })

    it('shows Type selector with packaging sub-types', async () => {
      const user = await switchToPackaging()
      await waitFor(() => {
        expect(screen.getByText('Type *')).toBeInTheDocument()
      })
      // Open sub-type dropdown - find the "Bags" text (default value)
      const typeTrigger = screen.getByText('Bags')
      await user.click(typeTrigger)
      // Verify some sub-type options exist
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Tape' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Stretch' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Bubble' })).toBeInTheDocument()
      })
    })

    it('shows Material field for packaging', async () => {
      await switchToPackaging()
      await waitFor(() => {
        expect(screen.getByPlaceholderText('e.g., Poly, Kraft')).toBeInTheDocument()
      })
    })

    it('hides Print Method section when division is Packaging', async () => {
      await switchToPackaging()
      await waitFor(() => {
        expect(screen.queryByText('Print Method')).not.toBeInTheDocument()
      })
    })
  })

  // ─── General rendering ───

  describe('General rendering', () => {
    it('renders page title and header', () => {
      renderPage()
      expect(screen.getByText('Create New Item')).toBeInTheDocument()
      expect(screen.getByText('Add a new product to your catalog')).toBeInTheDocument()
    })

    it('shows Create Item button', () => {
      renderPage()
      expect(screen.getByRole('button', { name: /Create Item/i })).toBeInTheDocument()
    })

    it('shows Cancel button', () => {
      renderPage()
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    })

    it('shows Board Specifications section for corrugated', () => {
      renderPage()
      expect(screen.getByText('Board Specifications')).toBeInTheDocument()
    })

    it('shows Printing section for corrugated', () => {
      renderPage()
      expect(screen.getByText('Printing')).toBeInTheDocument()
    })

    it('shows Descriptions section', () => {
      renderPage()
      expect(screen.getByText('Descriptions')).toBeInTheDocument()
    })

    it('shows Unitizing / Pallet section', () => {
      renderPage()
      expect(screen.getByText('Unitizing / Pallet')).toBeInTheDocument()
    })

    it('navigates back on Cancel click', async () => {
      const user = userEvent.setup()
      renderPage()
      await user.click(screen.getByRole('button', { name: /Cancel/i }))
      expect(mockNavigate).toHaveBeenCalledWith(-1)
    })
  })
})
