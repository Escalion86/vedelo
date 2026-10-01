import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useAuth } from '../../shared/auth/AuthProvider'
import { api } from '../../shared/api/client'
import { getTariffDisplayName } from '../../shared/domain/tariff'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { formatBalanceRunway } from '../billing/format'
import type { MobileBilling } from '../billing/types'
import { canUseUserSupport } from '../support/userAccess'
import { getSupportUnreadCount } from '../support/api'
import { menuGroups, type MenuGroup } from './menu'
import { MenuRow } from './MenuRow'

export function MenuCatalogue({ onNavigate, supportUnread = 0, groups = menuGroups, activePath = '' }: {
  onNavigate: (href: string) => void; supportUnread?: number; groups?: readonly MenuGroup[]; activePath?: string
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return <>{groups.filter((group) => group.items.length > 0).map((group) => {
    const accordion = group.items.length > 1
    const open = expanded === group.title
    return <View key={group.title}>
      {accordion ? <MenuRow title={group.title} icon="cog-outline" expanded={open}
        onPress={() => setExpanded(open ? null : group.title)} /> : null}
      {(!accordion || open) ? group.items.map((item) => <MenuRow key={item.href}
        title={item.title} icon={item.icon} nested={accordion}
        selected={activePath === item.href.replace('/(tabs)', '')}
        badge={item.href === '/support' ? supportUnread : 0} onPress={() => onNavigate(item.href)} />) : null}
    </View>
  })}</>
}

// Used both inside the overlay and by the legacy /more route.
export function MenuSheet({ onNavigate = (href) => router.push(href as never), activePath }: {
  onNavigate?: (href: string) => void; activePath?: string
}) {
  const styles = useThemeStyles(createStyles)
  const { refreshUser, user } = useAuth()
  const [billing, setBilling] = useState<MobileBilling | null>(null)
  const [supportUnread, setSupportUnread] = useState(0)
  const supportAvailable = canUseUserSupport(user)
  useFocusEffect(useCallback(() => {
    let active = true
    setBilling(null)
    setSupportUnread(0)
    refreshUser().catch(() => undefined)
    api.get<{ success: true; data: MobileBilling }>('/mobile/v1/billing')
      .then((response) => { if (active) setBilling(response.data) }).catch(() => undefined)
    if (supportAvailable && user?._id && user?.tenantId) {
      getSupportUnreadCount().then((response) => {
        if (active) setSupportUnread(response.data.unreadCount || 0)
      }).catch(() => undefined)
    }
    return () => { active = false }
  }, [refreshUser, supportAvailable, user?._id, user?.tenantId]))

  return <View style={styles.content}>
    <View style={styles.personal}>
      <MenuRow title={[user?.firstName, user?.secondName].filter(Boolean).join(' ') || 'Профиль'}
        icon="account-circle-outline" onPress={() => onNavigate('/(tabs)/profile')} />
      <Text style={styles.hint}>Профиль, реквизиты, активность</Text>
      <MenuRow title={`Тариф: ${billing?.currentTariff?.title || getTariffDisplayName(user)}`}
        icon="credit-card-outline" testID="more-change-tariff" onPress={() => onNavigate('/billing')} />
      <Text style={styles.hint}>{formatBalanceRunway(billing)}</Text>
      <MenuRow title="Синхронизация" icon="sync" onPress={() => onNavigate('/sync')} />
    </View>
    <MenuCatalogue onNavigate={onNavigate} supportUnread={supportAvailable ? supportUnread : 0} activePath={activePath} />
  </View>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  content: { padding: 6, borderRadius: 16, backgroundColor: palette.canvas },
  personal: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, marginBottom: 6, paddingBottom: 6 },
  hint: { color: palette.cardMuted, fontSize: 11, paddingLeft: 42, paddingRight: 12, paddingBottom: 4 },
})
