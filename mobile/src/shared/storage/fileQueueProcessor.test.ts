import {
  extractRemoteFileUrl,
  getFileQueueRetryAt,
  processFileQueueItems,
  validateLocalFileSize,
  type FileQueueItem,
} from './fileQueueProcessor'

const item = (id: string, attempts = 0): FileQueueItem => ({
  id,
  localUri: `file:///encrypted/${id}.acrm`,
  name: `${id}.docx`,
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 100,
  status: 'pending',
  attempts,
})

describe('fileQueueProcessor', () => {
  it('ошибка потерянного файла не блокирует следующие вложения', async () => {
    const uploading: string[] = []
    const synced: string[] = []
    const failed: Array<{ id: string; error: string; attempts: number }> = []
    const cleaned: string[] = []

    await processFileQueueItems([item('missing'), item('valid')], {
      now: () => Date.parse('2026-07-15T12:00:00.000Z'),
      markUploading: async (entry) => {
        uploading.push(entry.id)
      },
      decrypt: async (entry) => {
        if (entry.id === 'missing') {
          throw new Error('Локальный зашифрованный файл не найден')
        }
        return `file:///cache/artistcrm-upload-${entry.id}.docx`
      },
      upload: async (entry) => `https://files.test/${entry.id}`,
      markSynced: async (entry) => {
        synced.push(entry.id)
      },
      markFailed: async (entry, failure) => {
        failed.push({
          id: entry.id,
          error: failure.error,
          attempts: failure.attempts,
        })
      },
      cleanup: async (uri) => {
        cleaned.push(uri)
      },
    })

    expect(uploading).toEqual(['missing', 'valid'])
    expect(failed).toEqual([
      {
        id: 'missing',
        error: 'Локальный зашифрованный файл не найден',
        attempts: 1,
      },
    ])
    expect(synced).toEqual(['valid'])
    expect(cleaned).toEqual(['file:///cache/artistcrm-upload-valid.docx'])
  })

  it('удаляет временную копию после ошибки upload и продолжает очередь', async () => {
    const synced: string[] = []
    const failed: string[] = []
    const cleaned: string[] = []

    await processFileQueueItems([item('upload-error', 2), item('next')], {
      markUploading: async () => undefined,
      decrypt: async (entry) => `file:///cache/${entry.id}`,
      upload: async (entry) => {
        if (entry.id === 'upload-error') throw new Error('Сеть недоступна')
        return `https://files.test/${entry.id}`
      },
      markSynced: async (entry) => {
        synced.push(entry.id)
      },
      markFailed: async (entry) => {
        failed.push(entry.id)
      },
      cleanup: async (uri) => {
        cleaned.push(uri)
      },
    })

    expect(failed).toEqual(['upload-error'])
    expect(synced).toEqual(['next'])
    expect(cleaned).toEqual([
      'file:///cache/upload-error',
      'file:///cache/next',
    ])
  })

  it('ограничивает backoff одним часом и читает варианты cloud-ответа', () => {
    const retry = getFileQueueRetryAt(
      20,
      Date.parse('2026-07-15T12:00:00.000Z')
    )
    expect(retry.attempts).toBe(21)
    expect(retry.nextRetryAt).toBe('2026-07-15T13:00:00.000Z')
    expect(extractRemoteFileUrl([{ fileUrl: 'https://files.test/a' }])).toBe(
      'https://files.test/a'
    )
    expect(extractRemoteFileUrl({ path: '/tenant/file' })).toBe('/tenant/file')
    expect(extractRemoteFileUrl({ document: { id: 'offline-queue-id' } })).toBe(
      'offline-queue-id'
    )
  })

  it('отклоняет пустой и слишком большой локальный файл до шифрования', () => {
    expect(() => validateLocalFileSize(0)).toThrow(
      'Нельзя добавить пустой файл'
    )
    expect(() => validateLocalFileSize(5 * 1024 * 1024 + 1)).toThrow(
      'Файл не должен превышать 5 МБ'
    )
    expect(validateLocalFileSize(5 * 1024 * 1024)).toBe(5 * 1024 * 1024)
  })

  it('не помечает файл синхронизированным без URL в ответе', async () => {
    const synced: string[] = []
    const failed: string[] = []
    const cleaned: string[] = []

    await processFileQueueItems([item('missing-url')], {
      markUploading: async () => undefined,
      decrypt: async () => 'file:///cache/missing-url',
      upload: async () => '',
      markSynced: async (entry) => {
        synced.push(entry.id)
      },
      markFailed: async (_entry, failure) => {
        failed.push(failure.error)
      },
      cleanup: async (uri) => {
        cleaned.push(uri)
      },
    })

    expect(synced).toEqual([])
    expect(failed).toEqual(['Сервер не вернул URL файла'])
    expect(cleaned).toEqual(['file:///cache/missing-url'])
  })
})
