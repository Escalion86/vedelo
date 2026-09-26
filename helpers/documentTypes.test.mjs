import test from 'node:test'
import assert from 'node:assert/strict'
import { getDocumentTitleAfterTypeChange } from './documentTypes.js'

test('document title follows the selected type while it is empty or automatic', () => {
  assert.equal(
    getDocumentTitleAfterTypeChange({
      title: '',
      previousType: 'other',
      nextType: 'contract',
    }),
    'Договор'
  )
  assert.equal(
    getDocumentTitleAfterTypeChange({
      title: 'Договор',
      previousType: 'contract',
      nextType: 'invoice',
    }),
    'Счет'
  )
})

test('document title preserves a user value when the type changes', () => {
  assert.equal(
    getDocumentTitleAfterTypeChange({
      title: 'Счет за сентябрь',
      previousType: 'invoice',
      nextType: 'receipt',
    }),
    'Счет за сентябрь'
  )
})

test('custom document type keeps an automatic title in sync', () => {
  assert.equal(
    getDocumentTitleAfterTypeChange({
      title: 'Другое',
      previousType: 'other',
      nextType: 'other',
      nextCustomTypeName: 'Справка',
    }),
    'Справка'
  )
  assert.equal(
    getDocumentTitleAfterTypeChange({
      title: 'Справка',
      previousType: 'other',
      nextType: 'other',
      previousCustomTypeName: 'Справка',
      nextCustomTypeName: 'Гарантийное письмо',
    }),
    'Гарантийное письмо'
  )
})
