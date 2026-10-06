import { useMemo, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import type { Service, ServiceGroup } from '../../shared/domain/types'
import { useCachedEntities } from '../../shared/hooks/useCachedEntities'
import { Button, EmptyState, Notice, StatusChip, Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { serviceCatalog } from './serviceUi'

export const ServicesSection = () => {
  const servicesQuery = useCachedEntities<Service>('services')
  const groupsQuery = useCachedEntities<ServiceGroup>('serviceGroups')
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const catalog = useMemo(() => serviceCatalog(servicesQuery.data || [], groupsQuery.data || []), [servicesQuery.data, groupsQuery.data])
  const retry = () => { void servicesQuery.refetch(); void groupsQuery.refetch() }
  if (servicesQuery.isError || groupsQuery.isError) return <><Notice tone="danger" message="Не удалось прочитать прайс. Услуги не считаются отсутствующими." /><Button title="Повторить загрузку" variant="secondary" onPress={retry} /></>
  if (servicesQuery.isPending || groupsQuery.isPending) return <Notice message="Загружаем услуги и группы…" />
  const groupRows = (id: string, title: string, items: Service[], group?: ServiceGroup) => <Surface key={id} style={styles.card}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}, услуг: ${items.length}`} accessibilityState={{ expanded: !collapsed[id] }} style={styles.grow} onPress={() => setCollapsed((current) => ({ ...current, [id]: !current[id] }))}>
        <View style={styles.header}><MaterialCommunityIcons name={collapsed[id] ? 'chevron-right' : 'chevron-down'} size={22} color={palette.cardMuted} /><Text style={styles.title}>{title} ({items.length})</Text></View>
      </Pressable>
      {group ? <Button title="Изменить" accessibilityLabel={`Редактировать группу ${title}`} variant="secondary" onPress={() => router.push(`/service-groups/edit/${id}` as never)} /> : null}
    </View>
    {group?.syncStatus && group.syncStatus !== 'synced' ? <StatusChip label={group.syncStatus === 'pending' ? 'В очереди' : 'Ошибка синхронизации'} tone="warning" /> : null}
    {!collapsed[id] ? items.length ? items.map((service) => <ServiceRow key={service._id} service={service} />) : <Text style={styles.muted}>В этой группе пока нет услуг.</Text> : null}
  </Surface>
  return <>
    <Text style={styles.muted}>Всего: {catalog.visible.length}</Text>
    {!catalog.visible.length && !catalog.groups.length ? <EmptyState title="Услуги не найдены" description="Добавьте услугу в свой прайс." /> : null}
    {catalog.groups.length ? <>
      {catalog.ungrouped.length ? groupRows('__ungrouped', 'Без группы', catalog.ungrouped) : null}
      {catalog.groups.map((group) => groupRows(group._id, group.title || 'Группа', catalog.visible.filter((item) => item.groupId === group._id), group))}
    </> : catalog.visible.map((service) => <Surface key={service._id} style={styles.card}><ServiceRow service={service} /></Surface>)}
    <Button title="Добавить услугу" onPress={() => router.push('/services/edit/new' as never)} />
    <Button title="Добавить группу" variant="secondary" onPress={() => router.push('/service-groups/edit/new' as never)} />
  </>
}

const ServiceRow = ({ service }: { service: Service }) => {
  const styles = useThemeStyles(createStyles)
  const images = (service as Service & { images?: string[] }).images
  return <Pressable accessibilityRole="button" accessibilityLabel={`Редактировать услугу ${service.title || 'Без названия'}`} onPress={() => router.push(`/services/edit/${service._id}` as never)} style={({ pressed }) => [styles.service, pressed && styles.pressed]}>
    {images?.[0] ? <Image source={{ uri: images[0] }} accessibilityLabel="Изображение услуги" style={styles.image} /> : null}
    <View style={styles.grow}>
      <Text style={styles.title}>{service.title || 'Без названия'}</Text>
      <View style={styles.meta}><Text style={styles.muted}>Продолжительность: {service.duration ? `${service.duration} мин.` : 'Не указана'}</Text><Text style={styles.price}>Цена: {new Intl.NumberFormat('ru-RU').format(Number(service.price || 0))} ₽</Text></View>
      <Text style={styles.muted} numberOfLines={3}>{service.description || 'Описание отсутствует'}</Text>
      {service.syncStatus && service.syncStatus !== 'synced' ? <StatusChip label={service.syncStatus === 'pending' ? 'В очереди' : 'Ошибка синхронизации'} tone="warning" /> : null}
    </View>
  </Pressable>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 }, card: { borderRadius: 8, padding: 12 }, header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  service: { minHeight: 64, flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  title: { color: palette.cardTitle, fontSize: 15.2, fontWeight: '600', flexShrink: 1 }, muted: { color: palette.cardMuted, fontSize: 13.12, lineHeight: 18 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 }, price: { color: palette.text, fontSize: 13.12, fontWeight: '600', flexShrink: 1 },
  image: { width: 64, height: 64, borderRadius: 8 }, pressed: { opacity: 0.82 },
})
