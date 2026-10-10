import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createLoader } = require('../tests/server/loadWithAliases.cjs')

const { load } = await createLoader({
  '@server/dbConnect': { __esModule: true, default: async () => ({}) },
})

const { buildAiIncludedRates } = load('server/aiIncludedEstimate.js')

test('buildAiIncludedRates: до накопления статистики берутся измеренные ставки', () => {
  const rates = buildAiIncludedRates([])
  assert.equal(rates.transcriptionRubPerSecond, 0.02)
  assert.equal(rates.voiceNoteRub, 0.2)
  assert.equal(rates.eventDraftRub, 0.7)
  assert.equal(rates.fileRecordRub, 0, 'без статистики импорт не обещаем')
})

test('buildAiIncludedRates: секунды расшифровки считаются по фактическим расходам', () => {
  const rates = buildAiIncludedRates([
    {
      _id: 'call_transcription',
      operations: 2,
      providerMicro: 2_200_000,
      seconds: 110,
      providerMicroWithSeconds: 2_200_000,
    },
    {
      _id: 'voice_transcription',
      operations: 4,
      providerMicro: 800_000,
      seconds: 40,
      providerMicroWithSeconds: 800_000,
    },
  ])
  // (2,2 + 0,8) ₽ на 150 секунд = 0,02 ₽/с
  assert.ok(Math.abs(rates.transcriptionRubPerSecond - 0.02) < 1e-9)
  assert.equal(rates.voiceNoteRub, 0.2)
})

test('buildAiIncludedRates: средние по заметкам и черновикам требуют минимум операций', () => {
  const few = buildAiIncludedRates([
    { _id: 'event_draft', operations: 2, providerMicro: 4_000_000 },
    { _id: 'voice_transcription', operations: 1, providerMicro: 1_000_000 },
  ])
  assert.equal(few.eventDraftRub, 0.7, 'двух операций мало, ставка измеренная')
  assert.equal(few.voiceNoteRub, 0.2)

  const enough = buildAiIncludedRates([
    { _id: 'event_draft', operations: 10, providerMicro: 5_000_000 },
    { _id: 'voice_transcription', operations: 10, providerMicro: 1_000_000 },
    { _id: 'file_import', operations: 5, providerMicro: 7_500_000 },
  ])
  assert.equal(enough.eventDraftRub, 0.5)
  assert.equal(enough.voiceNoteRub, 0.1)
  assert.equal(enough.fileRecordRub, 1.5)
})

test('buildAiIncludedRates: мусорные средние зажимаются в разумные границы', () => {
  const rates = buildAiIncludedRates([
    { _id: 'event_draft', operations: 100, providerMicro: 0 },
    { _id: 'call_transcription', operations: 5, providerMicro: 500, seconds: 0 },
  ])
  assert.ok(rates.eventDraftRub >= 0.01 && rates.eventDraftRub <= 50)
  assert.ok(
    rates.transcriptionRubPerSecond >= 0.0005 &&
      rates.transcriptionRubPerSecond <= 1
  )
})
