import { resetClientMessengerAvailability } from '../../../src/shared/domain/clientMessengerAvailability'
import { normalizeMaxContactInput } from '../../../src/shared/domain/maxContact'
import { useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  formatSignificantDateInput,
  serializeSignificantDates,
  validateSignificantDates,
  type SignificantDateDraft,
} from '../../../src/shared/domain/clientForm'
import type { Client } from '../../../src/shared/domain/types'
import { getCachedEntity } from '../../../src/shared/storage/cache'
import { deleteLocalEntity, saveLocalEntity } from '../../../src/shared/storage/mutations'
import {
  Button,
  ErrorNotice,
  Field,
  PageHeader,
  Screen,
  SectionTitle,
  Surface,
} from '../../../src/shared/ui/components'
import { colors, radius, spacing } from '../../../src/shared/ui/theme'

const CLIENT_TYPES = [
  ['none', 'Без типа'],
  ['host', 'Ведущий'],
  ['organizer', 'Организатор'],
  ['colleague', 'Коллега'],
] as const

const CONTACT_CHANNELS = [
  ['phone', 'Телефон'],
  ['telegram', 'Telegram'],
  ['whatsapp', 'WhatsApp'],
  ['max', 'MAX'],
  ['vk', 'VK'],
  ['other', 'Другое'],
] as const

const emptyValues = {
  firstName: '', secondName: '', thirdName: '', phone: '', email: '', telegram: '',
  whatsapp: '', max: '', viber: '', instagram: '', vk: '', town: '', clientType: 'none',
  preferredContactChannel: '' as NonNullable<Client['preferredContactChannel']>,
  preferredContactChannelOther: '', messengerPushMuted: false, comment: '',
  legalName: '', inn: '', kpp: '', ogrn: '', bankName: '', bik: '',
  checkingAccount: '', correspondentAccount: '', legalAddress: '',
}

const localKey = () => `date-${Date.now()}-${Math.random().toString(36).slice(2)}`
const phoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits ? Number(digits) : null
}

