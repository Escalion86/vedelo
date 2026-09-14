import assert from 'node:assert/strict'

// Используется только с временной БД HTTP integration runner.
export const runWebCoreSmoke = async ({
  baseUrl,
  password,
  tenantA,
  tenantB,
  phoneA,
  phoneB,
}) => {
  const login = async (phone) => {
    const cookies = new Map()
    const request = async (pathname, options = {}) => {
      const response = await fetch(`${baseUrl}${pathname}`, {
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
        const separator = pair.indexOf('=')
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
      }
      return response
    }
    const csrfResponse = await request('/api/auth/csrf')
    assert.equal(csrfResponse.status, 200)
    const { csrfToken } = await csrfResponse.json()
    const response = await request('/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        phone,
        password,
        csrfToken,
        json: 'true',
        callbackUrl: `${baseUrl}/cabinet/attention`,
      }),
    })
    assert.equal(response.status, 200)
    const session = await (await request('/api/auth/session')).json()
    assert.ok(
      session.user?._id,
      'Credentials login должен создать реальную web-сессию'
    )
    return request
  }

  const userA = await login(phoneA)
  const userB = await login(phoneB)
  const json = async (request, pathname, method = 'GET', body) => {
    const response = await request(pathname, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, body: await response.json() }
  }
  const client = await json(userA, '/api/clients', 'POST', {
    firstName: 'Тестовый клиент smoke',
    phone: '79000000999',
    tenantId: String(tenantB),
  })
  assert.equal(client.status, 201)
  assert.equal(client.body.data.tenantId, String(tenantA))
  const clientId = client.body.data._id
  const start = new Date(Date.now() + 7 * 86400_000).toISOString()
  const end = new Date(Date.now() + 7 * 86400_000 + 3600_000).toISOString()
  const closedCreation = await json(userA, '/api/events', 'POST', {
    status: 'closed',
    eventType: 'Неоплаченное',
    contractSum: 10000,
  })
  assert.equal(closedCreation.status, 409)
  const event = await json(userA, '/api/events', 'POST', {
    status: 'draft',
    eventType: 'Smoke-проверка',
    clientId,
    eventDate: start,
    dateEnd: end,
    contractSum: 10000,
    waitDeposit: true,
    depositExpectedAmount: 3000,
    additionalEvents: [{ title: 'Уточнить детали', date: start, done: false }],
  })
  assert.equal(event.status, 201, JSON.stringify(event.body))
  const eventId = event.body.data._id
  const eventPath = `/api/events/${eventId}`
  assert.equal((await json(userB, eventPath)).status, 404)
  assert.equal(
    (await json(userB, eventPath, 'PUT', { status: 'canceled' })).status,
    404
  )
  assert.equal(
    (
      await json(userA, '/api/transactions', 'POST', {
        eventId,
        type: 'income',
        amount: 3000,
      })
    ).status,
    400
  )
  assert.equal(
    (await json(userA, eventPath, 'PUT', { status: 'active' })).status,
    200
  )
  const prematureClose = await json(userA, eventPath, 'PUT', {
    status: 'closed',
  })
  assert.equal(
    prematureClose.status,
    409,
    'API должен запрещать закрытие неоплаченного мероприятия'
  )

  const pay = (amount, category) =>
    json(userA, '/api/transactions', 'POST', {
      eventId,
      type: 'income',
      amount,
      category,
      paymentMethod: 'transfer',
    })
  assert.equal((await pay(3000, 'deposit')).status, 201)
  assert.equal(
    (await json(userA, eventPath, 'PUT', { status: 'closed' })).status,
    409
  )
  assert.equal((await pay(7000, 'final_payment')).status, 201)
  const noTaxes = await json(userA, eventPath, 'PUT', {
    status: 'closed',
    isByContract: true,
  })
  assert.equal(noTaxes.status, 409)
  assert.match(noTaxes.body.error, /Налоги/)
  assert.equal((await json(userA, eventPath)).body.data.status, 'active')
  assert.equal(
    (
      await json(userA, '/api/transactions', 'POST', {
        eventId,
        type: 'expense',
        category: 'taxes',
        amount: 600,
      })
    ).status,
    201
  )
  const completed = await json(userA, eventPath, 'PUT', {
    additionalEvents: [
      {
        title: 'Уточнить детали',
        date: start,
        done: true,
        doneAt: new Date().toISOString(),
      },
    ],
    status: 'closed',
    isByContract: true,
  })
  assert.equal(completed.status, 200, JSON.stringify(completed.body))
  assert.equal(completed.body.data.status, 'closed')
  const transactions = await json(userA, `/api/transactions?eventId=${eventId}`)
  assert.equal(
    transactions.body.data
      .filter((item) => item.eventId === eventId && item.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0),
    10000
  )
  const otherTransactions = await json(userB, '/api/transactions')
  assert.equal(
    otherTransactions.body.data.some((item) => item.eventId === eventId),
    false
  )

  for (const route of [
    '/cabinet/attention',
    '/cabinet/eventsUpcoming',
    '/cabinet/clients',
  ]) {
    const response = await userA(route)
    assert.equal(response.status, 200, route)
    const html = await response.text()
    assert.match(html, /Кабинет Ведело/)
    assert.doesNotMatch(
      html,
      /NEXT_HTTP_ERROR_FALLBACK;500|Application error: a server-side exception/
    )
  }
}
