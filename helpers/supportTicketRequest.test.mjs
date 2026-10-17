import test from 'node:test'
import assert from 'node:assert/strict'
import { sendSupportMessage } from './supportTicketRequest.mjs'

test('only a confirmed persisted ticket and message count as a successful send', async (t) => {
  const form = new FormData()
  form.set('message', 'Reply')
  const saved = { success: true, data: { ticket: { id: 'ticket' }, message: { id: 'message' } } }
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/support-tickets/ticket/messages')
    assert.equal(options.body, form)
    assert.equal(options.method, 'POST')
    return Response.json(saved, { status: 201 })
  })
  assert.deepEqual(await sendSupportMessage('/api/support-tickets/ticket/messages', form), saved)
  for (const response of [
    new Response('<html>Sign in</html>'),
    new Response(''),
    Response.json({ success: false }),
    Response.json({ success: true }),
    Response.json({ success: true, data: { ticket: { id: 'ticket' } } }),
  ]) {
    fetch.mock.mockImplementation(async () => response)
    await assert.rejects(sendSupportMessage('/api/support-tickets/ticket/messages', form), /не подтвердил сохранение/)
    assert.equal(form.get('message'), 'Reply')
  }
  fetch.mock.mockImplementation(async () => Response.json({ success: false, error: { message: 'Нет доступа' } }, { status: 403 }))
  await assert.rejects(sendSupportMessage('/api/support-tickets/ticket/messages', form), /Нет доступа/)
})
