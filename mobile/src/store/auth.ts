import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import api from '../api/client'

interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
}

interface AuthState {
  token: string | null
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean

  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  hydrate: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (username: string, password: string) => {
    try {
      const { data } = await api.post('/auth/login/', { username, password })
      const token = data.token || data.access
      const user = data.user

      await SecureStore.setItemAsync('auth_token', token)
      if (data.refresh) {
        await SecureStore.setItemAsync('refresh_token', data.refresh)
      }

      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error: any) {
      set({ isLoading: false })
      const message =
        error.response?.data?.detail ||
        error.response?.data?.error ||
        'Invalid credentials'
      throw new Error(message)
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('auth_token')
    await SecureStore.deleteItemAsync('refresh_token')
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    })
  },

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token')
      if (token) {
        // Validate token by fetching current user
        const { data } = await api.get('/auth/me/')
        set({
          token,
          user: data,
          isAuthenticated: true,
          isLoading: false,
        })
      } else {
        set({ isLoading: false })
      }
    } catch {
      // Token expired or invalid
      await SecureStore.deleteItemAsync('auth_token')
      await SecureStore.deleteItemAsync('refresh_token')
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },
}))
