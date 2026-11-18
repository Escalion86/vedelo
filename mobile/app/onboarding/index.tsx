import { useCallback, useEffect, useRef, useState } from 'react'
import { DetectTownButton } from '../../src/shared/native/DetectTownButton'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '../../src/shared/api/client'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import { upsertEntities } from '../../src/shared/storage/cache'
import { useQueryClient } from '@tanstack/react-query'
import { MOBILE_SETTINGS_QUERY_KEY } from '../../src/shared/hooks/useWorkItemTerminology'
import { ActivityFields } from '../../src/features/onboarding/ActivityFields'
import { activityPayload, activityTerminology, readActivityOnboarding, validateActivityDraft, type ActivityDraft, type ActivityPreset } from '../../src/features/onboarding/activityProfile'
import { readBuiltInContracts, type BuiltInContractTemplate } from '../../src/features/documents/builtInTemplates'
import {
  Button,
  PageHeader,
  Screen,
  SectionTitle,
  Surface,
} from '../../src/shared/ui/components'
import { CompactField } from '../../src/shared/ui/CompactField'
import { Notice } from '../../src/shared/ui/Notice'
import { useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import { radius, spacing, type Palette } from '../../src/shared/ui/theme'

const timeZones = [
  ['Europe/Moscow', 'Москва'],
  ['Asia/Yekaterinburg', 'Екатеринбург'],
  ['Asia/Omsk', 'Омск'],
  ['Asia/Krasnoyarsk', 'Красноярск'],
  ['Asia/Irkutsk', 'Иркутск'],
  ['Asia/Yakutsk', 'Якутск'],
  ['Asia/Vladivostok', 'Владивосток'],
] as const

export default function OnboardingScreen() {
  const styles = useThemeStyles(createStyles)
  const { user, refreshUser, completeOnboarding } = useAuth()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [presets, setPresets] = useState<ActivityPreset[]>([])
  const [templates, setTemplates] = useState<BuiltInContractTemplate[]>([])
  const [servicesCount, setServicesCount] = useState(0)
  const [profile, setProfile] = useState({
    firstName: user?.firstName || '', secondName: user?.secondName || '',
    thirdName: user?.thirdName || '', whatsapp: '', telegram: '', vk: '', instagram: '',
  })
  const [town, setTown] = useState('')
  const [timeZone, setTimeZone] = useState('Asia/Krasnoyarsk')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [activity, setActivity] = useState<ActivityDraft>({ preset: '', otherDescription: '' })
  const [activityError, setActivityError] = useState('')
  const [presetLoading, setPresetLoading] = useState(true)
  const [presetError, setPresetError] = useState('')
  const [createStarterServices, setCreateStarterServices] = useState(true)
  const [showColleagueTransferFields, setShowColleagueTransferFields] = useState(false)
  const [createDemoEvent, setCreateDemoEvent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const finishing = useRef(false)

  const loadPresets = useCallback(async () => {
    setPresetLoading(true)
    setPresetError('')
    try {
      const data = await readActivityOnboarding()
      setPresets(data.presets)
      setServicesCount(data.servicesCount)
      if (data.servicesCount > 0) setCreateStarterServices(false)
      const defaultTown = data.settings?.defaultTown
      if (defaultTown) setTown((current) => current || defaultTown)
      if (data.settings?.timeZone) setTimeZone(data.settings.timeZone)
    } catch (reason) {
      setPresetError(reason instanceof Error ? reason.message : 'Не удалось загрузить мастер')
    } finally { setPresetLoading(false) }
  }, [])

  useEffect(() => { void loadPresets() }, [loadPresets])
  useEffect(() => {
    let active = true
    void readBuiltInContracts().then((items) => { if (active) setTemplates(items) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const next = () => {
    setError('')
    if (step === 0 && (!profile.firstName.trim() || !profile.secondName.trim())) {
      setError('Укажите имя и фамилию')
      return
    }
    if (step === 2) {
      const issue = validateActivityDraft(activity)
      setActivityError(issue)
      if (issue) return
    }
    setStep((current) => Math.min(4, current + 1))
  }

  const finish = async () => {
    if (finishing.current) return
    finishing.current = true
    setLoading(true); setError('')
    try {
      const response = await api.post<{
        success: true
        data: {
          settings?: Record<string, unknown> & { _id: string }
          services?: Array<Record<string, unknown> & { _id: string }>
          event?: Record<string, unknown> & { _id: string }
        }
      }>('/mobile/v1/onboarding', {
        profile, town, timeZone, theme,
        presetKey: activity.preset,
        otherDescription: activityPayload(activity).otherDescription,
        terminology: activityTerminology(activity),
        activityProfileVersion: 1,
        createStarterServices: servicesCount === 0 && createStarterServices,
        showColleagueTransferFields, createDemoEvent,
      })
      if (response.data.settings?._id) {
        await upsertEntities('siteSettings', [response.data.settings])
      }
      if (response.data.services?.length) {
        await upsertEntities('services', response.data.services)
      }
      if (response.data.event?._id) {
        await upsertEntities('events', [response.data.event])
      }
      await refreshUser()
      void queryClient.invalidateQueries({ queryKey: MOBILE_SETTINGS_QUERY_KEY })
      completeOnboarding()
      router.replace('/(tabs)')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось завершить настройку')
    } finally { finishing.current = false; setLoading(false) }
  }

  const preset = presets.find((item) => item.key === activity.preset)
  return (
    <Screen keyboardShouldPersistTaps="handled" contentStyle={styles.screen}>
      <View accessible accessibilityRole="progressbar" accessibilityLabel="Настройка Ведело" accessibilityValue={{ min: 1, max: 5, now: step + 1, text: `Шаг ${step + 1} из 5` }} style={styles.progress}><View style={[styles.progressFill, { width: `${((step + 1) / 5) * 100}%` }]} /></View>
      <PageHeader
        title={['Ваш профиль', 'Город и время', 'Специализация', 'Работа с коллегами', 'Как устроена CRM'][step]}
        subtitle={`Шаг ${step + 1} из 5`}
      />

      {step === 0 ? <Surface>
        <Text style={styles.explanation}>Эти данные используются в документах и помогают быстрее связываться с клиентами.</Text>
        <CompactField editable={!loading} testID="onboarding-first-name" label="Имя *" value={profile.firstName} onChangeText={(firstName) => setProfile((value) => ({ ...value, firstName }))} />
        <CompactField editable={!loading} testID="onboarding-last-name" label="Фамилия *" value={profile.secondName} onChangeText={(secondName) => setProfile((value) => ({ ...value, secondName }))} />
        <CompactField editable={!loading} label="Отчество" value={profile.thirdName} onChangeText={(thirdName) => setProfile((value) => ({ ...value, thirdName }))} />
        <CompactField editable={!loading} label="WhatsApp" value={profile.whatsapp} onChangeText={(whatsapp) => setProfile((value) => ({ ...value, whatsapp }))} keyboardType="phone-pad" />
        <CompactField editable={!loading} label="Telegram" value={profile.telegram} onChangeText={(telegram) => setProfile((value) => ({ ...value, telegram }))} autoCapitalize="none" />
      </Surface> : null}

      {step === 1 ? <Surface>
        <Text style={styles.explanation}>Город и часовой пояс нужны для правильных напоминаний, календаря и дат документов.</Text>
        <CompactField editable={!loading} label="Основной город" value={town} onChangeText={setTown} />
        <DetectTownButton value={town} onConfirm={setTown} disabled={loading} />
        <SectionTitle>Часовой пояс</SectionTitle>
        <View style={styles.options}>{timeZones.map(([value, label]) => <Choice disabled={loading} key={value} label={label} active={timeZone === value} onPress={() => setTimeZone(value)} />)}</View>
        <SectionTitle>Тема</SectionTitle>
        <View style={styles.options}><Choice disabled={loading} label="Светлая" active={theme === 'light'} onPress={() => setTheme('light')} /><Choice disabled={loading} label="Тёмная" active={theme === 'dark'} onPress={() => setTheme('dark')} /></View>
      </Surface> : null}

      {step === 2 ? <Surface>
        {!presets.length ? <>
          <Notice tone={presetLoading ? 'info' : 'warning'} message={presetLoading ? 'Загружаем виды деятельности…' : 'Не удалось загрузить виды деятельности.'} />
          {!presetLoading ? <Button title="Повторить загрузку" variant="secondary" onPress={() => void loadPresets()} /> : null}
        </> : <ActivityFields draft={activity} presets={presets} terminology templates={templates} error={activityError} disabled={loading}
          change={(draft) => { setActivity(draft); setActivityError('') }} />}
        {servicesCount > 0 ? <Notice tone="info" message="У вас уже есть услуги. Стартовый набор добавлять не будем." /> : preset ? <Pressable accessibilityRole="checkbox" accessibilityLabel="Создать стартовые услуги" accessibilityState={{ checked: createStarterServices, disabled: loading }} disabled={loading} style={({ pressed }) => [styles.checkRow, pressed && styles.pressed, loading && styles.disabled]} onPress={() => setCreateStarterServices((value) => !value)}><Check checked={createStarterServices} /><View style={styles.flex}><Text style={styles.checkTitle}>Создать стартовые услуги</Text><Text style={styles.presetDescription}>{preset.starterServices.map((item) => item.title).join(', ')}</Text></View></Pressable> : null}
      </Surface> : null}

      {step === 3 ? <Surface>
        <Text style={styles.explanation}>Бывает ли, что вы передаёте подтверждённый заказ коллеге?</Text>
        <View style={styles.options}><Choice disabled={loading} label="Да, бывает" active={showColleagueTransferFields} onPress={() => setShowColleagueTransferFields(true)} /><Choice disabled={loading} label="Нет" active={!showColleagueTransferFields} onPress={() => setShowColleagueTransferFields(false)} /></View>
        <Text style={styles.presetDescription}>Если включить, в редакторе появятся поля «Передано коллеге». Существующие карточки при выключении не изменятся.</Text>
      </Surface> : null}

      {step === 4 ? <>
        <Surface><Status title="Заявка" tone="warning" text="Клиент заинтересовался, но ещё не подтвердил заказ. Главное — поставить следующий контакт." /><Status title="Подтверждено" tone="success" text="Дата или условия согласованы. Контролируйте оплату, задачи, документы и календарь." /><Status title="Закрыто" text="Работа завершена, оплаты и документы доведены до конца." /><Status title="Отменено" tone="danger" text="Заказ не состоялся и больше не считается активной работой." /></Surface>
        <Surface><Pressable accessibilityRole="checkbox" accessibilityLabel="Создать учебную заявку" accessibilityState={{ checked: createDemoEvent, disabled: loading }} disabled={loading} style={({ pressed }) => [styles.checkRow, pressed && styles.pressed, loading && styles.disabled]} onPress={() => setCreateDemoEvent((value) => !value)}><Check checked={createDemoEvent} /><View style={styles.flex}><Text style={styles.checkTitle}>Создать учебную заявку</Text><Text style={styles.presetDescription}>В ней уже будет следующий контакт на завтра. Её можно удалить как обычную карточку.</Text></View></Pressable></Surface>
      </> : null}

      {error || presetError ? <Notice tone="danger" message={error || presetError} /> : null}
      <View style={styles.actions}>{step > 0 ? <View style={styles.action}><Button title="Назад" variant="secondary" onPress={() => setStep((value) => value - 1)} disabled={loading} /></View> : null}<View style={styles.action}><Button testID="onboarding-next" title={step === 4 ? 'Завершить настройку' : 'Продолжить'} onPress={step === 4 ? finish : next} loading={loading} disabled={step === 2 && !presets.length} /></View></View>
    </Screen>
  )
}

const Choice = ({ label, active, onPress, disabled }: { label: string; active: boolean; onPress: () => void; disabled: boolean }) => {
  const styles = useThemeStyles(createStyles)
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: active, disabled }} disabled={disabled} style={({ pressed }) => [styles.choice, active && styles.choiceActive, pressed && (active ? styles.choiceActivePressed : styles.pressed), disabled && styles.disabled]} onPress={onPress}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>
}
const Check = ({ checked }: { checked: boolean }) => {
  const styles = useThemeStyles(createStyles)
  return <View style={[styles.checkbox, checked && styles.checkboxActive]}><Text style={styles.checkmark}>{checked ? '✓' : ''}</Text></View>
}
const Status = ({ title, text, tone = 'neutral' }: { title: string; text: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) => <Notice tone={tone} accessibilityRole="text" accessibilityLabel={`${title}. ${text}`} message={`${title}. ${text}`} />
const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { gap: spacing.md },
  progress: { height: 5, borderRadius: 3, backgroundColor: palette.notice.neutral.background, overflow: 'hidden' },
  progressFill: { height: 5, backgroundColor: palette.primary },
  explanation: { color: palette.text, fontSize: 14, lineHeight: 21 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { minHeight: 40, flexShrink: 1, paddingHorizontal: 13, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: palette.notice.neutral.background, borderWidth: 1, borderColor: palette.border },
  choiceActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  choiceActivePressed: { backgroundColor: palette.primaryPressed },
  choiceText: { color: palette.cardMuted, fontSize: 13, fontWeight: '600' },
  choiceTextActive: { color: palette.onPrimary },
  presetDescription: { color: palette.cardMuted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  checkRow: { minHeight: 40, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm },
  checkbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  checkmark: { color: palette.onPrimary, fontWeight: '700' },
  checkTitle: { color: palette.text, fontSize: 14, fontWeight: '600' },
  pressed: { backgroundColor: palette.rowPressed },
  disabled: { opacity: 0.65 },
  flex: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 160 },
})
