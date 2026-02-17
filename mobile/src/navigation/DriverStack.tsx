import { createNativeStackNavigator } from '@react-navigation/native-stack'
import DriverManifestScreen from '../screens/driver/DriverManifestScreen'
import StopDetailScreen from '../screens/driver/StopDetailScreen'
import PODCaptureScreen from '../screens/driver/PODCaptureScreen'

export type DriverStackParamList = {
  Manifest: undefined
  StopDetail: { stop: any; runId: number }
  PODCapture: { stopId: number; customerName: string }
}

const Stack = createNativeStackNavigator<DriverStackParamList>()

export default function DriverStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Manifest" component={DriverManifestScreen} />
      <Stack.Screen name="StopDetail" component={StopDetailScreen} />
      <Stack.Screen name="PODCapture" component={PODCaptureScreen} />
    </Stack.Navigator>
  )
}
