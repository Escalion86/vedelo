import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { Document, Paragraph, Packer } from 'docx'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'

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

  // Current proposal rollout remains dev-only; test it with a synthetic developer.
  await db
    .collection('users')
    .updateOne({ _id: tenantId }, { $set: { role: 'dev' } })
  const removable = await post(`/api/events/${draftEventId}/proposals`, {})
  const foreignProposalId = new mongoose.Types.ObjectId()
  await db.collection('proposals').insertOne({
    _id: foreignProposalId,
    tenantId: new mongoose.Types.ObjectId(),
    eventId: draftEventId,
    status: 'draft',
    title: 'Foreign draft',
  })
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
  const published = await patch(proposalPath, { action: 'publish' })
  assert.equal(published.status, 200, JSON.stringify(published.body))
  assert.equal((await request(proposalPath, { method: 'DELETE' })).status, 409)
  const publicPath = `/api/public${new URL(published.body.data.publicUrl).pathname.replace('/proposal/', '/proposals/')}`
  const selected = await post(publicPath, { packageId: 'basic' })
  assert.equal(selected.status, 200, JSON.stringify(selected.body))
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
        await context.addCookies(
          [...cookies].map(([name, value]) => ({ name, value, url: baseUrl }))
        )
        const page = await context.newPage()
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
          await page
            .locator('.event-card-shell')
            .filter({ hasText: 'Независимые документы QA' })
            .getByRole('button', { name: 'Открыть меню действий' })
            .click()
          await page.getByText('Редактирование', { exact: true }).click()
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
          const documentCardId = await eventDocumentCard.getAttribute(
            'data-document-card'
          )
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
          assert.ok(
            (await editor.locator('.proposal-line-editor').count()) >= 2
          )
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
            .locator('.proposal-line-editor')
            .count()
          await editor
            .getByRole('button', { name: 'Своя позиция', exact: true })
            .first()
            .click()
          const customLine = editor.locator('.proposal-line-editor').last()
          await customLine
            .getByRole('button', { name: /Удалить позицию/ })
            .click()
          assert.equal(
            await editor.locator('.proposal-line-editor').count(),
            countBeforeCustom
          )
          const line = editor.locator('.proposal-line-editor').last()
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
          assert.equal(
            await line
              .getByRole('textbox', { name: /Описание позиции/ })
              .inputValue(),
            'Индивидуальное описание для клиента'
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
          assert.equal(await line.isVisible(), false)
          assert.match(await packageSummary.innerText(), /Позиций:/)
          await packageSummary.focus()
          await page.keyboard.press('Enter')
          assert.equal(
            await line
              .getByRole('textbox', { name: /Описание позиции/ })
              .inputValue(),
            'Индивидуальное описание для клиента'
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
          await line.scrollIntoViewIfNeeded()
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
          await editor
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
          await line.getByRole('combobox').selectOption('')
          assert.equal(
            await line
              .getByRole('textbox', { name: /Описание позиции/ })
              .inputValue(),
            'Индивидуальное описание для клиента'
          )
          await editor
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
          assert.equal(await line.getByRole('combobox').inputValue(), '')
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
          const proposalShot = path.join(
            os.tmpdir(),
            `vedelo-proposal-${width}-${theme}.png`
          )
          await page.screenshot({ path: proposalShot })
          console.log(`Proposal UI screenshot: ${proposalShot}`)
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
          await editor
            .getByRole('button', { name: 'Опубликовать', exact: true })
            .click()
          await editor.waitFor({ state: 'hidden' })
          await form
            .getByText('Несохранённое название КП', { exact: true })
            .first()
            .waitFor()
          await page
            .getByRole('alert')
            .filter({ hasText: 'Предложение опубликовано' })
            .last()
            .locator('svg')
            .last()
            .click()
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
