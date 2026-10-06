import { CompactField } from '../../src/shared/ui/CompactField'
import { useScreenLifetime } from '../../src/features/profile/useScreenLifetime'
import { useTheme, useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import { Notice } from '../../src/shared/ui/Notice'
import { SupportUserAccess } from '../../src/features/support/SupportUserAccess'
import { useRef, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, Pressable } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { router } from 'expo-router'
import { Button, ErrorNotice, PageHeader, Screen, SectionTitle, Surface } from '../../src/shared/ui/components'
import { radius, spacing, type Palette } from '../../src/shared/ui/theme'
import { createSupportTicket, getSupportTicket } from '../../src/features/support/api'
import { SupportImagePicker } from '../../src/features/support/ImagePicker'
import type { SelectedSupportImage, SupportCategory } from '../../src/features/support/types'

const choices: Array<[SupportCategory, string]> = [['bug', 'Ошибка'], ['idea', 'Идея'], ['question', 'Вопрос']]

export default function NewSupportTicketScreen() {
  return <SupportUserAccess><UserNewSupportTicketScreen /></SupportUserAccess>
}

function UserNewSupportTicketScreen() {
  const { palette } = useTheme()
  const styles = useThemeStyles(createStyles)
  const capture = useScreenLifetime()
  const lock = useRef(false)
  const [uncertain, setUncertain] = useState(false)
  const [category, setCategory] = useState<SupportCategory>('bug')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<SelectedSupportImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    if (lock.current || uncertain) return
    if (!title.trim() || !message.trim()) return setError('Заполните тему и сообщение')
    lock.current = true
    const current = capture()
    setError(''); setLoading(true)
    let sent = false
    try {
      const network = await NetInfo.fetch()
      if (!current()) return
      if (!network.isConnected || network.isInternetReachable === false) { setError('Для отправки обращения требуется интернет'); return }
      sent = true; setUncertain(true)
      const response = await createSupportTicket({ category, title: title.trim(), message: message.trim(), images })
      if (!current()) return
      if (!response.data?.ticket?.id) throw new Error('Создание не подтверждено')
      const read = await getSupportTicket(response.data.ticket.id)
      if (!current()) return
      if (read.data?.ticket?.id !== response.data.ticket.id) throw new Error('Создание не подтверждено')
      router.replace(`/support/${response.data.ticket.id}` as never)
    } catch (reason) {
      if (current()) { setUncertain(sent); setError(reason instanceof Error ? reason.message : 'Не удалось создать обращение') }
    } finally { lock.current = false; if (capture()()) setLoading(false) }
  }
  return <Screen><PageHeader title="Новое обращение" subtitle="Опишите вопрос разработчику" />{error ? <ErrorNotice message={error} /> : null}{uncertain && !loading ? <><Notice tone="warning" message="Результат отправки неизвестен. Черновик сохранён на экране. Проверьте список обращений перед новым созданием, чтобы избежать дубля." /><Button title="Проверить обращения" variant="secondary" onPress={() => router.push('/support')} /><Button title="Разрешить повтор после проверки" variant="secondary" onPress={() => Alert.alert('Повторить создание?', 'Проверьте список обращений. Если первое обращение уже создано, повтор создаст дубль.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Разрешить повтор', onPress: () => { if (capture()()) setUncertain(false) } }])} /></> : null}<Surface><SectionTitle>Тип обращения</SectionTitle><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{choices.map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: category === value, disabled: loading }} disabled={loading} onPress={() => setCategory(value)} style={[styles.choice, category === value && styles.choiceActive]}><Text style={{ color: palette.text }}>{label}</Text></Pressable>)}</ScrollView><CompactField editable={!loading} label="Тема" value={title} onChangeText={setTitle} maxLength={160} placeholder="Коротко опишите обращение" /><CompactField editable={!loading} label="Сообщение" value={message} onChangeText={setMessage} maxLength={5000} multiline placeholder="Что произошло или что вы хотите предложить?" /><SupportImagePicker images={images} onChange={setImages} onError={setError} disabled={loading} /><Button title="Создать тикет" onPress={submit} loading={loading} disabled={uncertain} /></Surface></Screen>
}
const createStyles = (palette: Palette) => StyleSheet.create({ choices: { gap: spacing.sm, paddingBottom: spacing.md }, choice: { overflow: 'hidden', borderWidth: 1, borderColor: palette.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44, color: palette.text }, choiceActive: { borderColor: palette.primary, backgroundColor: palette.rowSelected, color: palette.selectionText, fontWeight: '800' } })
