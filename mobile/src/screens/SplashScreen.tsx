import { View, Text, ActivityIndicator } from 'react-native'

export default function SplashScreen() {
  return (
    <View className="flex-1 bg-slate-950 items-center justify-center">
      <View className="w-20 h-20 rounded-2xl bg-rose-600 items-center justify-center mb-6">
        <Text className="text-white text-3xl font-bold">R</Text>
      </View>
      <Text className="text-white text-2xl font-bold tracking-tight mb-4">
        Raven
      </Text>
      <ActivityIndicator size="small" color="#e02424" />
    </View>
  )
}
