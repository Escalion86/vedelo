import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

import tariffsSchema from './tariffsSchema.js'
import { DEFAULT_TARIFF } from '../helpers/constants.js'

const TariffsSchemaTest =
  mongoose.models.TariffsSchemaTest ||
  mongoose.model(
    'TariffsSchemaTest',
    new mongoose.Schema(tariffsSchema, { timestamps: true })
  )

test('tariffsSchema: лимит включённого ИИ по умолчанию равен нулю', async () => {
  const doc = new TariffsSchemaTest({ title: 'Профи' })
  await doc.validate()
  assert.equal(doc.aiIncludedRubPerMonth, 0)
})

test('tariffsSchema: лимит включённого ИИ сохраняется числом', async () => {
  const doc = new TariffsSchemaTest({
    title: 'Профи',
    allowAi: true,
    aiIncludedRubPerMonth: 500,
  })
  await doc.validate()
  assert.equal(doc.aiIncludedRubPerMonth, 500)
})

test('tariffsSchema: отрицательный лимит включённого ИИ не проходит валидацию', async () => {
  const doc = new TariffsSchemaTest({
    title: 'Профи',
    allowAi: true,
    aiIncludedRubPerMonth: -1,
  })
  await assert.rejects(doc.validate())
})

test('DEFAULT_TARIFF: лимит включённого ИИ выключен по умолчанию', () => {
  assert.equal(DEFAULT_TARIFF.aiIncludedRubPerMonth, 0)
  assert.equal(DEFAULT_TARIFF.allowAi, false)
})
