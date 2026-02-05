import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { authApi, apiClient } from '@/api/client'

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

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
  }

  const logout = () => {
    authApi.logout()
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
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
