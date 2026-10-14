import { router } from 'expo-router'
import { Button, PageHeader, Screen } from '../../shared/ui/components'
import { ClientReviewsSection } from './ClientReviewsSection'
export function ClientReviewsScreen() {
  return <Screen keyboardShouldPersistTaps="handled"><PageHeader title="Отзывы клиентов" />
    <Button title="Настройка страницы отзывов" variant="secondary" onPress={()=>router.push('/more/review-page')} />
    <ClientReviewsSection title="Запросы и ответы" />
  </Screen>
}
