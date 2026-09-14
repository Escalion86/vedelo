import type { OutboxMethod, OutboxStatus } from '../storage/outbox'
import { getConflictEntityLabel } from './conflictPresentation'

export type QueueStatusPresentation = {
  label: string
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'blue'
}

const methodLabels: Record<OutboxMethod, string> = {
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
}

const outboxStatus: Record<OutboxStatus, QueueStatusPresentation> = {
  pending: { label: 'Ожидает отправки', tone: 'warning' },
  syncing: { label: 'Синхронизация', tone: 'blue' },
  failed: { label: 'Ошибка', tone: 'danger' },
  conflict: { label: 'Конфликт', tone: 'danger' },
  synced: { label: 'Синхронизировано', tone: 'success' },
}

const fileStatus: Record<string, QueueStatusPresentation> = {
  pending: { label: 'Ожидает отправки', tone: 'warning' },
  uploading: { label: 'Отправляется', tone: 'blue' },
  failed: { label: 'Ошибка файла', tone: 'danger' },
  synced: { label: 'Синхронизирован', tone: 'success' },
}

export const getOutboxMethodLabel = (method: OutboxMethod) =>
  methodLabels[method]

export const getOutboxStatusPresentation = (status: OutboxStatus) =>
  outboxStatus[status]

export const getFileStatusPresentation = (
  status: string
): QueueStatusPresentation =>
  fileStatus[status] || { label: 'Ожидает отправки', tone: 'warning' }

export const getQueueEntityTitle = (
  entityType: string,
  entityId: string | undefined,
  labelsByEntity: Record<string, string>
) =>
  (entityId && labelsByEntity[`${entityType}:${entityId}`]) ||
  getConflictEntityLabel(entityType)

export const getSafeSyncErrorMessage = (
  error?: string | null,
  kind: 'operation' | 'file' = 'operation'
) => {
  const value = String(error || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!value) return ''
  if (/зашифрованн.*файл.*не найден/i.test(value)) {
    return 'Локальный файл не найден. Добавьте вложение повторно.'
  }
  if (/network|fetch|internet|offline|соединен|сеть недоступ/i.test(value)) {
    return 'Нет соединения. Приложение повторит отправку после восстановления сети.'
  }
  if (/401|unauthor|jwt|сесси.*(истек|отозв)/i.test(value)) {
    return 'Сессия больше недействительна. Войдите в Ведело повторно.'
  }
  if (/429|слишком много|лимит запрос/i.test(value)) {
    return 'Сервер временно ограничил запросы. Повторите позже.'
  }
  if (/тариф|функци.*недоступ/i.test(value)) {
    return 'Функция недоступна в текущей конфигурации Ведело.'
  }
  if (/прерван/i.test(value)) {
    return 'Предыдущая отправка была прервана. Можно повторить сейчас.'
  }
  return kind === 'file'
    ? 'Не удалось отправить файл. Повторите отправку.'
    : 'Не удалось синхронизировать изменение. Повторите отправку.'
}