export default function ClientEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const queryClient = useQueryClient()
  const [values, setValues] = useState(emptyValues)
  const [significantDates, setSignificantDates] = useState<SignificantDateDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isNew || !id) return
    getCachedEntity<Client>('clients', id).then((client) => {
      if (!client) return
      setValues({
        firstName: client.firstName || '', secondName: client.secondName || '',
        thirdName: client.thirdName || '', phone: String(client.phone || ''),
        max: client.max || '', email: client.email || '', telegram: client.telegram || '',
        whatsapp: String(client.whatsapp || ''), viber: String(client.viber || ''),
        instagram: client.instagram || '', vk: client.vk || '', town: client.town || '',
        clientType: client.clientType || 'none',
        preferredContactChannel: client.preferredContactChannel || '',
        preferredContactChannelOther: client.preferredContactChannelOther || '',
        messengerPushMuted: client.messengerPushMuted === true,
        comment: client.comment || '', legalName: client.legalName || '',
        inn: client.inn || '', kpp: client.kpp || '', ogrn: client.ogrn || '',
        bankName: client.bankName || '', bik: client.bik || '',
        checkingAccount: client.checkingAccount || '',
        correspondentAccount: client.correspondentAccount || '',
        legalAddress: client.legalAddress || '',
      })
      setSignificantDates((client.significantDates || []).map((item) => ({
        ...item,
        localKey: localKey(),
        dateInput: formatSignificantDateInput(item.date),
      })))
    }).catch(() => setError('Не удалось загрузить клиента'))
  }, [id, isNew])

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const updateDate = (key: string, patch: Partial<SignificantDateDraft>) =>
    setSignificantDates((current) => current.map((item) =>
      item.localKey === key ? { ...item, ...patch } : item))

  const save = async () => {
    if (!values.firstName.trim() && !values.phone.trim()) {
      setError('Укажите имя или телефон')
      return
    }
    if (values.max.trim() && !normalizeMaxContactInput(values.max)) {
      setError('MAX: укажите ссылку max.ru на контакт или российский номер телефона')
      return
    }
    const dateError = validateSignificantDates(significantDates)
    if (dateError) {
      setError(dateError)
      return
    }
    setLoading(true)
    setError('')
    try {
      const existing = isNew ? null : await getCachedEntity<Client>('clients', id)
      const entity = await saveLocalEntity({
        entityType: 'clients',
        entityId: isNew ? undefined : id,
        values: resetClientMessengerAvailability(existing, {
          ...values,
          firstName: values.firstName.trim(), secondName: values.secondName.trim(),
          thirdName: values.thirdName.trim(), phone: phoneNumber(values.phone),
          whatsapp: phoneNumber(values.whatsapp), viber: phoneNumber(values.viber),
          max: normalizeMaxContactInput(values.max), email: values.email.trim(), telegram: values.telegram.trim(),
          instagram: values.instagram.trim(), vk: values.vk.trim(), town: values.town.trim(),
          comment: values.comment.trim(),
          preferredContactChannelOther: values.preferredContactChannel === 'other'
            ? values.preferredContactChannelOther.trim()
            : '',
          significantDates: serializeSignificantDates(significantDates),
        }),
      })
      await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'clients'] })
      router.replace(`/clients/${entity._id}` as never)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить клиента')
    } finally {
      setLoading(false)
    }
  }

  const remove = () => Alert.alert(
    'Удалить клиента?',
    'Удаление синхронизируется со всеми устройствами.',
    [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteLocalEntity('clients', id)
          await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'clients'] })
          router.replace('/(tabs)/clients')
        },
      },
    ],
  )

  return (
    <Screen>
      <PageHeader title={isNew ? 'Новый клиент' : 'Редактирование'} subtitle="Контактные данные доступны офлайн" />
      <Surface>
        <SectionTitle>Основные данные</SectionTitle>
        <Field testID="client-first-name" label="Имя" value={values.firstName} onChangeText={(value) => set('firstName', value)} maxLength={100} />
        <View style={styles.row}>
          <View style={styles.flex}><Field label="Фамилия" value={values.secondName} onChangeText={(value) => set('secondName', value)} maxLength={100} /></View>
          <View style={styles.flex}><Field label="Отчество" value={values.thirdName} onChangeText={(value) => set('thirdName', value)} maxLength={100} /></View>
        </View>
        <Field label="Город" value={values.town} onChangeText={(value) => set('town', value)} />
        <SectionTitle>Тип клиента</SectionTitle>
        <View style={styles.options}>{CLIENT_TYPES.map(([value, label]) => <Choice key={value} active={values.clientType === value} label={label} onPress={() => set('clientType', value)} />)}</View>
      </Surface>

      <Surface>
        <SectionTitle>Контакты</SectionTitle>
        <Field testID="client-phone" label="Телефон" value={values.phone} onChangeText={(value) => set('phone', value)} keyboardType="phone-pad" />
        <Field label="WhatsApp" value={values.whatsapp} onChangeText={(value) => set('whatsapp', value)} keyboardType="phone-pad" />
        <Field label="MAX" value={values.max} onChangeText={(value) => set('max', value)} placeholder="https://max.ru/… или +7…" />
        <Field label="Telegram" value={values.telegram} onChangeText={(value) => set('telegram', value)} autoCapitalize="none" />
        <Field label="Viber" value={values.viber} onChangeText={(value) => set('viber', value)} keyboardType="phone-pad" />
        <Field label="Email" value={values.email} onChangeText={(value) => set('email', value)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Instagram" value={values.instagram} onChangeText={(value) => set('instagram', value)} autoCapitalize="none" />
        <Field label="VK" value={values.vk} onChangeText={(value) => set('vk', value)} autoCapitalize="none" />
        <SectionTitle>Приоритетный канал</SectionTitle>
        <View style={styles.options}>{CONTACT_CHANNELS.map(([value, label]) => <Choice key={value} active={values.preferredContactChannel === value} label={label} onPress={() => set('preferredContactChannel', value)} />)}</View>
        {values.preferredContactChannel === 'other' ? <Field label="Другой канал" value={values.preferredContactChannelOther} onChangeText={(value) => set('preferredContactChannelOther', value)} maxLength={100} /> : null}
        <Field label="Комментарий" value={values.comment} onChangeText={(value) => set('comment', value)} multiline maxLength={2000} />
      </Surface>

      <Surface>
        <SectionTitle>Значимые даты</SectionTitle>
        {significantDates.map((item, index) => (
          <View key={item.localKey} style={styles.dateCard}>
            <View style={styles.dateHeader}>
              <Text style={styles.dateTitle}>Дата {index + 1}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Удалить дату" style={styles.iconButton} onPress={() => setSignificantDates((current) => current.filter((date) => date.localKey !== item.localKey))}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
            <Field label="Название" value={item.title || ''} onChangeText={(title) => updateDate(item.localKey, { title })} placeholder="День рождения" maxLength={100} />
            <Field label="Дата" value={item.dateInput} onChangeText={(dateInput) => updateDate(item.localKey, { dateInput })} placeholder="1990-05-20" />
            <Field label="Комментарий" value={item.comment || ''} onChangeText={(comment) => updateDate(item.localKey, { comment })} multiline maxLength={500} />
          </View>
        ))}
        <Pressable accessibilityRole="button" style={styles.addButton} onPress={() => setSignificantDates((current) => [...current, { localKey: localKey(), title: '', dateInput: '', comment: '' }])}>
          <MaterialCommunityIcons name="plus" size={20} color={colors.primary} />
          <Text style={styles.addButtonText}>Добавить дату</Text>
        </Pressable>
      </Surface>

      <Surface>
        <SectionTitle>Реквизиты для документов</SectionTitle>
        <Field label="Наименование / ФИО" value={values.legalName} onChangeText={(value) => set('legalName', value)} />
        <View style={styles.row}><View style={styles.flex}><Field label="ИНН" value={values.inn} onChangeText={(value) => set('inn', value)} keyboardType="numeric" /></View><View style={styles.flex}><Field label="КПП" value={values.kpp} onChangeText={(value) => set('kpp', value)} keyboardType="numeric" /></View></View>
        <Field label="ОГРН / ОГРНИП" value={values.ogrn} onChangeText={(value) => set('ogrn', value)} keyboardType="numeric" />
        <Field label="Банк" value={values.bankName} onChangeText={(value) => set('bankName', value)} />
        <Field label="БИК" value={values.bik} onChangeText={(value) => set('bik', value)} keyboardType="numeric" />
        <Field label="Расчётный счёт" value={values.checkingAccount} onChangeText={(value) => set('checkingAccount', value)} keyboardType="numeric" />
        <Field label="Корреспондентский счёт" value={values.correspondentAccount} onChangeText={(value) => set('correspondentAccount', value)} keyboardType="numeric" />
        <Field label="Юридический адрес" value={values.legalAddress} onChangeText={(value) => set('legalAddress', value)} multiline />
      </Surface>

      {error ? <ErrorNotice message={error} /> : null}
      <Button testID="save-client" title="Сохранить" onPress={save} loading={loading} />
      {!isNew ? <Button title="Удалить клиента" variant="danger" onPress={remove} /> : null}
      <Text style={styles.hint}>Если сети нет, запись получит статус «Ожидает отправки».</Text>
    </Screen>
  )
}

const Choice = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" style={[styles.option, active && styles.optionActive]} onPress={onPress}>
    <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
  </Pressable>
)

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  optionActive: { backgroundColor: colors.primary },
  optionText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  optionTextActive: { color: '#fff' },
  dateCard: { gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  dateHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  addButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  addButtonText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
})
