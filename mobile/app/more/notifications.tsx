import { PageHeader, Screen } from '../../src/shared/ui/components'
import { NotificationsSection } from '../../src/features/notifications/NotificationsSection'
export default function NotificationsScreen() {
  return <Screen><PageHeader title="Уведомления" subtitle="Push и напоминания" /><NotificationsSection /></Screen>
}
