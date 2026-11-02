import { router } from 'expo-router'
import { useIsFocused } from '@react-navigation/native'
import { Button, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useLearning } from './useLearning'

export const LearningTip = () => {
  const focused = useIsFocused()
  const { catalog, progress, mutation } = useLearning('present', focused)
  const data = progress.data
  const item = catalog.data?.find(article => article.id === data?.tipId)
  if (!progress.isSuccess || !data?.enabled || data.tipDismissed || !item || data.readIds.includes(item.id) || data.knownIds.includes(item.id)) return null
  return <Surface><SectionTitle>Полезный совет</SectionTitle><Notice message={item.title} />
    {!item.access.available ? <Notice message={item.access.label || 'Недоступно на текущем тарифе'} /> : null}
    <Button title="Как это сделать" onPress={() => router.push({ pathname: '/more/learning', params: { article: item.id } })} />
    <Button title="Уже знаю" variant="secondary" disabled={mutation.isPending} onPress={() => mutation.mutate({ action: 'known', articleId: item.id })} />
    <Button title="Скрыть совет" variant="secondary" disabled={mutation.isPending} onPress={() => mutation.mutate({ action: 'dismiss', articleId: item.id })} />
    {mutation.isError ? <Notice tone="danger" message="Не удалось сохранить отметку. Повторите действие." /> : null}
  </Surface>
}
