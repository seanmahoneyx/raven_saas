import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'
import type {
  Contract,
  ContractLine,
  ContractRelease,
  ContractInput,
  ContractLineInput,
  CreateReleasePayload,
  PaginatedResponse,
  ApiError,
} from '@/types/api'

// ==================== Contracts ====================

export function useContracts(params?: {
  search?: string
  status?: string
  customer?: number
}) {
  return useQuery({
    queryKey: ['contracts', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Contract>>('/contracts/', { params })
      return data
    },
  })
}

export function useContract(id: number) {
  return useQuery({
    queryKey: ['contracts', id],
    queryFn: async () => {
      const { data } = await api.get<Contract>(`/contracts/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useContractsByCustomer(customerId: number) {
  return useQuery({
    queryKey: ['contracts', 'by-customer', customerId],
    queryFn: async () => {
      const { data } = await api.get<Contract[]>('/contracts/by_customer/', {
        params: { customer: customerId },
      })
      return data
    },
    enabled: !!customerId,
  })
}

export function useContractsByItem(itemId: number) {
  return useQuery({
    queryKey: ['contracts', 'by-item', itemId],
    queryFn: async () => {
      const { data } = await api.get<Contract[]>('/contracts/by_item/', {
        params: { item: itemId },
      })
      return data
    },
    enabled: !!itemId,
  })
}

export function useActiveContracts() {
  return useQuery({
    queryKey: ['contracts', 'active'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Contract>>('/contracts/active/')
      return data
    },
  })
}

export function useCreateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (contract: ContractInput) => {
      const { data } = await api.post<Contract>('/contracts/', contract)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      toast.success('Contract created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create contract')
    },
  })
}

export function useUpdateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...contract }: Partial<ContractInput> & { id: number }) => {
      const { data } = await api.patch<Contract>(`/contracts/${id}/`, contract)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['contracts', variables.id] })
      toast.success('Changes saved')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to save changes')
    },
  })
}

export function useDeleteContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/contracts/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      toast.success('Contract deleted')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete contract')
    },
  })
}

// ==================== Contract Status Actions ====================

export function useActivateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<Contract>(`/contracts/${id}/activate/`)
      return data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['contracts', id] })
      toast.success('Contract activated')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to activate contract')
    },
  })
}

export function useCompleteContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<Contract>(`/contracts/${id}/complete/`)
      return data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['contracts', id] })
      toast.success('Contract marked complete')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to complete contract')
    },
  })
}

export function useCancelContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<Contract>(`/contracts/${id}/cancel/`)
      return data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['contracts', id] })
      toast.success('Contract cancelled')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to cancel contract')
    },
  })
}

export function useDeactivateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<Contract>(`/contracts/${id}/deactivate/`)
      return data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['contracts', id] })
      toast.success('Contract deactivated')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to deactivate contract')
    },
  })
}

// ==================== Contract Lines ====================

export function useContractLines(contractId: number) {
  return useQuery({
    queryKey: ['contracts', contractId, 'lines'],
    queryFn: async () => {
      const { data } = await api.get<ContractLine[]>(`/contracts/${contractId}/lines/`)
      return data
    },
    enabled: !!contractId,
  })
}

export function useAddContractLine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      contractId,
      ...line
    }: ContractLineInput & { contractId: number }) => {
      const { data } = await api.post<ContractLine>(
        `/contracts/${contractId}/lines/`,
        line
      )
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['contracts', variables.contractId] })
      queryClient.invalidateQueries({
        queryKey: ['contracts', variables.contractId, 'lines'],
      })
      toast.success('Line added')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to add line')
    },
  })
}

// ==================== Contract Releases ====================

export function useCreateRelease() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      contractId,
      ...payload
    }: CreateReleasePayload & { contractId: number }) => {
      const { data } = await api.post<ContractRelease>(
        `/contracts/${contractId}/create_release/`,
        payload
      )
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['contracts', variables.contractId] })
      queryClient.invalidateQueries({
        queryKey: ['contracts', variables.contractId, 'lines'],
      })
      // Also invalidate sales orders since we created one
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      toast.success('Release created')
    },
    onError: (error: ApiError) => {
      toast.error(error?.response?.data?.detail || 'Failed to create release')
    },
  })
}
