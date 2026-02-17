import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Feather } from '@expo/vector-icons'
import HomeScreen from '../screens/HomeScreen'
import NewEstimate from '../screens/estimates/NewEstimate'
import MenuScreen from '../screens/MenuScreen'
import DriverManifestScreen from '../screens/driver/DriverManifestScreen'

export type MainTabsParamList = {
  Home: undefined
  Quote: undefined
  Delivery: undefined
  Menu: undefined
}

const Tabs = createBottomTabNavigator<MainTabsParamList>()

export default function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#020617',
          borderTopColor: '#1e293b',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarActiveTintColor: '#e02424',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Quote"
        component={NewEstimate}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Feather name="file-plus" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Delivery"
        component={DriverManifestScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Feather name="truck" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Menu"
        component={MenuScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Feather name="grid" size={size} color={color} />
          ),
        }}
      />
    </Tabs.Navigator>
  )
}
