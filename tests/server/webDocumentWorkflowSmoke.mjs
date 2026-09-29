import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { Document, Paragraph, Packer } from 'docx'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'

export const runWebDocumentWorkflowSmoke = async ({
  baseUrl,
  db,
  password,
  tenantId,
  tariffId,
  draftEventId,
  otherEventId,
}) => {
  const cookies = new Map()
  const request = async (url, options = {}) => {
    const response = await fetch(`${baseUrl}${url}`, {
      ...options,
      redirect: 'manual',
      headers: {
        cookie: [...cookies]
          .map(([key, value]) => `${key}=${value}`)
          .join('; '),
        ...options.headers,
      },
    })
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]
      const index = pair.indexOf('=')
      cookies.set(pair.slice(0, index), pair.slice(index + 1))
    }
    return response
  }
  const csrf = await (await request('/api/auth/csrf')).json()
  await request('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      phone: '79000000871',
      password,
      csrfToken: csrf.csrfToken,
      json: 'true',
    }),
  })
  assert.ok((await (await request('/api/auth/session')).json()).user?._id)
  const post = async (url, body) => {
    const response = await request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }
  const catalogServiceId = new mongoose.Types.ObjectId()
  const foreignServiceId = new mongoose.Types.ObjectId()
  const extraServiceId = new mongoose.Types.ObjectId()
  await db.collection('services').insertMany([
    {
      _id: extraServiceId,
      tenantId,
      title: 'Дополнительная услуга КП QA',
      description: 'Вторая услуга',
      price: 400,
    },
    {
      _id: catalogServiceId,
      tenantId,
      title: 'Услуга для КП QA',
      description: 'Описание из каталога',
      price: 1700,
    },
    {
      _id: foreignServiceId,
      tenantId: new mongoose.Types.ObjectId(),
      title: 'Чужая услуга QA',
      price: 9000,
    },
  ])
  const catalog = await (await request('/api/services')).json()
  assert.ok(catalog.data.some((item) => item._id === String(catalogServiceId)))
  assert.ok(!catalog.data.some((item) => item._id === String(foreignServiceId)))
  const endpoint = `/api/events/${draftEventId}/documents/generate`
  const payload = {
    templateId: 'invoice-independent',
    documentDate: '2026-09-25',
    requestId: randomUUID(),
  }
  assert.equal((await post(endpoint, payload)).status, 403)
  await db
    .collection('tariffs')
    .updateOne({ _id: tariffId }, { $set: { allowDocuments: true } })
  const template = (
    await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph('Счёт №{НОМЕР_ДОКУМЕНТА} от {ДАТА_ДОКУМЕНТА}'),
              new Paragraph('Сумма {СУММА_ДОКУМЕНТА}'),
            ],
          },
        ],
      })
    )
  ).toString('base64')
  const unknown = (
    await Packer.toBuffer(
      new Document({
        sections: [{ children: [new Paragraph('{НЕИЗВЕСТНАЯ}')] }],
      })
    )
  ).toString('base64')
  await db.collection('sitesettings').updateOne(
    { tenantId },
    {
      $push: {
        'custom.documentTemplates': {
          $each: [
            {
              id: payload.templateId,
              name: 'Независимый счёт',
              type: 'invoice',
              templateBase64: template,
            },
            {
              id: 'unknown-fields',
              name: 'Ошибка',
              type: 'invoice',
              templateBase64: unknown,
            },
            {
              id: 'receipt-template',
              name: 'Чек',
              type: 'receipt',
              templateBase64: template,
            },
          ],
        },
      },
      $set: {
        'custom.firstRunWizardCompleted': true,
        'custom.firstRunWizardShowToken': null,
      },
    }
  )
  await db.collection('events').updateOne(
    { _id: draftEventId },
    {
      $set: {
        contractSum: 3500,
        isByContract: false,
        eventDate: new Date(Date.now() + 86400000),
        eventType: 'Независимые документы QA',
      },
    }
  )
  const anon = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  assert.equal(anon.status, 401)
  assert.equal(
    (await post(`/api/events/${otherEventId}/documents/generate`, payload))
      .status,
    404
  )
  const preview = await post(endpoint, { ...payload, action: 'preview' })
  assert.equal(preview.status, 200, JSON.stringify(preview.body))
  assert.deepEqual(preview.body.data.preview.unknown, [])
  assert.equal(
    await db.collection('documentgenerations').countDocuments({ tenantId }),
    0
  )
  assert.equal(
    (await post(endpoint, { ...payload, templateId: 'unknown-fields' })).status,
    422
  )
  assert.equal(
    (await post(endpoint, { ...payload, templateId: 'receipt-template' }))
      .status,
    400
  )
  assert.equal(
    (await post(endpoint, { ...payload, documentDate: '2026-02-31' })).status,
    400
  )
  const generated = await post(endpoint, payload)
  assert.equal(generated.status, 200, JSON.stringify(generated.body))
  const repeated = await post(endpoint, payload)
  assert.equal(repeated.body.data.document.id, generated.body.data.document.id)
  const concurrentPayload = { ...payload, requestId: randomUUID() }
  const concurrent = await Promise.all([
    post(endpoint, concurrentPayload),
    post(endpoint, concurrentPayload),
  ])
  concurrent.forEach((result) =>
    assert.equal(result.status, 200, JSON.stringify(result.body))
  )
  assert.equal(
    concurrent[0].body.data.document.number,
    concurrent[1].body.data.document.number
  )
  const saved = await db.collection('events').findOne({ _id: draftEventId })
  assert.equal(
    saved.documents.filter((item) => item.id === concurrentPayload.requestId)
      .length,
    1
  )
  assert.equal(
    saved.documents.filter((item) => item.id === payload.requestId).length,
    1
  )
  assert.equal(saved.isByContract, false)
  assert.equal(saved.status, 'draft')
  assert.equal(
    (await post(endpoint, { ...payload, documentDate: '2026-09-26' })).status,
    409
  )

  const completedOperation = await db
    .collection('documentgenerations')
    .findOne({ tenantId, requestId: payload.requestId })
  assert.equal(completedOperation.state, 'complete')
  assert.equal(completedOperation.template.templateBase64, undefined)
  const deleted = await request(`/api/events/${draftEventId}/files`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      documentId: concurrentPayload.requestId,
      deleteId: randomUUID(),
    }),
  })
  assert.equal(deleted.status, 200)
  assert.equal((await post(endpoint, concurrentPayload)).status, 410)
  const actExample = await request('/api/document-templates/examples/act')
  assert.equal(actExample.status, 200)
  assert.equal(
    Buffer.from(await actExample.arrayBuffer())
      .subarray(0, 2)
      .toString(),
    'PK'
  )

  const paymentId = new mongoose.Types.ObjectId()
  const foreignPaymentId = new mongoose.Types.ObjectId()
  await db.collection('transactions').insertMany([
    {
      _id: paymentId,
      tenantId,
      eventId: draftEventId,
      type: 'income',
      category: 'deposit',
      amount: 1000,
      paymentMethod: 'cash',
      date: new Date(),
    },
    {
      _id: foreignPaymentId,
      tenantId: new mongoose.Types.ObjectId(),
      eventId: otherEventId,
      type: 'income',
      amount: 1000,
    },
  ])
  const linkPath = `/api/events/${draftEventId}/documents`
  const receipt = {
    id: randomUUID(),
    type: 'receipt',
    url: 'https://example.test/receipt',
    transactionId: String(paymentId),
  }
  assert.equal(
    (
      await post(linkPath, {
        ...receipt,
        transactionId: String(foreignPaymentId),
      })
    ).status,
    400
  )
  assert.equal(
    (await post(linkPath, { ...receipt, url: 'javascript:alert(1)' })).status,
    400
  )
  assert.equal((await post(linkPath, receipt)).status, 200)
  assert.equal((await post(linkPath, receipt)).status, 200)
  assert.equal(
    (
      await post(linkPath, {
        ...receipt,
        id: randomUUID(),
        url: 'https://example.test/receipt-unlinked',
        transactionId: '',
      })
    ).status,
    200
  )
  assert.equal(
    (await post(`/api/events/${otherEventId}/documents`, receipt)).status,
    404
  )
  const ownAfter = await db.collection('events').findOne({ _id: draftEventId })
  assert.equal(
    ownAfter.documents.filter((item) => item.id === receipt.id).length,
    1
  )
  const patch = async (url, body) => {
    const response = await request(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }
  assert.equal(
    (
      await patch(linkPath, {
        documentId: receipt.id,
        transactionId: String(foreignPaymentId),
      })
    ).status,
    400
  )
  assert.equal(
    (await patch(linkPath, { documentId: receipt.id, transactionId: '' }))
      .status,
    200
  )
  assert.equal(
    (
      await patch(linkPath, {
        documentId: receipt.id,
        transactionId: String(paymentId),
      })
    ).status,
    200
  )
  assert.equal(
    (
      await patch(linkPath, {
        documentId: receipt.id,
        type: 'other',
        customTypeName: 'Кассовый документ',
        title: 'Чек от заказчика',
        url: 'https://example.test/receipt-updated',
        transactionId: '',
      })
    ).status,
    200
  )
  const editedDocument = (
    await db.collection('events').findOne({ _id: draftEventId })
  ).documents.find((item) => item.id === receipt.id)
  assert.equal(editedDocument.type, 'other')
  assert.equal(editedDocument.customTypeName, 'Кассовый документ')
  assert.equal(editedDocument.title, 'Чек от заказчика')
  assert.equal(editedDocument.url, 'https://example.test/receipt-updated')
  assert.equal(
    (
      await patch(linkPath, {
        documentId: receipt.id,
        title: 'Небезопасная ссылка',
        url: 'javascript:alert(1)',
      })
    ).status,
    400
  )
  assert.equal(
    (
      await patch(`/api/events/${otherEventId}/documents`, {
        documentId: receipt.id,
        title: 'Чужой документ',
      })
    ).status,
    404
  )

  assert.equal((await fetch(`${baseUrl}/api/proposals/statuses`)).status, 401)
  await db.collection('tariffs').updateOne({ _id: tariffId }, { $set: { allowProposals: true } })
  // Ordinary users with the feature enabled can complete the entire workflow.
  assert.equal((await request('/api/proposals/statuses')).status, 200)
  const removable = await post(`/api/events/${draftEventId}/proposals`, {})
  const foreignProposalId = new mongoose.Types.ObjectId()
  await db.collection('proposals').insertOne({
    _id: foreignProposalId,
    tenantId: new mongoose.Types.ObjectId(),
    eventId: draftEventId,
    status: 'published',
    title: 'Foreign draft',
    selectedPackageId: 'foreign-choice',
  })
  assert.equal((await (await request('/api/proposals/statuses')).json()).data[String(draftEventId)], undefined)
  assert.equal(
    (await request(`/api/proposals/${foreignProposalId}`, { method: 'DELETE' }))
      .status,
    404
  )
  assert.ok(
    await db.collection('proposals').findOne({ _id: foreignProposalId })
  )
  assert.equal(
    (
      await request(`/api/proposals/${removable.body.data._id}`, {
        method: 'DELETE',
      })
    ).status,
    200
  )
  assert.equal(
    (await request(`/api/proposals/${removable.body.data._id}`)).status,
    404
  )
  const createdProposal = await post(`/api/events/${draftEventId}/proposals`, {
    packages: [
      {
        id: 'basic',
        title: 'Основной',
        manualTotal: false,
        lines: [
          { title: 'Индивидуальная работа', price: 3000 },
          { title: 'Доставка', price: 500 },
        ],
      },
      {
        id: 'extended',
        title: 'Расширенный',
        manualTotal: true,
        total: 4000,
        lines: [{ title: 'Расширенная работа', price: 4500 }],
      },
    ],
    blocks: [
      { type: 'cover', title: 'Предложение' },
      {
        type: 'intro',
        title: 'Для {{client.firstName}}',
        contentHtml: '<p>Здравствуйте, {{client.firstName}}!</p>',
      },
      { type: 'packages', title: 'Варианты' },
    ],
  })
  assert.equal(
    createdProposal.status,
    201,
    JSON.stringify(createdProposal.body)
  )
  const proposalId = createdProposal.body.data._id
  assert.equal(createdProposal.body.data.packages[0].total, 3500)
  const proposalPath = `/api/proposals/${proposalId}`
  const logoBytes = await sharp({
    create: { width: 220, height: 80, channels: 4, background: '#2563eb' },
  })
    .png()
    .toBuffer()
  const uploadLogo = (id, bytes = logoBytes, type = 'image/png') => {
    const body = new FormData()
    body.append('file', new Blob([bytes], { type }), 'brand.png')
    return request(`/api/proposals/${id}/logo`, { method: 'POST', body })
  }
  assert.equal(
    (await fetch(`${baseUrl}${proposalPath}/logo`, { method: 'POST' })).status,
    401
  )
  assert.equal((await uploadLogo(foreignProposalId)).status, 404)
  assert.equal(
    (await uploadLogo(proposalId, Buffer.from('invalid image'))).status,
    400
  )
  assert.equal(
    (await uploadLogo(proposalId, Buffer.from('<svg/>'), 'image/svg+xml'))
      .status,
    400
  )
  assert.equal(
    (await uploadLogo(proposalId, Buffer.alloc(5 * 1024 * 1024 + 1))).status,
    413
  )
  await db
    .collection('tariffs')
    .updateOne({ _id: tariffId }, { $set: { allowProposals: false } })
  assert.equal((await uploadLogo(proposalId)).status, 403)
  const blockedRoutes = [
    ['/api/proposals/statuses', 'GET'],
    ['/api/proposal-templates', 'GET'],
    ['/api/proposal-templates', 'POST'],
    [`/api/proposal-templates/${proposalId}`, 'GET'],
    [`/api/proposal-templates/${proposalId}`, 'PATCH'],
    [`/api/proposal-templates/${proposalId}`, 'DELETE'],
    [`/api/events/${draftEventId}/proposals`, 'GET'],
    [`/api/events/${draftEventId}/proposals`, 'POST'],
    [proposalPath, 'GET'],
    [proposalPath, 'PATCH'],
    [proposalPath, 'DELETE'],
    [`${proposalPath}/send-telegram`, 'POST'],
  ]
  for (const role of ['user', 'dev']) {
    await db.collection('users').updateOne({ _id: tenantId }, { $set: { role } })
    for (const [url, method] of blockedRoutes) {
      assert.equal((await request(url, { method })).status, 403, `${role}: ${method} ${url}`)
    }
  }
  await db.collection('users').updateOne({ _id: tenantId }, { $set: { role: 'user' } })

  await db
    .collection('tariffs')
    .updateOne({ _id: tariffId }, { $unset: { allowProposals: '' } })
  const logoResponse = await uploadLogo(proposalId)
  const logoResult = await logoResponse.json()
  assert.equal(logoResponse.status, 200, JSON.stringify(logoResult))
  const logoUrl = logoResult.data.url
  assert.ok(
    logoUrl.includes(`/vedelo/${tenantId}/proposals/${proposalId}/logos/`)
  )
  assert.equal(
    (await patch(proposalPath, { appearance: { theme: 'unknown' } })).status,
    400
  )
  assert.equal(
    (
      await patch(proposalPath, {
        appearance: {
          theme: 'blue',
          logoUrl: logoUrl.replace(
            String(tenantId),
            String(new mongoose.Types.ObjectId())
          ),
        },
      })
    ).status,
    400
  )
  const appearance = { theme: 'blue', logoUrl }
  assert.equal((await patch(proposalPath, { appearance })).status, 200)
  assert.deepEqual(
    (await (await request(proposalPath)).json()).data.appearance,
    appearance
  )
  const published = await patch(proposalPath, { action: 'publish' })
  assert.equal((await uploadLogo(proposalId)).status, 409)
  assert.equal(
    (await patch(proposalPath, { appearance: { theme: 'dark' } })).status,
    409
  )
  const cloned = await post(`/api/events/${draftEventId}/proposals`, {
    sourceProposalId: proposalId,
  })
  assert.equal(cloned.status, 201)
  assert.deepEqual(cloned.body.data.appearance, appearance)
  assert.equal(
    (
      await request(`/api/proposals/${cloned.body.data._id}`, {
        method: 'DELETE',
      })
    ).status,
    200
  )
  assert.equal(published.status, 200, JSON.stringify(published.body))
  const deletable = await post(`/api/events/${draftEventId}/proposals`, {
    sourceProposalId: proposalId,
  })
  const deletablePath = `/api/proposals/${deletable.body.data._id}`
  const deletableLive = await patch(deletablePath, { action: 'publish' })
  const deletedPublicPath = `/api/public${new URL(deletableLive.body.data.publicUrl).pathname.replace('/proposal/', '/proposals/')}`
  assert.equal((await post(deletedPublicPath, { packageId: 'basic' })).status, 200)
  assert.equal((await patch(deletablePath, { action: 'apply' })).status, 200)
  const agreedBeforeDelete = (await db.collection('events').findOne({ _id: draftEventId })).agreedProposal
  assert.equal((await request(deletablePath, { method: 'DELETE' })).status, 200)
  assert.deepEqual((await db.collection('events').findOne({ _id: draftEventId })).agreedProposal, agreedBeforeDelete)
  assert.equal((await request(deletedPublicPath)).status, 404)
  const publicPath = `/api/public${new URL(published.body.data.publicUrl).pathname.replace('/proposal/', '/proposals/')}`
  assert.deepEqual(
    (await (await request(publicPath)).json()).data.appearance,
    appearance
  )
  await db.collection('proposals').updateOne({ _id: new mongoose.Types.ObjectId(proposalId) }, { $set: { sentAt: new Date() } })
  assert.equal((await (await request('/api/proposals/statuses')).json()).data[String(draftEventId)], 'sent')
  const selected = await post(publicPath, { packageId: 'basic' })
  assert.equal(selected.status, 200, JSON.stringify(selected.body))
  assert.equal((await (await request('/api/proposals/statuses')).json()).data[String(draftEventId)], 'accepted')
  assert.equal((await patch(proposalPath, { action: 'revoke' })).status, 409)
  assert.equal(
    (await patch(`/api/proposals/${foreignProposalId}`, { action: 'revoke' }))
      .status,
    404
  )
  assert.equal(
    (await (await request(proposalPath)).json()).data.status,
    'published'
  )
  for (let race = 0; race < 3; race += 1) {
    const copy = await post(`/api/events/${draftEventId}/proposals`, {
      sourceProposalId: proposalId,
    })
    const copyPath = `/api/proposals/${copy.body.data._id}`
    const live = await patch(copyPath, { action: 'publish' })
    const clientPath = `/api/public${new URL(live.body.data.publicUrl).pathname.replace('/proposal/', '/proposals/')}`
    const [revocation, selection] = await Promise.all([
      patch(copyPath, { action: 'revoke' }),
      post(clientPath, { packageId: 'basic' }),
    ])
    assert.ok([200, 409].includes(revocation.status))
    assert.ok([200, 409, 410].includes(selection.status))
    assert.notEqual(revocation.status === 200 && selection.status === 200, true)
    const stored = (await (await request(copyPath)).json()).data
    assert.ok(
      stored.status === 'published'
        ? Boolean(stored.selectedPackageId)
        : !stored.selectedPackageId
    )
  }

  const applied = await patch(proposalPath, { action: 'apply' })
  assert.equal(applied.status, 200)
  const agreed = await db.collection('events').findOne({ _id: draftEventId })
  assert.deepEqual(
    agreed.agreedProposal.lines.map((line) => line.title),
    ['Индивидуальная работа', 'Доставка']
  )
  assert.equal(agreed.isByContract, false)
  assert.equal((await post(publicPath, { packageId: 'extended' })).status, 200)
  const newSelection = (await (await request(proposalPath)).json()).data
  assert.equal(newSelection.appliedPackageId, 'basic')
  assert.equal(newSelection.selectedPackageId, 'extended')
  assert.equal((await patch(proposalPath, { action: 'apply' })).status, 200)
  const selectedPreview = await post(endpoint, {
    ...payload,
    action: 'preview',
    source: 'proposal',
  })
  assert.ok(
    selectedPreview.body.data.preview.fields.some(
      (item) => item.name === 'СУММА_ДОКУМЕНТА' && item.value === '4000'
    )
  )
  await db
    .collection('events')
    .updateOne({ _id: draftEventId }, { $set: { status: 'closed' } })
  assert.equal((await patch(proposalPath, { action: 'apply' })).status, 409)
  await db
    .collection('events')
    .updateOne({ _id: draftEventId }, { $set: { status: 'draft' } })
  // Restore order amount for the independent document UI flow below.
  await db
    .collection('events')
    .updateOne({ _id: draftEventId }, { $set: { contractSum: 3500 } })

  const shareEvent = await db.collection('events').findOne({ _id: draftEventId })
  await db.collection('clients').updateOne({ _id: new mongoose.Types.ObjectId(shareEvent.clientId), tenantId }, { $set: { email: 'proposal-qa@example.test', max: 'https://max.ru/qa-contact' } })
  console.log(`Web document QA environment: ${baseUrl}`)
  if (process.env.PLAYWRIGHT_MODULE) {
    const { chromium } = await import(
      pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    )
    const browser = await chromium.launch({ channel: 'msedge', headless: true })
    try {
      for (const width of [1365, 390]) {
        const context = await browser.newContext({
          baseURL: baseUrl,
          viewport: { width, height: 900 },
        })
        await context.grantPermissions(['clipboard-read', 'clipboard-write'])
        await context.route('**/proposal/**', (route) => {
          const target = new URL(route.request().url())
          if (target.origin !== baseUrl) {
            return route.fulfill({ status: 302, headers: { location: `${baseUrl}${target.pathname}${target.search}` } })
          }
          return route.continue()
        })
        await context.addCookies(
          [...cookies].map(([name, value]) => ({ name, value, url: baseUrl }))
        )
        const page = await context.newPage()
        await context.route(
          'https://cloud.escalion.ru/uploads/vedelo/**',
          (route) =>
            route.fulfill({ contentType: 'image/png', body: logoBytes })
        )
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        const consoleErrors = []
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text())
        })
        for (const theme of ['light', 'dark']) {
          await page.goto('/cabinet/eventsUpcoming')
          await page.evaluate(
            (value) => localStorage.setItem('theme', value),
            theme
          )
          await page.reload()
          const eventMenu = page
            .locator('.event-card-shell')
            .filter({ hasText: 'Независимые документы QA' })
            .getByRole('button', { name: 'Открыть меню действий' })
          await eventMenu.waitFor()
          await eventMenu.click()
          const editEvent = page.getByText('Редактирование', { exact: true })
          await editEvent.waitFor({ timeout: 3000 }).catch(async () => {
            await eventMenu.click()
            await editEvent.waitFor()
          })
          await editEvent.click()
          const form = page.locator('.compact-event-form')
          assert.equal(
            await form.getByText('Файлы и документы', { exact: true }).count(),
            1
          )
          assert.match(
            await form
              .locator('summary')
              .filter({ hasText: 'Файлы и документы' })
              .innerText(),
            /Документов: \d+/
          )

          await form
            .locator('summary')
            .filter({ hasText: 'Файлы и документы' })
            .click()
          await form
            .getByRole('button', { name: 'Добавить документ', exact: true })
            .click()
          const dialog = page.locator('.document-create-dialog')
          const typeHelp = dialog.getByRole('button', {
            name: 'Подсказка: Тип документа',
            exact: true,
          })
          await typeHelp.click()
          await page
            .getByRole('tooltip')
            .filter({ hasText: 'КП, договор, счёт и чек независимы' })
            .waitFor()
          await typeHelp.press('Escape')
          await page.getByRole('tooltip').waitFor({ state: 'hidden' })
          await dialog.waitFor()
          await typeHelp.press('Enter')
          await page.getByRole('tooltip').waitFor()
          await typeHelp.click()
          await page.getByRole('tooltip').waitFor({ state: 'hidden' })

          const titleInput = dialog.getByRole('textbox', {
            name: 'Название',
            exact: true,
          })
          assert.equal(await titleInput.inputValue(), 'Другое')
          await dialog
            .getByRole('combobox', { name: 'Тип документа', exact: true })
            .selectOption('invoice')
          assert.equal(await titleInput.inputValue(), 'Счет')
          await dialog
            .getByRole('combobox', { name: 'Тип документа', exact: true })
            .selectOption('contract')
          assert.equal(await titleInput.inputValue(), 'Договор')
          await titleInput.fill('Свой документ')
          await dialog
            .getByRole('combobox', { name: 'Тип документа', exact: true })
            .selectOption('receipt')
          assert.equal(await titleInput.inputValue(), 'Свой документ')
          await titleInput.fill('')
          await dialog
            .getByRole('combobox', { name: 'Тип документа', exact: true })
            .selectOption('invoice')
          assert.equal(await titleInput.inputValue(), 'Счет')
          await dialog
            .getByRole('button', { name: 'Сформировать', exact: true })
            .click()
          await dialog
            .getByRole('combobox', { name: 'Шаблон', exact: true })
            .selectOption(payload.templateId)
          await page
            .getByRole('button', { name: 'Проверить данные', exact: true })
            .click()
          await dialog
            .getByText('Проверка данных документа', { exact: true })
            .waitFor()
          assert.ok((await dialog.innerText()).includes('3500'))
          assert.match(await page.title(), /Кабинет/)
          assert.doesNotMatch(
            await page.locator('body').innerText(),
            /Application error|Unhandled Runtime Error/
          )
          const shot = path.join(
            os.tmpdir(),
            `vedelo-documents-${width}-${theme}.png`
          )
          await page.screenshot({ path: shot })
          console.log(`Documents UI screenshot: ${shot}`)
          await page
            .getByRole('button', { name: 'Создать документ', exact: true })
            .click()
          await dialog.waitFor({ state: 'hidden' })
          assert.equal(
            (await form
              .getByText('Файлы и документы', { exact: true })
              .count()) > 0,
            true
          )
          await form
            .getByRole('button', { name: 'Добавить документ', exact: true })
            .click()
          await dialog
            .getByRole('combobox', { name: 'Тип документа', exact: true })
            .selectOption('receipt')
          assert.equal(
            await dialog
              .getByRole('button', { name: 'Сформировать', exact: true })
              .count(),
            0
          )
          await dialog
            .getByRole('button', { name: 'Добавить ссылку', exact: true })
            .click()
          await dialog
            .getByRole('combobox', { name: 'К какой оплате относится чек' })
            .selectOption(String(paymentId))
          await dialog
            .locator('input')
            .last()
            .fill(`https://example.test/ui-receipt-${width}-${theme}`)
          await page
            .getByRole('button', { name: 'Добавить', exact: true })
            .click()
          await dialog.waitFor({ state: 'hidden' })
          const originalDocumentUrl = `https://example.test/ui-receipt-${width}-${theme}`
          const eventDocumentCard = form
            .locator('[data-document-card]')
            .filter({ hasText: originalDocumentUrl })
          await eventDocumentCard.waitFor()
          const documentCardId =
            await eventDocumentCard.getAttribute('data-document-card')
          assert.ok(documentCardId)
          const editDocumentButton = eventDocumentCard.getByRole('button', {
            name: 'Редактировать документ',
            exact: true,
          })
          const deleteDocumentButton = eventDocumentCard.getByRole('button', {
            name: 'Удалить документ',
            exact: true,
          })
          const descriptionButton = eventDocumentCard.getByRole('button', {
            name: new RegExp(originalDocumentUrl),
          })
          const [descriptionBox, editBox, deleteBox] = await Promise.all([
            descriptionButton.boundingBox(),
            editDocumentButton.boundingBox(),
            deleteDocumentButton.boundingBox(),
          ])
          assert.ok(descriptionBox && editBox && deleteBox)
          assert.ok(editBox.x > descriptionBox.x)
          assert.ok(editBox.x < deleteBox.x)
          await editDocumentButton.click()
          const editDialog = page.locator('.document-edit-dialog')
          await editDialog.waitFor()
          await editDialog
            .getByRole('textbox', { name: 'Название', exact: true })
            .fill('Чек с изменённым названием')
          const editedDocumentUrl = `${originalDocumentUrl}-edited`
          await editDialog
            .getByRole('textbox', { name: 'Ссылка', exact: true })
            .fill(editedDocumentUrl)
          await page
            .getByRole('button', { name: 'Сохранить', exact: true })
            .last()
            .click()
          await editDialog.waitFor({ state: 'hidden' })
          const editedDocumentCard = form.locator(
            `[data-document-card="${documentCardId}"]`
          )
          await editedDocumentCard
            .getByText('Чек с изменённым названием', { exact: false })
            .waitFor()
          assert.match(await editedDocumentCard.innerText(), /-edited/)
          const cardShot = path.join(
            os.tmpdir(),
            `vedelo-document-card-${width}-${theme}.png`
          )
          await editedDocumentCard.screenshot({ path: cardShot })
          console.log(`Document card screenshot: ${cardShot}`)
          await form
            .locator('summary')
            .filter({ hasText: 'Коммерческие предложения' })
            .click()
          await form
            .getByRole('button', { name: 'Создать предложение', exact: true })
            .click()
          const editor = page.locator('.proposal-editor')
          await editor.locator('.proposal-appearance summary').click()
          const logoInput = editor.getByLabel('Файл логотипа')
          const logoFile = {
            name: 'brand.png',
            mimeType: 'image/png',
            buffer: logoBytes,
          }
          await logoInput.setInputFiles(logoFile)
          await editor.getByAltText('Логотип предложения').waitFor()
          await editor
            .getByRole('button', { name: 'Убрать логотип из предложения' })
            .click()
          assert.equal(
            await editor.getByAltText('Логотип предложения').count(),
            0
          )
          await logoInput.setInputFiles(logoFile)
          await editor.getByAltText('Логотип предложения').waitFor()

          await editor.waitFor()
          assert.equal(await form.locator('.proposal-editor').count(), 0)
          await editor
            .getByRole('button', { name: 'Выбрать услуги', exact: true })
            .first()
            .click()
          await page
            .getByText('Услуга для КП QA — 1700 ₽', { exact: true })
            .last()
            .locator('..')
            .getByRole('checkbox')
            .click()
          await page
            .getByRole('button', { name: 'Применить', exact: true })
            .last()
            .click()
          await editor
            .getByRole('button', { name: 'Выбрать услуги', exact: true })
            .first()
            .click()
          await page
            .getByText('Дополнительная услуга КП QA — 400 ₽', { exact: true })
            .last()
            .locator('..')
            .getByRole('checkbox')
            .click()
          await page
            .getByRole('button', { name: 'Применить', exact: true })
            .last()
            .click()
          assert.ok((await editor.locator('.proposal-line-card').count()) >= 2)
          await editor
            .getByRole('button', { name: 'Выбрать услуги', exact: true })
            .first()
            .click()
          await page
            .getByText('Дополнительная услуга КП QA — 400 ₽', { exact: true })
            .last()
            .locator('..')
            .getByRole('checkbox')
            .click()
          await page
            .getByRole('button', { name: 'Применить', exact: true })
            .last()
            .click()
          const countBeforeCustom = await editor
            .locator('.proposal-line-card')
            .count()
          await editor
            .getByRole('button', { name: 'Своя позиция', exact: true })
            .first()
            .click()
          const line = page.locator('.proposal-line-editor')
          assert.equal(
            await page
              .getByRole('button', { name: 'Добавить', exact: true })
              .last()
              .isDisabled(),
            true
          )
          await page
            .getByRole('button', { name: 'Отмена', exact: true })
            .last()
            .click()
          assert.equal(
            await editor.locator('.proposal-line-card').count(),
            countBeforeCustom
          )
          await editor
            .getByRole('button', { name: 'Своя позиция', exact: true })
            .first()
            .click()
          await line
            .getByRole('textbox', { name: /Название позиции/ })
            .fill('Своя услуга QA')
          await page
            .getByRole('button', { name: 'Добавить', exact: true })
            .last()
            .click()
          const customLine = editor.locator('.proposal-line-card').last()
          await customLine
            .getByRole('button', { name: /Удалить позицию/ })
            .click()
          await page
            .getByRole('button', { name: 'Удалить', exact: true })
            .last()
            .click()
          assert.equal(
            await editor.locator('.proposal-line-card').count(),
            countBeforeCustom
          )
          const lineCard = editor.locator('.proposal-line-card').last()
          const beforeCancel = await lineCard.innerText()
          await lineCard
            .getByRole('button', { name: /Редактировать позицию/ })
            .click()
          await line
            .getByRole('textbox', { name: /Описание позиции/ })
            .fill('Правки для отмены')
          await page
            .getByRole('button', { name: 'Отмена', exact: true })
            .last()
            .click()
          await page
            .getByText(
              'Вы уверены, что хотите закрыть окно без сохранения изменений?',
              { exact: true }
            )
            .waitFor()
          await page
            .getByRole('button', { name: 'Подтвердить', exact: true })
            .last()
            .click()
          assert.equal(await lineCard.innerText(), beforeCancel)
          const recommended = editor
            .getByRole('checkbox', { name: 'Рекомендуем', exact: true })
            .first()
          const wasRecommended = await recommended.getAttribute('aria-checked')
          await recommended.focus()
          await page.keyboard.press('Space')
          assert.equal(
            await recommended.getAttribute('aria-checked'),
            wasRecommended === 'true' ? 'false' : 'true'
          )
          await page.keyboard.press('Space')
          assert.equal(
            await recommended.getAttribute('aria-checked'),
            wasRecommended
          )
          await lineCard
            .getByRole('button', { name: /Редактировать позицию/ })
            .click()
          await line
            .getByRole('combobox')
            .selectOption(String(catalogServiceId))
          assert.equal(
            await line
              .getByRole('textbox', { name: /Название позиции/ })
              .inputValue(),
            'Услуга для КП QA'
          )
          assert.equal(
            await line
              .getByRole('textbox', { name: /Описание позиции/ })
              .inputValue(),
            'Описание из каталога'
          )
          assert.equal(
            await line
              .getByRole('textbox', { name: /Цена позиции/ })
              .inputValue(),
            '1700'
          )
          // Дождаться завершения анимации стека модалок перед визуальной проверкой.
          await page.waitForTimeout(400)
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `vedelo-proposal-line-${width}-${theme}.png`
            ),
          })
          const priceInput = line.getByRole('textbox', { name: /Цена позиции/ })
          await priceInput.fill('1700,50')
          await priceInput.blur()
          assert.equal(await priceInput.inputValue(), '1700.5')
          await priceInput.fill('1700')
          await priceInput.blur()

          assert.equal(
            await line.getByRole('option', { name: 'Чужая услуга QA' }).count(),
            0
          )
          await line
            .getByRole('textbox', { name: /Описание позиции/ })
            .fill('Индивидуальное описание для клиента')
          await page
            .getByRole('button', { name: 'Применить', exact: true })
            .last()
            .click()
          await editor
            .getByRole('button', { name: 'Выбрать услуги', exact: true })
            .first()
            .click()
          await page
            .getByText('Услуга для КП QA — 1700 ₽', { exact: true })
            .last()
            .locator('..')
            .getByRole('checkbox')
            .click()
          await page
            .getByRole('button', { name: 'Отмена', exact: true })
            .last()
            .click()
          assert.match(
            await lineCard.innerText(),
            /Индивидуальное описание для клиента/
          )
          const packageSection = editor.locator('.proposal-package').first()
          const packageSummary = packageSection.locator('summary').first()
          await packageSummary.click()
          assert.equal(
            await packageSection
              .locator('details')
              .first()
              .evaluate((element) => element.open),
            false
          )
          assert.equal(await lineCard.isVisible(), false)
          assert.match(await packageSummary.innerText(), /Позиций:/)
          await packageSummary.focus()
          await page.keyboard.press('Enter')
          assert.match(
            await lineCard.innerText(),
            /Индивидуальное описание для клиента/
          )
          await editor
            .getByRole('button', { name: 'Добавить вариант', exact: true })
            .click()
          const newPackage = editor.locator('.proposal-package').last()
          assert.equal(
            await newPackage
              .locator('details')
              .first()
              .evaluate((element) => element.open),
            true
          )
          await newPackage.locator('summary').first().click()
          assert.equal(
            await newPackage
              .locator('details')
              .first()
              .evaluate((element) => element.open),
            false
          )
          assert.equal(
            await packageSection
              .locator('details')
              .first()
              .evaluate((element) => element.open),
            true
          )
          await newPackage.locator('summary').first().click()
          await newPackage
            .getByRole('button', { name: 'Удалить вариант', exact: true })
            .click()
          await lineCard.scrollIntoViewIfNeeded()
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `vedelo-proposal-editor-${width}-${theme}.png`
            ),
          })
          const savedServiceResponse = page.waitForResponse(
            (response) =>
              response.request().method() === 'PATCH' &&
              /\/api\/proposals\/[^/]+$/.test(new URL(response.url()).pathname)
          )
          await page
            .getByRole('button', { name: 'Сохранить', exact: true })
            .first()
            .click()
          const savedService = (await (await savedServiceResponse).json()).data
          assert.ok(
            savedService.packages.some((item) =>
              item.lines.some(
                (entry) =>
                  entry.serviceId === String(catalogServiceId) &&
                  entry.description === 'Индивидуальное описание для клиента'
              )
            )
          )
          await page
            .getByRole('alert')
            .filter({ hasText: 'Черновик сохранён' })
            .last()
            .locator('svg')
            .last()
            .click()
          await page
            .getByText('Черновик сохранён', { exact: true })
            .waitFor({ state: 'detached' })
          // Switching to a custom position keeps the entered snapshot but removes its service link.
          await lineCard
            .getByRole('button', { name: /Редактировать позицию/ })
            .click()
          await line.getByRole('combobox').selectOption('')
          assert.equal(
            await line
              .getByRole('textbox', { name: /Описание позиции/ })
              .inputValue(),
            'Индивидуальное описание для клиента'
          )
          await page
            .getByRole('button', { name: 'Применить', exact: true })
            .last()
            .click()
          await page
            .getByRole('button', { name: 'Сохранить', exact: true })
            .first()
            .click()
          await page
            .getByText('Черновик сохранён', { exact: true })
            .last()
            .waitFor()
          assert.equal(
            await editor
              .getByText('Черновик сохранён', { exact: true })
              .count(),
            0
          )
          await page
            .getByRole('alert')
            .filter({ hasText: 'Черновик сохранён' })
            .last()
            .locator('svg')
            .last()
            .click()
          await page
            .getByText('Черновик сохранён', { exact: true })
            .waitFor({ state: 'detached' })
          await lineCard
            .getByRole('button', { name: /Редактировать позицию/ })
            .click()
          assert.equal(await line.getByRole('combobox').inputValue(), '')
          await page
            .getByRole('button', { name: 'Отмена', exact: true })
            .last()
            .click()
          assert.equal(
            (await db.collection('services').findOne({ _id: catalogServiceId }))
              .description,
            'Описание из каталога'
          )
          await editor
            .getByRole('button', {
              name: 'Предпросмотр для клиента',
              exact: true,
            })
            .click()
          await editor
            .getByRole('heading', {
              name: 'Персональное предложение',
              exact: true,
            })
            .waitFor()
          assert.ok(
            (await editor.locator('.proposal-page-view').innerText()).includes(
              'Индивидуальное описание для клиента'
            )
          )
          await editor.locator('.proposal-page-view').scrollIntoViewIfNeeded()
          assert.equal(
            await editor
              .locator('.proposal-page-view article')
              .evaluate((element) => getComputedStyle(element).backgroundColor),
            'rgb(255, 255, 255)'
          )
          const pagePreview = editor.locator('.proposal-page-view')
          const proposalTheme = editor.getByRole('combobox', {
            name: /Тема оформления/,
          })
          for (const value of ['light', 'blue', 'dark', 'classic']) {
            await proposalTheme.selectOption(value)
            assert.equal(await pagePreview.getAttribute('data-theme'), value)
            await pagePreview.getByAltText('Логотип', { exact: true }).waitFor()
            assert.equal(
              await pagePreview
                .locator('article')
                .evaluate((el) => getComputedStyle(el).backgroundColor),
              value === 'dark' ? 'rgb(24, 24, 27)' : 'rgb(255, 255, 255)'
            )
          }
          await proposalTheme.selectOption('dark')
          await pagePreview.scrollIntoViewIfNeeded()
          await page.waitForTimeout(250)
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `vedelo-proposal-dark-${width}-${theme}.png`
            ),
          })
          await proposalTheme.selectOption('blue')
          await pagePreview.scrollIntoViewIfNeeded()
          await page.waitForTimeout(250)
          const proposalShot = path.join(
            os.tmpdir(),
            `vedelo-proposal-${width}-${theme}.png`
          )
          await page.screenshot({ path: proposalShot })
          console.log(`Proposal UI screenshot: ${proposalShot}`)
          await proposalTheme.selectOption('classic')
          await page
            .getByRole('button', { name: 'Закрыть', exact: true })
            .last()
            .click()
          await editor.waitFor({ state: 'hidden' })
          assert.ok(await form.isVisible())
          const draftCard = form
            .locator('.proposal-list-item')
            .filter({
              has: page.getByRole('button', {
                name: 'Удалить предложение',
                exact: true,
              }),
            })
            .first()
          await draftCard
            .getByRole('button', { name: 'Удалить предложение', exact: true })
            .click()
          await page
            .getByRole('button', { name: 'Отмена', exact: true })
            .last()
            .click()
          assert.ok(await draftCard.isVisible())
          await draftCard.scrollIntoViewIfNeeded()
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `vedelo-proposal-card-${width}-${theme}.png`
            ),
          })

          await form
            .getByRole('button', { name: 'Редактировать', exact: true })
            .first()
            .click()
          await editor.waitFor()
          await editor
            .locator('input')
            .first()
            .fill('Несохранённое название КП')
          await page
            .getByRole('button', { name: 'Закрыть', exact: true })
            .last()
            .click()
          await page.getByText('Вы уверены', { exact: false }).last().waitFor()
          await page
            .getByRole('button', { name: 'Отмена', exact: true })
            .last()
            .click()
          assert.equal(
            await editor.locator('input').first().inputValue(),
            'Несохранённое название КП'
          )
          assert.equal(await editor.getByRole('button', { name: 'Опубликовать', exact: true }).count(), 0)
          const footerSave = page.getByRole('button', { name: 'Сохранить', exact: true }).last()
          assert.ok((await footerSave.getAttribute('class')).includes('modal-action-button'))
          await footerSave.click()
          await footerSave.waitFor({ state: 'hidden' })
          const savedDraftToast = page.getByRole('alert').filter({ hasText: 'Черновик сохранён' }).last()
          await savedDraftToast.waitFor({ state: 'visible' })
          await savedDraftToast.locator('svg').last().click()
          await savedDraftToast.waitFor({ state: 'hidden' })
          await page.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
          await editor.waitFor({ state: 'hidden' })
          await form.locator('.proposal-list-item').filter({ hasText: 'Несохранённое название КП' }).filter({ hasText: 'черновик' }).first().getByRole('button', { name: 'Опубликовать', exact: true }).click()
          const publishedCard = form
            .locator('.proposal-list-item')
            .filter({ hasText: 'Несохранённое название КП' })
            .first()
          await publishedCard.getByText(/опубликовано/).waitFor()
          await publishedCard.locator('button:not([disabled])').filter({ hasText: 'Отозвать' }).waitFor()
          assert.equal(
            await publishedCard
              .getByRole('button', { name: 'Отозвать', exact: true })
              .isEnabled(),
            true
          )
          assert.equal(await publishedCard.getByRole('button', { name: 'В Telegram', exact: true }).count(), 0)
          const shareToast = page.getByRole('alert').filter({ hasText: 'Предложение опубликовано' }).last()
          if (await shareToast.isVisible()) {
            await shareToast.locator('svg').last().click()
            await shareToast.waitFor({ state: 'hidden' })
          }
          await publishedCard.getByRole('button', { name: 'Отправить', exact: true }).click()
          const shareDialog = page.locator('.proposal-share-dialog')
          await shareDialog.getByText(/Текст предложения скопирован/).waitFor()
          const clipboardMessage = await page.evaluate(() => navigator.clipboard.readText())
          assert.match(clipboardMessage, /Предложение для вашего мероприятия можете посмотреть по ссылке/)
          assert.equal(await shareDialog.getByRole('textbox').inputValue(), clipboardMessage)
          await shareDialog.getByRole('button', { name: /Электронная почта/ }).waitFor()
          await page.screenshot({ path: path.join(os.tmpdir(), `vedelo-proposal-share-${width}-${theme}.png`), animations: 'disabled' })
          await page.evaluate(() => { window.qaOriginalOpen = window.open; window.open = (url) => { window.qaContactUrl = url; return null } })
          await shareDialog.getByRole('button', { name: /Электронная почта/ }).click()
          const contactUrl = await page.evaluate(() => window.qaContactUrl)
          assert.equal(new URL(contactUrl).protocol, 'mailto:')
          assert.equal(new URL(contactUrl).searchParams.get('body'), clipboardMessage)
          await shareDialog.getByRole('button', { name: /MAX/ }).click()
          assert.equal(await page.evaluate(() => navigator.clipboard.readText()), clipboardMessage)
          await page.evaluate(() => { window.open = window.qaOriginalOpen; delete window.qaOriginalOpen; delete window.qaContactUrl })
          await page.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
          await shareDialog.waitFor({ state: 'hidden' })
          await publishedCard
            .getByRole('button', {
              name: 'Редактировать в новой версии',
              exact: true,
            })
            .click()
          await editor.waitFor()
          assert.equal(
            await editor.locator('input').first().inputValue(),
            'Несохранённое название КП'
          )
          await page
            .getByRole('button', { name: 'Закрыть', exact: true })
            .last()
            .click()
          await editor.waitFor({ state: 'hidden' })
          const copiedCard = form
            .locator('.proposal-list-item')
            .filter({ hasText: 'Несохранённое название КП' })
            .filter({ hasText: 'черновик' })
            .first()
          await copiedCard
            .getByRole('button', { name: 'Удалить предложение', exact: true })
            .click()
          await page
            .getByRole('button', { name: 'Удалить', exact: true })
            .last()
            .click()
          await copiedCard.waitFor({ state: 'hidden' })
          await page
            .getByRole('alert')
            .filter({ hasText: 'Черновик предложения удалён' })
            .last()
            .locator('svg')
            .last()
            .click()

          const acceptedCard = form
            .locator('.proposal-list-item')
            .filter({ hasText: 'клиент выбрал вариант' })
            .first()
          assert.equal(
            await acceptedCard
              .getByRole('button', { name: 'Отозвать', exact: true })
              .isDisabled(),
            true
          )
          assert.equal(
            await acceptedCard
              .getByRole('button', {
                name: 'Удалить предложение',
                exact: true,
              })
              .isEnabled(),
            true
          )

          await acceptedCard.getByRole('button', { name: 'Удалить предложение', exact: true }).click()
          await page.getByText(/Клиент уже выбрал вариант в этом предложении/).waitFor()
          await page.getByRole('button', { name: 'Отмена', exact: true }).last().click()
          assert.ok(await acceptedCard.isVisible())
          await acceptedCard.scrollIntoViewIfNeeded()
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `vedelo-proposal-actions-${width}-${theme}.png`
            ),
          })
          assert.doesNotMatch(await publishedCard.innerText(), /черновик/)
          await form
            .getByText('Несохранённое название КП', { exact: true })
            .first()
            .waitFor()
          const publishedToast = page.getByRole('alert').filter({ hasText: 'Предложение опубликовано' }).last()
          if (await publishedToast.isVisible()) await publishedToast.locator('svg').last().click()
          await form
            .getByRole('button', { name: 'Создать предложение', exact: true })
            .click()
          await editor.waitFor()
          await page
            .getByRole('button', { name: 'Закрыть', exact: true })
            .last()
            .click()
          await editor.waitFor({ state: 'hidden' })
          const beforeDelete = await form.locator('.proposal-list-item').count()
          await form
            .locator('.proposal-list-item')
            .filter({ hasText: 'черновик' })
            .getByRole('button', { name: 'Удалить предложение', exact: true })
            .first()
            .click()
          await page
            .getByRole('button', { name: 'Удалить', exact: true })
            .last()
            .click()
          await page
            .getByText('Черновик предложения удалён', { exact: true })
            .waitFor()
          assert.equal(
            await form.locator('.proposal-list-item').count(),
            beforeDelete - 1
          )
          await db.collection('proposals').updateMany({ tenantId, eventId: draftEventId, status: 'published', selectedPackageId: '' }, { $set: { sentAt: new Date() } })
          // Статус без перезагрузки проверен выше; отдельно проверяем вход в просмотр.
          await page.goto('/cabinet/eventsUpcoming')
          const statusEventCard = page.locator('.event-card-shell').filter({ hasText: 'Независимые документы QA' })
          await statusEventCard.getByText('КП принято', { exact: true }).waitFor()
          await statusEventCard.screenshot({ path: path.join(os.tmpdir(), `vedelo-event-proposal-status-${width}-${theme}.png`), animations: 'disabled' })
          await statusEventCard.locator('.card-title').first().click()
          const publishedSection = page.locator('.event-published-proposals')
          await publishedSection.waitFor()
          const viewCard = publishedSection
            .locator('.published-proposal-card')
            .filter({ hasText: 'Несохранённое название КП' })
            .first()
          await viewCard.waitFor()
          await viewCard.getByText('КП отправлено', { exact: true }).waitFor()
          await publishedSection.getByText('КП принято', { exact: true }).first().waitFor()
          assert.doesNotMatch(
            await publishedSection.innerText(),
            /черновик|отозвано/
          )
          await viewCard.scrollIntoViewIfNeeded()
          await page.waitForTimeout(400)
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `vedelo-published-proposal-${width}-${theme}.png`
            ),
          })
          const popupPromise = page.waitForEvent('popup')
          await viewCard
            .getByRole('button', { name: 'Открыть предложение', exact: true })
            .click()
          const popup = await popupPromise
          await popup.waitForURL(/\/proposal\//)
          await popup.goto(`${baseUrl}${new URL(popup.url()).pathname}`)
          await popup.getByAltText('Логотип', { exact: true }).waitFor()
          assert.equal(
            await popup
              .locator('.proposal-page-view')
              .getAttribute('data-theme'),
            'classic'
          )
          await popup.close()
          const templateName = `Шаблон предложения с длинным названием QA ${width} ${theme}`
          const templateResult = await post('/api/proposal-templates', {
            name: templateName,
          })
          assert.equal(templateResult.status, 201)
          await page.goto('/cabinet/documents?section=proposals')
          const sectionHelp = page.getByRole('button', {
            name: 'Подсказка: Коммерческие предложения',
            exact: true,
          })
          await sectionHelp.click()
          const helpPopup = page.getByRole('tooltip')
          await helpPopup.waitFor()
          const helpBox = await helpPopup.boundingBox()
          assert.ok(
            helpBox.x >= 0 && helpBox.x + helpBox.width <= width,
            'Подсказка должна помещаться по ширине экрана'
          )
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `vedelo-field-help-${width}-${theme}.png`
            ),
            animations: 'disabled',
          })
          await page.getByText('Шаблоны предложений', { exact: true }).click()
          await helpPopup.waitFor({ state: 'hidden' })

          const templateCard = page
            .locator('.proposal-template-card')
            .filter({ hasText: templateName })
          await templateCard.waitFor()
          await templateCard.scrollIntoViewIfNeeded()
          const textRect = await templateCard
            .locator(':scope > div')
            .first()
            .boundingBox()
          const editRect = await templateCard
            .getByRole('button', { name: 'Редактировать', exact: true })
            .boundingBox()
          assert.ok(editRect.x >= textRect.x + textRect.width)
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `vedelo-template-card-${width}-${theme}.png`
            ),
          })
          await templateCard
            .getByRole('button', { name: 'Редактировать', exact: true })
            .click()
          await page
            .getByRole('button', { name: 'К списку', exact: true })
            .click()
          page.once('dialog', (dialog) => dialog.accept())
          await templateCard
            .getByRole('button', { name: 'Удалить', exact: true })
            .click()
          await templateCard.waitFor({ state: 'hidden' })
          await page
            .getByRole('button', { name: 'Документы', exact: true })
            .click()
          const documentCard = page.locator('.document-template-card').first()
          await documentCard.waitFor()
          await documentCard.scrollIntoViewIfNeeded()
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `vedelo-document-template-card-${width}-${theme}.png`
            ),
          })
          await documentCard
            .getByRole('button', { name: 'Редактировать', exact: true })
            .click()
          await page
            .getByText('Редактирование шаблона', { exact: true })
            .waitFor()
          await db.collection('tariffs').updateOne({ _id: tariffId }, { $set: { allowProposals: false } })
          await page.goto('/cabinet/documents?section=proposals')
          await page.getByText('Работа с документами', { exact: true }).waitFor()
          assert.equal(await page.getByRole('button', { name: 'Предложения', exact: true }).count(), 0)
          await db.collection('tariffs').updateOne({ _id: tariffId }, { $set: { allowProposals: true } })
        }
        assert.deepEqual(errors, [])
        assert.deepEqual(
          consoleErrors.filter(
            (message) => !message.includes('ERR_CONNECTION_RESET')
          ),
          []
        )
        await context.close()
      }
    } finally {
      await browser.close()
    }
  }
  console.log(
    'Web documents: independent invoice/receipt, tenant/payment isolation, validation, numbering, replay and concurrent retry passed'
  )
}
