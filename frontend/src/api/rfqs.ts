import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export function useCreateRFQ() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rfq: any) => {
      const { data } = await api.post('/rfqs/', rfq)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] })
    },
  })
}
