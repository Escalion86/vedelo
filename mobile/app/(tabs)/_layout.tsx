import { Tabs } from 'expo-router'
import { MobileBottomBar } from '../../src/features/navigation/MobileBottomBar'
import { EventsScopeProvider } from '../../src/features/navigation/EventsScope'
import { useTheme } from '../../src/shared/ui/ThemeProvider'

export default function TabsLayout() {
  const { palette } = useTheme()
  return <EventsScopeProvider>
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.canvas } }} tabBar={(props) => <MobileBottomBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Важное' }} />
      <Tabs.Screen name="events" />
      <Tabs.Screen name="clients" options={{ title: 'Клиенты' }} />
      <Tabs.Screen name="finance" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="tasks" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  </EventsScopeProvider>
}
