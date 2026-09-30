import { SupportUserAccess } from '../../src/features/support/SupportUserAccess'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { router } from 'expo-router'
import { Button, ErrorNotice, Field, PageHeader, Screen, SectionTitle, Surface } from '../../src/shared/ui/components'
import { colors, radius, spacing } from '../../src/shared/ui/theme'
import { createSupportTicket } from '../../src/features/support/api'
import { SupportImagePicker } from '../../src/features/support/ImagePicker'
import type { SelectedSupportImage, SupportCategory } from '../../src/features/support/types'

const choices: Array<[SupportCategory, string]> = [['bug', 'Ошибка'], ['idea', 'Идея'], ['question', 'Вопрос']]

export default function NewSupportTicketScreen() {
  return <SupportUserAccess><UserNewSupportTicketScreen /></SupportUserAccess>
}

function UserNewSupportTicketScreen() {
  const [category, setCategory] = useState<SupportCategory>('bug')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<SelectedSupportImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setError('')
    if (!title.trim() || !message.trim()) return setError('Заполните тему и сообщение')
    const network = await NetInfo.fetch()
    if (!network.isConnected) return setError('Для отправки обращения требуется интернет')
    setLoading(true)
    try {
      const response = await createSupportTicket({ category, title: title.trim(), message: message.trim(), images })
      router.replace(`/support/${response.data.ticket.id}` as never)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось создать обращение') }
    finally { setLoading(false) }
  }
  return <Screen><PageHeader title="Новое обращение" subtitle="Опишите вопрос разработчику" />{error ? <ErrorNotice message={error} /> : null}<Surface><SectionTitle>Тип обращения</SectionTitle><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{choices.map(([value, label]) => <Text key={value} onPress={() => setCategory(value)} style={[styles.choice, category === value && styles.choiceActive]}>{label}</Text>)}</ScrollView><Field label="Тема" value={title} onChangeText={setTitle} maxLength={160} placeholder="Коротко опишите обращение" /><Field label="Сообщение" value={message} onChangeText={setMessage} maxLength={5000} multiline placeholder="Что произошло или что вы хотите предложить?" /><SupportImagePicker images={images} onChange={setImages} onError={setError} disabled={loading} /><Button title="Создать тикет" onPress={submit} loading={loading} /></Surface></Screen>
}
const styles = StyleSheet.create({ choices: { gap: spacing.sm, paddingBottom: spacing.md }, choice: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text }, choiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft, color: colors.primary, fontWeight: '800' } })
