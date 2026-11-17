import { useEffect, useState } from 'react'
import { AccessibilityInfo, Animated, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../../shared/ui/ThemeProvider'
import { calendarSyncLabel } from './calendarSync'

const CalendarSyncProgress = ({ color }: { color: string }) => {
  const [opacity] = useState(() => new Animated.Value(1))
  useEffect(() => {
    let alive = true
    let reduceMotionReported = false
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.4, duration: 450, useNativeDriver: true, isInteraction: false }),
      Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true, isInteraction: false }),
    ]))
    const apply = (reduceMotion: boolean) => {
      animation.stop()
      opacity.setValue(1)
      if (!reduceMotion) animation.start()
    }
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduceMotion) => {
      reduceMotionReported = true
      apply(reduceMotion)
    })
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (alive && !reduceMotionReported) apply(reduceMotion)
    }).catch(() => {})
    return () => {
      alive = false
      subscription.remove()
      animation.stop()
    }
  }, [opacity])
  return <Animated.View style={{ opacity }}>
    <MaterialCommunityIcons name="calendar-sync-outline" size={15} color={color} />
  </Animated.View>
}

export function CalendarSyncIndicator({ status, decorative = false }: { status: '' | 'pending' | 'failed'; decorative?: boolean }) {
  const { palette } = useTheme()
  if (!status) return null
  return <View accessible={!decorative} accessibilityRole={decorative ? undefined : 'image'}
    accessibilityLabel={decorative ? undefined : calendarSyncLabel(status)}
    importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}>
    {status === 'pending' ? <CalendarSyncProgress color={palette.notice.info.text} />
      : <MaterialCommunityIcons name="calendar-alert" size={15} color={palette.notice.danger.text} />}
  </View>
}
