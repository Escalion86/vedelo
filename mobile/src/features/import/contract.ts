export const jobStatuses = ['uploaded', 'analyzing', 'review', 'quoted', 'importing', 'paused', 'completed', 'failed'] as const
export const recordStatuses = ['pending', 'processing', 'created', 'duplicate', 'possible_duplicate', 'needs_attention', 'error'] as const
export type JobStatus = typeof jobStatuses[number]
export type RecordStatus = typeof recordStatuses[number]
export type Quote = { id: string; phase: 'analysis' | 'import'; count: number; amountKopecks: number; estimatedKopecks: number; markup: number; provider: string; model: string; createdAt: string }
export type ImportRecord = { id: string; title: string; source: string; status: RecordStatus; error: string; eventId?: string; warnings: string[] }
export type Analysis = { summary: string; rules: string; examples: string[]; questions: { id: string; question: string; options: string[] }[] }
export type Job = { id: string; fileName: string; status: JobStatus; warnings: string[]; note: string; analysis: Analysis | null; ignored: { id: string; section: string; text: string }[]; records: ImportRecord[]; selectedIds: string[]; answers: Record<string, string>; quote: Quote | null; error: string; balanceRub: number; actualCostRub: number; analysisCostRub: number; reservedRub: number; refundPending: boolean; expiresAt: string }
export type JobSummary = Pick<Job, 'id' | 'fileName' | 'status'> & { createdAt: string }
export type Draft = { answers: Record<string, string>; selectedIds: string[] }
export const labels: Record<JobStatus | RecordStatus, string> = {
  uploaded: 'Файл загружен', analyzing: 'Анализ', review: 'Проверка структуры', quoted: 'Смета готова', importing: 'Импорт', paused: 'Приостановлен', completed: 'Сервер завершил обработку', failed: 'Ошибка анализа',
  pending: 'Ожидает импорта', processing: 'Обрабатывается', created: 'Создано', duplicate: 'Уже импортировано', possible_duplicate: 'Возможный дубль — пропущено', needs_attention: 'Нужно уточнение', error: 'Ошибка записи',
}
export class InvalidImportResponse extends Error { constructor() { super('Некорректный ответ импорта') } }
export class ImportFailure extends Error { constructor(public code: string, public status = 0) { super(code) } }
const invalid = (): never => { throw new InvalidImportResponse() }
export const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : invalid()
const string = (v: unknown) => typeof v === 'string' ? v : invalid()
const identifier = (v: unknown) => { const s = string(v); return s && s === s.trim() && !['__proto__', 'constructor', 'prototype'].includes(s) ? s : invalid() }
export const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-fA-F0-9]{24}$/.test(v)
const id = (v: unknown) => validId(v) ? v : invalid()
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : invalid()
const strings = (v: unknown) => array(v).map(string)
const unique = (v: string[]) => new Set(v).size === v.length ? v : invalid()
const number = (v: unknown, integer = false, signed = false) => typeof v === 'number' && Number.isFinite(v) && (signed || v >= 0) && (!integer || Number.isSafeInteger(v)) ? v : invalid()
const date = (v: unknown) => { const s = string(v); return s && Number.isFinite(Date.parse(s)) ? s : invalid() }
const status = (v: unknown): JobStatus => jobStatuses.includes(v as JobStatus) ? v as JobStatus : invalid()
export function envelope(v: unknown): unknown {
  const r = object(v)
  if (r.success !== true) { if (r.success === false) throw new ImportFailure(typeof r.code === 'string' ? r.code : 'FILE_IMPORT_FAILED'); invalid() }
  if (!('data' in r)) invalid()
  return r.data
}
function readQuote(v: unknown): Quote | null {
  if (v == null) return null
  const q = object(v), quoteId = string(q.id)
  if (!/^[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}$/.test(quoteId)) invalid()
  if (q.phase !== 'analysis' && q.phase !== 'import') invalid()
  return { id: quoteId, phase: q.phase as Quote['phase'], count: number(q.count, true), amountKopecks: number(q.amountKopecks, true), estimatedKopecks: number(q.estimatedKopecks, true), markup: number(q.markup), provider: identifier(q.provider), model: identifier(q.model), createdAt: date(q.createdAt) }
}
export function readJob(response: unknown, expectedId?: string): Job {
  const v = object(envelope(response)), jobId = id(v.id)
  if (expectedId !== undefined && jobId !== expectedId) invalid()
  const records = array(v.records).map((raw): ImportRecord => {
    const r = object(raw)
    if (!recordStatuses.includes(r.status as RecordStatus)) invalid()
    return { id: identifier(r.id), title: string(r.title), source: string(r.source), status: r.status as RecordStatus, error: string(r.error), warnings: strings(r.warnings), ...(r.eventId == null ? {} : { eventId: id(r.eventId) }) }
  })
  unique(records.map((r) => r.id)); if (records.length > 100) invalid()
  const selectedIds = unique(strings(v.selectedIds).map(identifier))
  if (selectedIds.some((s) => !records.some((r) => r.id === s))) invalid()
  const answers = Object.fromEntries(Object.entries(object(v.answers)).map(([k, val]) => [identifier(k), string(val)]))
  let analysis: Analysis | null = null
  if (v.analysis != null) {
    const a = object(v.analysis)
    const questions = array(a.questions).map((raw) => { const q = object(raw); return { id: identifier(q.id), question: string(q.question), options: strings(q.options) } })
    unique(questions.map((q) => q.id)); if (questions.length > 3) invalid()
    analysis = { summary: string(a.summary), rules: string(a.rules), examples: strings(a.examples), questions }
  }
  const jobStatus = status(v.status)
  if (['review', 'quoted', 'importing', 'completed', 'paused'].includes(jobStatus) && !analysis) invalid()
  if (typeof v.refundPending !== 'boolean') invalid()
  return { id: jobId, fileName: string(v.fileName), status: jobStatus, warnings: strings(v.warnings), note: string(v.note), analysis,
    ignored: array(v.ignored).map((raw) => { const l = object(raw); return { id: identifier(l.id), section: string(l.section), text: string(l.text) } }),
    records, selectedIds, answers, quote: readQuote(v.quote), error: string(v.error), balanceRub: number(v.balanceRub, false, true), actualCostRub: number(v.actualCostRub), analysisCostRub: number(v.analysisCostRub), reservedRub: number(v.reservedRub), refundPending: v.refundPending as boolean, expiresAt: date(v.expiresAt) }
}
export function readJobs(response: unknown): JobSummary[] {
  const rows = array(envelope(response)).map((raw) => { const v = object(raw); return { id: id(v.id), fileName: string(v.fileName), status: status(v.status), createdAt: date(v.createdAt) } })
  unique(rows.map((r) => r.id)); if (rows.length > 20) invalid()
  return rows
}
export const activeJob = (job: Job | null) => Boolean(job && ['analyzing', 'importing'].includes(job.status))
export const eligible = (r: ImportRecord) => !['created', 'duplicate'].includes(r.status)
export const initialDraft = (j: Job): Draft => ({ answers: { ...j.answers }, selectedIds: j.selectedIds.filter((id) => j.records.some((r) => r.id === id && eligible(r))) })
export const draftMatches = (a: Draft, b: Draft) => JSON.stringify(Object.entries(a.answers).filter(([, v]) => v !== '').sort()) === JSON.stringify(Object.entries(b.answers).filter(([, v]) => v !== '').sort()) && JSON.stringify([...a.selectedIds].sort()) === JSON.stringify([...b.selectedIds].sort())
// Explicit canonicalization of user answers mirrors quote's documented contract;
// server and record identifiers are never repaired or normalized.
export function quoteDraft(job: Job, draft: Draft): Draft {
  const answers = Object.fromEntries((job.analysis?.questions || []).map((q) => [q.id, (draft.answers[q.id] || '').trim().slice(0, 1000)]))
  answers.comment = (draft.answers.comment || '').trim().slice(0, 2000)
  const selectedIds = job.records.filter((r) => eligible(r) && draft.selectedIds.includes(r.id)).map((r) => r.id)
  if (!job.analysis || !selectedIds.length || Object.values(answers).some((v, i) => i < job.analysis!.questions.length && !v)) throw new ImportFailure('ANSWERS_REQUIRED')
  return { answers, selectedIds }
}
export const rub = (value: number) => `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
export const shortageKopecks = (j: Job) => j.quote?.provider === 'artistcrm' ? Math.max(0, (j.quote?.amountKopecks || 0) - Math.round(j.balanceRub * 100)) : 0
export function safeImportError(reason: unknown): string {
  const r = reason && typeof reason === 'object' ? reason as { code?: string; status?: number } : {}
  if (r.code === 'FILE_INVALID') return 'Выберите один непустой XLSX, CSV, TXT или DOCX до 5 МБ. Размер должен быть известен; формат окончательно проверяет сервер.'
  if (r.status === 403 || r.code === 'AI_ACCESS_REQUIRED') return 'Импорт недоступен: нужен действующий тариф с ИИ. Личный ключ не заменяет тариф.'
  if (r.status === 401) return 'Сессия завершена. Войдите снова.'
  if (r.status === 404 || r.code === 'NOT_FOUND') return 'Импорт или карточка недоступны. Они могли быть удалены.'
  if (r.code === 'IMPORT_EXPIRED') return 'Срок хранения истёк. Загрузите файл заново.'
  if (r.code === 'QUOTE_CHANGED') return 'Смета изменилась. Прочитайте состояние и рассчитайте стоимость заново.'
  if (r.code === 'AI_UNAVAILABLE') return 'Настройте доступного ИИ-провайдера в интеграциях.'
  if (r.status === 402 || r.code === 'AI_BALANCE_INSUFFICIENT' || r.code === 'AI_INSUFFICIENT_BALANCE' || r.code === 'INSUFFICIENT_BALANCE') return 'Недостаточно средств. Обновите баланс и смету.'
  if (r.code === 'ANSWERS_REQUIRED') return 'Ответьте на все уточнения (можно «Не знаю») и выберите хотя бы одну запись.'
  if (r.status === 400) return 'Сервер отклонил файл или запрос. Проверьте формат, ограничения файла, уточнения и срок хранения задания; повторите чтение состояния.'
  if (r.status === 409) return 'Состояние, смета или настройки ИИ изменились. Обновите задание и расчёт; проверьте баланс и интеграции.'
  if (reason instanceof InvalidImportResponse) return 'Сервер вернул несовместимое состояние. Автообновление остановлено; повторите чтение.'
  return 'Не удалось выполнить запрос. Проверьте сеть и повторите чтение состояния.'
}

// Only documented server-authored messages are displayed verbatim. Provider
// errors and arbitrary strings never become an alert or a success message.
const knownProblems = new Set([
  'Дата или год не определены. Уточните их в общем пояснении и рассчитайте оставшиеся записи заново.',
  'Достигнут согласованный предел расходов. Рассчитайте стоимость оставшихся записей.',
  'Провайдер не сообщил стоимость. Обработка приостановлена, списание за этот запрос не выполнено.',
  'Достигнут лимит мероприятий тарифа. Прогресс сохранён.',
  'Импорт остановлен. Выполненные записи сохранены.',
  'Анализ остановлен.',
  'Срок хранения файла истёк. Импорт остановлен, резерв возвращается.',
  'Настройки ИИ изменены. Рассчитайте стоимость повторно.',
  'Этот запрос уже выполнялся. Повтор доступен отдельным запуском с новой сметой.',
  'Резерв закрыт. Рассчитайте стоимость повторно.',
  'Не удалось освободить резерв. Повторите запрос.',
  'Не удалось сохранить результат запроса.',
  'ИИ-провайдер недоступен.',
  'Не удалось выполнить обработку. Сохранённый прогресс доступен для продолжения.',
])
export const safeJobProblem = (error: string, fallback: string) => knownProblems.has(error) ? error : fallback
