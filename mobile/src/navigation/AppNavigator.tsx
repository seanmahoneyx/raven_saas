import { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'

import LoginScreen from '../screens/LoginScreen'
import SplashScreen from '../screens/SplashScreen'
import MainTabs from './MainTabs'
import OrderStack from './OrderStack'
import DriverStack from './DriverStack'

type RootStackParamList = {
  MainTabs: undefined
  OrderStack: undefined
  DriverStack: { screen?: string; params?: any }
}

const RootStack = createNativeStackNavigator<RootStackParamList>()

type AuthStackParamList = {
  Login: undefined
}

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  )
}

function AppContent() {
  const isLoading = useAuthStore((s) => s.isLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hydrate = useAuthStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  if (isLoading) {
    return <SplashScreen />
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? (
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="MainTabs" component={MainTabs} />
          <RootStack.Screen name="OrderStack" component={OrderStack} />
          <RootStack.Screen name="DriverStack" component={DriverStack} />
        </RootStack.Navigator>
      ) : <AuthNavigator />}
    </NavigationContainer>
  )
}

export default function AppNavigator() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}
