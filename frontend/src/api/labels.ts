import { apiClient } from './client'

export async function generateItemLabels(itemId: number, qty: number, format: string = 'PDF') {
  const response = await apiClient.post('/labels/items/',
    { item_id: itemId, qty, format },
    { responseType: format === 'ZPL' ? 'text' : 'blob' }
  )
  return response.data
}

export async function generateBinLabels(params: {
  warehouse_id?: number
  location_ids?: number[]
  format?: string
}) {
  const fmt = params.format || 'PDF'
  const response = await apiClient.post('/labels/bins/',
    params,
    { responseType: fmt === 'ZPL' ? 'text' : 'blob' }
  )
  return response.data
}

export async function generateLPNLabels(lpnIds: number[], format: string = 'ZPL') {
  const response = await apiClient.post('/labels/lpns/',
    { lpn_ids: lpnIds, format },
    { responseType: format === 'ZPL' ? 'text' : 'blob' }
  )
  return response.data
}
