import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { Document, Paragraph, Packer } from 'docx'
import PizZip from 'pizzip'

export const runDocumentsHttpSmoke = async ({
  baseUrl,
  db,
  password,
  passwordHash,
  cloudRequests,
}) => {
  const tenantId = new mongoose.Types.ObjectId()
  const otherTenantId = new mongoose.Types.ObjectId()
  const tariffId = new mongoose.Types.ObjectId()
  const clientId = new mongoose.Types.ObjectId()
  const eventId = new mongoose.Types.ObjectId()
  const draftEventId = new mongoose.Types.ObjectId()
  const otherEventId = new mongoose.Types.ObjectId()
  const otherClientId = new mongoose.Types.ObjectId()
  // Минимальный пользовательский DOCX-шаблон только в памяти, без файлов на диске.
  const template = (
    await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph('Документ №{НОМЕР ДОКУМЕНТА}'),
              new Paragraph('{ФИО АРТИСТА}'),
              new Paragraph('{ФИО КЛИЕНТА}'),
              new Paragraph('{ДОГОВОРНАЯ СУММА}'),
              new Paragraph('{РЕКВИЗИТЫ СТОРОН}'),
            ],
          },
        ],
      })
    )
  ).toString('base64')
  await db.collection('tariffs').insertOne({
    _id: tariffId,
    title: 'Document smoke',
    allowDocuments: true,
    eventsPerMonth: 100,
  })
  await db.collection('users').insertOne({
    _id: tenantId,
    tenantId,
    tariffId,
    phone: '79000000871',
    password: passwordHash,
    role: 'user',
    archive: false,
  })
  await db.collection('clients').insertOne({
    _id: clientId,
    tenantId,
    firstName: 'ТестовыйЗаказчик',
    inn: '1234567890',
    clientType: 'individual_entrepreneur',
  })
  await db.collection('clients').insertOne({
    _id: otherClientId,
    tenantId: otherTenantId,
    firstName: 'Чужой клиент',
    documents: [],
  })
  await db.collection('events').insertMany([
    {
      _id: eventId,
      tenantId,
      clientId,
      status: 'active',
      contractSum: 12345,
      eventDate: new Date('2026-09-20T12:00:00Z'),
      servicesIds: [],
      documents: [],
    },
    {
      _id: draftEventId,
      tenantId,
      clientId,
      status: 'draft',
      eventType: 'Заявка с вложением',
      documents: [],
    },
    { _id: otherEventId, tenantId: otherTenantId, status: 'active' },
  ])
  await db.collection('sitesettings').insertOne({
    tenantId,
    custom: {
      contractArtistFullName: 'ТестовыйИсполнитель',
      contractArtistInn: '123456789012',
      documentTemplates: [
        {
          id: 'contract-smoke',
          type: 'contract',
          name: 'Договор',
          templateBase64: template,
        },
        { id: 'act-smoke', type: 'act', name: 'Акт', templateBase64: template },
        {
          id: 'broken-smoke',
          type: 'act',
          name: 'Повреждённый',
          templateBase64: Buffer.from('not-docx').toString('base64'),
        },
      ],
    },
  })
  const login = await fetch(`${baseUrl}/api/mobile/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      phone: '79000000871',
      password,
      deviceId: 'documents-smoke',
      platform: 'android',
    }),
  })
  assert.equal(login.status, 200)
  const token = (await login.json()).data.accessToken
  const generate = async (
    id,
    templateId,
    documentDate = '2026-09-10',
    authenticated = true
  ) => {
    const response = await fetch(
      `${baseUrl}/api/mobile/v1/events/${id}/documents/generate`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ templateId, documentDate }),
      }
    )
    return { status: response.status, body: await response.json() }
  }
  const initialUploads = cloudRequests.length
  assert.equal(
    (await generate(eventId, 'contract-smoke', undefined, false)).status,
    401
  )
  assert.equal((await generate(otherEventId, 'contract-smoke')).status, 404)
  assert.equal((await generate(eventId, 'unknown')).status, 404)
  assert.equal(
    (await generate(eventId, 'contract-smoke', 'invalid-date')).status,
    400
  )
  for (const invalidDate of ['2026-02-31', '2025-02-29', '2026-04-31']) {
    assert.equal(
      (await generate(eventId, 'contract-smoke', invalidDate)).status,
      400,
      invalidDate
    )
  }
  assert.equal((await generate(eventId, 'broken-smoke')).status, 422)
  assert.equal(cloudRequests.length, initialUploads)
  await db
    .collection('events')
    .updateOne({ _id: eventId }, { $set: { status: 'draft' } })
  assert.equal((await generate(eventId, 'contract-smoke')).status, 409)
  await db
    .collection('events')
    .updateOne({ _id: eventId }, { $set: { status: 'active' } })

  for (const type of ['contract', 'act']) {
    const result = await generate(eventId, `${type}-smoke`)
    assert.equal(result.status, 200, JSON.stringify(result.body))
    assert.equal(result.body.data.document.type, type)
    const upload = cloudRequests.at(-1)
    const form = await new Response(upload.bytes, {
      headers: { 'content-type': upload.headers['content-type'] },
    }).formData()
    const uploadId = form.get('uploadId')
    assert.match(String(uploadId), /^[a-zA-Z0-9-]{1,80}$/)
    assert.equal(
      form.get('storageKey'),
      `artistcrm/${tenantId}/events/${eventId}/documents/${uploadId}`
    )
    const file = form.get('file')
    assert.match(file.name, /\.docx$/)
    const xml = new PizZip(Buffer.from(await file.arrayBuffer()))
      .file('word/document.xml')
      .asText()
    assert.match(xml, /ТестовыйИсполнитель/)
    assert.match(xml, /ТестовыйЗаказчик/)
    assert.match(xml, /123456789012/)
    assert.match(xml, /1234567890/)
    assert.match(xml, /<w:tbl/)
    assert.doesNotMatch(xml, /PARTIES_TABLES|\{ФИО|\{НОМЕР/)
  }
  assert.equal(cloudRequests.length, initialUploads + 2)
  const stored = await db.collection('events').findOne({ _id: eventId })
  assert.deepEqual(
    stored.documents.map((item) => item.type),
    ['contract', 'act']
  )
  assert.ok(
    stored.documents.every((item) => item.file.storageKey && !item.file.url)
  )

  const uploadFile = async (entityType, id, uploadId, name = 'brief.xlsx') => {
    const form = new FormData()
    form.append('fileQueueId', uploadId)
    form.append('type', 'other')
    form.append('title', name)
    form.append(
      'files',
      new Blob(['xlsx-smoke'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      name
    )
    const response = await fetch(
      `${baseUrl}/api/mobile/v1/${entityType}/${id}/files`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      }
    )
    return { status: response.status, body: await response.json() }
  }

  const beforeEntityUploads = cloudRequests.length
  const draftUpload = await uploadFile(
    'events',
    draftEventId,
    'draft-xlsx-smoke'
  )
  assert.equal(draftUpload.status, 200, JSON.stringify(draftUpload.body))
  assert.equal(draftUpload.body.data.document.type, 'other')
  assert.equal(
    draftUpload.body.data.document.file.storageKey,
    `artistcrm/${tenantId}/events/${draftEventId}/documents/draft-xlsx-smoke`
  )
  assert.equal(cloudRequests.length, beforeEntityUploads + 1)
  assert.equal(
    (await uploadFile('events', draftEventId, 'draft-xlsx-smoke')).status,
    200
  )
  assert.equal(
    cloudRequests.length,
    beforeEntityUploads + 1,
    'повтор fileQueueId не должен загружать второй объект'
  )

  const clientUpload = await uploadFile(
    'clients',
    clientId,
    'client-xlsx-smoke'
  )
  assert.equal(clientUpload.status, 200, JSON.stringify(clientUpload.body))
  assert.equal(clientUpload.body.data.entity.documents.length, 1)
  assert.equal(
    (await uploadFile('clients', otherClientId, 'foreign-client-file')).status,
    404
  )

  const accessResponse = await fetch(
    `${baseUrl}/api/mobile/v1/clients/${clientId}/files/access-url`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        documentId: 'client-xlsx-smoke',
        disposition: 'attachment',
      }),
    }
  )
  assert.equal(accessResponse.status, 200)
  assert.match((await accessResponse.json()).data.url, /private-files\/content/)

  const deleteClientDocument = () =>
    fetch(`${baseUrl}/api/mobile/v1/clients/${clientId}/files`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        documentId: 'client-xlsx-smoke',
        deleteId: 'client-xlsx-smoke',
      }),
    })
  assert.equal((await deleteClientDocument()).status, 200)
  const requestsAfterDelete = cloudRequests.length
  assert.equal((await deleteClientDocument()).status, 200)
  assert.equal(cloudRequests.length, requestsAfterDelete)

  await db
    .collection('tariffs')
    .updateOne({ _id: tariffId }, { $set: { allowDocuments: false } })
  assert.equal((await generate(eventId, 'contract-smoke')).status, 403)
  assert.equal(
    (await uploadFile('clients', clientId, 'tariff-blocked-file')).status,
    403
  )
  assert.equal(cloudRequests.length, requestsAfterDelete)
}
