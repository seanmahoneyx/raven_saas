import axios from 'axios'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

// Android emulator uses 10.0.2.2 to reach host machine
// iOS simulator uses localhost
// Physical devices need the machine's local IP
const getBaseUrl = () => {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:8000/api/v1'
    }
    // iOS simulator or web
    return 'http://localhost:8000/api/v1'
  }
  // Production URL - update when deploying
  return 'https://api.ravenapp.com/api/v1'
}

const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: inject auth token
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Clear stored credentials
      await SecureStore.deleteItemAsync('auth_token')
      await SecureStore.deleteItemAsync('refresh_token')
      // The auth store's hydrate() check will redirect to login
      // on next app focus or navigation attempt
    }
    return Promise.reject(error)
  }
)

export default api
