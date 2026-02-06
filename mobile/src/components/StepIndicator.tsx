import { View, Text } from 'react-native'
import { Feather } from '@expo/vector-icons'

interface Step {
  key: string
  label: string
}

const STEPS: Step[] = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'picking', label: 'Production' },
  { key: 'shipped', label: 'Shipped' },
]

// Map each status to its step index (-1 means not started)
function getStepIndex(status: string): number {
  switch (status) {
    case 'confirmed':
      return 0
    case 'scheduled':
      return 1
    case 'picking':
    case 'crossdock':
      return 2
    case 'shipped':
    case 'complete':
      return 3
    default:
      return -1 // draft, cancelled
  }
}

interface Props {
  status: string
}

export default function StepIndicator({ status }: Props) {
  const currentIndex = getStepIndex(status)

  return (
    <View className="flex-row items-center px-2">
      {STEPS.map((step, i) => {
        const isComplete = i < currentIndex
        const isActive = i === currentIndex
        const isPending = i > currentIndex

        return (
          <View key={step.key} className="flex-1 items-center">
            {/* Connector line (before this step) */}
            <View className="flex-row items-center w-full">
              {i > 0 && (
                <View
                  className="flex-1 h-0.5"
                  style={{
                    backgroundColor: isComplete || isActive ? '#e02424' : '#334155',
                  }}
                />
              )}
              {i === 0 && <View className="flex-1" />}

              {/* Circle */}
              <View
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{
                  backgroundColor: isComplete
                    ? '#e02424'
                    : isActive
                      ? '#e02424'
                      : '#1e293b',
                  borderWidth: isPending ? 2 : 0,
                  borderColor: '#334155',
                }}
              >
                {isComplete ? (
                  <Feather name="check" size={14} color="#fff" />
                ) : (
                  <Text
                    className="text-xs font-bold"
                    style={{ color: isActive ? '#fff' : '#64748b' }}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>

              {i < STEPS.length - 1 && (
                <View
                  className="flex-1 h-0.5"
                  style={{
                    backgroundColor: isComplete ? '#e02424' : '#334155',
                  }}
                />
              )}
              {i === STEPS.length - 1 && <View className="flex-1" />}
            </View>

            {/* Label */}
            <Text
              className="text-xs mt-1.5 text-center"
              style={{
                color: isComplete || isActive ? '#e02424' : '#64748b',
                fontWeight: isActive ? '700' : '500',
              }}
            >
              {step.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
