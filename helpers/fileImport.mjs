export const FILE_IMPORT_EXTENSIONS = ['xlsx', 'csv', 'txt', 'docx']
export const FILE_IMPORT_MAX_BYTES = 5 * 1024 * 1024
export const FILE_IMPORT_MAX_CHARS = 80000
export const FILE_IMPORT_MAX_RECORDS = 100

export class FileImportError extends Error {
  constructor(message, code = 'FILE_IMPORT_INVALID', status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export const validateImportFile = (name, size) => {
  const extension = String(name).split('.').pop().toLowerCase()
  if (!FILE_IMPORT_EXTENSIONS.includes(extension)) {
    throw new FileImportError(
      'Поддерживаются только XLSX, CSV, TXT и DOCX. PDF и изображения не принимаются.'
    )
  }
  if (!size || size > FILE_IMPORT_MAX_BYTES) {
    throw new FileImportError('Выберите непустой файл размером до 5 МБ.')
  }
  return extension
}

export const parseImportJson = (content) => {
  try {
    return JSON.parse(
      String(content)
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '')
    )
  } catch {
    throw new FileImportError(
      'ИИ вернул некорректный результат. Повторите обработку.',
      'AI_INVALID_RESULT'
    )
  }
}

const text = (value, max = 1000) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

export const normalizeFileAnalysis = (value, lines) => {
  const validIds = new Set(lines.map((line) => line.id))
  const usedIds = new Set()
  const claimedRanges = new Map()
  if (
    !Array.isArray(value?.records) ||
    value.records.length > FILE_IMPORT_MAX_RECORDS
  ) {
    throw new FileImportError(
      'Не удалось выделить мероприятия или их больше 100. Разделите файл на части.'
    )
  }
  const records = value.records.map((record, index) => {
    const sourceIds = [
      ...new Set(Array.isArray(record.sourceIds) ? record.sourceIds : []),
    ]
    const excerpt = text(record.excerpt, FILE_IMPORT_MAX_CHARS)
    const singleLine =
      sourceIds.length === 1
        ? lines.find((line) => line.id === sourceIds[0])
        : null
    const offset =
      excerpt && singleLine ? String(singleLine.text).indexOf(excerpt) : -1
    const range = offset >= 0 ? [offset, offset + excerpt.length] : null
    if (
      !sourceIds.length ||
      sourceIds.some((id) => !validIds.has(id)) ||
      (excerpt && !range) ||
      sourceIds.some(
        (id) =>
          usedIds.has(id) &&
          (!range ||
            (claimedRanges.get(id) || []).some(
              ([start, end]) => range[0] < end && start < range[1]
            ))
      )
    ) {
      throw new FileImportError(
        'ИИ неоднозначно разделил записи. Уточните структуру файла и повторите анализ.',
        'AI_INVALID_RESULT'
      )
    }
    sourceIds.forEach((id) => {
      usedIds.add(id)
      claimedRanges.set(id, [
        ...(claimedRanges.get(id) || []),
        range || [0, Infinity],
      ])
    })
    return {
      id: String(index + 1),
      title: text(record.title, 160) || `Запись ${index + 1}`,
      sourceIds,
      ...(excerpt ? { excerpt } : {}),
    }
  })
  const questions = (Array.isArray(value.questions) ? value.questions : [])
    .slice(0, 3)
    .map((q, i) => ({
      id: `q${i + 1}`,
      question: text(q.question, 300),
      options: (Array.isArray(q.options) ? q.options : [])
        .map((v) => text(v, 160))
        .filter(Boolean)
        .slice(0, 4),
    }))
    .filter((q) => q.question)
  return {
    summary: text(value.summary, 2000),
    rules: text(value.rules, 4000),
    questions,
    examples: (Array.isArray(value.examples) ? value.examples : [])
      .slice(0, 3)
      .map((v) => text(v, 1000))
      .filter(Boolean),
    records,
    ignoredLines: lines
      .filter((line) => !usedIds.has(line.id))
      .map((line) => line.id),
  }
}

export const getRecordSource = (record, lines) => {
  if (record.excerpt)
    return `${lines.find((line) => line.id === record.sourceIds[0])?.section || ''} / ${record.sourceIds[0]}: ${record.excerpt}`
  const ids = new Set(record.sourceIds)
  return lines
    .filter((line) => ids.has(line.id))
    .map((line) => `${line.section} / ${line.id}: ${line.text}`)
    .join('\n')
}

// A conservative estimate derived from actual local billing history, scaled by text volume.
// It is not a provider tariff or a promise about provider cost.
export const estimateFileAiKopecks = (characters, averageKopecks = 100) =>
  Math.max(
    1,
    Math.ceil(
      Math.max(1, averageKopecks) * Math.max(1, characters / 3000) * 1.5
    )
  )

export const getFileImportCharge = (budget, usage) => {
  const cost = Number(usage?.cost_rub)
  if (
    usage?.cost_rub == null ||
    usage.cost_rub === '' ||
    !Number.isFinite(cost) ||
    cost < 0
  ) {
    throw new FileImportError(
      'Провайдер не сообщил стоимость. Обработка приостановлена, списание за этот запрос не выполнено.',
      'AI_COST_UNKNOWN'
    )
  }
  const markupPercent = Math.round(budget.markup * 100)
  const requested = Math.ceil(
    (Math.round(cost * 1_000_000) * Math.round(budget.markup * 100)) / 1_000_000
  )
  // Часть себестоимости может быть включена в тариф: её вместо пользователя платит платформа.
  const coveredLimitKopecks = Math.max(
    0,
    Number(budget.coveredProviderKopecks || 0)
  )
  const coveredSpentKopecks = Math.max(
    0,
    Number(budget.spentCoveredProviderKopecks || 0)
  )
  const providerCostKopecks = Math.max(0, Math.round(cost * 100))
  const coveredProviderKopecks = Math.max(
    0,
    Math.min(providerCostKopecks, coveredLimitKopecks - coveredSpentKopecks)
  )
  const covered = coveredProviderKopecks
    ? Math.max(
        1,
        Math.ceil((coveredProviderKopecks * 10_000 * markupPercent) / 1_000_000)
      )
    : 0
  const chargeableKopecks = Math.max(0, requested - covered)
  const holdKopecks = Math.max(
    0,
    Number(budget.holdKopecks ?? budget.amountKopecks ?? 0)
  )
  const spentKopecks = Math.max(0, Number(budget.spentKopecks || 0))
  const remaining = Math.max(0, holdKopecks - spentKopecks)
  return {
    charged: Math.min(chargeableKopecks, remaining),
    uncovered: Math.max(0, chargeableKopecks - remaining),
    covered,
    coveredProviderKopecks,
  }
}

export const isEventImportChecked = (event) =>
  event?.importedFromFile
    ? event.fileImportChecked === true
    : Boolean(event?.calendarImportChecked)
