import assert from 'node:assert/strict'

// Запускается только из стенда с временной MongoDB и локальным облачным mock.
export const runAttachmentSmoke = async ({ page, context, viewport }) => {
  const settings = await context.request.post('/api/site', {
    data: {
      custom: { firstRunWizardCompleted: true, firstRunWizardShowToken: null },
    },
  })
  assert.equal(settings.status(), 200)
  const clientsResponse = await context.request.get('/api/clients')
  assert.equal(clientsResponse.status(), 200)
  const client = (await clientsResponse.json()).data[0]
  assert.ok(client?._id)
  const marker = `Проверка вложения ${viewport.width}`
  const created = await context.request.post('/api/events', {
    data: {
      status: 'draft',
      clientId: client._id,
      eventType: marker,
      eventDate: new Date(
        Date.now() + (viewport.width === 390 ? 2 : 1) * 86400_000
      ).toISOString(),
      documents: [
        { id: 'brief-link', type: 'other', url: 'https://example.test/brief' },
      ],
    },
  })
  assert.equal(created.status(), 201, await created.text())
  const event = (await created.json()).data
  const eventPath = `/api/events/${event._id}`
  const uploaded = await context.request.post(`${eventPath}/files`, {
    multipart: {
      uploadId: `smoke-file-${viewport.width}`,
      title: 'Тестовое вложение',
      file: {
        name: 'brief.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Synthetic brief'),
      },
    },
  })
  assert.equal(uploaded.status(), 200, await uploaded.text())
  const readEvent = async () => {
    const response = await context.request.get(eventPath)
    assert.equal(response.status(), 200)
    return (await response.json()).data
  }
  const before = await readEvent()
  const storageKey = before.documents.find((item) => item.file?.storageKey)
    ?.file.storageKey
  assert.ok(storageKey)

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('theme', value), theme)
    await page.goto('/cabinet/eventsUpcoming', {
      waitUntil: 'domcontentloaded',
    })
    await page
      .locator('.event-card-shell')
      .filter({ hasText: marker })
      .getByRole('button', { name: 'Открыть меню действий' })
      .click()
    await page.getByText('Редактирование', { exact: true }).click()
    const form = page.locator('.compact-event-form')
    await form.waitFor({ state: 'visible' })
    await form
      .locator('summary')
      .filter({ hasText: 'Файлы и документы' })
      .click()
    await form
      .getByText('Тестовое вложение', { exact: true })
      .waitFor({ state: 'visible' })
    assert.equal(
      await page
        .locator('body')
        .evaluate((body) => body.classList.contains('theme-dark')),
      theme === 'dark'
    )
    const clientSection = form.locator('details').filter({
      has: page
        .locator('summary')
        .filter({ hasText: 'Клиент и прочие контакты' }),
    })
    await clientSection.locator('summary').click()
    const description = `${marker}: ${theme}`
    await clientSection.locator('textarea').first().fill(description)
    try {
      const [response] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === eventPath &&
            response.request().method() === 'PUT',
          { timeout: 10000 }
        ),
        page.getByRole('button', { name: 'Применить', exact: true }).click(),
      ])
      assert.equal(response.status(), 200)
    } catch (error) {
      throw new Error(
        `${viewport.width}/${theme}: ${error.message}\n${(await page.locator('body').innerText()).slice(-5000)}`
      )
    }
    await form.waitFor({ state: 'hidden' })
    const saved = await readEvent()
    assert.equal(saved.description, description)
    assert.equal(saved.status, 'draft')
    assert.equal(saved.documents.length, 2)
    assert.equal(
      saved.documents.find((item) => item.file?.storageKey)?.file.storageKey,
      storageKey
    )
  }
  console.log(
    `Attachments ${viewport.width}: draft → upload → editor save, light/dark; private file preserved`
  )
}
