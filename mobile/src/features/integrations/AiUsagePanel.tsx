import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { api } from '../../shared/api/client'
import { Button, ErrorNotice, Notice } from '../../shared/ui/components'
import { radius, spacing, type Palette } from '../../shared/ui/theme'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import { isObject, responseData, safeError } from './integrationContract'

export type AiProvider = 'artistcrm' | 'aitunnel'

type AiUsageItem = {
  id: string
  feature: string
  status: string
  charged: number
  createdAt: string
}

type UserAiUsage = {
  balance: number
  requiredBalance: number
  available: boolean
  platformConfigured: boolean
  quotes: Array<{
    feature: string
    requiredBalance: number
    available: boolean
  }>
  summary: {
    operations: number
    charged: number
  }
  recent: AiUsageItem[]
}

export const readUsage = (response: unknown): UserAiUsage => {
  const data = responseData(response)
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  if (!finite(data.balance) || !finite(data.requiredBalance) || typeof data.available !== 'boolean' || typeof data.platformConfigured !== 'boolean' || !isObject(data.summary) || !finite(data.summary.operations) || !finite(data.summary.charged) || !Array.isArray(data.quotes) || !Array.isArray(data.recent)) throw new Error('INVALID_USAGE')
  const quotes = data.quotes.map((item) => {
    if (!isObject(item) || typeof item.feature !== 'string' || !finite(item.requiredBalance) || typeof item.available !== 'boolean') throw new Error('INVALID_QUOTE')
    return { feature: item.feature, requiredBalance: item.requiredBalance, available: item.available }
  })
  const recent = data.recent.map((item) => {
    if (!isObject(item) || typeof item.id !== 'string' || typeof item.feature !== 'string' || typeof item.status !== 'string' || !finite(item.charged) || typeof item.createdAt !== 'string') throw new Error('INVALID_USAGE_ITEM')
    return { id: item.id, feature: item.feature, status: item.status, charged: item.charged, createdAt: item.createdAt }
  })
  return { balance: data.balance, requiredBalance: data.requiredBalance, available: data.available, platformConfigured: data.platformConfigured, summary: { operations: data.summary.operations, charged: data.summary.charged }, quotes, recent }
}

const featureLabels: Record<string, string> = {
  call_transcription: 'Расшифровка звонка',
  call_analysis: 'Анализ звонка',
  voice_transcription: 'Голосовой ввод',
  event_draft: 'Черновик мероприятия',
}

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const formatMoney = (value?: number) => {
  const number = Number(value || 0)
  return `${moneyFormatter.format(Number.isFinite(number) ? number : 0)} ₽`
}

const formatDateTime = (value?: string) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
}

const operationStatus = (item: AiUsageItem) => {
  if (item.status === 'succeeded') return formatMoney(item.charged)
  if (item.status === 'failed') return 'Без списания'
  return 'Обрабатывается'
}

const Metric = ({ label, value }: { label: string; value: string }) => {
  const styles = useThemeStyles(createStyles)
  return (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
  )
}

