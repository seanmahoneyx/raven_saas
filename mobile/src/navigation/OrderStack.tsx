import { createNativeStackNavigator } from '@react-navigation/native-stack'
import OrderList from '../screens/orders/OrderList'
import OrderDetail from '../screens/orders/OrderDetail'

export type OrderStackParamList = {
  OrderList: undefined
  OrderDetail: { orderId: number }
}

const Stack = createNativeStackNavigator<OrderStackParamList>()

export default function OrderStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OrderList" component={OrderList} />
      <Stack.Screen name="OrderDetail" component={OrderDetail} />
    </Stack.Navigator>
  )
}
