import { useState, type PropsWithChildren } from 'react'
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Client } from '../domain/types'
import { useTheme, useThemeStyles } from './ThemeProvider'
import type { Palette } from './theme'

type ContactAction = { label: string; url: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
const digits = (value?: string | number | null) => String(value || '').replace(/\D/g, '')
export const getQuickContactActions = (client?: Client): ContactAction[] => {
  if (!client) return []
  const actions: ContactAction[] = []
  const phone = digits(client.phone), whatsapp = digits(client.whatsapp), viber = digits(client.viber)
  if (phone) actions.push({ label: 'Позвонить', url: `tel:${phone}`, icon: 'phone-outline' })
  if (whatsapp) actions.push({ label: 'WhatsApp', url: `https://wa.me/${whatsapp}`, icon: 'whatsapp' })
  if (client.telegram?.trim()) {
    const name = client.telegram.trim().replace(/^https?:\/\/(?:www\.)?t\.me\//i, '').replace(/^@/, '')
    actions.push({ label: 'Telegram', url: `https://t.me/${encodeURIComponent(name)}`, icon: 'send-outline' })
  }
  if (client.vk?.trim()) {
    const name = client.vk.trim().replace(/^https?:\/\/(?:www\.)?(?:vk\.com|vk\.ru)\//i, '')
    actions.push({ label: 'ВКонтакте', url: `https://vk.com/${encodeURIComponent(name)}`, icon: 'account-circle-outline' })
  }
  if (client.email?.trim()) actions.push({ label: 'Электронная почта', url: `mailto:${client.email.trim()}`, icon: 'email-outline' })
  if (viber) actions.push({ label: 'Viber', url: `viber://chat?number=%2B${viber}`, icon: 'message-outline' })
  if (client.instagram?.trim()) {
    const name = client.instagram.trim().replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '').replace(/^@/, '')
    actions.push({ label: 'Instagram', url: `https://www.instagram.com/${encodeURIComponent(name)}`, icon: 'instagram' })
  }
  return actions
}
export const openContactUrl = (url: string) => Linking.openURL(url).catch(() => {
  Alert.alert('Не удалось открыть', 'Проверьте, установлено ли приложение для выбранного действия.')
})

/** Kept outside a card's tap target. Android Back and outside taps close the sheet. */
type SheetProps = PropsWithChildren<{ title: string; visible: boolean; onClose: () => void }>
export function QuickActionsSheet(props: SheetProps) {
  // No hidden native Modal or safe-area subscription for every virtualized card.
  return props.visible ? <VisibleActionsSheet {...props} /> : null
}
function VisibleActionsSheet({ title, visible, onClose, children }: SheetProps) {
  const styles = useThemeStyles(createStyles)
  const insets = useSafeAreaInsets()
  return <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
    {visible ? <View style={styles.modal}>
      <Pressable accessible={false} testID="quick-actions-outside" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { marginTop: insets.top + 16, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" onPress={onClose} style={styles.button}><Text style={styles.close}>×</Text></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </View> : null}
  </Modal>
}
export function QuickContacts({ client, maxVisible = 2 }: { client?: Client; maxVisible?: number }) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const actions = getQuickContactActions(client)
  if (!actions.length) return null
  return <View style={styles.contacts}>
    {actions.slice(0, maxVisible).map((action) => <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={(event) => { event.stopPropagation(); void openContactUrl(action.url) }}>
      <MaterialCommunityIcons name={action.icon} size={20} color={palette.primary} />
    </Pressable>)}
    {actions.length > maxVisible ? <Pressable accessibilityRole="button" accessibilityLabel="Все способы связи" accessibilityState={{ expanded }}
      style={styles.button} onPress={(event) => { event.stopPropagation(); setExpanded(true) }}>
      <MaterialCommunityIcons name="dots-horizontal" size={20} color={palette.primary} />
    </Pressable> : null}
    <QuickActionsSheet title="Связаться с клиентом" visible={expanded} onClose={() => setExpanded(false)}>
      {actions.map((action) => <Pressable key={action.label} accessibilityRole="button" style={styles.action}
        onPress={() => { setExpanded(false); void openContactUrl(action.url) }}><Text style={styles.actionText}>{action.label}</Text></Pressable>)}
    </QuickActionsSheet>
  </View>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  contacts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  pressed: { backgroundColor: palette.rowPressed }, modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '85%', backgroundColor: palette.canvas, borderColor: palette.border, borderWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }, title: { flex: 1, color: palette.text, fontSize: 18, fontWeight: '600' },
  close: { color: palette.text, fontSize: 24 }, action: { minHeight: 48, justifyContent: 'center', paddingVertical: 12 }, actionText: { color: palette.text, fontSize: 16 },
})
