import { useContext, useRef, useState, type PropsWithChildren } from 'react'
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { QueryClientContext } from '@tanstack/react-query'
import { getMaxContactAction } from '../domain/maxContact'
import type { Client } from '../domain/types'
import { useTheme, useThemeStyles } from './ThemeProvider'
import type { Palette } from './theme'

export type ContactAction = {
  label: string; url: string; icon: keyof typeof MaterialCommunityIcons.glyphMap
  channel?: 'phone' | 'vk'
  provider?: 'whatsapp' | 'telegram' | 'max'; trial?: boolean; phone?: string; copyPhone?: string
}
const digits = (value?: string | number | null) => String(value || '').replace(/\D/g, '')
export const getQuickContactActions = (client?: Client): ContactAction[] => {
  if (!client) return []
  const actions: ContactAction[] = []
  const phone = digits(client.phone), whatsapp = digits(client.whatsapp), viber = digits(client.viber)
  if (phone) actions.push({ label: 'Позвонить', url: `tel:${phone}`, icon: 'phone-outline', channel: 'phone' })
  if (whatsapp || (phone && !client.whatsappPhoneUnavailable)) actions.push({
    label: 'WhatsApp', url: `https://wa.me/${whatsapp || phone}`, icon: 'whatsapp',
    provider: 'whatsapp', trial: !whatsapp, phone: whatsapp || phone,
  })
  if (viber) actions.push({ label: 'Viber', url: `viber://chat?number=%2B${viber}`, icon: 'message-outline' })
  if (client.telegram?.trim()) {
    const name = client.telegram.trim().replace(/^https?:\/\/(?:www\.)?t\.me\//i, '').replace(/^@/, '')
    actions.push({ label: 'Telegram', url: `https://t.me/${encodeURIComponent(name)}`, icon: 'send-outline', provider: 'telegram' })
  } else if (digits(client.telegramPhone) || (phone && !client.telegramPhoneUnavailable)) {
    const telegramPhone = digits(client.telegramPhone) || phone
    actions.push({ label: 'Telegram', url: `tg://resolve?phone=${telegramPhone}`, icon: 'send-outline', provider: 'telegram', trial: !digits(client.telegramPhone), phone: telegramPhone })
  }
  const max = getMaxContactAction(client.max || (!client.maxPhoneUnavailable ? client.phone : ''))
  if (max) actions.push({ label: 'MAX', url: max.url, icon: 'message-outline', provider: 'max',
    trial: !client.max, phone: max.phone, copyPhone: max.phone })
  if (client.instagram?.trim()) {
    const name = client.instagram.trim().replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '').replace(/^@/, '')
    actions.push({ label: 'Instagram', url: `https://www.instagram.com/${encodeURIComponent(name)}`, icon: 'instagram' })
  }
  if (client.vk?.trim()) {
    const name = client.vk.trim().replace(/^https?:\/\/(?:www\.)?(?:vk\.com|vk\.ru)\//i, '')
    actions.push({ label: 'ВКонтакте', url: `https://vk.com/${encodeURIComponent(name)}`, icon: 'account-circle-outline', channel: 'vk' })
  }
  if (client.email?.trim()) actions.push({ label: 'Электронная почта', url: `mailto:${client.email.trim()}`, icon: 'email-outline' })
  return actions
}
export const openContactUrl = (url: string) => Linking.openURL(url).then(() => true).catch(() => {
  Alert.alert('Не удалось открыть', 'Проверьте, установлено ли приложение для выбранного действия.')
  return false
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
  const queryClient = useContext(QueryClientContext)
  const saving = useRef(false)
  const [override, setOverride] = useState<{ source: Client; patch: Partial<Client> } | null>(null)
  const actions = getQuickContactActions(client && override?.source === client ? { ...client, ...override.patch } : client)
  const label = (action: ContactAction) => `${action.label}${action.trial ? ' — попробовать по телефону' : ''}${client?.preferredContactChannel && client.preferredContactChannel === (action.provider || action.channel) ? ' — приоритетный канал связи' : ''}`
  const color = (action: ContactAction) => action.trial ? palette.contacts.trial : action.provider ? palette.contacts[action.provider] : palette.primary
  const open = async (action: ContactAction) => {
    setExpanded(false)
    let copyFailed = false
    if (action.copyPhone) {
      try {
        copyFailed = await Clipboard.setStringAsync(action.copyPhone) === false
      } catch { copyFailed = true }
    }
    const copyHint = copyFailed ? `Номер не скопирован — введите в поиске MAX вручную: ${action.copyPhone}` : 'Номер скопирован — вставьте его в поиск MAX.'
    if (!await openContactUrl(action.url)) return
    if (action.trial && action.provider && client) {
      const save = async (confirmed: boolean) => {
        if (saving.current) return
        saving.current = true
        try {
          // Load the native storage adapter only when the user confirms.
          const { confirmPhoneContact } = require('../domain/phoneContactConfirmation') as typeof import('../domain/phoneContactConfirmation')
          const patch = await confirmPhoneContact(client, action.provider!, action.phone!, confirmed)
          setOverride({ source: client, patch })
          await queryClient?.invalidateQueries({ queryKey: ['cached-entities', 'clients'] })
        } catch {
          Alert.alert('Контакт не сохранён', 'Откройте клиента заново и повторите действие.')
        } finally { saving.current = false }
      }
      Alert.alert(`Контакт в ${action.label}`, `Удалось найти клиента по номеру ${action.phone}?${action.copyPhone ? ` ${copyHint}` : ''}`, [
        { text: 'Не знаю', style: 'cancel' },
        { text: 'Нет', onPress: () => { void save(false) } },
        { text: 'Да', onPress: () => { void save(true) } },
      ])
    } else if (action.copyPhone) Alert.alert(copyFailed ? 'Номер не скопирован' : 'Номер скопирован', copyHint)
  }
  if (!actions.length) return null
  return <View style={styles.contacts}>
    {actions.slice(0, maxVisible).map((action) => <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={label(action)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={(event) => { event.stopPropagation(); void open(action) }}>
      <ContactGlyph action={action} color={color(action)} />
    </Pressable>)}
    {actions.length > maxVisible ? <Pressable accessibilityRole="button" accessibilityLabel="Все способы связи" accessibilityState={{ expanded }}
      style={styles.button} onPress={(event) => { event.stopPropagation(); setExpanded(true) }}>
      <MaterialCommunityIcons name="dots-horizontal" size={20} color={palette.primary} />
    </Pressable> : null}
    <QuickActionsSheet title="Связаться с клиентом" visible={expanded} onClose={() => setExpanded(false)}>
      {actions.map((action) => <Pressable key={action.label} accessibilityRole="button" style={styles.action}
        onPress={() => { setExpanded(false); void open(action) }}><View style={styles.actionContent}><ContactGlyph action={action} color={color(action)} /><Text style={styles.actionText}>{label(action)}</Text></View></Pressable>)}
    </QuickActionsSheet>
  </View>
}
function ContactGlyph({ action, color }: { action: ContactAction; color: string }) {
  const styles = useThemeStyles(createStyles)
  return action.provider === 'max' ? <Text style={[styles.maxBadge, { backgroundColor: color }]}>MAX</Text>
    : <MaterialCommunityIcons name={action.icon} size={20} color={color} />
}
const createStyles = (palette: Palette) => StyleSheet.create({
  maxBadge: { color: palette.contacts.onBadge, borderRadius: 4, padding: 3, fontSize: 9, fontWeight: '700' },
  actionContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contacts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  pressed: { backgroundColor: palette.rowPressed }, modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '85%', backgroundColor: palette.canvas, borderColor: palette.border, borderWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }, title: { flex: 1, color: palette.text, fontSize: 18, fontWeight: '600' },
  close: { color: palette.text, fontSize: 24 }, action: { minHeight: 48, justifyContent: 'center', paddingVertical: 12 }, actionText: { color: palette.text, fontSize: 16, flexShrink: 1 },
})
