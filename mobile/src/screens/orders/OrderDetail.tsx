import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import * as WebBrowser from 'expo-web-browser'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { fetchOrderDetail, type OrderLine } from '../../api/orders'
import StepIndicator from '../../components/StepIndicator'
import StatusBadge from '../../components/StatusBadge'
import type { OrderStackParamList } from '../../navigation/OrderStack'

type Nav = NativeStackNavigationProp<OrderStackParamList>
type Route = RouteProp<OrderStackParamList, 'OrderDetail'>

function getBaseUrl() {
  if (__DEV__) {
    if (Platform.OS === 'android') return 'http://10.0.2.2:8000/api/v1'
    return 'http://localhost:8000/api/v1'
  }
  return 'https://api.ravenapp.com/api/v1'
}

export default function OrderDetail() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const { orderId } = route.params

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => fetchOrderDetail(orderId),
  })

  const handleViewPDF = async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token')
      const baseUrl = getBaseUrl()
      // Open in browser - user can download/view the PDF
      await WebBrowser.openBrowserAsync(
        `${baseUrl}/sales-orders/${orderId}/generate-pdf/`,
        { toolbarColor: '#020617' }
      )
    } catch {
      Alert.alert('Error', 'Could not open PDF viewer.')
    }
  }

  if (isLoading || !order) {
    return (
      <SafeAreaView className="flex-1 bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#e02424" />
      </SafeAreaView>
    )
  }

  const isShipped = order.status === 'shipped' || order.status === 'complete'
  const isCancelled = order.status === 'cancelled'
  const isDraft = order.status === 'draft'

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-6 pt-4 pb-4 flex-row items-center">
          <Pressable onPress={() => navigation.goBack()} className="mr-3 p-1">
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-white text-xl font-bold">{order.order_number}</Text>
            <Text className="text-slate-400 text-xs mt-0.5">{order.customer_name}</Text>
          </View>
          <StatusBadge status={order.status} />
        </View>

        {/* Step Indicator */}
        {!isCancelled && !isDraft && (
          <View className="px-4 py-4 mb-2">
            <StepIndicator status={order.status} />
          </View>
        )}

        {/* Cancelled Banner */}
        {isCancelled && (
          <View className="mx-6 mb-4 bg-red-950 border border-red-900 rounded-xl p-4 flex-row items-center">
            <Feather name="x-circle" size={20} color="#f87171" />
            <Text className="text-red-400 text-sm font-medium ml-3">
              This order has been cancelled
            </Text>
          </View>
        )}

        {/* Order Info Cards */}
        <View className="px-6 mb-4">
          <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <View className="flex-row mb-3">
              <View className="flex-1">
                <Text className="text-slate-500 text-xs uppercase tracking-wider">Order Date</Text>
                <Text className="text-white text-sm font-medium mt-1">{order.order_date}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-500 text-xs uppercase tracking-wider">Scheduled</Text>
                <Text className="text-white text-sm font-medium mt-1">
                  {order.scheduled_date || 'Not scheduled'}
                </Text>
              </View>
            </View>
            <View className="flex-row mb-3">
              <View className="flex-1">
                <Text className="text-slate-500 text-xs uppercase tracking-wider">Ship To</Text>
                <Text className="text-white text-sm font-medium mt-1">
                  {order.ship_to_name || '--'}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-500 text-xs uppercase tracking-wider">Customer PO</Text>
                <Text className="text-white text-sm font-medium mt-1">
                  {order.customer_po || '--'}
                </Text>
              </View>
            </View>
            {order.notes ? (
              <View>
                <Text className="text-slate-500 text-xs uppercase tracking-wider">Notes</Text>
                <Text className="text-slate-300 text-sm mt-1">{order.notes}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Shipped info */}
        {isShipped && (
          <View className="mx-6 mb-4 bg-green-950 border border-green-900 rounded-xl p-4 flex-row items-center">
            <View className="w-9 h-9 rounded-lg bg-green-600/20 items-center justify-center mr-3">
              <Feather name="truck" size={18} color="#4ade80" />
            </View>
            <View>
              <Text className="text-green-400 text-sm font-semibold">Order Shipped</Text>
              <Text className="text-green-600 text-xs mt-0.5">
                Delivered on {order.scheduled_date || 'N/A'}
              </Text>
            </View>
          </View>
        )}

        {/* Line Items */}
        <View className="px-6 mb-4">
          <Text className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">
            Line Items ({order.lines?.length ?? 0})
          </Text>
          <View className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {(order.lines ?? []).map((line: OrderLine, idx: number) => (
              <View
                key={line.id}
                className={`flex-row items-center px-4 py-3.5 ${
                  idx < (order.lines?.length ?? 0) - 1 ? 'border-b border-slate-800' : ''
                }`}
              >
                <View className="flex-1 mr-3">
                  <Text className="text-white text-sm font-semibold">{line.item_sku}</Text>
                  <Text className="text-slate-400 text-xs mt-0.5" numberOfLines={1}>
                    {line.item_name}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-white text-sm font-bold">
                    ${parseFloat(line.line_total).toFixed(2)}
                  </Text>
                  <Text className="text-slate-500 text-xs mt-0.5">
                    {line.quantity_ordered} x ${parseFloat(line.unit_price).toFixed(2)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Total */}
        <View className="mx-6 mb-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex-row items-center justify-between">
          <Text className="text-slate-400 text-sm font-medium">Order Total</Text>
          <Text className="text-white text-2xl font-bold">
            ${parseFloat(order.subtotal).toFixed(2)}
          </Text>
        </View>

        {/* Actions */}
        <View className="px-6 mb-8">
          <Pressable
            onPress={handleViewPDF}
            className="bg-slate-800 border border-slate-700 py-4 rounded-xl flex-row items-center justify-center active:bg-slate-700"
          >
            <Feather name="file-text" size={18} color="#e02424" />
            <Text className="text-rose-500 text-sm font-semibold ml-2">View Order PDF</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
