import { ApiError } from '../../src/shared/api/errors'
import { getAuthSession } from '../../src/shared/auth/tokenStore'
import type { MobileUser } from '../../src/shared/auth/types'
import { CompactField } from '../../src/shared/ui/CompactField'
import { PaymentHistory } from '../../src/features/billing/PaymentHistory'
import { safeHttps } from '../../src/features/billing/history'
import { useScreenLifetime } from '../../src/features/profile/useScreenLifetime'
import { useWorkItemTerminology } from '../../src/shared/hooks/useWorkItemTerminology'
import { useTheme, useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import { Notice } from '../../src/shared/ui/Notice'
import { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import { api } from '../../src/shared/api/client'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import {
  formatBalanceRunway,
  formatBillingDate,
  formatRubles,
  getTariffFeatures,
} from '../../src/features/billing/format'
import type {
  MobileBilling,
  MobileTariff,
} from '../../src/features/billing/types'
import {
  Button,
  ErrorNotice,
  PageHeader,
  SectionTitle,
  StatusChip,
  Surface,
  Screen,
} from '../../src/shared/ui/components'
import { radius, spacing, type Palette } from '../../src/shared/ui/theme'

const quickAmounts = [500, 1000, 3000]

export default function BillingScreen() {
 const { user } = useAuth()
 return user ? <UserBillingScreen key={`${user.tenantId}:${user._id}`} /> : <Screen><PageHeader title="Баланс и платежи" /><Notice message="Войдите в пользовательский аккаунт" /></Screen>
}

function UserBillingScreen() {
  const { palette } = useTheme()
  const styles = useThemeStyles(createStyles)
  const { user, completeSignIn } = useAuth()
  const terms = useWorkItemTerminology()
  const capture = useScreenLifetime()
  const lock = useRef(false)
  const loadRevision = useRef(0)
  const [uncertain, setUncertain] = useState(false)
  const [billing, setBilling] = useState<MobileBilling | null>(null)
  const [amount, setAmount] = useState('1000')
  const [pendingPaymentId, setPendingPaymentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const current = capture()
    const revision = ++loadRevision.current
    setLoading(true)
    setError('')
    try {
      const response = await api.get<{ success: true; data: MobileBilling }>(
        '/mobile/v1/billing'
      )
      if (current() && revision === loadRevision.current) setBilling(response.data)
    } catch (reason) {
      if (current() && revision === loadRevision.current) setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось загрузить тариф и баланс'
      )
    } finally {
      if (current() && revision === loadRevision.current) setLoading(false)
    }
  }, [capture])

  useFocusEffect(
    useCallback(() => {
      void load()
      return () => { loadRevision.current++ }
    }, [load])
  )

  const run = async (task: (current: () => boolean) => Promise<void>) => {
    if (lock.current) return
    lock.current = true; loadRevision.current++
    const current = capture()
    if (!current()) { lock.current = false; return }
    setBusy(true); setLoading(false); setError(''); setMessage('')
    try { await task(current) }
    catch (reason) { if (current()) { if (reason instanceof ApiError && reason.status < 500 && reason.status !== 408) setUncertain(false); setError(reason instanceof ApiError && reason.status < 500 ? reason.message : 'Результат не подтверждён. Проверьте баланс и историю операций перед повтором.') } }
    finally { lock.current = false; if (capture()()) setBusy(false) }
  }
  const readBilling = async (current: () => boolean) => {
    const response = await api.get<{ success: true; data: MobileBilling }>('/mobile/v1/billing')
    if (!response.success || !response.data?.account) throw new Error('Unconfirmed')
    if (current()) setBilling(response.data)
    return response.data
  }
  const updateUser = async (current: () => boolean) => {
    try {
      const response = await api.get<{ success: true; data: MobileUser }>('/mobile/v1/auth/me')
      if (!current()) return
      const session = await getAuthSession()
      if (!current() || !response.success || response.data?._id !== user?._id || response.data?.tenantId !== user?.tenantId || session?.user._id !== user?._id || session?.user.tenantId !== user?.tenantId) return
      await completeSignIn({ ...session, user: response.data })
    } catch { if (current()) setError('Баланс проверен, но не удалось обновить профиль. Обновите экран позже.') }
  }
  const syncPayment = (paymentId = pendingPaymentId) => run(async (current) => {
    if (!paymentId) return
    const response = await api.post<{ success: true; data: { billing: MobileBilling; paymentStatus: string } }>(`/mobile/v1/billing/topup/${encodeURIComponent(paymentId)}/sync`, undefined, { skipRefresh: true })
    if (!current()) return
    await readBilling(current)
    if (!current()) return
    if (response.data.paymentStatus === 'succeeded') { setPendingPaymentId(''); setUncertain(false); setMessage('Платёж подтверждён') }
    else setMessage('Платёж не подтверждён. Проверьте его немного позже.')
    await updateUser(current)
  })
  const topUp = () => run(async (current) => {
    if (uncertain) return
    const normalizedAmount = Number(String(amount).replace(',', '.'))
    if (!Number.isFinite(normalizedAmount) || normalizedAmount < 100) { setError('Минимальная сумма пополнения — 100 ₽'); return }
    setUncertain(true)
    const response = await api.post<{ success: true; data: { paymentId: string; confirmationUrl: string } }>('/mobile/v1/billing/topup', { amount: normalizedAmount }, { skipRefresh: true })
    if (!current()) return
    const url = safeHttps(response.data?.confirmationUrl)
    if (!response.success || !response.data?.paymentId || !url) throw new Error('Unconfirmed')
    setPendingPaymentId(response.data.paymentId)
    await WebBrowser.openBrowserAsync(url)
    if (current()) setMessage('Проверьте статус платежа после оплаты')
  })

  const selectTariff = (tariff: MobileTariff) => {
    if (lock.current) return
    const quote = tariff.change
    if (!quote || quote.current || quote.blockedReason) return
    if (quote.missingAmount > 0) {
      const missing = Math.ceil(quote.missingAmount)
      setAmount(String(Math.max(missing, 100)))
      setMessage(`Для тарифа «${tariff.title}» пополните баланс минимум на ${formatRubles(missing)}.`)
      return
    }
    const details = [
      quote.creditAmount > 0
        ? `Компенсация за текущий тариф: ${formatRubles(quote.creditAmount)}.`
        : '',
      tariff.price > 0
        ? `Будет списано ${formatRubles(tariff.price)}.`
        : 'Переход бесплатный.',
      `После смены останется ${formatRubles(quote.balanceAfter)}.`,
    ]
      .filter(Boolean)
      .join(' ')
    Alert.alert(`Перейти на «${tariff.title}»?`, details, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Сменить тариф',
        onPress: () => void run(async (current) => {
          let postFailed = false
          try { await api.post('/mobile/v1/billing', { tariffId: tariff._id }, { skipRefresh: true }) }
          catch { postFailed = true }
          if (!current()) return
          const read = await readBilling(current)
          if (read.currentTariff?._id !== tariff._id) throw new Error('Unconfirmed')
          if (current()) setMessage(`Тариф «${tariff.title}» подключён${postFailed ? ' (подтверждено повторным чтением)' : ''}`)
          if (current()) await updateUser(current)
        }),
      },
    ])
  }

  return (
    <Screen>
      <PageHeader
        title="Баланс и платежи"
        subtitle="Пополнение, прогноз и доступные тарифы"
      />
      {error ? <ErrorNotice message={error} /> : null}
      {message ? <Notice message={message} /> : null}
      {uncertain && !pendingPaymentId ? <><Notice tone="warning" message="Платёж мог быть создан. Проверьте историю операций перед новым пополнением; автоматического повтора нет." /><Button title="Разрешить повтор после проверки" variant="secondary" onPress={() => Alert.alert('Создать новый платёж?', 'Проверьте историю операций. Первый платёж мог быть создан; повтор создаст новый платёж.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Разрешить повтор', onPress: () => { if (capture()()) setUncertain(false) } }])} /></> : null}
      {error ? <Button title="Обновить тариф и баланс" variant="secondary" onPress={load} disabled={busy || loading} /> : null}
      {loading && !billing ? (
        <ActivityIndicator size="large" color={palette.primary} />
      ) : billing ? (
        <>
          <Surface style={styles.balanceCard}>
            <View style={styles.titleRow}>
              <View>
                <Text style={[styles.eyebrow, styles.balanceMeta]}>ТЕКУЩИЙ БАЛАНС</Text>
                <Text style={styles.balance}>{formatRubles(billing.account.balance)}</Text>
              </View>
              <View style={styles.balanceIcon}><MaterialCommunityIcons name="wallet-outline" size={25} color={palette.primary} /></View>
            </View>
            <Text style={styles.runway}>{formatBalanceRunway(billing)}</Text>
            {billing.account.tariffActiveUntil ? <Text style={[styles.muted, styles.balanceMeta]}>Текущий период оплачен до {formatBillingDate(billing.account.tariffActiveUntil)}</Text> : null}
          </Surface>

          <Surface>
            <SectionTitle>Пополнить баланс</SectionTitle>
            <View style={styles.quickAmounts}>
              {quickAmounts.map((value) => <Pressable key={value} style={[styles.quickAmount, amount === String(value) && styles.quickAmountActive]} accessibilityRole="button" accessibilityLabel={formatRubles(value)} accessibilityState={{ selected: amount === String(value), disabled: busy }} disabled={busy} onPress={() => setAmount(String(value))}><Text style={[styles.quickAmountText, amount === String(value) && styles.quickAmountTextActive]}>{formatRubles(value)}</Text></Pressable>)}
            </View>
            <CompactField editable={!loading && !busy} label="Сумма, ₽" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <Button title="Перейти к оплате" onPress={topUp} loading={busy} disabled={uncertain || loading} />
            {pendingPaymentId ? <Button title="Проверить последний платёж" variant="secondary" onPress={() => syncPayment()} loading={busy} /> : null}
            <Text style={styles.muted}>Оплата проходит через СБП на защищённой странице Точки. После подтверждения вернитесь в приложение.</Text>
          </Surface>

          <Surface>
            <View style={styles.titleRow}>
              <View style={styles.grow}>
                <Text style={styles.eyebrow}>ТЕКУЩИЙ ТАРИФ</Text>
                <Text style={styles.currentTariff}>{billing.currentTariff?.title || 'Не выбран'}</Text>
              </View>
              {billing.currentTariff ? <StatusChip label="Выбран" tone="neutral" /> : null}
            </View>
            {billing.currentTariff ? <Text style={styles.muted}>{billing.currentTariff.price > 0 ? `${formatRubles(billing.currentTariff.price)} в месяц` : 'Бесплатный тариф'}{billing.currentTariff.eventsPerMonth > 0 ? ` · до ${billing.currentTariff.eventsPerMonth} ${terms.pluralGenitive}` : ` · без ограничений по ${terms.pluralDative}`}</Text> : null}
          </Surface>

          <View style={styles.tariffsSection}>
            <SectionTitle>Сменить тариф</SectionTitle>
            {billing.tariffs.map((tariff) => {
              const quote = tariff.change
              const features = getTariffFeatures(tariff)
              const disabled = busy || loading || !quote || Boolean(quote?.current || quote?.blockedReason)
              const buttonTitle = quote?.current
                ? 'Текущий тариф'
                : quote?.missingAmount
                  ? `Пополнить на ${formatRubles(Math.ceil(quote.missingAmount))}`
                  : 'Выбрать тариф'
              return (
                <Surface key={tariff._id} style={quote?.current ? styles.currentCard : undefined}>
                  <View style={styles.titleRow}><View style={styles.grow}><Text style={styles.tariffTitle}>{tariff.title}</Text><Text style={styles.tariffPrice}>{tariff.price > 0 ? `${formatRubles(tariff.price)}/мес` : 'Бесплатно'}</Text></View>{quote?.current ? <StatusChip label="Текущий" tone="success" /> : null}</View>
                  <Text style={styles.muted}>{tariff.eventsPerMonth > 0 ? `До ${tariff.eventsPerMonth} ${terms.pluralGenitive} в месяц` : `Без ограничений по ${terms.pluralDative}`}</Text>
                  {features.length ? <Text style={styles.features}>{features.join(' · ')}</Text> : null}
                  {quote?.creditAmount ? <Text style={styles.credit}>Компенсация за текущий тариф: {formatRubles(quote.creditAmount)}</Text> : null}
                  {quote?.blockedReason ? <Text style={styles.warning}>{quote.blockedReason}</Text> : null}
                  <Button title={buttonTitle} variant={quote?.current ? 'secondary' : 'primary'} disabled={disabled} onPress={() => selectTariff(tariff)} />
                </Surface>
              )
            })}
          </View>
        </>
      ) : null}
      <PaymentHistory />
    </Screen>
  )
}

