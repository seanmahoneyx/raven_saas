import { useState, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { fetchOrders, type OrderSummary } from '../../api/orders'
import StatusBadge from '../../components/StatusBadge'
import type { OrderStackParamList } from '../../navigation/OrderStack'

type Nav = NativeStackNavigationProp<OrderStackParamList>

const FILTERS = [
  { key: 'open', label: 'Open', statuses: 'confirmed,scheduled,picking,crossdock' },
  { key: 'shipped', label: 'Shipped', statuses: 'shipped,complete' },
  { key: 'all', label: 'All', statuses: undefined },
] as const

export default function OrderList() {
  const navigation = useNavigation<Nav>()
  const [activeFilter, setActiveFilter] = useState<string>('open')
  const [search, setSearch] = useState('')

  const filter = FILTERS.find((f) => f.key === activeFilter)!
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders', activeFilter, search],
    queryFn: () =>
      fetchOrders({
        status: filter.statuses,
        search: search || undefined,
      }),
  })

  const orders = data?.results ?? []

  const renderOrder = useCallback(
    ({ item }: { item: OrderSummary }) => (
      <Pressable
        onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
        className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-2 active:bg-slate-800"
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-white text-base font-bold">{item.order_number}</Text>
          <Text className="text-slate-500 text-xs">{item.order_date}</Text>
        </View>
        <Text className="text-slate-300 text-sm mb-3" numberOfLines={1}>
          {item.customer_name}
        </Text>
        <View className="flex-row items-center justify-between">
          <StatusBadge status={item.status} />
          <Text className="text-white text-sm font-semibold">
            ${parseFloat(item.subtotal).toFixed(2)}
          </Text>
        </View>
      </Pressable>
    ),
    [navigation]
  )

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      {/* Header */}
      <View className="px-6 pt-4 pb-3 flex-row items-center">
        <Pressable onPress={() => navigation.goBack()} className="mr-3 p-1">
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text className="text-white text-xl font-bold flex-1">Sales Orders</Text>
        <Text className="text-slate-500 text-sm">{data?.count ?? 0} orders</Text>
      </View>

      {/* Search */}
      <View className="px-6 mb-3">
        <View className="flex-row items-center bg-slate-800 border border-slate-700 rounded-xl px-4">
          <Feather name="search" size={16} color="#64748b" />
          <TextInput
            className="flex-1 text-white text-sm py-3 ml-3"
            placeholder="Search orders..."
            placeholderTextColor="#475569"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Feather name="x" size={16} color="#64748b" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View className="flex-row px-6 mb-4 gap-2">
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setActiveFilter(f.key)}
            className={`px-4 py-2 rounded-lg ${
              activeFilter === f.key
                ? 'bg-rose-600'
                : 'bg-slate-800 border border-slate-700'
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                activeFilter === f.key ? 'text-white' : 'text-slate-400'
              }`}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#e02424" />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderOrder}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#e02424"
              colors={['#e02424']}
            />
          }
          ListEmptyComponent={
            <View className="items-center py-16">
              <Feather name="inbox" size={40} color="#334155" />
              <Text className="text-slate-500 text-sm mt-3">No orders found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}
