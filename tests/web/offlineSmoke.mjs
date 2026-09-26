import assert from 'node:assert/strict'

export const runOfflineSmoke = async ({ page, context, viewport }) => {
  const marker = `Offline smoke ${viewport.width}`
  await context.setOffline(true)
  try {
    const queued = await page.evaluate(async (firstName) => {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ firstName }),
      })
      return {
        status: response.status,
        body: await response.json(),
        queue: JSON.parse(localStorage.getItem('artistcrm:server-sync-queue')),
      }
    }, marker)
    assert.equal(queued.status, 202)
    assert.equal(queued.body.queued, true)
    assert.equal(queued.queue.length, 1)
    assert.equal(JSON.parse(queued.queue[0].body).firstName, marker)
  } finally {
    await context.setOffline(false)
  }
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('artistcrm:server-sync-queue') || '[]')
        .length === 0
  )
  const readClients = async () =>
    (await (await context.request.get('/api/clients')).json()).data
  assert.equal(
    (await readClients()).filter((item) => item.firstName === marker).length,
    1
  )
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  assert.equal(
    (await readClients()).filter((item) => item.firstName === marker).length,
    1
  )

  await context.setOffline(true)
  try {
    const failure = await page.evaluate(async () => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key === 'artistcrm:server-sync-queue')
          throw new DOMException('Storage full', 'QuotaExceededError')
        return original.call(this, key, value)
      }
      try {
        await fetch('/api/clients', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ firstName: 'Must not be accepted' }),
        })
        return 'accepted'
      } catch (error) {
        return error.message
      } finally {
        Storage.prototype.setItem = original
      }
    })
    assert.match(failure, /Не удалось сохранить изменение/)
    await page
      .getByText(
        'Не удалось сохранить изменение на устройстве. Не закрывайте форму и повторите сохранение.',
        { exact: true }
      )
      .waitFor()
  } finally {
    await context.setOffline(false)
  }
  console.log(
    `Offline ${viewport.width}: очередь → replay → одна запись; ошибка storage показана пользователю`
  )
  if (viewport.width === 1365) {
    for (const startOffline of [true, false]) {
      const retryMarker = `Lost response ${startOffline ? 'offline' : 'online'}`
      let replayAttempts = 0
      const keys = new Set()
      const handler = async (route) => {
        if (route.request().method() === 'POST') {
          replayAttempts += 1
          keys.add(route.request().headers()['idempotency-key'])
          if (replayAttempts === 1) {
            // Сервер уже создал клиента, но браузер не получил ответ.
            const accepted = await route.fetch()
            assert.equal(accepted.status(), 201)
            return route.abort('connectionreset')
          }
        }
        return route.continue()
      }
      await page.route('**/api/clients', handler)
      try {
        await context.setOffline(startOffline)
        await page.evaluate(async (firstName) => {
          await fetch('/api/clients', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ firstName }),
          })
        }, retryMarker)
        await context.setOffline(false)
        if (startOffline) await page.waitForFunction(() =>
          JSON.parse(
            localStorage.getItem('artistcrm:server-sync-queue') || '[]'
          ).some((item) => item.status === 'failed')
        )
        await page.waitForFunction(
          () =>
            JSON.parse(
              localStorage.getItem('artistcrm:server-sync-queue') || '[]'
            ).length === 0,
          {},
          { timeout: 15000 }
        )
        assert.equal(replayAttempts, 2)
        assert.equal(keys.size, 1)
        assert.ok([...keys][0])
        assert.equal(
          (await readClients()).filter(
            (item) => item.firstName === retryMarker
          ).length,
          1
        )
        console.log(
          `${startOffline ? 'Offline' : 'Online'} retry: ответ после создания потерян; повтор не создал дубль`
        )
      } finally {
        await context.setOffline(false)
        await page.unroute('**/api/clients', handler)
      }
    }
  }
}
