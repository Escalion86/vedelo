// Разбор ответа cloud.escalion.ru: превращает ответ загрузки в абсолютный
// https-адрес файла так, чтобы клиент мог сразу вставить его в текст или медиа.
export const ESCALIONCLOUD_ORIGIN = 'https://cloud.escalion.ru'

const collectUploadCandidates = (value) => {
  if (!value) return []
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap(collectUploadCandidates)
  if (typeof value !== 'object') return []

  return [
    value.url,
    value.secure_url,
    value.fileUrl,
    value.href,
    value.src,
    value.location,
    value.path,
    value.filePath,
    value.data,
    value.files,
    value.urls,
  ].flatMap(collectUploadCandidates)
}

const normalizeUploadCandidate = (value) => {
  const candidate = String(value ?? '').trim()
  if (!candidate) return ''
  if (/^https:\/\/cloud\.escalion\.ru(?:\/|$)/i.test(candidate)) {
    return candidate
  }
  if (candidate.startsWith('/uploads/')) {
    return `${ESCALIONCLOUD_ORIGIN}${candidate}`
  }
  if (candidate.startsWith('uploads/')) {
    return `${ESCALIONCLOUD_ORIGIN}/${candidate}`
  }
  if (
    /^(?:artistcrm|vedelo|news|proposal-templates|proposals)\//i.test(candidate)
  ) {
    return `${ESCALIONCLOUD_ORIGIN}/uploads/${candidate.replace(/^\/+/, '')}`
  }
  return ''
}

export const resolveUploadedFileUrl = (
  uploadResult,
  { directory = 'temp', project = 'artistcrm' } = {}
) => {
  const directUrl = collectUploadCandidates(uploadResult)
    .map(normalizeUploadCandidate)
    .find(Boolean)
  if (directUrl) return directUrl.replaceAll(' ', '%20')

  const first = Array.isArray(uploadResult)
    ? uploadResult[0]
    : Array.isArray(uploadResult?.data)
      ? uploadResult.data[0]
      : uploadResult?.data || uploadResult
  const stringValue = typeof first === 'string' ? first.trim() : ''
  const fileName = String(
    first?.fileName ||
      first?.filename ||
      first?.name ||
      first?.originalName ||
      stringValue
  ).trim()
  if (!fileName) return ''

  const safeDirectory = String(directory || 'temp').replace(/^\/+|\/+$/g, '')
  const safeProject = String(project || 'artistcrm').replace(/^\/+|\/+$/g, '')
  const relativePath = fileName.includes('/')
    ? fileName.replace(/^\/+/, '')
    : `${safeProject}/${safeDirectory}/${fileName}`
  return `${ESCALIONCLOUD_ORIGIN}/uploads/${relativePath}`.replaceAll(
    ' ',
    '%20'
  )
}
