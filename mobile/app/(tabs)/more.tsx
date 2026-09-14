import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useCallback, useState } from 'react'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import { api } from '../../src/shared/api/client'
import { getTariffDisplayName } from '../../src/shared/domain/tariff'
import { formatBalanceRunway } from '../../src/features/billing/format'
import type { MobileBilling } from '../../src/features/billing/types'
import { getSupportUnreadCount } from '../../src/features/support/api'
import { PageHeader, Screen, SectionTitle, Surface } from '../../src/shared/ui/components'
import { colors, spacing } from '../../src/shared/ui/theme'

const sections = [
  { title: 'Работа', items: [
    ['phone-log-outline', 'Звонки', 'Журнал, записи и результаты', '/more/calls'],
    ['chart-box-outline', 'Статистика', 'Динамика заявок и маржинальность', '/more/statistics'],
    ['history', 'История действий', 'Изменения заявок, клиентов и финансов', '/history'],
    ['briefcase-outline', 'Услуги', 'Услуги и группы', '/more/services'],
    ['file-document-outline', 'Документы', 'Шаблоны, договоры и акты', '/more/documents'],
  ] },
  { title: 'Организация', items: [
    ['message-alert-outline', 'Обратная связь', 'Диалог с разработчиком', '/support'],
    ['sync-alert', 'Синхронизация', 'Очередь, ошибки и конфликты', '/sync'],
    ['cog-outline', 'Настройки', 'Термины и общие параметры', '/more/settings'],
    ['format-list-bulleted', 'Списки', 'Пользовательские справочники', '/more/lists'],
    ['bell-outline', 'Уведомления', 'Напоминания и push', '/more/notifications'],
    ['connection', 'Интеграции', 'Календарь, Avito, VK и телефония', '/more/integrations'],
    ['account-cash-outline', 'Рефералы', 'Приглашения и статистика', '/more/referrals'],
  ] },
] as const

export default function MoreScreen() {
  const { refreshUser, user } = useAuth()
  const [billing, setBilling] = useState<MobileBilling | null>(null)
  const [supportUnread, setSupportUnread] = useState(0)
  const tariffName = billing?.currentTariff?.title || getTariffDisplayName(user)

  useFocusEffect(
    useCallback(() => {
      let active = true
      refreshUser().catch(() => undefined)
      api
        .get<{ success: true; data: MobileBilling }>('/mobile/v1/billing')
        .then((response) => {
          if (active) setBilling(response.data)
        })
        .catch(() => undefined)
      getSupportUnreadCount()
        .then((response) => { if (active) setSupportUnread(response.data.unreadCount || 0) })
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, [refreshUser])
  )

  return (
    <Screen contentStyle={styles.screenContent}>
      <PageHeader title="Ещё" subtitle="Рабочие инструменты и личные настройки" />
      <Surface>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть профиль"
          style={styles.profile}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <View style={styles.avatar}>{user?.images?.[0] ? <Image accessibilityLabel="Аватар профиля" source={{ uri: user.images[0] }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{(user?.firstName || user?.phone || '?').slice(0, 1).toUpperCase()}</Text>}</View><View style={styles.profileText}><Text style={styles.profileName}>{[user?.firstName, user?.secondName].filter(Boolean).join(' ') || 'Профиль'}</Text><Text style={styles.profileSubtitle}>Профиль, реквизиты, активность</Text></View><MaterialCommunityIcons name="chevron-right" size={24} color={colors.textMuted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть тариф и баланс"
          testID="more-change-tariff"
          style={styles.tariffAction}
          onPress={() => router.push('/billing' as never)}
        >
          <View style={styles.tariffIcon}><MaterialCommunityIcons name="credit-card-outline" size={20} color={colors.primary} /></View><View style={styles.profileText}><Text style={styles.tariffActionTitle}>Тариф: {tariffName}</Text><Text style={styles.tariffActionSubtitle}>{formatBalanceRunway(billing)}</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
        </Pressable>
      </Surface>
      {sections.map((section) => <View key={section.title} style={styles.section}><SectionTitle>{section.title}</SectionTitle><Surface>{section.items.map(([iconName, title, subtitle, href], index) => <Pressable key={href} style={[styles.row, index > 0 && styles.rowBorder]} onPress={() => router.push(href as never)}><View style={styles.icon}><MaterialCommunityIcons name={iconName} size={22} color={colors.primary} /></View><View style={styles.rowText}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View>{href === '/support' && supportUnread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{supportUnread > 99 ? '!' : supportUnread}</Text></View> : null}<MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} /></Pressable>)}</Surface></View>)}
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 0 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md }, avatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, avatarImage: { width: 52, height: 52 }, avatarText: { color: colors.primary, fontSize: 21, fontWeight: '800' }, profileText: { flex: 1 }, profileName: { color: colors.text, fontSize: 17, fontWeight: '700' }, profileSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  tariffAction: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md }, tariffIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, tariffActionTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, tariffActionSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  section: { gap: spacing.sm }, row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, rowText: { flex: 1 }, rowTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, rowSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger }, badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
})
