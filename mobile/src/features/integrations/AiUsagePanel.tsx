import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { api } from '../../shared/api/client'
import { Button, ErrorNotice, Field } from '../../shared/ui/components'
import { colors, radius, spacing } from '../../shared/ui/theme'

type AiProvider = 'artistcrm' | 'aitunnel' | 'deepseek'

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

type AdminAiUsage = {
  summary: {
    operations: number
    providerCost: number
    charged: number
    margin: number
    uncovered: number
  }
  breakdown: Array<{
    feature: string
    operations: number
    providerCost: number
    charged: number
  }>
  users: Array<{
    tenantId: string
    name: string
    email: string
    balance: number
    operations: number
    providerCost: number
    charged: number
    margin: number
  }>
}

type AiBillingSettings = {
  markupCoefficient: number
  platformConfigured: boolean
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

const Metric = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
)

export const AiUsagePanel = ({
  activeProvider,
  isDeveloper,
}: {
  activeProvider: AiProvider
  isDeveloper: boolean
}) => {
  const [usage, setUsage] = useState<UserAiUsage | null>(null)
  const [adminUsage, setAdminUsage] = useState<AdminAiUsage | null>(null)
  const [settings, setSettings] = useState<AiBillingSettings | null>(null)
  const [coefficient, setCoefficient] = useState('1.5')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError('')
      try {
        const userPromise = api.get<{ success: true; data: UserAiUsage }>(
          '/ai/usage',
          { signal }
        )
        const developerPromise = isDeveloper
          ? Promise.all([
              api.get<{ success: true; data: AiBillingSettings }>(
                '/ai/settings',
                { signal }
              ),
              api.get<{ success: true; data: AdminAiUsage }>(
                '/ai/usage?scope=admin',
                { signal }
              ),
            ])
          : Promise.resolve([null, null] as const)
        const [userResponse, [settingsResponse, adminResponse]] =
          await Promise.all([userPromise, developerPromise])
        if (signal?.aborted) return

        setUsage(userResponse.data)
        setSettings(settingsResponse?.data || null)
        setAdminUsage(adminResponse?.data || null)
        if (settingsResponse?.data) {
          setCoefficient(String(settingsResponse.data.markupCoefficient))
        }
      } catch (reason) {
        if (signal?.aborted) return
        setError(
          reason instanceof Error
            ? reason.message
            : 'Не удалось загрузить расходы на ИИ'
        )
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [isDeveloper]
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const saveCoefficient = async () => {
    const value = Number(String(coefficient).replace(',', '.'))
    if (!Number.isFinite(value) || value < 1 || value > 10) {
      setError('Коэффициент должен быть от 1 до 10')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await api.post<{
        success: true
        data: AiBillingSettings
      }>('/ai/settings', { markupCoefficient: value })
      setSettings(response.data)
      setCoefficient(String(response.data.markupCoefficient))
      setMessage('Коэффициент наценки сохранён')
      await load()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось сохранить коэффициент'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading && !usage) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Загрузка баланса и расходов...</Text>
      </View>
    )
  }

  const platformActive = activeProvider === 'artistcrm'
  const adminSummary = adminUsage?.summary

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
      {message ? <Text style={styles.success}>{message}</Text> : null}

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

      {!usage?.platformConfigured ? (
        <View style={[styles.notice, styles.dangerNotice]}>
          <Text style={styles.dangerText}>
            Общий ИИ временно не настроен администратором.
          </Text>
        </View>
      ) : platformActive && !usage.available ? (
        <View style={[styles.notice, styles.warningNotice]}>
          <Text style={styles.warningText}>
            Для части операций недостаточно средств. Баланс должен быть больше
            средней стоимости нужной операции.
          </Text>
        </View>
      ) : !platformActive ? (
        <View style={[styles.notice, styles.neutralNotice]}>
          <Text style={styles.muted}>
            Сейчас используется собственный провайдер. Ведело не списывает
            баланс за такие запросы.
          </Text>
        </View>
      ) : (
        <View style={[styles.notice, styles.successNotice]}>
          <Text style={styles.successText}>Общий ИИ доступен.</Text>
        </View>
      )}

      {(usage?.quotes || []).length > 0 ? (
        <View style={styles.listBox}>
          <Text style={styles.listTitle}>Пороги по операциям</Text>
          {usage?.quotes.map((quote) => (
            <View key={quote.feature} style={styles.row}>
              <Text style={styles.rowLabel}>
                {featureLabels[quote.feature] || quote.feature}
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
                  {featureLabels[item.feature] || item.feature}
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

      {isDeveloper ? (
        <View style={styles.adminBox}>
          <Text style={styles.sectionTitle}>Администрирование</Text>
          <Text style={styles.muted}>
            Фактическая стоимость AITunnel умножается на этот коэффициент.
          </Text>
          <Field
            testID="ai-markup-coefficient"
            label="Коэффициент наценки"
            value={coefficient}
            onChangeText={setCoefficient}
            keyboardType="decimal-pad"
          />
          <Button
            title="Сохранить коэффициент"
            onPress={saveCoefficient}
            loading={saving}
            disabled={loading}
          />
          {!settings?.platformConfigured ? (
            <Text style={styles.dangerText}>AITUNNEL_KEY не настроен.</Text>
          ) : null}

          <View style={styles.metrics}>
            <Metric
              label="Себестоимость"
              value={formatMoney(adminSummary?.providerCost)}
            />
            <Metric
              label="Списано"
              value={formatMoney(adminSummary?.charged)}
            />
            <Metric label="Маржа" value={formatMoney(adminSummary?.margin)} />
            <Metric
              label="Всего операций"
              value={String(adminSummary?.operations || 0)}
            />
          </View>

          {(adminUsage?.breakdown || []).length > 0 ? (
            <View style={styles.listBox}>
              <Text style={styles.listTitle}>По функциям</Text>
              {adminUsage?.breakdown.map((item) => (
                <View key={item.feature} style={styles.adminRow}>
                  <View style={styles.grow}>
                    <Text style={styles.rowLabel}>
                      {featureLabels[item.feature] || item.feature}
                    </Text>
                    <Text style={styles.muted}>{item.operations} операций</Text>
                  </View>
                  <View style={styles.right}>
                    <Text style={styles.rowValue}>{formatMoney(item.charged)}</Text>
                    <Text style={styles.muted}>
                      затраты {formatMoney(item.providerCost)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {(adminUsage?.users || []).length > 0 ? (
            <View style={styles.listBox}>
              <Text style={styles.listTitle}>Основные пользователи</Text>
              {adminUsage?.users.slice(0, 5).map((item) => (
                <View key={item.tenantId} style={styles.adminRow}>
                  <View style={styles.grow}>
                    <Text style={styles.rowLabel}>{item.name}</Text>
                    <Text style={styles.muted}>
                      {item.operations} операций · баланс {formatMoney(item.balance)}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <Text style={styles.rowValue}>{formatMoney(item.charged)}</Text>
                    <Text style={styles.muted}>
                      маржа {formatMoney(item.margin)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {Number(adminSummary?.uncovered || 0) > 0 ? (
            <Text style={styles.warningText}>
              Не покрыто балансом: {formatMoney(adminSummary?.uncovered)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.surfaceMuted,
  },
  metricLabel: { color: colors.textMuted, fontSize: 11 },
  metricValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  notice: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  dangerNotice: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  warningNotice: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  successNotice: { backgroundColor: colors.successSoft, borderColor: colors.success },
  neutralNotice: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  dangerText: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  warningText: { color: colors.warning, fontSize: 12, lineHeight: 18 },
  successText: { color: colors.success, fontSize: 12, fontWeight: '700' },
  success: { color: colors.success, fontSize: 13, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
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
  adminRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  rowLabel: { flexShrink: 1, color: colors.text, fontSize: 12, fontWeight: '600' },
  rowValue: { color: colors.text, fontSize: 12, fontWeight: '700' },
  grow: { flex: 1 },
  right: { alignItems: 'flex-end' },
  adminBox: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
})
