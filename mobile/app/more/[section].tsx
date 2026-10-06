import { useCallback, useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { NotificationsSection as Notifications } from '../../src/features/notifications/NotificationsSection'
import { api } from '../../src/shared/api/client'
import { StatisticsSection } from '../../src/features/statistics/StatisticsSection'
import { ReferralsSection } from '../../src/features/referrals/ReferralsSection'
import { CallsSection } from '../../src/features/calls/CallsSection'
import { ServicesSection } from '../../src/features/services/ServicesSection'
import { ListsSection } from '../../src/features/lists/ListsSection'
import { DocumentsSection } from '../../src/features/documents/DocumentsSection'
import { SettingsSection } from '../../src/features/settings/SettingsSection'
import { IntegrationsSection } from '../../src/features/integrations/IntegrationsSection'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import {
  disableExpoPushNotifications,
  enableExpoPushNotifications,
  getExpoPushDeviceState,
} from '../../src/shared/notifications/useExpoPushNotifications'
import { Button, EmptyState, ErrorNotice, Field, PageHeader, Screen, SectionTitle, StatusChip, Surface } from '../../src/shared/ui/components'
import { colors, radius, spacing } from '../../src/shared/ui/theme'
import { getMenuSection } from '../../src/features/navigation/menu'

const titles: Record<string, [string, string]> = {
  calls: ['Звонки', 'Журнал IP-телефонии и результаты'], statistics: ['Статистика', 'Показатели по сохранённым данным'], services: ['Услуги', 'Прайс и группы услуг'], documents: ['Документы', 'Шаблоны, договоры и акты'], lists: ['Списки', 'Пользовательские справочники'], notifications: ['Уведомления', 'Push и напоминания'], integrations: ['Интеграции', 'Подключённые внешние сервисы'], referrals: ['Рефералы', 'Приглашения и вознаграждения'], settings: ['Настройки', 'Организация и термины'],
}

export default function MoreSectionScreen() {
  const { section = '' } = useLocalSearchParams<{ section: string }>()
  const item = getMenuSection(section)
  if (!item) return <Screen><PageHeader title="Раздел недоступен" /><EmptyState title="Раздел недоступен" description="Этот адрес не входит в пользовательские разделы приложения." /><Button title="Открыть меню" onPress={() => router.replace('/(tabs)/more')} /></Screen>
  if (section === 'profile' || section === 'billing-history') return <Redirect href={item.href as never} />
  if (item.pendingDescription) return <Screen><PageHeader title={item.title} /><EmptyState title="Пока недоступно в приложении" description={item.pendingDescription} /></Screen>
  if (section === 'import') return <Screen><PageHeader title={item.title} /><EmptyState title="Пока недоступно в приложении" description="Импорт файлов и полный экспорт данных ещё не реализованы в Android. Этот раздел появится на следующих этапах обновления." /></Screen>
  const [, subtitle] = titles[section]
  const title = item.title
  return <Screen><PageHeader title={title} subtitle={subtitle} />{section === 'calls' ? <CallsSection /> : section === 'statistics' ? <StatisticsSection /> : section === 'services' ? <ServicesSection /> : section === 'referrals' ? <ReferralsSection /> : section === 'integrations' ? <IntegrationsSection /> : section === 'notifications' ? <Notifications /> : section === 'documents' ? <Documents /> : section === 'settings' ? <SettingsSection /> : section === 'lists' ? <Lists /> : null}</Screen>
}

const Documents = () => <DocumentsSection />
const Lists = () => <ListsSection />
const Integration = ({ icon, title, description }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; description: string }) => <View style={styles.integration}><View style={styles.round}><MaterialCommunityIcons name={icon} size={21} color={colors.primary} /></View><View style={styles.grow}><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{description}</Text></View></View>
const IntegrationState = ({ icon, title, description, label, tone }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; description: string; label: string; tone: 'neutral' | 'success' | 'warning' }) => <View style={styles.integration}><View style={styles.round}><MaterialCommunityIcons name={icon} size={21} color={colors.primary} /></View><View style={styles.grow}><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{description}</Text></View><StatusChip label={label} tone={tone} /></View>
const FilterChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => <Pressable style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}><Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text></Pressable>
const money = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} ₽`
const csvCell = (value: unknown) => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ')
  return text.includes(';') || text.includes('"') ? `"${text.replace(/"/g, '""')}"` : text
}
const transactionCategoryLabel = (category: string) => ({ taxes: 'Налоги', referral_out: 'Реферальные выплаты', organizer: 'Комиссия организатора', services: 'Услуги и подрядчики', transport: 'Транспорт', advertising: 'Реклама', other: 'Прочее' }[category] || category)

const Metric = ({ label, value }: { label: string; value: number }) => <View style={styles.metric}><Text style={styles.metricValue}>{new Intl.NumberFormat('ru-RU').format(value)}</Text><Text style={styles.metricLabel}>{label}</Text></View>
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, grow: { flex: 1 }, round: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.text, fontSize: 14, fontWeight: '700' }, muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 3 }, body: { color: colors.text, fontSize: 13, lineHeight: 19 }, metrics: { flexDirection: 'row', gap: spacing.sm }, metric: { flex: 1, minHeight: 86, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: spacing.md, justifyContent: 'space-between' }, metricValue: { color: colors.text, fontSize: 21, fontWeight: '800' }, metricLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' }, bigMoney: { color: colors.text, fontSize: 30, fontWeight: '800' }, split: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }, success: { color: colors.success, fontSize: 12, fontWeight: '700' }, danger: { color: colors.danger, fontSize: 12, fontWeight: '700' }, price: { color: colors.text, fontSize: 14, fontWeight: '800' }, integration: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, file: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, filterWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }, filterChipActive: { backgroundColor: colors.primary }, filterChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' }, filterChipTextActive: { color: '#FFFFFF' }, listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } })
