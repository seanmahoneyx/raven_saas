import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingStatus {
  onboarding_completed: boolean
  onboarding_step: number
  company_name: string
  company_address: string
  company_phone: string
  company_logo: string | null
  industry: string
}

export interface CompanyInfoPayload {
  name: string
  company_address?: string
  company_phone?: string
  company_logo?: File | null
  industry?: string
}

export interface WarehousePayload {
  name?: string
  code?: string
  address?: string
}

export interface UoMPayload {
  preset?: 'standard' | 'corrugated' | 'food'
  uom_codes?: string[]
}

export interface InviteMember {
  email: string
  role: 'Admin' | 'Sales' | 'Warehouse' | 'Driver' | 'Viewer'
}

export interface InvitePayload {
  invites: InviteMember[]
}

export interface UoMPresetsResponse {
  presets: Record<string, { code: string; name: string }[]>
  suggested_preset: string
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useOnboardingStatus() {
  return useQuery<OnboardingStatus>({
    queryKey: ['onboarding-status'],
    queryFn: async () => {
      const { data } = await api.get<OnboardingStatus>('/onboarding/status/')
      return data
    },
  })
}

export function useOnboardingUoMPresets() {
  return useQuery<UoMPresetsResponse>({
    queryKey: ['onboarding-uom-presets'],
    queryFn: async () => {
      const { data } = await api.get<UoMPresetsResponse>('/onboarding/uom/')
      return data
    },
  })
}

export function useSaveCompanyInfo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CompanyInfoPayload) => {
      const formData = new FormData()
      formData.append('name', payload.name)
      if (payload.company_address) formData.append('company_address', payload.company_address)
      if (payload.company_phone) formData.append('company_phone', payload.company_phone)
      if (payload.industry) formData.append('industry', payload.industry)
      if (payload.company_logo instanceof File) formData.append('company_logo', payload.company_logo)

      const { data } = await api.post('/onboarding/company/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
    },
    onError: () => {
      toast.error('Failed to save company info')
    },
  })
}

export function useSaveWarehouse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: WarehousePayload) => {
      const { data } = await api.post('/onboarding/warehouse/', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
    },
    onError: () => {
      toast.error('Failed to save warehouse')
    },
  })
}

export function useSaveUoMs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UoMPayload) => {
      const { data } = await api.post('/onboarding/uom/', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
    },
    onError: () => {
      toast.error('Failed to set up units of measure')
    },
  })
}

export function useInviteTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: InvitePayload) => {
      const { data } = await api.post('/onboarding/invite/', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
    },
    onError: () => {
      toast.error('Failed to send invitations')
    },
  })
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/onboarding/complete/')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
    },
    onError: () => {
      toast.error('Failed to complete onboarding')
    },
  })
}
