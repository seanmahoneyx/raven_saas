import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useAuthStore } from '../store/auth'

export default function LoginScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both username and password.')
      return
    }

    setLoading(true)
    try {
      await login(username.trim(), password)
    } catch (error: any) {
      Alert.alert('Sign In Failed', error.message || 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-950"
    >
      <View className="flex-1 justify-center px-8">
        {/* Logo / Brand */}
        <View className="items-center mb-12">
          <View className="w-20 h-20 rounded-2xl bg-rose-600 items-center justify-center mb-4">
            <Text className="text-white text-3xl font-bold">R</Text>
          </View>
          <Text className="text-white text-3xl font-bold tracking-tight">
            Raven
          </Text>
          <Text className="text-slate-400 text-base mt-1">
            Warehouse Management
          </Text>
        </View>

        {/* Form */}
        <View className="space-y-4">
          <View>
            <Text className="text-slate-400 text-sm font-medium mb-2 ml-1">
              Username
            </Text>
            <TextInput
              className="bg-slate-800 text-white p-4 rounded-lg text-base border border-slate-700 focus:border-rose-500"
              placeholder="Enter your username"
              placeholderTextColor="#64748b"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View className="mt-4">
            <Text className="text-slate-400 text-sm font-medium mb-2 ml-1">
              Password
            </Text>
            <TextInput
              className="bg-slate-800 text-white p-4 rounded-lg text-base border border-slate-700 focus:border-rose-500"
              placeholder="Enter your password"
              placeholderTextColor="#64748b"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            className="bg-rose-600 active:bg-rose-700 mt-6 p-4 rounded-lg items-center disabled:opacity-50"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white text-base font-semibold">
                Sign In
              </Text>
            )}
          </Pressable>
        </View>

        {/* Footer */}
        <Text className="text-slate-600 text-center text-xs mt-12">
          Raven SaaS v1.0
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}