export const AiUsagePanel = ({
  activeProvider, activeEnabled, activeConfigured,
}: {
  activeProvider: AiProvider | null
  activeEnabled?: boolean
  activeConfigured?: boolean
}) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const [usage, setUsage] = useState<UserAiUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const lifecycle = useRef({ active: false, revision: 0, busy: false })
  const load = useCallback(async () => {
    if (!lifecycle.current.active || lifecycle.current.busy) return
    lifecycle.current.busy = true
    const revision = ++lifecycle.current.revision
    setLoading(true); setError('')
    try {
      const data = readUsage(await api.get('/ai/usage'))
      if (lifecycle.current.active && lifecycle.current.revision === revision) setUsage(data)
    } catch (reason) {
      if (lifecycle.current.active && lifecycle.current.revision === revision) {
        setUsage(null)
        setError(safeError(reason, 'Не удалось загрузить баланс и расходы ИИ.'))
      }
    } finally {
      if (lifecycle.current.active && lifecycle.current.revision === revision) {
        lifecycle.current.busy = false; setLoading(false)
      }
    }
  }, [])
  useFocusEffect(useCallback(() => {
    lifecycle.current.active = true; lifecycle.current.busy = false
    void load()
    return () => { lifecycle.current.active = false; ++lifecycle.current.revision; lifecycle.current.busy = false }
  }, [load]))

  if (loading && !usage) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.primary} />
        <Text style={styles.muted}>Загрузка баланса и расходов...</Text>
      </View>
    )
  }

  const platformActive = activeProvider === 'artistcrm'

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Расходы ИИ Ведело</Text>
        <Button
          title="Обновить"
          variant="secondary"
          onPress={() => void load()}
          loading={loading}
          style={styles.compactButton}
        />
      </View>

      {error ? <ErrorNotice message={error} /> : null}

      {usage ? (
        <>
          <View style={styles.metrics}>
            <Metric label="Баланс" value={formatMoney(usage?.balance)} />
            <Metric
              label="Макс. текущий порог"
              value={formatMoney(usage?.requiredBalance)}
            />
            <Metric
              label="Всего списано"
              value={formatMoney(usage?.summary?.charged)}
            />
            <Metric
              label="Операции"
              value={String(usage?.summary?.operations || 0)}
            />
          </View>

          {activeProvider === null ? (
            <Text style={styles.muted}>Текущий провайдер не поддерживается приложением.</Text>
          ) : activeEnabled === false ? (
            <Notice tone="info" message="ИИ-интеграция приостановлена. Баланс и история остаются доступными." />
          ) : activeConfigured === false ? (
            <Notice tone="warning" message="Текущий ИИ требует настройки. История относится к общему ИИ Ведело." />
          ) : !platformActive ? (
            <Notice tone="info" message="Сейчас используется собственный провайдер. Ведело не списывает баланс за такие запросы." />
          ) : !usage.platformConfigured ? (
            <Notice tone="warning" message="Общий ИИ временно не настроен администратором." />
          ) : !usage.available ? (
            <Notice tone="warning" message="Для части операций недостаточно средств. Баланс должен быть больше средней стоимости нужной операции." />
          ) : <Notice tone="success" message="Общий ИИ доступен." />}

          {(usage?.quotes || []).length > 0 ? (
            <View style={styles.listBox}>
              <Text style={styles.listTitle}>Пороги по операциям</Text>
              {usage?.quotes.map((quote) => (
                <View key={quote.feature} style={styles.row}>
                  <Text style={styles.rowLabel}>
                    {featureLabels[quote.feature] || 'Операция ИИ'}
                  </Text>
                  <Text style={quote.available ? styles.rowValue : styles.warningText}>
                    больше {formatMoney(quote.requiredBalance)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {(usage?.recent || []).length > 0 ? (
            <View style={styles.listBox}>
              <Text style={styles.listTitle}>Последние операции</Text>
              {usage?.recent.slice(0, 5).map((item) => (
                <View key={item.id} style={styles.row}>
                  <View style={styles.grow}>
                    <Text style={styles.rowLabel}>
                      {featureLabels[item.feature] || 'Операция ИИ'}
                    </Text>
                    <Text style={styles.muted}>{formatDateTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.rowValue}>{operationStatus(item)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>Операций общего ИИ пока нет.</Text>
          )}
        </>
      ) : null}
    </View>
  )
}

const createStyles = (colors: Palette) => StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  loading: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  compactButton: { minHeight: 40, paddingHorizontal: spacing.md },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    minWidth: '47%',
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.kpiBackground,
  },
  metricLabel: { color: colors.cardMuted, fontSize: 11 },
  metricValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  warningText: { color: colors.notice.warning.text, fontSize: 12, lineHeight: 18 },
  muted: { color: colors.cardMuted, fontSize: 12, lineHeight: 18 },
  listBox: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  listTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  row: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  rowLabel: { flexShrink: 1, color: colors.text, fontSize: 12, fontWeight: '600' },
  rowValue: { color: colors.text, fontSize: 12, fontWeight: '700' },
  grow: { flex: 1 },
})
