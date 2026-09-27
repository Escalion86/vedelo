import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

export const runMessengerNavigationSmoke = async ({ page, viewport }) => {
  const clients = await page.evaluate(async () => {
    const create = async (firstName) => {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, telegram: 'push_navigation_test' }),
      })
      if (!response.ok) throw new Error('Cannot create navigation fixture')
      return (await response.json()).data
    }
    return Promise.all([create('Push target'), create('Push duplicate')])
  })
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('theme', value), theme)
    await page.goto(`/cabinet/clients?openMessenger=${clients[0]._id}`)
    await page.getByText('Диалог с клиентом', { exact: true }).waitFor()
    await page
      .getByText('Переписок с клиентом пока нет.', { exact: true })
      .waitFor()
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click({ trial: true })
    await page.screenshot({
      path: path.join(
        os.tmpdir(),
        `vedelo-messenger-${viewport.width}-${theme}.png`
      ),
    })
    const search = page.getByPlaceholder('Введите имя или телефон')
    assert.equal(await search.inputValue(), 'push_navigation_test')
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
    await page
      .getByText('Диалог с клиентом', { exact: true })
      .waitFor({ state: 'hidden' })
    assert.equal(
      await page.getByText('Push target', { exact: true }).count(),
      1
    )
    assert.equal(
      await page.getByText('Push duplicate', { exact: true }).count(),
      0
    )
    await search.fill('')
    await search.fill('push_navigation_test')
    await page.getByText('Push duplicate', { exact: true }).waitFor()
    assert.ok(!new URL(page.url()).searchParams.has('openMessenger'))
    await search.fill('')
  }
  await page.goto('/cabinet/clients?openMessenger=000000000000000000000000')
  await page.getByText('Клиенты не найдены', { exact: true }).waitFor()
  assert.equal(
    await page.getByText('Диалог с клиентом', { exact: true }).count(),
    0
  )
  await page.getByRole('button', { name: 'Сбросить поиск и фильтр' }).click()
  await page
    .getByPlaceholder('Введите имя или телефон')
    .fill('push_navigation_test')
  await page.getByText('Push target', { exact: true }).waitFor()
  await page.evaluate(async (items) => {
    for (const client of items) {
      await fetch(`/api/clients/${client._id}`, { method: 'DELETE' })
    }
  }, clients)
  console.log(
    `Messenger navigation ${viewport.width}: light/dark, exact client, dialog, reset, unavailable client`
  )
}