const createStyles = (palette: Palette) => StyleSheet.create({
  grow: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  eyebrow: { color: palette.cardMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  balanceCard: { backgroundColor: palette.rowSelected },
  balanceMeta: { color: palette.cardMeta },
  balance: { color: palette.text, fontSize: 32, fontWeight: '800', marginTop: spacing.xs },
  balanceIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  runway: { color: palette.text, fontSize: 14, fontWeight: '700' },
  muted: { color: palette.cardMuted, fontSize: 13, lineHeight: 19 },
  message: { backgroundColor: palette.notice.success.background },
  messageText: { color: palette.notice.success.text, fontSize: 13, fontWeight: '700' },
  quickAmounts: { flexDirection: 'row', gap: spacing.sm },
  quickAmount: { flex: 1, minHeight: 40, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.rowPressed },
  quickAmountActive: { borderColor: palette.primary, backgroundColor: palette.rowSelected },
  quickAmountText: { color: palette.text, fontSize: 13, fontWeight: '700' },
  quickAmountTextActive: { color: palette.selectionText },
  currentTariff: { color: palette.text, fontSize: 22, fontWeight: '800', marginTop: spacing.xs },
  tariffsSection: { gap: spacing.md },
  currentCard: { borderColor: palette.notice.success.text },
  tariffTitle: { color: palette.text, fontSize: 18, fontWeight: '800' },
  tariffPrice: { color: palette.primary, fontSize: 16, fontWeight: '700', marginTop: spacing.xs },
  features: { color: palette.text, fontSize: 13, lineHeight: 20 },
  credit: { color: palette.notice.success.text, fontSize: 13, fontWeight: '700' },
  warning: { color: palette.notice.warning.text, fontSize: 13, fontWeight: '700' },
})
