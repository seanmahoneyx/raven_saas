import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { authApi, apiClient } from '@/api/client'

interface User {
  id: number
  username: string
  name: string
  roles: string[]
  permissions: string[]
  is_superuser: boolean
}

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  const refreshUser = async () => {
    try {
      const res = await apiClient.get('/users/me/')
      setUser(res.data)
    } catch {
      setUser(null)
    }
  }

  useEffect(() => {
    // Check if user is already authenticated
    // Check localStorage auth indicator (token or cookie mode)
    const hasAuthIndicator = authApi.isAuthenticated()

    if (hasAuthIndicator) {
      // Verify the session is still valid by making a lightweight API call
      // Use vendors endpoint as a simple auth check
      apiClient.get('/vendors/?limit=1')
        .then(() => {
          setIsAuthenticated(true)
          // Fetch user profile
          apiClient.get('/users/me/').then(res => setUser(res.data)).catch(() => {})
          setIsLoading(false)
        })
        .catch((error) => {
          // Only treat 401 as auth failure, other errors might be network issues
          if (error.response?.status === 401) {
            setIsAuthenticated(false)
          } else {
            // Assume authenticated if we can't verify (network error, etc.)
            setIsAuthenticated(true)
          }
          setIsLoading(false)
        })
    } else {
      setIsAuthenticated(false)
      setIsLoading(false)
    }
  }, [])

  const login = async (username: string, password: string) => {
    await authApi.login(username, password)
    setIsAuthenticated(true)
    // Fetch user profile with roles
    try {
      const res = await apiClient.get('/users/me/')
      setUser(res.data)
    } catch {
      // Login succeeded but profile fetch failed - still authenticated
    }
  }

  const logout = () => {
    authApi.logout()
    setIsAuthenticated(false)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
