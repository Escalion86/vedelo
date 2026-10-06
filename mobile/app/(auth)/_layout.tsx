import { Stack } from 'expo-router'
import { useTheme } from '../../src/shared/ui/ThemeProvider'

export default function AuthLayout() {
  const { palette } = useTheme()
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas } }} />
}
