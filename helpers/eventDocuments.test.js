import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeLegacyEventDocuments,
  normalizeEventDocument,
  normalizeEventDocuments,
} from './eventDocuments.js'

test('normalizes a link document', () => {
  assert.deepEqual(
    normalizeEventDocument(
      {
        id: 'doc-1',
        type: 'invoice',
        title: ' Счет ',
        url: ' https://example.com/invoice ',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
      { now: '2026-07-03T00:00:00.000Z' }
    ),
    {
      id: 'doc-1',
      type: 'invoice',
      customTypeName: '',
      title: 'Счет',
      url: 'https://example.com/invoice',
      file: null,
      transactionId: '', number: '', documentDate: '', templateId: '',
      createdAt: '2026-07-01T00:00:00.000Z',
    }
  )
})

test('normalizes a file document', () => {
  const result = normalizeEventDocument(
    {
      type: 'act',
      title: '',
      file: {
        name: 'akt.docx',
        url: 'https://files.example/akt.docx',
        path: 'events/1/documents/akt.docx',
        size: 10,
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    },
    { now: '2026-07-03T00:00:00.000Z' }
  )

  assert.equal(result.type, 'act')
  assert.equal(result.title, 'Акт')
  assert.equal(result.file.name, 'akt.docx')
  assert.equal(result.url, '')
})

test('drops empty documents', () => {
  assert.deepEqual(normalizeEventDocuments([{ title: 'empty' }]), [])
})

test('не принимает новый storageKey из клиентского JSON', () => {
  const malicious = {
    id: 'doc-storage',
    type: 'other',
    title: 'Чужой файл',
    file: {
      name: 'secret.pdf',
      storageKey:
        'artistcrm/507f1f77bcf86cd799439011/clients/507f1f77bcf86cd799439012/documents/foreign',
    },
  }
  assert.equal(normalizeEventDocument(malicious), null)
  assert.equal(
    normalizeEventDocument(malicious, { trustStorageKey: true }).file
      .storageKey,
    malicious.file.storageKey
  )
})

test('дедуплицирует сначала по id, затем по storageKey и legacy URL', () => {
  const result = normalizeEventDocuments(
    [
      {
        id: 'one',
        type: 'other',
        file: { name: 'one.pdf', storageKey: 'artistcrm/key-one' },
      },
      {
        id: 'two',
        type: 'other',
        file: { name: 'copy.pdf', storageKey: 'artistcrm/key-one' },
      },
      { id: 'link-one', type: 'other', url: 'https://example.com/a' },
      {
        id: 'link-two',
        type: 'other',
        file: { name: 'a', url: 'https://example.com/a' },
      },
    ],
    { trustStorageKey: true }
  )
  assert.deepEqual(
    result.map((item) => item.id),
    ['one', 'link-one']
  )
})

test('merges legacy event documents idempotently', () => {
  const event = {
    documents: [
      {
        id: 'existing',
        type: 'contract',
        title: 'Договор',
        url: 'https://example.com/contract',
      },
    ],
    contractLinks: ['https://example.com/contract'],
    invoiceLinks: ['https://example.com/invoice'],
    receiptLinks: ['https://example.com/receipt'],
    actLinks: ['https://example.com/act'],
    documentFiles: [
      {
        name: 'rider.pdf',
        url: 'https://files.example/rider.pdf',
        path: 'events/1/documents/rider.pdf',
      },
    ],
  }

  const once = mergeLegacyEventDocuments(event, {
    now: '2026-07-03T00:00:00.000Z',
  })
  const twice = mergeLegacyEventDocuments(
    { ...event, documents: once },
    { now: '2026-07-03T00:00:00.000Z' }
  )

  assert.equal(once.length, 5)
  assert.equal(twice.length, 5)
  assert.deepEqual(
    once.map((item) => item.type),
    ['contract', 'invoice', 'receipt', 'act', 'other']
  )
})
