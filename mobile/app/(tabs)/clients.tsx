import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import type { Client, Event } from '../../src/shared/domain/types'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import { useWorkItemTerminology } from '../../src/shared/hooks/useWorkItemTerminology'
import { deleteLocalEntity } from '../../src/shared/storage/mutations'
import { Button, CompactField, EmptyState, ErrorNotice, FilterControl, FilterOverlay, PageHeader, Screen } from '../../src/shared/ui/components'
import { useTheme, useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import type { Palette } from '../../src/shared/ui/theme'
import { MobileClientCard } from '../../src/features/clients/MobileClientCard'
import { clientName, clientSummary, selectClients, type ClientFilter } from '../../src/features/clients/clientList'

export default function ClientsScreen() {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const terms = useWorkItemTerminology()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ClientFilter>('all')
  const [overlay, setOverlay] = useState(false)
  const [error, setError] = useState('')
  const deleting = useRef(false)
  const query = useCachedEntities<Client>('clients')
  const events = useCachedEntities<Event>('events')
  const clients = useMemo(() => selectClients(query.data || [], events.data || [], search, filter), [query.data, events.data, search, filter])
  const summaries = useMemo(() => new Map(clients.map((client) => [client._id, clientSummary(client._id, events.data || [])])), [clients, events.data])
  const hasFilters = Boolean(search.trim() || filter !== 'all')
  const reset = () => { setSearch(''); setFilter('all') }
  const add = () => router.push('/clients/edit/new' as never)
  const remove = useCallback((client: Client) => Alert.alert('Удалить клиента?', clientName(client), [
    { text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: async () => {
      if (deleting.current) return
      deleting.current = true; setError('')
      try { await deleteLocalEntity('clients', client._id); await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'clients'] }) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось удалить клиента') }
      finally { deleting.current = false }
    } },
  ]), [queryClient])
  const selectedLabel = filter === 'requests' ? 'С заявками' : filter === 'events' ? terms.pluralCapitalized : filter === 'canceled' ? 'Есть отмены' : 'Все клиенты'
  const loading = query.isPending || events.isPending
  const failed = query.isError || events.isError
  const retry = () => { void query.refetch(); void events.refetch() }
  return <Screen scroll={false} contentStyle={styles.screen}>
    <PageHeader title="Клиенты" count={failed || loading ? undefined : clients.length} />
    <View style={styles.searchRow}>
      <View style={styles.search}><CompactField label="Поиск клиента" testID="clients-search" value={search} onChangeText={setSearch} placeholder="Введите имя или телефон" /></View>
      <Pressable testID="add-client" accessibilityRole="button" accessibilityLabel="Добавить клиента" style={styles.add} onPress={add}>
        <MaterialCommunityIcons name="plus" size={22} color={palette.secondaryText} />
      </Pressable>
    </View>
    <View style={styles.controls}>
      <FilterControl title={selectedLabel} selected={filter === 'all'} onPress={() => setFilter('all')} />
      <FilterOverlay testID="clients-filters" maxWidth={260} visible={overlay} selected={filter !== 'all'} onOpen={() => setOverlay(true)} onClose={() => setOverlay(false)}
        options={([['all', 'Все клиенты'], ['requests', 'С заявками'], ['events', terms.pluralCapitalized], ['canceled', 'Есть отмены'], ['reset', 'Сбросить фильтры']] as const).map(([value, label]) => ({ value, label, selected: filter === value }))}
        onSelect={(value) => value === 'reset' ? reset() : setFilter(value as ClientFilter)} />
    </View>
    {error ? <ErrorNotice message={error} /> : null}
    {failed ? <><ErrorNotice message="Не удалось прочитать клиентов или связанные работы. Статистика может быть неполной." /><Button title="Повторить чтение" variant="secondary" onPress={retry} /></> : null}
    {loading ? <ActivityIndicator accessibilityLabel="Загрузка клиентов" color={palette.primary} /> : null}
    <FlatList testID="clients-list" style={styles.list} data={failed || loading ? [] : clients} keyExtractor={(item) => item._id}
      refreshing={query.isFetching || events.isFetching} onRefresh={() => { void query.refresh(); void events.refresh() }}
      keyboardShouldPersistTaps="handled" contentContainerStyle={clients.length ? styles.rows : styles.empty}
      ListEmptyComponent={!loading && !failed ? <EmptyState title={hasFilters ? 'Ничего не найдено' : 'Клиентов пока нет'}
        description={hasFilters ? 'Попробуйте изменить запрос или фильтры.' : 'Добавьте первого клиента.'}
        action={{ title: hasFilters ? 'Сбросить фильтры' : 'Создать клиента', onPress: hasFilters ? reset : add }} /> : null}
      renderItem={({ item }) => <MobileClientCard client={item} summary={summaries.get(item._id)!} onDelete={remove} />} />

  </Screen>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { paddingBottom: 0 }, searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, search: { flex: 1, minWidth: 0 },
  add: { width: 40, height: 40, marginBottom: 8, borderWidth: 1, borderColor: palette.secondaryBorder, backgroundColor: palette.secondaryBackground, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', gap: 8 }, list: { flex: 1, minHeight: 0 }, rows: { gap: 8, paddingBottom: 16 }, empty: { flexGrow: 1, justifyContent: 'center' },
})
