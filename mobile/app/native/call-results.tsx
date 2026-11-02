import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import { api } from '../../src/shared/api/client'
import { Button, EmptyState, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../src/shared/ui/components'
type SavedResult = { _id: string; phone: string; note: string; result: string; direction: string; savedAt: string; eventId: string | null; clientId: string | null; pending: boolean }
const labels: Record<string, string> = { answered: 'Ответил', no_answer: 'Не ответил', callback: 'Перезвонить', follow_up: 'Следующий контакт' }
export default function CallResultsScreen() {
  const { user, authenticated } = useAuth()
  const query = useQuery({ queryKey: ['android-call-results', user?.tenantId, user?._id], enabled: authenticated,
    queryFn: async ({ signal }) => (await api.request<{ data: SavedResult[] }>('/calls/android', { signal })).data })
  return <Screen><PageHeader title="Итоги телефонных звонков" subtitle="Последние 100 сохранённых вручную результатов" />
    <Button title="Записать итог разговора" onPress={() => router.push('/native/call-result')} />
    {query.isPending ? <Notice message="Загрузка…" /> : null}{query.isError ? <Notice tone="danger" message="Не удалось загрузить итоги звонков" /> : null}
    {query.data?.length === 0 ? <EmptyState title="Сохранённых итогов пока нет" /> : null}
    {query.data?.map(item => <Surface key={item._id}><SectionTitle>{item.phone}</SectionTitle>
      <Notice message={`${labels[item.result] || item.result}\nСохранено: ${new Date(item.savedAt).toLocaleString('ru-RU')}${item.note ? `\n${item.note}` : ''}`} />
      {item.pending ? <Notice tone="warning" message="Создание следующего контакта не завершено. Повторите сохранённую попытку на исходном устройстве." /> : null}
      {item.clientId ? <Button title="Открыть клиента" variant="secondary" onPress={() => router.push(`/clients/${item.clientId}` as never)} /> : null}
      {item.eventId ? <Button title="Открыть работу" variant="secondary" onPress={() => router.push(`/events/${item.eventId}` as never)} /> : null}
    </Surface>)}
    <Button title="Обновить итоги" variant="secondary" onPress={() => void query.refetch()} />
  </Screen>
}
