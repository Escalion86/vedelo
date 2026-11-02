import { useState } from 'react'
import { Text } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Button, Field, Notice, PageHeader, Screen, SectionTitle, StatusChip, Surface } from '../../src/shared/ui/components'
import { useTheme } from '../../src/shared/ui/ThemeProvider'
import { learningRoute, useLearning } from '../../src/features/learning/useLearning'

export default function LearningScreen() {
  const { article: initialArticle } = useLocalSearchParams<{ article?: string }>()
  const [opened, setOpened] = useState(initialArticle || ''), [search, setSearch] = useState(''), [unread, setUnread] = useState(false)
  const { catalog, progress, mutation } = useLearning('visit')
  const { palette } = useTheme()
  const data = progress.data
  const done = new Set([...(data?.readIds || []), ...(data?.knownIds || [])])
  return <Screen><PageHeader title="Обучение" subtitle="Материалы и ваш прогресс" />
    {catalog.isPending || progress.isPending ? <Notice message="Загружаем материалы…" /> : null}
    {catalog.isError || progress.isError ? <><Notice tone="danger" message="Не удалось загрузить обучение. Проверьте подключение." /><Button title="Повторить загрузку" onPress={() => { void catalog.refetch(); void progress.refetch() }} /></> : null}
    {mutation.isError ? <Notice tone="danger" message="Отметка не сохранена. Повторите действие." /> : null}
    {data ? <Surface><SectionTitle>{`${done.size} из ${catalog.data?.length || 0} материалов изучено`}</SectionTitle>
      <Button title={data.enabled ? 'Отключить советы' : 'Включить советы'} variant="secondary" disabled={mutation.isPending} onPress={() => mutation.mutate({ action: 'preference', enabled: !data.enabled })} />
    </Surface> : null}
    <Field label="Поиск материалов" value={search} onChangeText={setSearch} />
    <Button title={unread ? 'Показать все материалы' : 'Только неизученные'} variant="secondary" onPress={() => setUnread(value => !value)} />
    {(catalog.data || []).filter(item => (!unread || !done.has(item.id)) && `${item.title} ${item.summary} ${item.category}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))).map(item => <Surface key={item.id}>
      <Text style={{ color: palette.cardMuted }}>{item.category}</Text><SectionTitle>{item.title}</SectionTitle>
      {done.has(item.id) ? <StatusChip label={data?.readIds.includes(item.id) ? 'Прочитано' : 'Уже знаю'} tone="success" /> : null}
      <Text style={{ color: palette.text }}>{item.summary}</Text>
      {!item.access.available ? <Notice message={item.access.label || 'Недоступно на текущем тарифе'} /> : null}
      <Button title={opened === item.id ? 'Свернуть материал' : 'Как это сделать'} variant="secondary" onPress={() => setOpened(opened === item.id ? '' : item.id)} />
      {opened === item.id ? <>{item.steps.map((step, index) => <Text key={index} style={{ color: palette.text }}>{`${index + 1}. ${step}`}</Text>)}
        <Button title={item.action} disabled={!item.access.available} onPress={() => router.push(learningRoute(item.href) as never)} />
        <Button title="Отметить прочитанным" variant="secondary" disabled={!data || mutation.isPending || data.readIds.includes(item.id)} onPress={() => mutation.mutate({ action: 'read', articleId: item.id })} />
      </> : null}
      <Button title="Уже знаю" variant="secondary" disabled={!data || mutation.isPending || done.has(item.id)} onPress={() => mutation.mutate({ action: 'known', articleId: item.id })} />
    </Surface>)}
  </Screen>
}
