import test from 'node:test'
import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import {
  buildSupportTicketCreationTarget,
  buildSupportNotificationPayload,
  buildSupportReplyTicketUpdate,
  buildSupportTicketAccessQuery,
  buildSupportUnreadQuery,
  isSupportDeveloper,
  serializeSupportTicket,
  validateSupportFiles,
  validateSupportText,
} from './supportTicketCore.js'

test('support access is tenant scoped for users and global only for developer', () => {
  assert.deepEqual(
    buildSupportTicketAccessQuery(
      { tenantId: 'tenant-1', user: { role: 'user' } },
      'ticket-1'
    ),
    { _id: 'ticket-1', tenantId: 'tenant-1' }
  )
  const developer = {
    tenantId: 'developer',
    user: { role: 'dev' },
    session: { user: {} },
  }
  assert.equal(isSupportDeveloper(developer), true)
  assert.deepEqual(buildSupportTicketAccessQuery(developer, 'ticket-1'), {
    _id: 'ticket-1',
  })
  assert.equal(
    isSupportDeveloper({
      ...developer,
      session: { user: { impersonation: { active: true } } },
    }),
    false
  )
})

test('only developer can choose another tenant when creating a support ticket', () => {
  const regularContext = {
    tenantId: 'tenant-1',
    user: { _id: 'user-1', role: 'user', firstName: 'Анна' },
  }
  assert.deepEqual(
    buildSupportTicketCreationTarget({
      context: regularContext,
      targetUser: {
        _id: 'user-2',
        tenantId: 'tenant-2',
        firstName: 'Подменённый пользователь',
      },
    }),
    {
      tenantId: 'tenant-1',
      createdBy: 'user-1',
      createdByLabel: 'Анна',
      actorRole: 'user',
    }
  )

  const developerContext = {
    tenantId: 'developer-tenant',
    user: { _id: 'developer', role: 'dev' },
    session: { user: {} },
  }
  assert.deepEqual(
    buildSupportTicketCreationTarget({
      context: developerContext,
      targetUser: {
        _id: 'user-2',
        tenantId: 'tenant-2',
        firstName: 'Борис',
      },
    }),
    {
      tenantId: 'tenant-2',
      createdBy: 'user-2',
      createdByLabel: 'Борис',
      actorRole: 'developer',
    }
  )
  assert.equal(
    buildSupportTicketCreationTarget({
      context: developerContext,
      targetUser: null,
    }),
    null
  )
})

test('support text validates category and length limits', () => {
  assert.equal(
    validateSupportText({
      title: 'Тема',
      body: 'Сообщение',
      category: 'bug',
      requireTitle: true,
    }).ok,
    true
  )
  assert.equal(
    validateSupportText({
      title: '',
      body: 'Сообщение',
      category: 'bug',
      requireTitle: true,
    }).ok,
    false
  )
  assert.equal(
    validateSupportText({
      title: 'Тема',
      body: 'Сообщение',
      category: 'other',
      requireTitle: true,
    }).ok,
    false
  )
  assert.equal(
    validateSupportText({ body: 'x'.repeat(5001), requireTitle: false }).ok,
    false
  )
})

test('support images verify mime, size and binary signature', async () => {
  const png = new File(
    [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])],
    'screen.png',
    { type: 'image/png' }
  )
  const fakePng = new File([Uint8Array.from([1, 2, 3, 4])], 'fake.png', {
    type: 'image/png',
  })
  assert.equal((await validateSupportFiles([png])).ok, true)
  assert.equal((await validateSupportFiles([fakePng])).ok, false)
  assert.equal(
    (await validateSupportFiles(Array.from({ length: 6 }, () => png))).ok,
    false
  )
})

test('user reply reopens resolved ticket while developer reply does not', () => {
  const now = new Date('2026-08-24T10:00:00.000Z')
  assert.deepEqual(
    buildSupportReplyTicketUpdate({
      actorRole: 'user',
      currentStatus: 'resolved',
      now,
    }),
    {
      lastMessageAt: now,
      lastMessageByRole: 'user',
      userLastReadAt: now,
      status: 'open',
      resolvedAt: null,
    }
  )
  assert.equal(
    'status' in
      buildSupportReplyTicketUpdate({
        actorRole: 'developer',
        currentStatus: 'resolved',
        now,
      }),
    false
  )
})

test('unread state is calculated independently for user and developer', () => {
  const ticket = {
    _id: 'ticket',
    tenantId: 'tenant',
    createdBy: 'user',
    category: 'question',
    title: 'Тема',
    status: 'open',
    lastMessageAt: new Date('2026-08-24T10:00:00.000Z'),
    lastMessageByRole: 'developer',
    userLastReadAt: new Date('2026-08-24T09:00:00.000Z'),
    developerLastReadAt: new Date('2026-08-24T10:00:00.000Z'),
  }
  assert.equal(serializeSupportTicket(ticket, false).unread, true)
  assert.equal(serializeSupportTicket(ticket, true).unread, false)
})

test('support summary query counts only unread messages from the other side', () => {
  const userQuery = buildSupportUnreadQuery({
    tenantId: 'tenant-1',
    user: { role: 'user' },
  })
  assert.equal(userQuery.tenantId, 'tenant-1')
  assert.equal(userQuery.lastMessageByRole, 'developer')
  assert.equal(userQuery.$expr.$lt[0].$ifNull[0], '$userLastReadAt')

  const developerQuery = buildSupportUnreadQuery({
    tenantId: 'developer-tenant',
    user: { role: 'dev' },
    session: { user: {} },
  })
  assert.equal('tenantId' in developerQuery, false)
  assert.equal(developerQuery.lastMessageByRole, 'user')
  assert.equal(developerQuery.$expr.$lt[0].$ifNull[0], '$developerLastReadAt')
})

test('developer reply builds web and mobile push deep links to the ticket', () => {
  const payload = buildSupportNotificationPayload({
    ticket: { _id: 'ticket-42', title: 'Нужна помощь' },
    actorRole: 'developer',
  })

  assert.equal(payload.title, 'Ответ разработчика')
  assert.equal(payload.tag, 'support-ticket-ticket-42')
  assert.deepEqual(payload.data, {
    type: 'support_ticket',
    ticketId: 'ticket-42',
    url: '/cabinet/feedback?ticketId=ticket-42',
    mobileUrl: '/support/ticket-42',
  })
})

test('developer-created ticket has a distinct push title for the user', () => {
  const payload = buildSupportNotificationPayload({
    ticket: { _id: 'ticket-43', title: 'Важная информация' },
    actorRole: 'developer',
    isNewTicket: true,
  })

  assert.equal(payload.title, 'Новое обращение от Ведело')
  assert.equal(payload.body, 'Важная информация')
})
