import { resetClientMessengerAvailability } from '../../../src/shared/domain/clientMessengerAvailability'
import { normalizeMaxContactInput } from '../../../src/shared/domain/maxContact'
import { setPendingEventClient } from '../../../src/shared/domain/eventClientHandoff'
import { useEffect, useRef, useState } from 'react'
import { usePreventRemove } from '@react-navigation/native'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
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
  CompactField as Field,
  EmptyState,
  PageHeader,
  Screen,
  SectionTitle,
  Surface,
} from '../../../src/shared/ui/components'
import { radius, spacing, type Palette } from '../../../src/shared/ui/theme'
import { useTheme, useThemeStyles } from '../../../src/shared/ui/ThemeProvider'

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
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const navigation = useNavigation()
  const params = useLocalSearchParams<{ id: string; returnTo?: string }>()
  const { id } = params
  const isNew = id === 'new'
  // Создание клиента из редактора работы: после сохранения возвращаемся назад и передаём id формы.
  const returnToEvent = params.returnTo === 'event'
  const queryClient = useQueryClient()
  const [values, setValues] = useState(emptyValues)
  const [significantDates, setSignificantDates] = useState<SignificantDateDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(isNew)
  const [attempt, setAttempt] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [requisitesOpen, setRequisitesOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedId, setSavedId] = useState('')
  const busy = useRef(false)
  usePreventRemove((dirty || loading) && !savedId, ({ data }) => {
    if (busy.current) return
    Alert.alert('Есть несохранённые изменения', 'Остаться в редакторе или выйти без сохранения?', [
      { text: 'Продолжить редактирование', style: 'cancel' },
      { text: 'Выйти без сохранения', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  })
  useEffect(() => {
    if (!savedId) return
    if (savedId === '__deleted__') router.replace('/(tabs)/clients')
    else if (returnToEvent) { setPendingEventClient(savedId); router.back() }
    else router.replace(`/clients/${savedId}` as never)
  }, [savedId, returnToEvent])

  useEffect(() => {
    let active = true
    if (isNew) { setReady(true); return }
    setReady(false); setLoadError('')
    getCachedEntity<Client>('clients', id).then((client) => {
      if (!active) return
      if (!client) throw new Error('Клиент не найден в локальных данных')
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
      setReady(true); setDirty(false)
    }).catch((cause) => { if (active) setLoadError(cause instanceof Error ? cause.message : 'Не удалось загрузить клиента') })
    return () => { active = false }
  }, [id, isNew, attempt])

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setDirty(true); setValues((current) => ({ ...current, [key]: value }))
  }

  const changeDates = (update: (current: SignificantDateDraft[]) => SignificantDateDraft[]) => { setDirty(true); setSignificantDates(update) }
  const updateDate = (key: string, patch: Partial<SignificantDateDraft>) =>
    changeDates((current) => current.map((item) =>
      item.localKey === key ? { ...item, ...patch } : item))

  const save = async () => {
    if (!ready || busy.current) return
    if (![values.firstName, values.secondName, values.thirdName].some((part) => part.trim())) {
      setError('Укажите ФИО клиента')
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
    busy.current = true; setLoading(true)
    setError('')
    try {
      const existing = isNew ? null : await getCachedEntity<Client>('clients', id)
      if (!isNew && !existing) throw new Error('Клиент удалён. Изменения не сохранены.')
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
      setDirty(false); setSavedId(entity._id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить клиента')
    } finally {
      busy.current = false; setLoading(false)
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
          if (busy.current) return
          busy.current = true; setLoading(true); setError('')
          try {
            await deleteLocalEntity('clients', id)
            await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'clients'] })
            setDirty(false); setSavedId('__deleted__')
          } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось удалить клиента') }
          finally { busy.current = false; setLoading(false) }
        },
      },
    ],
  )

  if (!ready) return <Screen><PageHeader title="Редактирование клиента" />{loadError ? <><ErrorNotice message={loadError} /><Button title="Повторить чтение" onPress={() => setAttempt((value) => value + 1)} /></> : <EmptyState title="Загрузка клиента…" />}</Screen>
  return (
    <Screen keyboardShouldPersistTaps="handled">
      <PageHeader title={isNew ? 'Создание клиента' : 'Редактирование клиента'} />
      <Surface>
        <Field testID="client-first-name" label="ФИО" value={[values.secondName, values.firstName, values.thirdName].filter(Boolean).join(' ')} onChangeText={(value) => { setDirty(true); setValues((current) => ({ ...current, firstName: value, secondName: '', thirdName: '' })) }} maxLength={300} />
        <Field testID="client-phone" label="Телефон" value={values.phone} onChangeText={(value) => set('phone', value)} keyboardType="phone-pad" />
        <Field label="WhatsApp" value={values.whatsapp} onChangeText={(value) => set('whatsapp', value)} keyboardType="phone-pad" />
        <Field label="Telegram" value={values.telegram} onChangeText={(value) => set('telegram', value)} autoCapitalize="none" />
        <Field label="Instagram" value={values.instagram} onChangeText={(value) => set('instagram', value)} autoCapitalize="none" />
        <Field label="VK" value={values.vk} onChangeText={(value) => set('vk', value)} autoCapitalize="none" />
        <Field label="MAX" value={values.max} onChangeText={(value) => set('max', value)} placeholder="Ссылка max.ru или +7 999 123-45-67" maxLength={500} />
        <SectionTitle>Тип клиента</SectionTitle>
        <View style={styles.options}>{CLIENT_TYPES.map(([value, label]) => <Choice key={value} active={values.clientType === value} label={label} onPress={() => set('clientType', value)} />)}</View>
        <SectionTitle>Приоритетный канал связи</SectionTitle>
        <View style={styles.options}>{CONTACT_CHANNELS.map(([value, label]) => <Choice key={value} active={values.preferredContactChannel === value} label={label} onPress={() => set('preferredContactChannel', value)} />)}</View>
        {values.preferredContactChannel === 'other' ? <Field label="Другой канал" value={values.preferredContactChannelOther} onChangeText={(value) => set('preferredContactChannelOther', value)} maxLength={100} /> : null}
        <Field label="Комментарий" value={values.comment} onChangeText={(value) => set('comment', value)} multiline maxLength={2000} />
      </Surface>

      {!isNew ? <Button title="Файлы и документы" variant="secondary" onPress={() => router.push(`/clients/${id}/documents` as never)} disabled={id.startsWith('local-')} /> : null}
      <Surface>
        <SectionTitle>Значимые даты</SectionTitle>
        {significantDates.map((item, index) => (
          <View key={item.localKey} style={styles.dateCard}>
            <View style={styles.dateHeader}>
              <Text style={styles.dateTitle}>Дата {index + 1}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Удалить дату" style={styles.iconButton} onPress={() => changeDates((current) => current.filter((date) => date.localKey !== item.localKey))}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={palette.notice.danger.text} />
              </Pressable>
            </View>
            <Field label="Название" value={item.title || ''} onChangeText={(title) => updateDate(item.localKey, { title })} placeholder="День рождения" maxLength={100} />
            <Field label="Дата" value={item.dateInput} onChangeText={(dateInput) => updateDate(item.localKey, { dateInput })} placeholder="1990-05-20" />
            <Field label="Комментарий" value={item.comment || ''} onChangeText={(comment) => updateDate(item.localKey, { comment })} multiline maxLength={500} />
          </View>
        ))}
        <Pressable accessibilityRole="button" style={styles.addButton} onPress={() => changeDates((current) => [...current, { localKey: localKey(), title: '', dateInput: '', comment: '' }])}>
          <MaterialCommunityIcons name="plus" size={20} color={palette.primary} />
          <Text style={styles.addButtonText}>Добавить дату</Text>
        </Pressable>
      </Surface>

      <Surface>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: requisitesOpen }} style={styles.dateHeader} onPress={() => setRequisitesOpen((value) => !value)}>
          <View style={styles.flex}><Text style={styles.dateTitle}>Реквизиты для договора</Text>{!requisitesOpen ? <Text numberOfLines={1} style={styles.hint}>{[values.legalName, values.inn && `ИНН ${values.inn}`].filter(Boolean).join(' · ') || 'Не заполнены'}</Text> : null}</View>
          <MaterialCommunityIcons name={requisitesOpen ? 'chevron-up' : 'chevron-down'} size={20} color={palette.cardMuted} />
        </Pressable>
        {requisitesOpen ? <View>
        <Field label="Наименование / ФИО" value={values.legalName} onChangeText={(value) => set('legalName', value)} />
        <View style={styles.row}><View style={styles.flex}><Field label="ИНН" value={values.inn} onChangeText={(value) => set('inn', value)} keyboardType="numeric" /></View><View style={styles.flex}><Field label="КПП" value={values.kpp} onChangeText={(value) => set('kpp', value)} keyboardType="numeric" /></View></View>
        <Field label="ОГРН / ОГРНИП" value={values.ogrn} onChangeText={(value) => set('ogrn', value)} keyboardType="numeric" />
        <Field label="Банк" value={values.bankName} onChangeText={(value) => set('bankName', value)} />
        <Field label="БИК" value={values.bik} onChangeText={(value) => set('bik', value)} keyboardType="numeric" />
        <Field label="Расчётный счёт" value={values.checkingAccount} onChangeText={(value) => set('checkingAccount', value)} keyboardType="numeric" />
        <Field label="Корреспондентский счёт" value={values.correspondentAccount} onChangeText={(value) => set('correspondentAccount', value)} keyboardType="numeric" />
        <Field label="Юридический адрес" value={values.legalAddress} onChangeText={(value) => set('legalAddress', value)} multiline />
        </View> : null}
      </Surface>
      <Surface>
        <SectionTitle>Дополнительные данные</SectionTitle>
        <Field label="Email" value={values.email} onChangeText={(value) => set('email', value)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Viber" value={values.viber} onChangeText={(value) => set('viber', value)} keyboardType="phone-pad" />
        <Field label="Город" value={values.town} onChangeText={(value) => set('town', value)} />
      </Surface>

      {error ? <ErrorNotice message={error} /> : null}
      <Button testID="save-client" title="Сохранить" onPress={save} loading={loading} />
      {!isNew ? <Button title="Удалить клиента" variant="danger" onPress={remove} disabled={loading} /> : null}
      <Text style={styles.hint}>Если сети нет, запись получит статус «Ожидает отправки».</Text>
    </Screen>
  )
}

const Choice = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => {
  const styles = useThemeStyles(createStyles)
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.option, active && styles.optionActive]} onPress={onPress}>
    <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
  </Pressable>
}

const createStyles = (palette: Palette) => StyleSheet.create({
  row: { gap: spacing.sm },
  flex: { flex: 1 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 4, backgroundColor: palette.surface },
  optionActive: { backgroundColor: palette.notice.success.background, borderColor: palette.notice.success.border },
  optionText: { color: palette.cardMuted, fontSize: 12, fontWeight: '700' },
  optionTextActive: { color: palette.notice.success.text },
  dateCard: { gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.kpiBackground },
  dateHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  addButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md },
  addButtonText: { color: palette.primary, fontSize: 14, fontWeight: '700' },
  hint: { color: palette.cardMuted, fontSize: 12, textAlign: 'center' },
})
