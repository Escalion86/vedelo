import { useEffect, useRef, useState } from 'react'
import { Pressable, Text } from 'react-native'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import { getAuthSessionEpoch } from '../../src/shared/auth/tokenStore'
import { Button, Notice, PageHeader, Screen, SectionTitle, StatusChip, Surface } from '../../src/shared/ui/components'
import { useTheme } from '../../src/shared/ui/ThemeProvider'
import { NewsContent } from '../../src/features/news/NewsContent'
import { unreadNews, useNews } from '../../src/features/news/useNews'

export default function NewsScreen() {
  const { user } = useAuth()
  return <NewsReader key={`${user?.tenantId}:${user?._id}`} />
}
function NewsReader() {
  const { query, markSeen } = useNews(), { palette } = useTheme()
  const [opened, setOpened] = useState(''), [seenError, setSeenError] = useState(false)
  const [marking, setMarking] = useState(false)
  const first = useRef(true), alive = useRef(true), markLock = useRef(false), seenTarget = useRef('')
  const fresh = useRef(new Set<string>())
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const mark = async () => {
    if (markLock.current || !seenTarget.current) return
    markLock.current = true; setMarking(true)
    const epoch = getAuthSessionEpoch(), current = () => alive.current && epoch === getAuthSessionEpoch()
    try { await markSeen(seenTarget.current); if (current()) setSeenError(false) }
    catch { if (current()) setSeenError(true) }
    finally { markLock.current = false; if (current()) setMarking(false) }
  }
  useEffect(() => {
    if (!query.data || !first.current) return
    first.current = false
    const unread = unreadNews(query.data).sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    fresh.current = new Set(unread.map(item => item._id))
    if (unread[0]?.publishedAt) { setOpened(unread[0]._id); seenTarget.current = unread[0].publishedAt; void mark() }
    // Mark only the catalogue the user actually opened, not background arrivals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data])
  const article = query.data?.items.find(item => item._id === opened)
  return <Screen scroll={!article} contentStyle={article ? { flex: 1 } : undefined}>
    <PageHeader title="Что нового" />
    {seenError ? <><Notice tone="warning" message="Новости открыты, но отметка прочтения не сохранена." /><Button title="Повторить отметку прочтения" variant="secondary" disabled={marking} onPress={() => void mark()} /></> : null}
    {query.isPending ? <Notice message="Загружаем новости…" /> : null}
    {query.isError ? <><Notice tone="warning" message="Не удалось обновить новости. Проверьте подключение." /><Button title="Повторить загрузку новостей" onPress={() => void query.refetch()} /></> : null}
    {article ? <>
      <Button title="Все новости" variant="secondary" onPress={() => setOpened('')} />
      <SectionTitle>{article.title}</SectionTitle>
      <Text style={{ color: palette.cardMuted }}>{[article.version, article.publishedAt ? new Date(article.publishedAt).toLocaleDateString('ru-RU') : ''].filter(Boolean).join(' · ')}</Text>
      <NewsContent html={article.contentHtml} />
    </> : <>
      {query.data?.items.length === 0 ? <Notice message="Новостей пока нет" /> : null}
      {query.data?.items.map(item => <Surface key={item._id}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Читать: ${item.title}`} onPress={() => setOpened(item._id)} style={{ minHeight: 48, gap: 8 }}>
          <SectionTitle>{item.title}</SectionTitle>
          <Text style={{ color: palette.cardMuted }}>{[item.version, item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('ru-RU') : ''].filter(Boolean).join(' · ')}</Text>
          {fresh.current.has(item._id) ? <StatusChip label="Новое" tone="upcoming" /> : null}
        </Pressable>
      </Surface>)}
    </>}
  </Screen>
}
