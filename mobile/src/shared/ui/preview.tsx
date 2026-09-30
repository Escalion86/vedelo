// Isolated development entry. Not imported by Expo Router or the production app.
import { registerRootComponent } from 'expo'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider, useTheme } from './ThemeProvider'
import { Button, CompactField, EmptyState, Field, FilterOverlay, Notice, PageHeader, Screen, StatusChip, Surface } from './components'
import type { NoticeTone, TemporalStatus } from './theme'

const Demo = () => {
  const { palette, setPreference } = useTheme()
  const [query, setQuery] = useState('Анна')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const [narrow, setNarrow] = useState(false)
  const [actions, setActions] = useState(0)
  const [firstCardY, setFirstCardY] = useState(0)
  return (
    <Screen>
      <StatusBar style={palette.mode === 'dark' ? 'light' : 'dark'} />
      <PageHeader title="Клиенты и следующие контакты" count={0} />
      <Button title={`Тема: ${palette.mode}`} variant="secondary"
        onPress={() => void setPreference(palette.mode === 'light' ? 'dark' : 'light')} />
      <CompactField search label="Поиск клиента" placeholder="Введите имя или телефон"
        value={query} onChangeText={setQuery} loading={loading} />
      <Button title={`Загрузка: ${loading ? 'да' : 'нет'}`} variant="secondary" onPress={() => setLoading(!loading)} />
      <Button title={`Ширина фильтра: ${narrow ? 260 : 340}`} variant="secondary" onPress={() => setNarrow(!narrow)} />
      <FilterOverlay title="Фильтры" visible={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}
        maxWidth={narrow ? 260 : 340} selected={filter !== 'all'} onSelect={setFilter}
        options={[
          { value: 'all', label: 'Все клиенты', selected: filter === 'all' },
          { value: 'requests', label: 'С заявками без следующего запланированного контакта', selected: filter === 'requests' },
          { value: 'disabled', label: 'Недоступный вариант', disabled: true },
          ...Array.from({ length: 12 }, (_, index) => ({ value: `item-${index}`, label: `Вариант ${index + 1}`, selected: filter === `item-${index}` })),
        ]} />
      <Surface testID="first-card" onLayout={(event) => setFirstCardY(event.nativeEvent.layout.y)}>
        <Text style={{ color: palette.cardTitle }}>Первая карточка — Анна Петрова</Text>
        <Text style={{ color: palette.cardMeta }}>Координата y: {firstCardY}; действий: {actions}</Text>
        <Button title="Сохранить" loading={loading} onPress={() => setActions(actions + 1)} />
        <Button title="Повторить" variant="secondary" loading={loading} onPress={() => setActions(actions + 1)} />
        <Button title="Удалить" variant="danger" disabled />
      </Surface>
      <Surface variant="toolbar"><Text style={{ color: palette.text }}>Панель инструментов</Text></Surface>
      <Surface variant="kpi"><Text style={{ color: palette.text }}>Оплачено: 0 ₽</Text></Surface>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['overdue', 'today', 'tomorrow', 'upcoming', 'neutral'] as TemporalStatus[]).map((tone, index) =>
          <StatusChip key={tone} tone={tone} label={['Просрочено', 'Сегодня', 'Завтра', 'Ближайшее', 'Без срока'][index]} />)}
        <StatusChip label="Закрыто" eventStatus="closed" />
      </View>
      {(['success', 'warning', 'danger', 'info', 'neutral'] as NoticeTone[]).map((tone) =>
        <Notice key={tone} tone={tone} message="Проверка длинного сообщения: текст должен переноситься и оставаться читаемым при увеличенном системном шрифте." />)}
      <Field label="Многострочный комментарий" multiline placeholder="Введите комментарий" />
      <EmptyState title="Ничего не найдено" description="Попробуйте изменить фильтры"
        icon={<Text style={{ color: palette.primary }}>⌕</Text>}
        action={{ title: 'Сбросить фильтры', onPress: () => { setFilter('all'); setQuery('') } }} />
    </Screen>
  )
}

const Preview = () => __DEV__ ? (
  <SafeAreaProvider><ThemeProvider storage={null}><Demo /></ThemeProvider></SafeAreaProvider>
) : null
registerRootComponent(Preview)
