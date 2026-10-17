const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const mongoose = require('mongoose')
const { createLoader } = require('./loadWithAliases.cjs')

test('support reply survives reload for developer and recipient; foreign tenant is denied', { timeout: 60000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vedelo-support-test-'))
  const probe = net.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const child = spawn(process.env.SUPPORT_TEST_MONGOD || 'mongod', ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet'], { stdio: 'ignore', windowsHide: true })
  const exited = once(child, 'exit')
  try {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/support_test`, { serverSelectionTimeoutMS: 30000 })
    const owner = new mongoose.Types.ObjectId()
    const dev = new mongoose.Types.ObjectId()
    const foreign = new mongoose.Types.ObjectId()
    let context = { tenantId: dev, user: { _id: dev, role: 'dev', firstName: 'Developer' } }
    const core = await import('../../server/supportTicketCore.js')
    const { load } = await createLoader({
      '@server/dbConnect': async () => {},
      '@server/getRequestContext': async () => context,
      '@server/rateLimit': { checkRateLimit: async () => ({ ok: true }) },
      '@server/supportTickets': { ...core, uploadSupportAttachments: async () => [], notifySupportMessage: async () => {} },
    })
    const Tickets = load('models/SupportTickets.js').default
    const Messages = load('models/SupportTicketMessages.js').default
    const reply = load('app/api/support-tickets/[id]/messages/route.js').POST
    const get = load('app/api/support-tickets/[id]/route.js').GET
    const ticket = await Tickets.create({ tenantId: owner, createdBy: owner, title: 'Test', category: 'question' })
    await Messages.create({ tenantId: owner, ticketId: ticket._id, authorId: owner, authorRole: 'user', body: 'Question' })
    const params = { params: Promise.resolve({ id: String(ticket._id) }) }
    const url = `http://localhost/api/support-tickets/${ticket._id}`
    const request = () => {
      const form = new FormData()
      form.set('message', 'Developer reply')
      form.set('tenantId', String(foreign))
      return new Request(`${url}/messages`, { method: 'POST', body: form })
    }
    const sent = await reply(request(), params)
    assert.equal(sent.status, 201)
    const sentBody = await sent.json()
    assert.equal(sentBody.data.message.body, 'Developer reply')
    for (const actor of [context, { tenantId: owner, user: { _id: owner, role: 'user' } }]) {
      context = actor
      const response = await get(new Request(url), params)
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.deepEqual(body.data.messages.map(row => row.body), ['Question', 'Developer reply'])
      assert.equal(body.data.messages[1].id, sentBody.data.message.id)
    }
    context = { tenantId: foreign, user: { _id: foreign, role: 'user' } }
    assert.equal((await get(new Request(url), params)).status, 404)
    assert.equal((await reply(request(), params)).status, 404)
    context = { tenantId: foreign, user: { _id: dev, role: 'dev' }, session: { user: { impersonation: { active: true } } } }
    assert.equal((await get(new Request(url), params)).status, 404)
    assert.equal((await reply(request(), params)).status, 404)
    assert.equal(await Messages.countDocuments({ ticketId: ticket._id }), 2)
  } finally {
    await mongoose.disconnect()
    child.kill()
    await exited
    const target = path.resolve(directory)
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('vedelo-support-test-'))
    await fs.rm(target, { recursive: true, force: true })
  }
})
