import { Text, View } from 'react-native'
import { Button, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import { activeJob, labels, rub, shortageKopecks, type Job } from './contract'
import type { Confirmation, ImportController, ImportState } from './ImportController'
export function quoteDescription(j: Job) {
  const q = j.quote
  if (!q) return 'Смета отсутствует. Обновите расчёт.'
  const platform = q.provider === 'artistcrm'
  return `${q.phase === 'analysis' ? 'Анализ файла' : `Импорт: ${q.count} записей`}. Провайдер: ${platform ? 'ИИ Ведело' : q.provider}; модель: ${q.model}. ${platform ? `Предел списания: ${rub(q.amountKopecks / 100)}.` : 'Личный ключ: расходы оплачиваются внешнему провайдеру; предел баланса Ведело к ним не применяется.'} Ориентир оценки: ${rub(q.estimatedKopecks / 100)}. Это оценка с запасом, а не точный тариф.`
}
export function ApplyStep({ controller, state, ask }: { controller: ImportController; state: ImportState; ask: (c: Confirmation) => void }) {
  const { palette } = useTheme()
  const j = state.job
  if (!j) return null
  const active = activeJob(j), confirm = controller.confirmation(j.analysis ? 'start' : 'analyze')
  const counts = j.records.reduce((out, r) => ({ ...out, [r.status]: (out[r.status] || 0) + 1 }), {} as Record<string, number>)
  const finished = j.records.filter((r) => !['pending', 'processing'].includes(r.status)).length
  return <Surface>
    <SectionTitle>{labels[j.status]}</SectionTitle>
    {active ? <>
      <Notice message="Прогресс хранится на сервере. Чтение активного задания может продолжить уже согласованную обработку; новая платная операция не запускается. После возвращения откройте сохранённый импорт." />
      <View accessibilityRole="progressbar" accessibilityLabel="Обработано записей" accessibilityValue={{ min: 0, max: j.records.length || 1, now: finished, text: `${finished} из ${j.records.length}` }}><Text style={{ color: palette.text }}>Обработано: {finished} из {j.records.length}</Text></View>
      <Button title="Остановить после текущего запроса" variant="secondary" disabled={state.busy || state.needsRead || state.stopRequested} onPress={() => { const c = controller.confirmation('stop'); if (c) ask(c) }} />
    </> : null}
    {Object.entries(counts).map(([status, count]) => <Text key={status} style={{ color: palette.text }}>{labels[status as keyof typeof labels]}: {count}</Text>)}
    {j.status === 'completed' ? <Notice tone="warning" message="Сервер завершил обработку. Проверьте созданные черновики, пропущенные и требующие внимания записи. Успешное создание не означает, что импорт проверен." /> : null}
    <Text style={{ color: palette.cardMuted }}>Списано с баланса Ведело — анализ: {rub(j.analysisCostRub)} · Всего с баланса: {rub(j.actualCostRub)} · Остаток резерва: {rub(j.reservedRub)}</Text>
    {active && j.quote && j.quote.provider !== 'artistcrm' ? <Notice tone="warning" message="Расходы личного ключа учитывает внешний провайдер. Суммы баланса Ведело не показывают его фактическую стоимость." /> : null}
    {j.quote && !active ? <>
      <Notice message={quoteDescription(j)} />
      <Text style={{ color: palette.text }}>Доступный баланс: {rub(j.balanceRub)}</Text>
      {shortageKopecks(j) > 0 ? <Notice tone="warning" message={`Не хватает ${rub(shortageKopecks(j) / 100)}. Ответы сохраняются; после пополнения обновите баланс и расчёт.`} /> : null}
      {state.requiresQuote || state.dirty ? <Notice tone="warning" message="Для нового запуска требуется новый расчёт. Прежнее подтверждение больше не действует." /> : null}
      {Date.parse(j.expiresAt) <= Date.now() ? <Notice tone="warning" message="Срок хранения задания истёк. Загрузите файл заново." /> : null}
      <Button title={j.analysis ? 'Подтвердить смету и начать импорт' : 'Подтвердить смету и анализ'} disabled={!confirm} onPress={() => { if (confirm) ask(confirm) }} />
      {!j.analysis ? <Button title="Обновить смету анализа" variant="secondary" disabled={state.busy || state.needsRead || state.denied} onPress={controller.refreshQuote} /> : null}
    </> : null}
    {j.refundPending ? <><Notice tone="warning" message={`Возврат остатка ещё не завершён: ${rub(j.reservedRub)}. Возврат не удаляет задание.`} /><Button title="Вернуть остаток резерва" variant="secondary" disabled={state.busy || state.needsRead || active} onPress={() => { const c = controller.confirmation('release'); if (c) ask(c) }} /></> : null}
    {state.sync === 'pending' ? <Notice message="Синхронизация созданных данных…" /> : state.sync === 'failed' ? <><Notice tone="warning" message="Состояние сервера прочитано, но локальная синхронизация не выполнена. Повторите только синхронизацию." /><Button title="Повторить синхронизацию" variant="secondary" disabled={state.busy} onPress={controller.retrySync} /></> : state.sync === 'done' ? <Notice tone="neutral" message="Локальная синхронизация выполнена. Созданные черновики требуют проверки пользователем." /> : null}
  </Surface>
}
