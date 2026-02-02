import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = '/api/v1'

// Create axios instance with credentials for httpOnly cookie support
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,  // Include cookies in cross-origin requests
})

// Token storage (for legacy support - new auth uses httpOnly cookies)
const TOKEN_KEY = 'raven_access_token'
const REFRESH_TOKEN_KEY = 'raven_refresh_token'

export const tokenStorage = {
  getAccessToken: () => localStorage.getItem(TOKEN_KEY),
  setAccessToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setRefreshToken: (token: string) => localStorage.setItem(REFRESH_TOKEN_KEY, token),
  clearTokens: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}

// Track if using cookie-based auth (set after successful login)
let usingCookieAuth = false

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - handle token refresh
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string | null) => void
  reject: (error: Error) => void
}> = []

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`
            }
            return apiClient(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        // Try cookie-based refresh first (preferred)
        if (usingCookieAuth) {
          await axios.post(`${API_BASE_URL}/auth/refresh/`, {}, { withCredentials: true })
          // Cookie refreshed automatically, retry original request
          processQueue(null, null)
          return apiClient(originalRequest)
        }

        // Fall back to legacy token refresh
        const refreshToken = tokenStorage.getRefreshToken()

        if (!refreshToken) {
          tokenStorage.clearTokens()
          window.location.href = '/login'
          return Promise.reject(error)
        }

        const response = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        })

        const { access } = response.data
        tokenStorage.setAccessToken(access)
        processQueue(null, access)

        originalRequest.headers.Authorization = `Bearer ${access}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError as Error, null)
        tokenStorage.clearTokens()
        usingCookieAuth = false
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

// Auth API - supports both cookie-based (preferred) and localStorage (legacy)
export const authApi = {
  login: async (username: string, password: string) => {
    try {
      // Try cookie-based login first (preferred, more secure)
      const response = await apiClient.post('/auth/login/', { username, password })
      usingCookieAuth = true
      // Tokens are in httpOnly cookies, not in response body
      return response.data
    } catch (error) {
      // Fall back to legacy token-based auth
      const response = await apiClient.post('/auth/token/', { username, password })
      const { access, refresh } = response.data
      tokenStorage.setAccessToken(access)
      tokenStorage.setRefreshToken(refresh)
      usingCookieAuth = false
      return response.data
    }
  },

  logout: async () => {
    try {
      // Try cookie-based logout first
      await apiClient.post('/auth/logout/')
    } catch {
      // Ignore errors - may not be using cookie auth
    }
    // Always clear localStorage tokens as well
    tokenStorage.clearTokens()
    usingCookieAuth = false
  },

  isAuthenticated: () => {
    // With cookie auth, we can't check directly - rely on API responses
    // For legacy, check localStorage
    return usingCookieAuth || !!tokenStorage.getAccessToken()
  },

  // Check if currently using secure cookie auth
  isUsingCookieAuth: () => usingCookieAuth,
}

export default apiClient
