import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export function useCreatePriceList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (priceList: any) => {
      const { data } = await api.post('/price-lists/', priceList)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] })
    },
  })
}
