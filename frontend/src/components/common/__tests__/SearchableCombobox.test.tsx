// src/components/common/__tests__/SearchableCombobox.test.tsx
/**
 * Tests for SearchableCombobox component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchableCombobox } from '../SearchableCombobox'
import type { SuggestionsResponse, UserFavorite } from '@/types/api'

// ── Mock API hooks ────────────────────────────────────────────────────────────

const mockAddFavorite = vi.fn()
const mockRemoveFavorite = vi.fn()

vi.mock('@/api/favorites', () => ({
  useSuggestions: vi.fn(),
  useFavorites: vi.fn(),
  useAddFavorite: vi.fn(),
  useRemoveFavorite: vi.fn(),
}))

// Import after mock so we can control return values per test
import {
  useSuggestions,
  useFavorites,
  useAddFavorite,
  useRemoveFavorite,
} from '@/api/favorites'

// ── Helpers ───────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const emptySuggestions: SuggestionsResponse = {
  favorites: [],
  recents: [],
  results: [],
}

const richSuggestions: SuggestionsResponse = {
  favorites: [
    { id: 1, label: 'Acme Corp', is_favorite: true },
    { id: 2, label: 'Beta LLC', is_favorite: true },
  ],
  recents: [
    { id: 3, label: 'Gamma Inc', is_favorite: false },
  ],
  results: [
    { id: 4, label: 'Delta Co', is_favorite: false },
  ],
}

const mockFavorites: UserFavorite[] = [
  { id: 10, entity_type: 'customer', object_id: 1, label: 'Acme Corp', created_at: '2025-01-01T00:00:00Z' },
  { id: 11, entity_type: 'customer', object_id: 2, label: 'Beta LLC', created_at: '2025-01-01T00:00:00Z' },
]

function setupMocks(
  suggestions: SuggestionsResponse | undefined = emptySuggestions,
  favorites: UserFavorite[] = mockFavorites,
) {
  vi.mocked(useSuggestions).mockReturnValue({ data: suggestions } as ReturnType<typeof useSuggestions>)
  vi.mocked(useFavorites).mockReturnValue({ data: favorites } as ReturnType<typeof useFavorites>)
  vi.mocked(useAddFavorite).mockReturnValue({ mutate: mockAddFavorite } as unknown as ReturnType<typeof useAddFavorite>)
  vi.mocked(useRemoveFavorite).mockReturnValue({ mutate: mockRemoveFavorite } as unknown as ReturnType<typeof useRemoveFavorite>)
}

function renderCombobox(props: Partial<React.ComponentProps<typeof SearchableCombobox>> = {}) {
  const defaultProps: React.ComponentProps<typeof SearchableCombobox> = {
    entityType: 'customer',
    value: null,
    onChange: vi.fn(),
    placeholder: 'Select customer…',
  }
  return render(
    <SearchableCombobox {...defaultProps} {...props} />,
    { wrapper: createWrapper() },
  )
}

// =============================================================================
// TESTS
// =============================================================================

describe('SearchableCombobox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  // ── 1. Renders with placeholder ─────────────────────────────────────────────

  describe('renders closed with placeholder', () => {
    it('shows placeholder text when no value is selected', () => {
      renderCombobox({ value: null, placeholder: 'Pick one…' })
      expect(screen.getByText('Pick one…')).toBeInTheDocument()
    })

    it('does not show a dropdown initially', () => {
      renderCombobox()
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })

  // ── 2. Renders with selected value ──────────────────────────────────────────

  describe('renders selected value', () => {
    it('shows initialLabel when value and initialLabel are provided', () => {
      renderCombobox({ value: 1, initialLabel: 'Acme Corp' })
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })
  })

  // ── 3. Opens dropdown on click ───────────────────────────────────────────────

  describe('opens dropdown on click', () => {
    it('shows listbox after clicking the trigger', async () => {
      const user = userEvent.setup()
      renderCombobox()

      await user.click(screen.getByRole('combobox'))

      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('sets aria-expanded to true when open', async () => {
      const user = userEvent.setup()
      renderCombobox()

      const trigger = screen.getByRole('combobox')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await user.click(trigger)

      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })

  // ── 4. Shows favorites section ───────────────────────────────────────────────

  describe('shows favorites section', () => {
    it('renders Favorites header when suggestions include favorites', async () => {
      setupMocks(richSuggestions)
      const user = userEvent.setup()
      renderCombobox()

      await user.click(screen.getByRole('combobox'))

      expect(screen.getByText('Favorites')).toBeInTheDocument()
    })

    it('renders favorite items under the Favorites header', async () => {
      setupMocks(richSuggestions)
      const user = userEvent.setup()
      renderCombobox()

      await user.click(screen.getByRole('combobox'))

      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      expect(screen.getByText('Beta LLC')).toBeInTheDocument()
    })
  })

  // ── 5. Shows recents section ─────────────────────────────────────────────────

  describe('shows recents section', () => {
    it('renders Recent header when suggestions include recents', async () => {
      setupMocks(richSuggestions)
      const user = userEvent.setup()
      renderCombobox()

      await user.click(screen.getByRole('combobox'))

      expect(screen.getByText('Recent')).toBeInTheDocument()
    })

    it('renders recent items under the Recent header', async () => {
      setupMocks(richSuggestions)
      const user = userEvent.setup()
      renderCombobox()

      await user.click(screen.getByRole('combobox'))

      expect(screen.getByText('Gamma Inc')).toBeInTheDocument()
    })
  })

  // ── 6. Shows search results ──────────────────────────────────────────────────

  describe('shows search results', () => {
    it('renders Results header when suggestions include results', async () => {
      setupMocks(richSuggestions)
      const user = userEvent.setup()
      renderCombobox()

      await user.click(screen.getByRole('combobox'))

      expect(screen.getByText('Results')).toBeInTheDocument()
      expect(screen.getByText('Delta Co')).toBeInTheDocument()
    })
  })

  // ── 7. Handles selection ─────────────────────────────────────────────────────

  describe('handles selection', () => {
    it('calls onChange with the correct id and label when an item is clicked', async () => {
      setupMocks(richSuggestions)
      const onChange = vi.fn()
      const user = userEvent.setup()
      renderCombobox({ onChange })

      await user.click(screen.getByRole('combobox'))
      // Use mousedown since rows use onMouseDown to prevent blur
      const item = screen.getByText('Acme Corp')
      await user.pointer({ target: item, keys: '[MouseLeft]' })

      expect(onChange).toHaveBeenCalledWith(1, 'Acme Corp')
    })
  })

  // ── 8. Closes on selection ───────────────────────────────────────────────────

  describe('closes on selection', () => {
    it('hides the listbox after selecting an item', async () => {
      setupMocks(richSuggestions)
      const user = userEvent.setup()
      renderCombobox()

      await user.click(screen.getByRole('combobox'))
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      await user.pointer({ target: screen.getByText('Acme Corp'), keys: '[MouseLeft]' })

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      })
    })
  })

  // ── 9. Closes on Escape ──────────────────────────────────────────────────────

  describe('closes on Escape', () => {
    it('hides the listbox when Escape is pressed', async () => {
      setupMocks(richSuggestions)
      const user = userEvent.setup()
      renderCombobox()

      await user.click(screen.getByRole('combobox'))
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      })
    })
  })

  // ── 10. Clears value ─────────────────────────────────────────────────────────

  describe('clears value', () => {
    it('shows clear button when allowClear is true and a value is selected', () => {
      renderCombobox({ value: 1, initialLabel: 'Acme Corp', allowClear: true })
      expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument()
    })

    it('calls onChange(null, "") when clear button is clicked', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      renderCombobox({ value: 1, initialLabel: 'Acme Corp', allowClear: true, onChange })

      await user.pointer({
        target: screen.getByRole('button', { name: 'Clear selection' }),
        keys: '[MouseLeft]',
      })

      expect(onChange).toHaveBeenCalledWith(null, '')
    })

    it('does not show clear button when allowClear is false', () => {
      renderCombobox({ value: 1, initialLabel: 'Acme Corp', allowClear: false })
      expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()
    })
  })

  // ── 11. Shows empty state ────────────────────────────────────────────────────

  describe('shows empty state', () => {
    it('shows "Start typing to search…" when no data and no search text', async () => {
      setupMocks(emptySuggestions, [])
      const user = userEvent.setup()
      renderCombobox()

      await user.click(screen.getByRole('combobox'))

      expect(screen.getByText('Start typing to search…')).toBeInTheDocument()
    })
  })

  // ── 12. Star toggle calls add favorite ──────────────────────────────────────

  describe('star toggle for non-favorited item', () => {
    it('calls useAddFavorite when clicking star on a non-favorited item', async () => {
      // Gamma Inc (id:3) is in recents but NOT in mockFavorites
      setupMocks(richSuggestions, mockFavorites)
      const user = userEvent.setup()
      renderCombobox()

      await user.click(screen.getByRole('combobox'))

      // Gamma Inc (id:3) is in recents; Delta Co (id:4) is in results — both are non-favorited.
      // Target the "Add to favorites" button that is a sibling of the "Gamma Inc" label.
      const gammaRow = screen.getByText('Gamma Inc').closest('div[style*="cursor: pointer"]')!
      const addBtn = gammaRow.querySelector('button[aria-label="Add to favorites"]')!
      await user.pointer({ target: addBtn, keys: '[MouseLeft]' })

      expect(mockAddFavorite).toHaveBeenCalledWith(
        { entity_type: 'customer', object_id: 3 },
      )
    })
  })

  // ── 13. Star toggle calls remove favorite ───────────────────────────────────

  describe('star toggle for favorited item', () => {
    it('calls useRemoveFavorite when clicking star on a favorited item', async () => {
      // Acme Corp (id:1) has favoriteId=10 in mockFavorites
      setupMocks(richSuggestions, mockFavorites)
      const user = userEvent.setup()
      renderCombobox()

      await user.click(screen.getByRole('combobox'))

      const removeBtns = screen.getAllByRole('button', { name: 'Remove from favorites' })
      await user.pointer({ target: removeBtns[0], keys: '[MouseLeft]' })

      expect(mockRemoveFavorite).toHaveBeenCalledWith(10)
    })
  })

  // ── 14. Disabled state ───────────────────────────────────────────────────────

  describe('disabled state', () => {
    it('does not open dropdown when disabled is true', async () => {
      const user = userEvent.setup()
      renderCombobox({ disabled: true })

      await user.click(screen.getByRole('combobox'))

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('sets tabIndex to -1 when disabled', () => {
      renderCombobox({ disabled: true })
      expect(screen.getByRole('combobox')).toHaveAttribute('tabindex', '-1')
    })
  })
})
