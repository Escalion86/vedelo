import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AI_INCLUDED_ESTIMATE_NOTE,
  buildAiIncludedEstimate,
  formatAiIncludedDuration,
  formatAiIncludedEstimateLine,
  formatAiIncludedEstimateLines,
  formatAiIncludedRubles,
  formatAiIncludedSentence,
} from './aiIncludedEstimate.mjs'

const lightRates = {
  transcriptionRubPerSecond: 0.02,
  voiceNoteRub: 0.25,
  eventDraftRub: 0.5,
  fileRecordRub: 1,
}

// В ru-RU разделитель разрядов — неразрывный пробел; приводим к обычному для читаемости сравнений.
const plain = (value) =>
  Array.isArray(value)
    ? value.map((item) => plain(item))
    : String(value).replace(/\u00A0/g, ' ')

test('buildAiIncludedEstimate: без лимита пояснений нет', () => {
  const estimate = buildAiIncludedEstimate({})
  assert.equal(estimate.enabled, false)
  assert.deepEqual(estimate.lines, [])
  assert.equal(formatAiIncludedEstimateLine(estimate), '')
  assert.equal(formatAiIncludedEstimateLines(estimate).length, 0)
  assert.equal(buildAiIncludedEstimate({ includedRub: -100 }).enabled, false)
})

test('buildAiIncludedEstimate: считает часы расшифровки и операции по ставкам', () => {
  const estimate = buildAiIncludedEstimate({
    includedRub: 300,
    rates: lightRates,
  })
  assert.equal(estimate.enabled, true)
  assert.equal(estimate.transcriptionSeconds, 15000)
  assert.equal(estimate.transcriptionHoursText, '4 ч 10 мин')
  assert.equal(estimate.voiceNotes, 1200)
  assert.equal(estimate.eventDrafts, 600)
  assert.equal(estimate.fileRecords, 300)
  assert.deepEqual(plain(estimate.lines), [
    '4 ч 10 мин расшифровки звонков',
    '1 200 голосовых заметок',
    '600 черновиков по заметке',
    '300 записей импорта из файла',
  ])
  assert.equal(estimate.note, AI_INCLUDED_ESTIMATE_NOTE)
})

test('formatAiIncludedEstimateLine: одна строка для тарифной сетки', () => {
  const estimate = buildAiIncludedEstimate({ includedRub: 300, rates: lightRates })
  assert.equal(
    plain(formatAiIncludedEstimateLine(estimate)),
    'Примерно 4 ч 10 мин расшифровки звонков · 1 200 голосовых заметок · 600 черновиков по заметке · 300 записей импорта из файла'
  )
})

test('buildAiIncludedEstimate: короткий лимит не обещает часы расшифровки', () => {
  const estimate = buildAiIncludedEstimate({
    includedRub: 1,
    rates: lightRates,
  })
  assert.equal(estimate.transcriptionSeconds, 50)
  assert.equal(estimate.transcriptionHoursText, '50 с')
  assert.deepEqual(estimate.lines, [
    '4 голосовых заметок',
    '2 черновиков по заметке',
    '1 записей импорта из файла',
  ])
})

test('buildAiIncludedEstimate: нулевые или нечисловые ставки не ломают расчёт', () => {
  const estimate = buildAiIncludedEstimate({
    includedRub: 300,
    rates: {
      transcriptionRubPerSecond: 0,
      voiceNoteRub: 'abc',
      eventDraftRub: 0.5,
      fileRecordRub: null,
    },
  })
  assert.equal(estimate.transcriptionSeconds, 0)
  assert.equal(estimate.voiceNotes, 0)
  assert.equal(estimate.eventDrafts, 600)
  assert.equal(estimate.fileRecords, 0)
  assert.deepEqual(estimate.lines, ['600 черновиков по заметке'])
})

test('formatAiIncludedDuration: часы, минуты и секунды', () => {
  assert.equal(formatAiIncludedDuration(45), '45 с')
  assert.equal(formatAiIncludedDuration(90), '2 мин')
  assert.equal(formatAiIncludedDuration(3600), '1 ч')
  assert.equal(formatAiIncludedDuration(5400), '1 ч 30 мин')
  assert.equal(formatAiIncludedDuration(0), '0 с')
})

test('formatAiIncludedSentence: фраза для сноски в тарифной сетке', () => {
  const estimate = buildAiIncludedEstimate({ includedRub: 300, rates: lightRates })
  assert.equal(
    plain(formatAiIncludedSentence(estimate)),
    'ИИ в тарифе на 300 ₽ — это примерно 4 ч 10 мин расшифровки звонков, 1 200 голосовых заметок, 600 черновиков по заметке или 300 записей импорта из файла'
  )
  assert.equal(formatAiIncludedSentence(buildAiIncludedEstimate({})), '')
  assert.equal(formatAiIncludedRubles(300), '300 ₽')
  assert.equal(plain(formatAiIncludedRubles(1500)), '1 500 ₽')
  assert.equal(formatAiIncludedRubles(0), '0 ₽')
})
