export const FILE_QUEUE_MAX_ATTEMPTS = 8
export const FILE_QUEUE_RETRY_BASE_MS = 30 * 1000
export const FILE_QUEUE_RETRY_MAX_MS = 60 * 60 * 1000
export const FILE_QUEUE_MAX_SIZE = 5 * 1024 * 1024

export type FileQueueItem = {
  id: string
  localUri: string
  name: string
  mimeType: string
  size: number
  status: string
  attempts: number
  remoteUrl?: string
  entityType?: string
  entityId?: string
  attachmentKind?: string
}

type FileQueueProcessorDependencies = {
  now?: () => number
  markUploading: (item: FileQueueItem, updatedAt: string) => Promise<void>
  decrypt: (item: FileQueueItem) => Promise<string>
  upload: (item: FileQueueItem, temporaryUri: string) => Promise<string>
  markSynced: (
    item: FileQueueItem,
    remoteUrl: string,
    updatedAt: string
  ) => Promise<void>
  markFailed: (
    item: FileQueueItem,
    failure: {
      attempts: number
      nextRetryAt: string
      error: string
      updatedAt: string
    }
  ) => Promise<void>
  cleanup: (temporaryUri: string) => Promise<void>
}

export const getFileQueueRetryAt = (attempts: number, now: number) => {
  const nextAttempts = Math.max(0, Number(attempts || 0)) + 1
  const delay = Math.min(
    FILE_QUEUE_RETRY_MAX_MS,
    FILE_QUEUE_RETRY_BASE_MS * 2 ** nextAttempts
  )
  return {
    attempts: nextAttempts,
    nextRetryAt: new Date(now + delay).toISOString(),
  }
}

export const getFileQueueError = (reason: unknown) =>
  reason instanceof Error && reason.message
    ? reason.message
    : 'Ошибка загрузки файла'

export const validateLocalFileSize = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('Нельзя добавить пустой файл')
  }
  if (size > FILE_QUEUE_MAX_SIZE) {
    throw new Error('Файл не должен превышать 5 МБ')
  }
  return size
}

export const extractRemoteFileUrl = (data: unknown) => {
  const first = Array.isArray(data) ? data[0] : data
  if (typeof first === 'string') return first
  if (!first || typeof first !== 'object') return ''
  const value = first as Record<string, unknown>
  const document =
    value.document && typeof value.document === 'object'
      ? (value.document as Record<string, unknown>)
      : null
  return String(value.url || value.fileUrl || value.path || document?.id || '')
}

export const processFileQueueItems = async (
  items: FileQueueItem[],
  dependencies: FileQueueProcessorDependencies
) => {
  const now = dependencies.now || Date.now
  for (const item of items) {
    let temporaryUri = ''
    try {
      await dependencies.markUploading(item, new Date(now()).toISOString())
      temporaryUri = await dependencies.decrypt(item)
      const remoteUrl = await dependencies.upload(item, temporaryUri)
      if (!remoteUrl) throw new Error('Сервер не вернул URL файла')
      await dependencies.markSynced(
        item,
        remoteUrl,
        new Date(now()).toISOString()
      )
    } catch (reason) {
      const retry = getFileQueueRetryAt(item.attempts, now())
      await dependencies.markFailed(item, {
        ...retry,
        error: getFileQueueError(reason),
        updatedAt: new Date(now()).toISOString(),
      })
    } finally {
      if (temporaryUri) {
        try {
          await dependencies.cleanup(temporaryUri)
        } catch {
          // Cache cleanup is best-effort and must not change the queue status.
        }
      }
    }
  }
}
