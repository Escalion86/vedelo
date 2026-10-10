import AiUsage from '@models/AiUsage'
import dbConnect from '@server/dbConnect'
import {
  buildAiIncludedEstimate,
  AI_INCLUDED_EXAMPLE_RATES,
} from '@helpers/aiIncludedEstimate.mjs'

const CACHE_TTL_MS = 10 * 60 * 1000
const MIN_OPERATIONS = 3
const TRANSCRIPTION_FEATURES = ['call_transcription', 'voice_transcription']

let cache = { at: 0, rates: null }

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const toRubles = (microrubles) => Number(microrubles || 0) / 1_000_000

// Измеренные средние продакшена: до накопления статистики используются они.
const FALLBACK_RATES = Object.freeze({
  transcriptionRubPerSecond: AI_INCLUDED_EXAMPLE_RATES.transcriptionRubPerSecond,
  voiceNoteRub: AI_INCLUDED_EXAMPLE_RATES.voiceNoteRub,
  eventDraftRub: AI_INCLUDED_EXAMPLE_RATES.eventDraftRub,
  fileRecordRub: 0,
})

export const buildAiIncludedRates = (rows = []) => {
  const byFeature = new Map(rows.map((row) => [row._id, row]))
  const rates = { ...FALLBACK_RATES }

  const transcriptionRows = TRANSCRIPTION_FEATURES.map((feature) =>
    byFeature.get(feature)
  ).filter(Boolean)
  const seconds = transcriptionRows.reduce(
    (sum, row) => sum + Number(row.seconds || 0),
    0
  )
  const transcriptionMicro = transcriptionRows.reduce(
    (sum, row) => sum + Number(row.providerMicroWithSeconds || 0),
    0
  )
  if (seconds > 0 && transcriptionMicro > 0)
    rates.transcriptionRubPerSecond = clamp(
      toRubles(transcriptionMicro) / seconds,
      0.0005,
      1
    )

  const voiceRow = byFeature.get('voice_transcription')
  if (voiceRow?.operations >= MIN_OPERATIONS)
    rates.voiceNoteRub = clamp(
      toRubles(voiceRow.providerMicro) / Number(voiceRow.operations),
      0.01,
      50
    )

  const draftRow = byFeature.get('event_draft')
  if (draftRow?.operations >= MIN_OPERATIONS)
    rates.eventDraftRub = clamp(
      toRubles(draftRow.providerMicro) / Number(draftRow.operations),
      0.01,
      50
    )

  const fileRows = ['file_import', 'file_analysis']
    .map((feature) => byFeature.get(feature))
    .filter((row) => row?.operations >= MIN_OPERATIONS)
  if (fileRows.length) {
    const operations = fileRows.reduce(
      (sum, row) => sum + Number(row.operations || 0),
      0
    )
    const micro = fileRows.reduce(
      (sum, row) => sum + Number(row.providerMicro || 0),
      0
    )
    if (operations > 0 && micro > 0)
      rates.fileRecordRub = clamp(toRubles(micro) / operations, 0.01, 100)
  }

  return rates
}

export const getAiIncludedExampleRates = async ({ now = Date.now() } = {}) => {
  await dbConnect()
  if (cache.rates && now - cache.at < CACHE_TTL_MS) return cache.rates
  const rows = await AiUsage.aggregate([
    { $match: { source: 'platform', status: 'succeeded' } },
    {
      $group: {
        _id: '$feature',
        operations: { $sum: 1 },
        providerMicro: { $sum: '$providerCostMicrorubles' },
        seconds: { $sum: '$audioSeconds' },
        providerMicroWithSeconds: {
          $sum: {
            $cond: [
              { $gt: ['$audioSeconds', 0] },
              '$providerCostMicrorubles',
              0,
            ],
          },
        },
      },
    },
  ])
  const rates = buildAiIncludedRates(rows)
  cache = { at: now, rates }
  return rates
}

export const resetAiIncludedExampleRatesCache = () => {
  cache = { at: 0, rates: null }
}

// Добавляет к каждому тарифу пояснение «300 ₽ ≈ 4 ч 10 мин расшифровки звонков…».
export const withAiIncludedEstimates = async (tariffs = []) => {
  if (!Array.isArray(tariffs) || !tariffs.length) return tariffs
  const needsEstimate = tariffs.some(
    (tariff) => Number(tariff?.aiIncludedRubPerMonth) > 0
  )
  if (!needsEstimate)
    return tariffs.map((tariff) => ({ ...tariff, aiIncludedEstimate: null }))
  let rates = null
  try {
    rates = await getAiIncludedExampleRates()
  } catch (error) {
    console.error('[ai-estimate] не удалось посчитать средние расходы', {
      message: error?.message,
    })
  }
  return tariffs.map((tariff) => ({
    ...tariff,
    aiIncludedEstimate: buildAiIncludedEstimate({
      includedRub: tariff?.aiIncludedRubPerMonth,
      rates: rates || {},
    }),
  }))
}
