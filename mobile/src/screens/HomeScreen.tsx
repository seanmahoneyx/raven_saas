import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../store/auth'
import api from '../api/client'

const { width } = Dimensions.get('window')
const CARD_WIDTH = width * 0.7

interface KpiCard {
  label: string
  value: string
  icon: keyof typeof Feather.glyphMap
  gradient: [string, string]
}

const kpiCards: KpiCard[] = [
  {
    label: 'Open Orders',
    value: '--',
    icon: 'shopping-bag',
    gradient: ['#e02424', '#991b1b'],
  },
  {
    label: 'Revenue Today',
    value: '--',
    icon: 'dollar-sign',
    gradient: ['#2563eb', '#1e40af'],
  },
  {
    label: 'Picks Pending',
    value: '--',
    icon: 'package',
    gradient: ['#7c3aed', '#5b21b6'],
  },
  {
    label: 'Shipments',
    value: '--',
    icon: 'truck',
    gradient: ['#059669', '#047857'],
  },
]

interface ActivityItem {
  id: string
  message: string
  time: string
  icon: keyof typeof Feather.glyphMap
  color: string
}

const recentActivity: ActivityItem[] = [
  { id: '1', message: 'Order #1042 shipped', time: '2m ago', icon: 'truck', color: '#22c55e' },
  { id: '2', message: 'PO #307 received', time: '15m ago', icon: 'package', color: '#3b82f6' },
  { id: '3', message: 'Item SKU-4821 created', time: '1h ago', icon: 'plus-circle', color: '#a855f7' },
  { id: '4', message: 'Invoice #891 posted', time: '2h ago', icon: 'file-text', color: '#f59e0b' },
  { id: '5', message: 'Order #1041 picked', time: '3h ago', icon: 'check-circle', color: '#22c55e' },
  { id: '6', message: 'Customer Acme updated', time: '4h ago', icon: 'users', color: '#64748b' },
]

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user)
  const [refreshing, setRefreshing] = useState(false)
  const [kpis, setKpis] = useState(kpiCards)

  const fetchDashboard = async () => {
    try {
      const { data } = await api.get('/calendar/unscheduled/')
      // Update open orders count from real data
      const updated = [...kpiCards]
      updated[0] = { ...updated[0], value: String(data?.length ?? '--') }
      setKpis(updated)
    } catch {
      // Use placeholder data on error
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchDashboard()
    setRefreshing(false)
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  const displayName = user?.first_name || user?.username || 'there'

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#e02424"
            colors={['#e02424']}
          />
        }
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-6">
          <Text className="text-slate-500 text-sm font-medium tracking-wide uppercase">
            {getGreeting()}
          </Text>
          <Text className="text-white text-2xl font-bold mt-1">
            {displayName}
          </Text>
        </View>

        {/* KPI Cards - Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, gap: 14 }}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + 14}
        >
          {kpis.map((card, i) => (
            <LinearGradient
              key={i}
              colors={card.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: CARD_WIDTH, borderRadius: 16, padding: 20 }}
            >
              <View className="flex-row items-center justify-between mb-4">
                <View className="bg-white/20 w-10 h-10 rounded-xl items-center justify-center">
                  <Feather name={card.icon} size={20} color="#fff" />
                </View>
              </View>
              <Text className="text-white/80 text-sm font-medium">
                {card.label}
              </Text>
              <Text className="text-white text-3xl font-bold mt-1">
                {card.value}
              </Text>
            </LinearGradient>
          ))}
        </ScrollView>

        {/* Recent Activity */}
        <View className="px-6 mt-8 mb-4">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-white text-lg font-bold">
              Recent Activity
            </Text>
            <Text className="text-rose-500 text-sm font-medium">See All</Text>
          </View>

          <View className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            {recentActivity.map((item, index) => (
              <View
                key={item.id}
                className={`flex-row items-center px-4 py-3.5 ${
                  index < recentActivity.length - 1
                    ? 'border-b border-slate-800'
                    : ''
                }`}
              >
                <View
                  className="w-9 h-9 rounded-lg items-center justify-center mr-3"
                  style={{ backgroundColor: item.color + '20' }}
                >
                  <Feather name={item.icon} size={16} color={item.color} />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-medium">
                    {item.message}
                  </Text>
                </View>
                <Text className="text-slate-500 text-xs ml-2">
                  {item.time}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Bottom padding for tab bar */}
        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  )
}
