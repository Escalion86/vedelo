import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { loginWebSmokeUser } from '../web/coreSmoke.mjs'

export async function runAndroidParityHttpSmoke({ baseUrl, db, password, passwordHash }) {
  const [a, b, clientA, clientB, event, tariff, chatA, chatB] = Array.from({ length: 8 }, () => new mongoose.Types.ObjectId())
  const now = new Date()
  await db.collection('tariffs').insertOne({ _id: tariff, title: 'Android parity HTTP', eventsPerMonth: 100, allowTelegramIntegration: true, allowProposals: true, allowCalendarSync: false, allowTelephony: false })
  await db.collection('users').insertMany([a, b].map((id, index) => ({ _id: id, tenantId: id, phone: `7900000099${index}`, password: passwordHash, tariffId: tariff, role: 'user', archive: false, createdAt: now, updatedAt: now })))
  await db.collection('clients').insertMany([{ _id: clientA, tenantId: a, firstName: 'Android A' }, { _id: clientB, tenantId: b, firstName: 'Android B' }])
  await db.collection('events').insertOne({ _id: event, tenantId: a, clientId: clientA, status: 'active', eventDate: new Date(Date.now() + 86400000), additionalEvents: [], syncVersion: 1, createdAt: now, updatedAt: now })
  await db.collection('telegramconversations').insertMany([{ _id: chatA, tenantId: a, clientId: clientA, telegramChatId: 'parity-a', businessConnectionId: 'parity', status: 'open', unreadCount: 2, lastIncomingAt: new Date(0), lastMessageAt: now }, { _id: chatB, tenantId: b, clientId: clientB, telegramChatId: 'parity-b', businessConnectionId: 'parity', status: 'open', unreadCount: 1, lastMessageAt: now }])
  await db.collection('sitesettings').insertOne({ tenantId: a, custom: { telegramBusinessEnabled: true, telegramBusinessBotToken: 'synthetic-token', telegramBusinessConnectionId: 'parity', telegramBusinessStatus: 'connected' } })
  const request = async (path, token, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`${baseUrl}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json() }
  }
  const login = async index => {
    const result = await request('/mobile/v1/auth/login', null, { phone: `7900000099${index}`, password, deviceId: `android-parity-${index}`, platform: 'android' })
    assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.data
  }
  const sessionA = await login(0), sessionB = await login(1), tokenA = sessionA.accessToken, tokenB = sessionB.accessToken
  const webA = await loginWebSmokeUser({ baseUrl, phone: '79000000990', password })
  const workspace = '/mobile/v1/settings/workspace'
  assert.equal((await request(workspace, null)).status, 401)
  const workspaceBefore = await request(workspace, tokenA)
  assert.equal(workspaceBefore.status, 200)
  assert.equal(workspaceBefore.body.data.syncVersion, 1)
  assert.equal((await request(workspace, tokenB)).body.data, null)
  assert.equal((await request(workspace, tokenA, { tenantId: String(b), syncVersion: 1, timeZone: 'Europe/Moscow' }, 'PUT')).status, 400)
  const workspaceSaved = await request(workspace, tokenA, { syncVersion: 1, timeZone: 'Europe/Moscow', defaultEventDurationMinutes: 90, eventFormVariant: 'classic', showColleagueTransferFields: true }, 'PUT')
  assert.equal(workspaceSaved.status, 200, JSON.stringify(workspaceSaved.body))
  assert.equal(workspaceSaved.body.data.syncVersion, 2)
  assert.equal(workspaceSaved.body.data.custom.defaultEventDurationMinutes, 90)
  assert.equal((await request(workspace, tokenA, { syncVersion: 1, timeZone: 'Europe/Samara' }, 'PUT')).status, 409)
  const persistedWorkspace = await db.collection('sitesettings').findOne({ tenantId: a })
  assert.equal(persistedWorkspace.timeZone, 'Europe/Moscow')
  assert.equal(persistedWorkspace.custom.telegramBusinessBotToken, 'synthetic-token')
  assert.equal(persistedWorkspace.custom.eventFormVariant, 'classic')
  assert.equal(persistedWorkspace.custom.showColleagueTransferFields, true)
  const webWorkspace = await (await webA('/api/site')).json()
  assert.equal(webWorkspace.data.custom.defaultEventDurationMinutes, 90)
  const webEdit = await webA('/api/site', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ custom: { defaultEventDurationMinutes: 120 } }),
  })
  assert.equal(webEdit.status, 200, await webEdit.text())
  const reopenedWorkspace = await request(workspace, tokenA)
  assert.equal(reopenedWorkspace.body.data.custom.defaultEventDurationMinutes, 120)
  assert.equal(reopenedWorkspace.body.data.custom.showColleagueTransferFields, true)
  assert.equal(reopenedWorkspace.body.data.timeZone, 'Europe/Moscow')
  await db.collection('users').updateOne({ _id: a }, { $set: { balance: 420, billingStatus: 'active', nextChargeAt: now } })
  await db.collection('payments').insertOne({ tenantId: a, userId: a, source: 'tochka', type: 'topup', purpose: 'balance', status: 'succeeded',
    amount: 420, receiptUrl: 'https://example.test/receipt', paidAt: now, createdAt: now })
  const history = '/billing/history?category=all&limit=30'
  const mobileHistory = await request(history, tokenA)
  assert.deepEqual(mobileHistory.body, await (await webA(`/api${history}`)).json())
  assert.equal(mobileHistory.body.data.account.balance, 420)
  assert.equal(mobileHistory.body.data.items[0].receiptUrl, 'https://example.test/receipt')
  assert.equal((await request(history, tokenB)).body.data.items.length, 0)
  assert.equal((await request('/address/suggest', null, { query: '' })).status, 401)
  assert.equal((await request('/address/suggest', tokenA, { query: '' })).status, 200)
  const checked = '/events/google-sync-checked'
  assert.equal((await request(checked, null)).status, 401)
  assert.equal((await request(checked, tokenA, { eventId: String(event) })).status, 403)
  await db.collection('tariffs').updateOne({ _id: tariff }, { $set: { allowCalendarSync: true } })
  assert.equal((await request(checked, tokenA)).status, 409)
  await db.collection('users').updateMany({ _id: { $in: [a, b] } }, { $set: { googleCalendar: { enabled: true, calendarId: 'primary', refreshToken: 'synthetic-google-refresh' } } })
  await db.collection('events').updateOne({ _id: event }, { $set: { calendarImportChecked: true } })
  const listed = await request(checked, tokenA)
  assert.equal(listed.status, 200, JSON.stringify(listed.body))
  assert.deepEqual(listed.body.data.events.map(item => item._id), [String(event)])
  assert.deepEqual(listed.body, await (await webA(`/api${checked}`)).json())
  assert.equal((await request(checked, tokenB)).body.data.total, 0)
  assert.equal((await request(checked, tokenB, { eventId: String(event), tenantId: String(a) })).status, 404)
  assert.equal((await request(checked, tokenA, { eventId: String(event), connectionKey: 'changed' })).status, 409)
  await db.collection('events').updateOne({ _id: event }, { $unset: { calendarImportChecked: '' } })
  await db.collection('users').updateMany({ _id: { $in: [a, b] } }, { $unset: { googleCalendar: '' } })
  await db.collection('tariffs').updateOne({ _id: tariff }, { $set: { allowCalendarSync: false } })
  // Reading a prior plan is available after tariff expiry and never runs AI.
  const aiPlanId = new mongoose.Types.ObjectId()
  await db.collection('aieditplans').insertOne({ _id: aiPlanId, tenantId: a, userId: a, eventId: event,
    eventSnapshot: { _id: event, eventType: 'Read-only AI review' }, clientName: 'Android A', serviceNames: {},
    completed: [], expiresAt: new Date(Date.now() + 60000), steps: [{ entity: 'event', operation: 'update', id: String(event), before: { eventType: 'Before' }, patch: { eventType: 'After' } }] })
  const aiPlanPath = `/events/ai-edit?planId=${aiPlanId}`
  const readPlan = await request(aiPlanPath, tokenA)
  assert.equal(readPlan.status, 200, JSON.stringify(readPlan.body)); assert.equal(readPlan.body.eventId, String(event)); assert.equal(readPlan.body.done, false)
  assert.equal((await request(aiPlanPath, tokenB)).status, 404)
  assert.equal((await request(aiPlanPath, null)).status, 401)
  assert.equal((await request('/events/ai-edit?planId=invalid', tokenA)).status, 400)
  assert.equal((await request('/events/ai-edit', tokenA, { mode: 'apply', planId: String(aiPlanId) })).status, 403)
  assert.deepEqual((await db.collection('aieditplans').findOne({ _id: aiPlanId })).completed, [])
  assert.equal((await db.collection('events').findOne({ _id: event })).eventType, undefined)
  const assistantPath = '/mobile/v1/events/ai-assistant'
  assert.equal((await request(assistantPath, null, { text: 'Создай заявку' })).status, 401)
  assert.equal((await request(assistantPath, tokenA, { text: 'Создай заявку' })).status, 403)
  await db.collection('tariffs').updateOne({ _id: tariff }, { $set: { allowAi: true } })
  // Foreign ID is rejected before provider calls; body tenant/mode cannot bypass the wrapper.
  assert.equal((await request(assistantPath, tokenB, { text: 'Измени описание', eventId: String(event), tenantId: String(a), mode: 'apply', planId: String(aiPlanId) })).status, 404)
  assert.equal((await request(assistantPath, tokenA, { text: 'Измени описание', eventId: 'invalid' })).status, 400)
  await db.collection('tariffs').updateOne({ _id: tariff }, { $set: { allowAi: false } })
  assert.deepEqual((await db.collection('aieditplans').findOne({ _id: aiPlanId })).completed, [])
  const body = { requestId: randomUUID(), phone: '79991234567', direction: 'incoming', result: 'follow_up', note: 'Ручная заметка', clientId: String(clientA), eventId: String(event), nextContactAt: new Date(Date.now() + 3600000).toISOString() }
  const results = await Promise.all([request('/calls/android', tokenA, body), request('/calls/android', tokenA, body)])
  for (const result of results) { assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.data.durationSec, null); assert.equal(result.body.data.pending, false) }
  assert.equal(results[0].body.data._id, results[1].body.data._id)
  assert.equal((await db.collection('events').findOne({ _id: event })).additionalEvents.length, 1)
  assert.equal((await request('/calls/android', tokenB)).body.data.length, 0)
  assert.equal((await request('/calls/android', tokenB, { ...body, requestId: randomUUID() })).status, 404)
  assert.equal((await request('/calls/android', tokenA, { ...body, durationSec: 0 })).status, 400)
  assert.equal((await request('/calls/android', tokenA)).body.data.length, 1)
  assert.equal((await request('/learning', tokenA, { action: 'known', articleId: 'deposit' })).status, 200)
  assert.deepEqual((await request('/learning', tokenB)).body.data.knownIds, [])
  assert.equal((await request('/mobile/v1/learning', tokenA)).status, 200)
  const [publishedNews, draftNews] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]
  await db.collection('news').insertMany([
    { _id: publishedNews, title: 'Android published news', version: '1', contentHtml: '<p>Safe<img src="https://example.test/image.png" onerror="alert(1)"></p>', items: [], isPublished: true, publishedAt: now, createdAt: now, createdBy: a },
    { _id: draftNews, title: 'Private draft news', items: ['Draft'], isPublished: false, createdAt: now, createdBy: a },
  ])
  const newsA = await request('/mobile/v1/news?all=1', tokenA)
  assert.equal(newsA.status, 200, JSON.stringify(newsA.body))
  const article = newsA.body.data.items.find(item => item._id === String(publishedNews))
  assert.ok(article); assert.ok(!article.contentHtml.includes('onerror')); assert.equal('createdBy' in article, false)
  assert.ok(!newsA.body.data.items.some(item => item._id === String(draftNews)))
  assert.equal((await request('/news/seen', tokenA, { seenAt: now.toISOString() })).status, 200)
  assert.equal((await request('/mobile/v1/news', tokenA)).body.data.lastSeenNewsAt, now.toISOString())
  assert.equal((await request('/mobile/v1/news', tokenB)).body.data.lastSeenNewsAt, null)
  assert.equal((await request('/news/seen', tokenA, { seenAt: now.toISOString(), userId: String(b) })).status, 400)
  const proposalId = new mongoose.Types.ObjectId()
  await db.collection('proposals').insertOne({ _id: proposalId, tenantId: a, eventId: event, title: 'Template source', status: 'published', version: 1, blocksSnapshot: [{ type: 'intro', contentHtml: '<p>Keep this text</p>', enabled: true }], packages: [{ id: 'main', title: 'Package', lines: [], total: 0 }], mediaSnapshot: [], messageText: 'Message', publicTokenHash: 'must-not-be-copied', selectedPackageId: 'main' })
  const templateCount = await db.collection('proposaltemplates').countDocuments({ tenantId: a })
  const draftPath = `/proposals/${proposalId}?view=template-draft`
  const legacyProposal = await request(`/proposals/${proposalId}`, tokenA)
  assert.equal(legacyProposal.status, 200)
  assert.ok(legacyProposal.body.data.editorBlocks.some(block => block.type === 'header' && block.contentHtml.includes('Keep this text')))
  assert.equal((await db.collection('proposals').findOne({ _id: proposalId })).blocksSnapshot[0].type, 'intro')
  const templateDraft = await request(draftPath, tokenA)
  assert.equal(templateDraft.status, 200, JSON.stringify(templateDraft.body))
  assert.equal(templateDraft.body.data.name, 'Template source')
  assert.ok(templateDraft.body.data.blocks.some(block => block.type === 'header' && block.contentHtml.includes('Keep this text')))
  for (const key of ['_id', 'tenantId', 'eventId', 'publicTokenHash', 'selectedPackageId']) assert.equal(templateDraft.body.data[key], undefined)
  assert.equal((await request(draftPath, tokenB)).status, 404)
  assert.equal((await request(draftPath, null)).status, 401)
  assert.equal(await db.collection('proposaltemplates').countDocuments({ tenantId: a }), templateCount)
  assert.equal((await db.collection('proposals').findOne({ _id: proposalId })).status, 'published')
  const legacyTemplateId = new mongoose.Types.ObjectId()
  const legacyBlocks = [{ type: 'intro', contentHtml: '<p>Legacy</p>', enabled: true }]
  await db.collection('proposaltemplates').insertOne({ _id: legacyTemplateId, tenantId: a, name: 'Legacy', status: 'active', blocks: legacyBlocks })
  const legacyTemplatePath = `/proposal-templates/${legacyTemplateId}`
  const legacyTemplate = await request(legacyTemplatePath, tokenA)
  assert.equal(legacyTemplate.body.data.contentRevision, 0)
  assert.ok(legacyTemplate.body.data.editorBlocks.some(block => block.type === 'header' && block.contentHtml.includes('Legacy')))
  const updatedTemplate = await request(legacyTemplatePath, tokenA, { contentRevision: 0, name: 'Legacy renamed' }, 'PATCH')
  assert.equal(updatedTemplate.status, 200, JSON.stringify(updatedTemplate.body))
  assert.equal(updatedTemplate.body.data.contentRevision, 1)
  assert.equal((await request(legacyTemplatePath, tokenA, { contentRevision: 0, name: 'Stale' }, 'PATCH')).status, 409)
  assert.equal((await request(legacyTemplatePath, tokenB, { contentRevision: 1, name: 'Foreign' }, 'PATCH')).status, 404)
  assert.deepEqual((await db.collection('proposaltemplates').findOne({ _id: legacyTemplateId })).blocks, legacyBlocks)
  // Creation retries survive process loss; only synthetic local records are used.
  const createPath = `/mobile/v1/events/${event}/proposals`
  const creationBody = { requestId: randomUUID(), title: 'Durable Android proposal' }
  await db.collection('tariffs').updateOne({ _id: tariff }, { $set: { allowProposals: false } })
  assert.equal((await request(createPath, tokenA, creationBody)).status, 403)
  assert.equal((await request(`${createPath}/cancel`, tokenA, creationBody)).status, 403)
  assert.equal((await request('/mobile/v1/proposal-templates', tokenA, { requestId: randomUUID(), name: 'Forbidden' })).status, 403)
  await db.collection('tariffs').updateOne({ _id: tariff }, { $set: { allowProposals: true } })
  assert.equal((await request(createPath, null, creationBody)).status, 401)
  assert.equal((await request(createPath, tokenB, creationBody)).status, 404)
  assert.equal((await request(`${createPath}/cancel`, tokenB, creationBody)).status, 404)
  const invalidSource = { requestId: randomUUID(), templateId: String(new mongoose.Types.ObjectId()) }
  assert.equal((await request(createPath, tokenA, invalidSource)).status, 404)
  assert.deepEqual((await request(`${createPath}/cancel`, tokenA, invalidSource)).body.data, { state: 'cancelled' })
  assert.equal((await request(createPath, tokenA, invalidSource)).body.error.code, 'creation_cancelled')
  assert.equal((await request(`${createPath}/cancel`, tokenA, invalidSource)).body.error.code, 'creation_cancelled')
  const creates = await Promise.all([request(createPath, tokenA, creationBody), request(createPath, tokenA, creationBody)])
  for (const result of creates) assert.ok([200, 201].includes(result.status), JSON.stringify(result.body))
  const createdId = creates[0].body.data._id
  assert.equal(creates[1].body.data._id, createdId)
  assert.deepEqual((await request(`${createPath}/cancel`, tokenA, creationBody)).body.data, { state: 'created', id: createdId })
  assert.equal(creates[0].body.data.creationRequest, undefined)
  assert.equal(await db.collection('proposals').countDocuments({ _id: new mongoose.Types.ObjectId(createdId) }), 1)
  assert.equal((await request(createPath, tokenA, { ...creationBody, title: 'Changed confirmation' })).status, 409)
  await db.collection('proposals').updateOne({ _id: new mongoose.Types.ObjectId(createdId) }, { $set: { title: 'Later PWA edit' } })
  assert.equal((await request(createPath, tokenA, creationBody)).body.data.title, 'Later PWA edit')
  assert.equal((await request(`/proposals/${createdId}`, tokenB, undefined, 'DELETE')).status, 404)
  assert.equal((await request(`/proposals/${createdId}`, tokenA, undefined, 'DELETE')).status, 200)
  assert.equal((await request(`/proposals/${createdId}`, tokenA)).status, 404)
  assert.equal((await request(createPath, tokenA, creationBody)).status, 410)
  assert.ok(!(await request(`/events/${event}/proposals`, tokenA)).body.data.some(item => item._id === createdId))
  const templateBody = { requestId: randomUUID(), name: 'Durable Android template' }
  const cancelledTemplate = { requestId: randomUUID(), name: '' }
  assert.equal((await request('/mobile/v1/proposal-templates/cancel', null, cancelledTemplate)).status, 401)
  assert.deepEqual((await request('/mobile/v1/proposal-templates/cancel', tokenA, cancelledTemplate)).body.data, { state: 'cancelled' })
  assert.equal((await request('/mobile/v1/proposal-templates', tokenA, cancelledTemplate)).body.error.code, 'creation_cancelled')
  const templatesCreated = await Promise.all([request('/mobile/v1/proposal-templates', tokenA, templateBody), request('/mobile/v1/proposal-templates', tokenA, templateBody)])
  for (const result of templatesCreated) assert.ok([200, 201].includes(result.status), JSON.stringify(result.body))
  const createdTemplateId = templatesCreated[0].body.data._id
  assert.equal(templatesCreated[1].body.data._id, createdTemplateId)
  assert.equal((await request(`/proposal-templates/${createdTemplateId}`, tokenB, undefined, 'DELETE')).status, 404)
  assert.equal((await request(`/proposal-templates/${createdTemplateId}`, tokenA, undefined, 'DELETE')).status, 200)
  assert.equal((await request('/mobile/v1/proposal-templates', tokenA, templateBody)).status, 410)
  assert.ok(!(await request('/proposal-templates', tokenA)).body.data.some(item => item._id === createdTemplateId))
  for (const [collection, id] of [['proposals', createdId], ['proposaltemplates', createdTemplateId]]) {
    const marker = await db.collection(collection).findOne({ _id: new mongoose.Types.ObjectId(id) })
    assert.deepEqual(Object.keys(marker).sort(), ['_id', 'creationDeletedAt', 'creationRequest', 'tenantId'])
  }
  const conversations = await request('/mobile/v1/conversations/telegram', tokenA)
  assert.equal(conversations.status, 200, JSON.stringify(conversations.body))
  assert.deepEqual(conversations.body.data.map(row => row._id), [String(chatA)])
  assert.equal(conversations.body.data[0].canReply, false)
  assert.equal((await request(`/mobile/v1/conversations/telegram/${chatA}/messages`, tokenB)).status, 404)
  assert.equal((await request(`/mobile/v1/conversations/telegram/${chatA}/messages`, tokenA, { text: 'Истёкшее окно' })).status, 400)
  const summary = await request('/clients/messenger-summary', tokenA)
  assert.equal(summary.status, 200, JSON.stringify(summary.body)); assert.equal(summary.body.data.unreadItems[0].clientId, String(clientA))
  assert.equal((await request(`/mobile/v1/conversations/telegram/${chatA}`, tokenA, { markRead: true }, 'PATCH')).body.data.unreadCount, 0)
  const settings = await request('/mobile/v1/integrations/telegram', tokenA)
  assert.equal(settings.status, 200); assert.equal(settings.body.data.configured, true); assert.ok(!JSON.stringify(settings.body).includes('synthetic-token'))
  assert.equal((await request('/mobile/v1/integrations/telegram', tokenA, { action: 'settings', autoCreateClients: true, pushAudience: 'clients' })).status, 200)
  assert.equal((await db.collection('sitesettings').findOne({ tenantId: a })).custom.telegramBusinessPushAudience, 'clients')
  const subscription = { installationId: randomUUID(), deliveryId: randomUUID(), revision: 1, provider: 'expo', pushToken: 'ExpoPushToken[android-parity-test]', applicationId: 'ru.escalion.vedelo.dev', showDetails: false }
  await db.collection('expopushtokens').insertOne({ tenantId: a, deviceId: 'android-parity-0', pushToken: 'ExpoPushToken[legacy-parity-test]', isActive: true })
  assert.equal((await request('/mobile/v1/push/subscription', tokenA, subscription)).status, 200)
  assert.equal((await db.collection('expopushtokens').findOne({ tenantId: a })).isActive, false)
  assert.equal((await request('/mobile/v1/push/subscription', tokenA, { ...subscription, revision: 2 })).status, 200)
  assert.equal((await request('/mobile/v1/push/subscription', tokenA, subscription)).status, 409)
  assert.equal((await request('/mobile/v1/push/subscription', tokenB, undefined, 'DELETE')).status, 200)
  assert.equal((await db.collection('mobilepushsubscriptions').findOne({ tenantId: a })).isActive, true)
  assert.equal((await request('/mobile/v1/push/subscription', tokenA, { ...subscription, revision: 3, tenantId: b })).status, 400)
  // No requests to Yandex: fixture is the verified server-side provider profile.
  await db.collection('sitesettings').updateOne({ tenantId: null }, { $set: { 'socialAuth.yandexEnabled': true } }, { upsert: true })
  const proof = async () => {
    const code = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url')
    await db.collection('yandexauthflows').insertOne({
      kind: 'mobile', hash: createHash('sha256').update(code).digest('hex'),
      mobileChallenge: createHash('sha256').update(verifier).digest('base64url'),
      phone: '79000000990', yandexId: '99123', expiresAt: new Date(Date.now() + 60000),
    })
    return { code, verifier }
  }
  const yandex = await proof()
  assert.equal((await request('/mobile/v1/auth/yandex', null, { ...yandex, verifier: 'x'.repeat(43), action: 'login' })).status, 410)
  assert.equal((await request('/mobile/v1/auth/yandex', tokenB, { ...yandex, action: 'link', tenantId: a, userId: a })).status, 409)
  const signedIn = await request('/mobile/v1/auth/yandex', null, { ...yandex, action: 'login', phone: '79000000991', userId: b, tenantId: b })
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body))
  assert.equal(signedIn.body.data.user._id, String(a))
  assert.equal(signedIn.body.data.user.yandexLinked, true)
  assert.equal((await request('/mobile/v1/auth/yandex', null, { ...yandex, action: 'login' })).status, 410)
  const me = await request('/mobile/v1/auth/me', signedIn.body.data.accessToken)
  assert.equal(me.status, 200); assert.equal(me.body.data.yandexLinked, true)
  assert.equal('yandexId' in me.body.data, false)
  await request('/mobile/v1/auth/logout', null, { refreshToken: sessionA.refreshToken })
  assert.equal((await request('/mobile/v1/auth/yandex', tokenA, { ...await proof(), action: 'link' })).status, 401)
  await request('/mobile/v1/auth/logout', null, { refreshToken: signedIn.body.data.refreshToken })
  assert.equal((await request('/mobile/v1/auth/me', signedIn.body.data.accessToken)).status, 401)
  assert.equal((await request('/mobile/v1/push/subscription', tokenA, { ...subscription, revision: 3 })).status, 401)
  assert.equal((await request('/news/seen', tokenA, { seenAt: now.toISOString() })).status, 401)
  for (const path of ['/calls/android', '/learning', '/mobile/v1/learning', '/mobile/v1/news', '/clients/messenger-summary', '/mobile/v1/conversations/telegram', '/mobile/v1/integrations/telegram']) assert.equal((await request(path, tokenA)).status, 401, path)
}
