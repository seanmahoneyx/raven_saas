import { View, Text, Pressable, ScrollView } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuthStore } from '../store/auth'

interface MenuItem {
  label: string
  icon: keyof typeof Feather.glyphMap
  color: string
  screen: string
}

const menuItems: MenuItem[] = [
  { label: 'Sales Orders', icon: 'shopping-bag', color: '#e02424', screen: 'OrderStack' },
  { label: 'Inventory', icon: 'box', color: '#3b82f6', screen: 'Inventory' },
  { label: 'Customers', icon: 'users', color: '#22c55e', screen: 'Customers' },
  { label: 'Vendors', icon: 'truck', color: '#f59e0b', screen: 'Vendors' },
  { label: 'Production', icon: 'settings', color: '#a855f7', screen: 'Production' },
  { label: 'Reports', icon: 'bar-chart-2', color: '#06b6d4', screen: 'Reports' },
  { label: 'Scheduler', icon: 'calendar', color: '#e02424', screen: 'Scheduler' },
  { label: 'Invoices', icon: 'file-text', color: '#f97316', screen: 'Invoices' },
  { label: 'Shipping', icon: 'send', color: '#14b8a6', screen: 'Shipping' },
  { label: 'Settings', icon: 'sliders', color: '#64748b', screen: 'Settings' },
]

export default function MenuScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-6 pt-4 pb-6">
          <View className="flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-rose-600 items-center justify-center mr-4">
              <Text className="text-white text-lg font-bold">
                {(user?.first_name?.[0] || user?.username?.[0] || 'R').toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-white text-lg font-bold">
                {user?.first_name} {user?.last_name}
              </Text>
              <Text className="text-slate-400 text-sm">{user?.email || user?.username}</Text>
            </View>
          </View>
        </View>

        {/* Grid Menu */}
        <View className="px-6">
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            {menuItems.map((item) => (
              <Pressable
                key={item.screen}
                onPress={() => {
                  if (item.screen === 'OrderStack') {
                    navigation.navigate('OrderStack')
                  }
                }}
                className="bg-slate-900 border border-slate-800 rounded-2xl items-center justify-center py-5 active:bg-slate-800 active:scale-95"
                style={{ width: '31%' }}
              >
                <View
                  className="w-12 h-12 rounded-xl items-center justify-center mb-3"
                  style={{ backgroundColor: item.color + '20' }}
                >
                  <Feather name={item.icon} size={22} color={item.color} />
                </View>
                <Text className="text-white text-xs font-semibold tracking-wide">
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Sign Out */}
        <View className="px-6 mt-8 mb-12">
          <Pressable
            onPress={logout}
            className="flex-row items-center justify-center py-4 rounded-2xl border border-slate-800 active:bg-slate-900"
          >
            <Feather name="log-out" size={18} color="#f87171" />
            <Text className="text-rose-400 text-sm font-semibold ml-2">
              Sign Out
            </Text>
          </Pressable>
          <Text className="text-slate-700 text-xs text-center mt-4">
            Raven SaaS v1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
