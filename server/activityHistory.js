import createHistorySafely from './historyAudit'
import {
  buildHistoryChanges,
  getHistoryEntityLabel,
  getTaskSemanticAction,
} from './activityHistoryCore.mjs'

export { buildHistoryChanges, getHistoryEntityLabel } from './activityHistoryCore.mjs'

const OPERATION_LABELS = {
  create: 'Добавлено',
  update: 'Изменено',
  delete: 'Удалено',
  merge: 'Объединено',
}
const SOURCE_LABELS = {
  web: 'Web',
  android: 'Android',
  public_api: 'Public API',
  tilda: 'Tilda',
  google_import: 'Google Calendar',
  file_import: 'Импорт из файла',
  avito: 'Avito',
  vk: 'VK',
  telephony: 'Телефония',
}
const INTEGRATION_SOURCES = new Set([
  'public_api',
  'tilda',
  'google_import',
  'file_import',
  'avito',
  'vk',
  'telephony',
])

const normalizeOccurredAt = (value) => {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return new Date()
  const now = Date.now()
  if (
    date.getTime() > now + 5 * 60 * 1000 ||
    date.getTime() < now - 365 * 24 * 60 * 60 * 1000
  )
    return new Date()
  return date
}

const getHeader = (req, key) => req?.headers?.get?.(key) || ''

export const getHistoryRequestMeta = ({ req, context, source }) => {
  const isMobileRequest = context?.authType === 'mobile'
  const resolvedSource =
    source ||
    (isMobileRequest && getHeader(req, 'x-artistcrm-history-source')) ||
    (isMobileRequest ? 'android' : 'web')
  const user = context?.user
  const actorName = [user?.firstName, user?.secondName]
    .filter(Boolean)
    .join(' ')
    .trim()
  return {
    source: resolvedSource,
    actorType: INTEGRATION_SOURCES.has(resolvedSource)
      ? 'integration'
      : 'user',
    actorId: user?._id ? String(user._id) : '',
    actorLabel:
      actorName ||
      SOURCE_LABELS[resolvedSource] ||
      (user?._id ? 'Пользователь' : 'Интеграция'),
    occurredAt: normalizeOccurredAt(
      isMobileRequest
        ? getHeader(req, 'x-artistcrm-history-occurred-at')
        : undefined
    ),
    operationId: isMobileRequest
      ? getHeader(req, 'x-artistcrm-history-operation-id') || undefined
      : undefined,
  }
}

export const recordActivityHistory = async ({
  req,
  context,
  tenantId = context?.tenantId,
  entityType,
  entityId,
  operation,
  before = null,
  after = null,
  source,
  semanticAction,
  entityLabel,
  summary,
  batchId = '',
}) => {
  if (!tenantId || !entityType || !entityId || !operation) return null
  const changes = buildHistoryChanges({ entityType, before, after, operation })
  if (operation === 'update' && changes.length === 0) return null
  const meta = getHistoryRequestMeta({ req, context, source })
  const resolvedLabel =
    entityLabel || getHistoryEntityLabel(entityType, after || before || {})
  return createHistorySafely(
    {
      tenantId,
      entityType,
      entityId: String(entityId),
      operation,
      semanticAction: semanticAction || getTaskSemanticAction(changes, operation),
      entityLabel: resolvedLabel,
      summary:
        summary ||
        `${OPERATION_LABELS[operation] || 'Изменено'}: ${resolvedLabel}`,
      changes,
      ...meta,
      batchId,
    },
    `activity.${entityType}.${operation}`
  )
}
