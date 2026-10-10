// Пояснение к сумме ИИ, включённой в тариф: «300 ₽ ≈ 4 ч 10 мин расшифровки звонков…».
// Ставки — средние по фактическим расходам; до накопления статистики используются
// измеренные значения продакшена (см. SERVER: server/aiIncludedEstimate.js).
export const AI_INCLUDED_EXAMPLE_RATES = Object.freeze({
  transcriptionRubPerSecond: 0.02,
  voiceNoteRub: 0.2,
  eventDraftRub: 0.7,
  fileRecordRub: 1.5,
})

export const AI_INCLUDED_ESTIMATE_NOTE =
  'Оценка по средним расходам ИИ. Фактический расход зависит от длины записи и объёма текста.'

const roundNumber = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 0
  return Math.floor(number)
}

const evenNumber = (value) => {
  const number = roundNumber(value)
  if (number < 10) return number
  if (number < 100) return Math.floor(number / 5) * 5
  if (number < 1000) return Math.floor(number / 10) * 10
  if (number < 10000) return Math.floor(number / 100) * 100
  return Math.floor(number / 1000) * 1000
}

const ru = (value) => evenNumber(value).toLocaleString('ru-RU')

export const formatAiIncludedDuration = (seconds) => {
  const total = roundNumber(seconds)
  if (total < 60) return `${total} с`
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total - hours * 3600) / 60)
  if (!hours) return `${minutes} мин`
  if (minutes >= 60) return `${hours + 1} ч`
  return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`
}

// Сколько примерно вмещает включённая в тариф сумма: часы расшифровки и число операций.
export const buildAiIncludedEstimate = ({ includedRub = 0, rates = {} } = {}) => {
  const limit = Number(includedRub)
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 0
  const merged = { ...AI_INCLUDED_EXAMPLE_RATES, ...(rates || {}) }
  if (!safeLimit)
    return {
      enabled: false,
      includedRub: 0,
      transcriptionSeconds: 0,
      transcriptionHoursText: '',
      voiceNotes: 0,
      eventDrafts: 0,
      fileRecords: 0,
      lines: [],
      note: '',
    }
  const rate = (key) => {
    const value = Number(merged[key])
    return Number.isFinite(value) && value > 0 ? value : 0
  }
  const transcriptionSeconds = rate('transcriptionRubPerSecond')
    ? Math.floor(safeLimit / rate('transcriptionRubPerSecond'))
    : 0
  const voiceNotes = rate('voiceNoteRub')
    ? Math.floor(safeLimit / rate('voiceNoteRub'))
    : 0
  const eventDrafts = rate('eventDraftRub')
    ? Math.floor(safeLimit / rate('eventDraftRub'))
    : 0
  const fileRecords = rate('fileRecordRub')
    ? Math.floor(safeLimit / rate('fileRecordRub'))
    : 0
  const lines = []
  if (transcriptionSeconds >= 60)
    lines.push(`${formatAiIncludedDuration(transcriptionSeconds)} расшифровки звонков`)
  if (voiceNotes) lines.push(`${ru(voiceNotes)} голосовых заметок`)
  if (eventDrafts) lines.push(`${ru(eventDrafts)} черновиков по заметке`)
  if (fileRecords) lines.push(`${ru(fileRecords)} записей импорта из файла`)
  return {
    enabled: lines.length > 0,
    includedRub: safeLimit,
    transcriptionSeconds,
    transcriptionHoursText: formatAiIncludedDuration(transcriptionSeconds),
    voiceNotes,
    eventDrafts,
    fileRecords,
    lines,
    note: AI_INCLUDED_ESTIMATE_NOTE,
  }
}

// Раздельные строки для интерфейса: «1 ч 30 мин расшифровки звонков», «1 500 голосовых заметок»…
export const formatAiIncludedEstimateLines = (estimate) =>
  estimate?.enabled ? estimate.lines : []

export const formatAiIncludedRubles = (value) => {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return '0 ₽'
  return `${amount.toLocaleString('ru-RU')} ₽`
}

const joinRu = (items) => {
  if (!items.length) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} или ${items[items.length - 1]}`
}

// Готовая фраза для тарифной сетки: «ИИ в тарифе на 300 ₽ — это примерно 4 ч 10 мин
// расшифровки звонков, 1 200 голосовых заметок или 600 черновиков по заметке».
export const formatAiIncludedSentence = (estimate) => {
  const lines = formatAiIncludedEstimateLines(estimate)
  if (!lines.length) return ''
  return `ИИ в тарифе на ${formatAiIncludedRubles(estimate.includedRub)} — это примерно ${joinRu(lines)}`
}

// Одна строка для тарифной сетки: «Примерно 1 ч 30 мин расшифровки звонков · 1 500 голосовых заметок · …»
export const formatAiIncludedEstimateLine = (estimate) => {
  const lines = formatAiIncludedEstimateLines(estimate)
  return lines.length ? `Примерно ${lines.join(' · ')}` : ''
}
