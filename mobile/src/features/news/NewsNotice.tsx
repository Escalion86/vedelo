import { router } from 'expo-router'
import { Button, Notice, Surface } from '../../shared/ui/components'
import { unreadNews, useNews } from './useNews'

export function NewsNotice() {
  const { query } = useNews()
  const unread = unreadNews(query.data)
  if (!unread.length) return null
  return <Surface><Notice message={`Что нового: ${unread.length} · ${unread[0].title}`} />
    <Button title="Прочитать новости Ведело" variant="secondary" onPress={() => router.push('/more/news')} />
  </Surface>
}
