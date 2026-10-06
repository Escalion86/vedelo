import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import type { Service, ServiceGroup } from '../../shared/domain/types'
import { getCachedEntity, listCachedEntities } from '../../shared/storage/cache'
import { deleteLocalEntity, saveLocalEntity } from '../../shared/storage/mutations'
import { Button, CompactField, EmptyState, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { servicePatch, serviceValues, type ServiceValues } from './serviceUi'

export const ServiceEditor = ({ group = false }: { group?: boolean }) => {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId?: string }>()
  const isNew = id === 'new'
  const kind = group ? 'serviceGroups' : 'services'
  const name = group ? 'группы' : 'услуги'
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const styles = useThemeStyles(createStyles)
  const [values, setValues] = useState<ServiceValues>(() => serviceValues())
  const initial = useRef(serviceValues())
  const [groups, setGroups] = useState<ServiceGroup[]>([])
  const [serviceCount, setServiceCount] = useState(0)
  const [state, setState] = useState<'loading' | 'error' | 'missing' | 'ready'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const confirming = useRef(false)
  usePreventRemove((dirty || loading) && !saved, ({ data }) => {
    if (busy.current) return
    Alert.alert('Есть несохранённые изменения', 'Выйти без сохранения?', [
      { text: 'Продолжить редактирование', style: 'cancel' },
      { text: 'Выйти без сохранения', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  })
  useEffect(() => { if (saved) router.replace('/more/services') }, [saved])
  useEffect(() => {
    let active = true
    setState('loading'); setError('')
    Promise.all([
      !isNew ? getCachedEntity<Service & ServiceGroup>(kind, id) : Promise.resolve(null),
      group ? listCachedEntities<Service>('services') : listCachedEntities<ServiceGroup>('serviceGroups'),
    ]).then(([item, related]) => {
      if (!active) return
      if (!isNew && !item) { setState('missing'); return }
      const next = serviceValues(item)
      if (isNew && !group && groupId) next.groupId = groupId
      initial.current = next; setValues(next); setDirty(false)
      if (group) setServiceCount((related as Service[]).filter((service) => service.groupId === id).length)
      else setGroups((related as ServiceGroup[]).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
      setState('ready')
    }).catch(() => { if (active) setState('error') })
    return () => { active = false }
  }, [id, isNew, kind, group, groupId, attempt])
  const change = (patch: Partial<ServiceValues>) => {
    if (busy.current || state !== 'ready') return
    const next = { ...values, ...patch }
    setValues(next); setDirty(JSON.stringify(next) !== JSON.stringify(initial.current))
    setError('')
  }
  const invalidate = async () => {
    await Promise.all(['services', 'serviceGroups'].map((entityType) => queryClient.invalidateQueries({ queryKey: ['cached-entities', entityType] })))
  }
  const save = async () => {
    if (busy.current || state !== 'ready' || saved) return
    let patch: Record<string, unknown>
    try { patch = servicePatch(values, initial.current, isNew, group) } catch (cause) { setError((cause as Error).message); return }
    if (!isNew && !Object.keys(patch).length) return
    busy.current = true; setLoading(true); setError('')
    try {
      if (!isNew && !await getCachedEntity(kind, id)) { setState('missing'); return }
      if (!group && patch.groupId && !await getCachedEntity('serviceGroups', String(patch.groupId))) throw new Error('Выбранная группа удалена. Выберите другую группу или «Без группы».')
      await saveLocalEntity({ entityType: kind, entityId: isNew ? undefined : id, values: patch })
      setDirty(false); setSaved(true)
      try { await invalidate() } catch { /* Локальная запись завершена; список может повторить чтение. */ }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения') }
    finally { busy.current = false; setLoading(false) }
  }
  const performDelete = async () => {
    confirming.current = false
    if (busy.current || saved || state !== 'ready') return
    busy.current = true; setLoading(true); setError('')
    try {
      if (!await getCachedEntity(kind, id)) { setState('missing'); return }
      if (group) {
        const services = await listCachedEntities<Service>('services')
        for (const service of services.filter((item) => item.groupId === id)) {
          // Повторное чтение: удалённая параллельно услуга не должна стать пустой новой записью.
          const current = await getCachedEntity<Service>('services', service._id)
          if (current?.groupId === id) await saveLocalEntity({ entityType: 'services', entityId: service._id, values: { groupId: null } })
        }
      }
      await deleteLocalEntity(kind, id)
      setDirty(false); setSaved(true)
    } catch {
      setError(group ? 'Не удалось завершить удаление группы. Уже перенесённые услуги остались без группы; повторите действие.' : 'Не удалось удалить услугу. Повторите действие.')
    } finally {
      try { await invalidate() } catch { /* Результат локальной операции уже показан. */ }
      busy.current = false; setLoading(false)
    }
  }
  const remove = () => {
    if (busy.current || confirming.current || saved || state !== 'ready') return
    confirming.current = true
    Alert.alert(group ? 'Удалить группу?' : 'Удалить услугу?', group
      ? `«${initial.current.title}». Услуг в группе: ${serviceCount}. Услуги сохранятся в «Без группы». Изменения попадут в очередь синхронизации.`
      : `«${initial.current.title}». Удаление попадёт в очередь синхронизации.`, [
      { text: 'Отмена', style: 'cancel', onPress: () => { confirming.current = false } },
      { text: 'Удалить', style: 'destructive', onPress: () => { void performDelete() } },
    ], { cancelable: true, onDismiss: () => { confirming.current = false } })
  }
  const title = group ? isNew ? 'Новая группа' : 'Группа услуг' : isNew ? 'Новая услуга' : 'Редактирование услуги'
  return <Screen keyboardShouldPersistTaps="handled">
    <PageHeader title={title} />
    {state === 'loading' ? <Notice message={`Загружаем данные ${name}…`} /> : state === 'error' ? <><Notice tone="danger" message={`Не удалось загрузить данные ${name}.`} /><Button title="Повторить загрузку" variant="secondary" onPress={() => setAttempt((current) => current + 1)} /></> : state === 'missing' ? <><EmptyState title={group ? 'Группа не найдена' : 'Услуга не найдена'} description="Запись отсутствует в локальных данных или удалена." /><Button title="К услугам" variant="secondary" onPress={() => router.replace('/more/services')} /></> : <>
      <Surface>
        <CompactField label={group ? 'Название группы' : 'Название'} value={values.title} onChangeText={(title) => change({ title })} editable={!loading} />
        {group ? <><CompactField label="Порядок" value={values.order} onChangeText={(order) => change({ order })} keyboardType="numbers-and-punctuation" editable={!loading} /><Text style={styles.muted}>Услуг в группе: {serviceCount}</Text></> : <>
          <SectionTitle>Группа</SectionTitle>
          <View style={styles.options}>
            {[{ _id: '', title: 'Без группы' }, ...groups].map((item) => <Pressable key={item._id} accessibilityRole="radio" accessibilityLabel={item.title || 'Группа'} accessibilityState={{ selected: item._id === values.groupId, disabled: loading }} disabled={loading} onPress={() => change({ groupId: item._id })} style={({ pressed }) => [styles.option, item._id === values.groupId && styles.selected, loading && styles.disabled, pressed && styles.pressed]}><Text style={styles.optionText}>{item.title || 'Группа'}</Text></Pressable>)}
          </View>
          {values.groupId && !groups.some((item) => item._id === values.groupId) ? <Notice tone="warning" message="Исходная группа недоступна. При правке других полей связь сохраняется; при необходимости выберите «Без группы»." /> : null}
          <CompactField label="Описание" value={values.description} onChangeText={(description) => change({ description })} multiline editable={!loading} />
          <CompactField label="Продолжительность, минут" value={values.duration} onChangeText={(duration) => change({ duration })} keyboardType="decimal-pad" editable={!loading} />
          <CompactField label="Цена, ₽" value={values.price} onChangeText={(price) => change({ price })} keyboardType="decimal-pad" editable={!loading} />
        </>}
        {error ? <Notice tone="danger" message={error} /> : null}
        <Button title="Сохранить" onPress={() => void save()} loading={loading} disabled={saved || (!isNew && !dirty)} />
        <Text style={styles.muted}>Изменения сохраняются на устройстве и передаются через очередь синхронизации.</Text>
      </Surface>
      {!isNew ? <Button title={group ? 'Удалить группу' : 'Удалить услугу'} variant="danger" onPress={remove} disabled={loading || saved} /> : null}
    </>}
  </Screen>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  muted: { color: palette.cardMuted, fontSize: 13, lineHeight: 18 }, options: { gap: 8 },
  option: { minHeight: 44, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  selected: { borderColor: palette.primary, backgroundColor: palette.rowSelected }, optionText: { color: palette.text, fontSize: 14 },
  disabled: { opacity: 0.65 }, pressed: { opacity: 0.82 },
})
