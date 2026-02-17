import { vi } from 'vitest'

// Must mock BEFORE importing the module under test
vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { apiClient } from './client'
import { generateItemLabels, generateBinLabels, generateLPNLabels } from './labels'

describe('Labels API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateItemLabels', () => {
    it('calls POST /labels/items/ with correct params for PDF', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: 'mock-blob' })

      await generateItemLabels(1, 5, 'PDF')

      expect(apiClient.post).toHaveBeenCalledWith(
        '/labels/items/',
        { item_id: 1, qty: 5, format: 'PDF' },
        { responseType: 'blob' }
      )
    })

    it('calls POST /labels/items/ with text responseType for ZPL', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: 'mock-zpl' })

      await generateItemLabels(1, 5, 'ZPL')

      expect(apiClient.post).toHaveBeenCalledWith(
        '/labels/items/',
        { item_id: 1, qty: 5, format: 'ZPL' },
        { responseType: 'text' }
      )
    })

    it('defaults format to PDF', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: 'mock-blob' })

      await generateItemLabels(1, 5)

      expect(apiClient.post).toHaveBeenCalledWith(
        '/labels/items/',
        { item_id: 1, qty: 5, format: 'PDF' },
        { responseType: 'blob' }
      )
    })

    it('returns response data', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: 'mock-zpl' })

      const result = await generateItemLabels(1, 5, 'ZPL')

      expect(result).toBe('mock-zpl')
    })
  })

  describe('generateBinLabels', () => {
    it('calls POST /labels/bins/ with warehouse_id', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: 'mock-blob' })

      await generateBinLabels({ warehouse_id: 42, format: 'PDF' })

      expect(apiClient.post).toHaveBeenCalledWith(
        '/labels/bins/',
        { warehouse_id: 42, format: 'PDF' },
        { responseType: 'blob' }
      )
    })

    it('calls POST /labels/bins/ with location_ids', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: 'mock-blob' })

      await generateBinLabels({ location_ids: [1, 2, 3], format: 'PDF' })

      expect(apiClient.post).toHaveBeenCalledWith(
        '/labels/bins/',
        { location_ids: [1, 2, 3], format: 'PDF' },
        { responseType: 'blob' }
      )
    })

    it('defaults format to PDF with blob responseType', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: 'mock-blob' })

      await generateBinLabels({ warehouse_id: 1 })

      expect(apiClient.post).toHaveBeenCalledWith(
        '/labels/bins/',
        { warehouse_id: 1 },
        { responseType: 'blob' }
      )
    })

    it('uses text responseType for ZPL format', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: 'mock-zpl' })

      await generateBinLabels({ warehouse_id: 1, format: 'ZPL' })

      expect(apiClient.post).toHaveBeenCalledWith(
        '/labels/bins/',
        { warehouse_id: 1, format: 'ZPL' },
        { responseType: 'text' }
      )
    })
  })

  describe('generateLPNLabels', () => {
    it('calls POST /labels/lpns/ with correct params', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: 'mock-zpl' })

      await generateLPNLabels([10, 20, 30], 'ZPL')

      expect(apiClient.post).toHaveBeenCalledWith(
        '/labels/lpns/',
        { lpn_ids: [10, 20, 30], format: 'ZPL' },
        { responseType: 'text' }
      )
    })

    it('defaults format to ZPL with text responseType', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: 'mock-zpl' })

      await generateLPNLabels([10, 20, 30])

      expect(apiClient.post).toHaveBeenCalledWith(
        '/labels/lpns/',
        { lpn_ids: [10, 20, 30], format: 'ZPL' },
        { responseType: 'text' }
      )
    })

    it('uses blob responseType for PDF format', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: 'mock-blob' })

      await generateLPNLabels([10, 20, 30], 'PDF')

      expect(apiClient.post).toHaveBeenCalledWith(
        '/labels/lpns/',
        { lpn_ids: [10, 20, 30], format: 'PDF' },
        { responseType: 'blob' }
      )
    })
  })
})
