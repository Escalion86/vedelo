const ESCALIONCLOUD_API_URL =
  process.env.ESCALIONCLOUD_API_URL || 'https://cloud.escalion.ru/api'
const ESCALIONCLOUD_ORIGIN = 'https://cloud.escalion.ru'

export class EscalionCloudError extends Error {
  constructor(code, message, status = 502) {
    super(message || code)
    this.name = 'EscalionCloudError'
    this.code = code
    this.status = status
  }
}

const parseResponse = async (response) => {
  const contentType = response.headers.get('content-type') || ''
  return contentType.includes('application/json')
    ? response.json()
    : response.text()
}

const normalizeUploadRows = (payload) => {
  const value = Array.isArray(payload) ? payload : (payload?.data ?? payload)
  return Array.isArray(value) ? value : value ? [value] : []
}

const requestPrivateFileApi = async (path, options) => {
  const password = process.env.ESCALIONCLOUD_PASSWORD
  if (!password) {
    throw new EscalionCloudError(
      'STORAGE_UNAVAILABLE',
      'Файловое хранилище не настроено',
      503
    )
  }
  const response = await fetch(`${ESCALIONCLOUD_API_URL}${path}`, {
    ...options,
    headers: {
      'x-api-password': password,
      ...(options?.headers || {}),
    },
    cache: 'no-store',
  })
  const payload = await parseResponse(response)
  if (!response.ok || payload?.success === false) {
    const error = payload?.error || payload?.data?.error || {}
    throw new EscalionCloudError(
      error.code || 'STORAGE_UNAVAILABLE',
      error.message || 'Файловое хранилище временно недоступно',
      response.status >= 400 ? response.status : 502
    )
  }
  return payload?.data ?? payload
}

export const normalizeEscalionCloudUrl = (value) => {
  const candidate = String(value || '').trim()
  if (!candidate) return ''
  try {
    const url = new URL(candidate, `${ESCALIONCLOUD_ORIGIN}/`)
    if (url.protocol !== 'https:' || url.hostname !== 'cloud.escalion.ru') {
      return ''
    }
    return url.toString()
  } catch {
    return ''
  }
}

export const uploadFilesToEscalionCloud = async ({ files, directory }) => {
  const password = process.env.ESCALIONCLOUD_PASSWORD
  if (!password) throw new Error('ESCALIONCLOUD_NOT_CONFIGURED')
  if (!Array.isArray(files) || files.length === 0) return []

  const formData = new FormData()
  files.forEach((file) => formData.append('files', file, file.name))
  formData.append('directory', directory)

  const response = await fetch(ESCALIONCLOUD_API_URL, {
    method: 'POST',
    headers: { 'x-api-password': password },
    body: formData,
    cache: 'no-store',
  })
  const payload = await parseResponse(response)
  if (!response.ok) {
    const message = payload?.reason || payload?.message || payload
    throw new Error(
      typeof message === 'string' ? message : 'ESCALIONCLOUD_UPLOAD_FAILED'
    )
  }

  return normalizeUploadRows(payload)
}

export const extractEscalionCloudUploadUrl = (row) =>
  normalizeEscalionCloudUrl(
    typeof row === 'string' ? row : row?.url || row?.fileUrl || row?.path
  )

export const uploadPrivateFileToEscalionCloud = async ({
  file,
  storageKey,
  uploadId,
}) => {
  const formData = new FormData()
  formData.append('file', file, file.name)
  formData.append('storageKey', storageKey)
  formData.append('uploadId', uploadId)
  return requestPrivateFileApi('/private-files/upload', {
    method: 'POST',
    body: formData,
  })
}

export const createPrivateFileAccessUrl = async ({
  storageKey,
  downloadName,
  disposition = 'attachment',
}) => {
  const data = await requestPrivateFileApi('/private-files/access-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ storageKey, downloadName, disposition }),
  })
  const url = normalizeEscalionCloudUrl(data?.url)
  if (!url) {
    throw new EscalionCloudError(
      'STORAGE_UNAVAILABLE',
      'Хранилище вернуло небезопасную ссылку',
      502
    )
  }
  return { ...data, url }
}

export const deletePrivateFileFromEscalionCloud = ({ storageKey, deleteId }) =>
  requestPrivateFileApi('/private-files', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ storageKey, deleteId }),
  })
