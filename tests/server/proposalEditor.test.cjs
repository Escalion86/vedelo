const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { loadBindings } = require('next/dist/build/swc')
const { loader, json, chain } = require('./stageFLoader.cjs')
const {
  toProposalEditorBlocks,
  normalizeProposalPackages,
  getVisibleProposalBlocks,
} = require('../../helpers/proposalContent.js')
const tenant = 'a'.repeat(24),
  foreign = 'd'.repeat(24),
  proposalId = 'b'.repeat(24),
  eventId = 'c'.repeat(24),
  templateId = 'e'.repeat(24)

test.before(() => loadBindings())

function fixture() {
  let currentTenant = tenant,
    allowed = true,
    profile = null,
    template,
    proposal
  const filters = [],
    uploads = []
  const model = (name) => ({
    findOne(filter) {
      filters.push([name, filter])
      let value =
        name === 'Events'
          ? { _id: eventId, tenantId: tenant, servicesIds: [], contractSum: 0 }
          : name === 'ProposalTemplates'
            ? template
            : name === 'Proposals'
              ? proposal
              : null
      if (
        (!filter.publicId && filter.tenantId !== tenant) ||
        (filter._id && value && filter._id !== value._id) ||
        (filter.eventId && value && filter.eventId !== value.eventId)
      )
        value = null
      return chain(value)
    },
    find(filter) {
      filters.push([name, filter])
      return chain([])
    },
    exists(filter) {
      filters.push([name, filter])
      return Promise.resolve(filter.tenantId === tenant)
    },
    create(value) {
      const stored = {
        ...value,
        _id: name === 'Proposals' ? proposalId : templateId,
        status: value.status || (name === 'Proposals' ? 'draft' : 'active'),
      }
      if (name === 'Proposals') {
        proposal = stored
        proposal.save = async () => {}
        proposal.toJSON = () =>
          Object.fromEntries(
            Object.entries(stored).filter(
              ([, value]) => typeof value !== 'function'
            )
          )
      } else template = stored
      return Promise.resolve(stored)
    },
    findOneAndUpdate(filter, update) {
      filters.push([name, filter])
      const stored = name === 'ProposalTemplates' ? template : proposal
      if (filter.tenantId !== tenant || !stored || filter._id !== stored._id)
        return Promise.resolve(null)
      Object.assign(stored, update.$set)
      return Promise.resolve(stored)
    },
  })
  const mocks = {
    '@models/Users': { findOne: (filter) => { filters.push(['Users', filter]); return chain(profile) } },
    'next/server': { NextResponse: json },
    '@server/dbConnect': async () => {},
    '@server/pushNotifications': { sendPushToTenant: async () => {} },
    '@server/getRequestContext': async () => ({
      tenantId: currentTenant,
      user: currentTenant ? { _id: currentTenant } : null,
    }),
    '@server/getUserTariffAccess': async () => ({
      allowProposals: allowed,
      user: {
        _id: currentTenant,
        tenantId: currentTenant,
        firstName: 'Иван',
        phone: '+7 900 000 00 00',
        telegram: 'ivan', vk: 'id123', whatsapp: 79000000000,
        password: 'must-not-be-copied',
      },
    }),
    '@server/escalionCloud': {
      uploadFilesToEscalionCloud: async (input) => {
        uploads.push(input)
        return [{ path: `${input.directory}/logo.webp` }]
      },
    },
  }
  for (const name of [
    'Events',
    'Clients',
    'Services',
    'ProposalTemplates',
    'Proposals',
  ])
    mocks[`@models/${name}`] = model(name)
  const load = loader(mocks)
  const req = (body) => ({
    json: async () => body,
    headers: { get: () => null },
    nextUrl: { origin: 'https://example.test' },
  })
  return {
    load,
    req,
    filters,
    uploads,
    setProfile: (value) => { profile = value },
    setTenant: (value) => {
      currentTenant = value
    },
    setAllowed: (value) => {
      allowed = value
    },
    get proposal() {
      return proposal
    },
    get template() {
      return template
    },
  }
}

test('реальные routes: шаблон → КП → PATCH → GET → publish/public; форматирование, legacy и media без потерь', async () => {
  const f = fixture()
  const legacy = [
    { type: 'cover', title: 'Шапка', enabled: true },
    { type: 'packages', title: 'Программы', enabled: true },
    {
      type: 'intro',
      title: 'Здравствуйте',
      contentHtml:
        '<p>{{client.firstName}}</p><img src="https://example.test/a.png">',
      enabled: true,
    },
    {
      type: 'terms',
      title: 'Старые условия',
      text: '{{missing.hidden}}',
      enabled: false,
    },
    {
      type: 'cta',
      title: 'Связаться',
      contentHtml:
        '<p>Пишите</p><video src="https://example.test/a.mp4" controls></video>',
      enabled: true,
    },
  ]
  const blocks = toProposalEditorBlocks(legacy)
  blocks.find((block) => block.type === 'packagesIntro').enabled = false
  blocks.find((block) => block.type === 'packagesIntro').contentHtml = '<p>{{missing.disabledDescription}}</p>'
  blocks.push({ type: 'packagesOutro', enabled: true, contentHtml: '<p><strong>После вариантов: {{artist.fullName}}</strong></p><script>bad()</script>' })
  blocks.find((block) => block.type === 'header').contentHtml =
    '<p style="text-align: center"><span style="color: #123abc; font-family: Georgia; font-size: 24px; position: fixed">{{artist.fullName}}</span></p><img src="https://example.test/a.png">'
  const packages = normalizeProposalPackages([
    {
      id: 'one',
      title: 'Программа',
      total: 0,
      manualTotal: true,
      lines: [
        {
          title: 'Единственная услуга',
          description: 'Сохранить описание',
          price: 5000,
        },
      ],
    },
  ])
  const createdTemplate = await f
    .load('app/api/proposal-templates/route.js')
    .POST(
      f.req({
        name: 'Тестовый',
        blocks,
        defaults: { packages },
        media: [
          {
            id: 'gallery',
            kind: 'image',
            url: 'https://example.test/gallery.png',
          },
        ],
        tenantId: foreign,
      })
    )
  assert.equal(createdTemplate.status, 201)
  assert.equal(createdTemplate.body.data.tenantId, tenant)
  const savedBlocks = createdTemplate.body.data.blocks
  assert.equal(savedBlocks.find((block) => block.type === 'packagesIntro').enabled, false)
  assert.match(savedBlocks.find((block) => block.type === 'packagesIntro').contentHtml, /missing.disabledDescription/)
  assert.doesNotMatch(savedBlocks.find((block) => block.type === 'packagesOutro').contentHtml, /script/)
  assert.doesNotMatch(
    savedBlocks.find((block) => block.type === 'header').contentHtml,
    /position/
  )
  const templateRoute = f.load('app/api/proposal-templates/[id]/route.js')
  const templateResult = await templateRoute.GET(f.req({}), {
    params: { id: templateId },
  })
  assert.equal(templateResult.status, 200)
  assert.deepEqual(templateResult.body.data.blocks, savedBlocks)
  const result = await f
    .load('app/api/events/[id]/proposals/route.js')
    .POST(f.req({ templateId }), { params: { id: eventId } })
  assert.equal(result.status, 201)
  assert.equal(result.body.data.artistSnapshot.vk, 'id123')
  assert.equal(result.body.data.artistSnapshot.whatsapp, '79000000000')
  assert.equal(result.body.data.artistSnapshot.password, undefined)
  assert.deepEqual(result.body.data.blocksSnapshot, savedBlocks)
  assert.deepEqual(result.body.data.packages, packages)
  assert.equal(result.body.data.mediaSnapshot[0].id, 'gallery')
  assert.equal(result.body.data.packages[0].total, 0)
  const proposalRoute = f.load('app/api/proposals/[id]/route.js')
  const patch = await proposalRoute.PATCH(
    f.req({
      blocks: savedBlocks,
      packages,
      appearance: { theme: 'dark' },
      tenantId: foreign,
    }),
    { params: { id: proposalId } }
  )
  assert.equal(patch.status, 200)
  const reread = await proposalRoute.GET(f.req({}), {
    params: { id: proposalId },
  })
  assert.deepEqual(reread.body.data.blocksSnapshot, savedBlocks)
  assert.deepEqual(reread.body.data.packages, packages)
  f.proposal.validUntil = '2030-10-20'
  f.proposal.messageText = 'Ссылка {{proposal.url}}'
  const published = await proposalRoute.PATCH(f.req({ action: 'publish' }), {
    params: { id: proposalId },
  })
  assert.equal(published.status, 200)
  const url = new URL(published.body.data.publicUrl)
  const [, , publicId, token] = url.pathname.split('/')
  const publicRoute = f.load(
    'app/api/public/proposals/[publicId]/[token]/route.js'
  )
  const publicResult = await publicRoute.GET(f.req({}), {
    params: { publicId, token },
  })
  assert.equal(publicResult.status, 200)
  assert.equal(publicResult.body.data.artist.vk, 'id123')
  assert.equal(publicResult.body.data.artist.whatsapp, '79000000000')
  assert.equal(publicResult.body.data.artist.password, undefined)
  const visible = getVisibleProposalBlocks(publicResult.body.data.blocks)
  assert.ok(!visible.some((block) => block.type === 'packagesIntro'))
  assert.match(visible.find((block) => block.type === 'packagesOutro').contentHtml, /После вариантов: Иван/)
  assert.match(visible[0].contentHtml, /Иван/)
  assert.match(visible[0].contentHtml, /font-family: Georgia/)
  assert.match(visible.at(-1).contentHtml, /a.mp4/)
  assert.ok(
    !visible
      .map((block) => block.contentHtml)
      .join('')
      .includes('missing.hidden')
  )
  for (const [name, filter] of f.filters)
    if (name !== 'Users' && (name !== 'Proposals' || !filter.publicId))
      assert.equal(filter.tenantId, tenant)
})

test('tenant-negative на чтение/сохранение КП и шаблона; тариф и авторизация сохранены', async () => {
  const f = fixture()
  await f
    .load('app/api/proposal-templates/route.js')
    .POST(f.req({ name: 'Тест' }))
  await f
    .load('app/api/events/[id]/proposals/route.js')
    .POST(f.req({ templateId }), { params: { id: eventId } })
  const route = f.load('app/api/proposals/[id]/route.js'),
    templates = f.load('app/api/proposal-templates/[id]/route.js')
  f.setTenant(foreign)
  assert.equal(
    (await route.GET(f.req({}), { params: { id: proposalId } })).status,
    404
  )
  assert.equal(
    (
      await route.PATCH(f.req({ blocks: toProposalEditorBlocks() }), {
        params: { id: proposalId },
      })
    ).status,
    404
  )
  assert.equal(
    (
      await templates.PATCH(f.req({ name: 'Подмена' }), {
        params: { id: templateId },
      })
    ).status,
    404
  )
  assert.equal(f.template.name, 'Тест')
  f.setTenant(null)
  assert.equal(
    (await route.GET(f.req({}), { params: { id: proposalId } })).status,
    401
  )
  f.setTenant(tenant)
  f.setAllowed(false)
  assert.equal(
    (await route.PATCH(f.req({}), { params: { id: proposalId } })).status,
    403
  )
})

test('настоящий logo POST + sharp сохраняет альфа-канал; tenant/tariff/draft проверки до cloud', async () => {
  const f = fixture()
  await f
    .load('app/api/events/[id]/proposals/route.js')
    .POST(f.req({}), { params: { id: eventId } })
  const input = await sharp({
    create: {
      width: 800,
      height: 400,
      channels: 4,
      background: { r: 20, g: 60, b: 120, alpha: 0.25 },
    },
  })
    .png()
    .toBuffer()
  const form = new FormData()
  form.set('file', new File([input], 'transparent.png', { type: 'image/png' }))
  const req = { ...f.req({}), formData: async () => form }
  const route = f.load('app/api/proposals/[id]/logo/route.js')
  const result = await route.POST(req, { params: { id: proposalId } })
  assert.equal(result.status, 200)
  const output = Buffer.from(await f.uploads[0].files[0].arrayBuffer())
  const metadata = await sharp(output).metadata()
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.hasAlpha, true)
  assert.equal(metadata.width, 640)
  assert.equal(metadata.height, 320)
  const { data, info } = await sharp(output)
    .raw()
    .toBuffer({ resolveWithObject: true })
  assert.equal(info.channels, 4)
  assert.ok(data[3] >= 62 && data[3] <= 65)
  assert.equal(metadata.exif, undefined)
  f.setTenant(foreign)
  assert.equal(
    (await route.POST(req, { params: { id: proposalId } })).status,
    404
  )
  f.setTenant(tenant)
  f.setAllowed(false)
  assert.equal(
    (await route.POST(req, { params: { id: proposalId } })).status,
    403
  )
  f.setAllowed(true)
  f.proposal.status = 'published'
  assert.equal(
    (await route.POST(req, { params: { id: proposalId } })).status,
    200
  )
  assert.equal(f.uploads.length, 2)
  const versionReq = { ...req, nextUrl: new URL('https://example.test/logo?forNewVersion=1') }
  const source = JSON.stringify(f.proposal)
  assert.equal((await route.POST(versionReq, { params: { id: proposalId } })).status, 200)
  assert.equal(JSON.stringify(f.proposal), source)
  assert.equal(f.uploads.length, 3)
  f.setTenant(foreign)
  assert.equal((await route.POST(versionReq, { params: { id: proposalId } })).status, 404)
  f.setTenant(tenant)
  f.setAllowed(false)
  assert.equal((await route.POST(versionReq, { params: { id: proposalId } })).status, 403)
  assert.equal(f.uploads.length, 3)
})


test('template appearance and Vimeo persist through create, patch, preview and new proposal; foreign logos rejected', async () => {
  const f = fixture()
  const logoUrl = `https://cloud.escalion.ru/uploads/vedelo/${tenant}/proposal-templates/${templateId}/logos/a123/logo.webp`
  const appearance = { theme: 'blue', logoUrl }
  const media = [{ id: 'vimeo', kind: 'video_link', url: 'https://vimeo.com/123456789/abc' }]
  const create = f.load('app/api/proposal-templates/route.js')
  const templates = f.load('app/api/proposal-templates/[id]/route.js')
  assert.equal((await create.POST(f.req({ name: 'Template', appearance, media }))).status, 201)
  assert.deepEqual(f.template.appearance, appearance)
  const patch = await templates.PATCH(f.req({ appearance: { ...appearance, theme: 'dark' } }), { params: { id: templateId } })
  assert.equal(patch.body.data.appearance.theme, 'dark')
  const created = await f.load('app/api/events/[id]/proposals/route.js').POST(f.req({ templateId }), { params: { id: eventId } })
  assert.deepEqual(created.body.data.appearance, { ...appearance, theme: 'dark' })
  assert.equal(created.body.data.mediaSnapshot[0].url, media[0].url)
  const preview = await f.load('app/api/proposal-templates/[id]/preview/route.js').POST(f.req({}), { params: { id: templateId } })
  assert.equal(preview.body.data.appearance.logoUrl, logoUrl)
  await templates.PATCH(f.req({ appearance: { ...appearance, logoUrl: logoUrl.replace(tenant, foreign) } }), { params: { id: templateId } })
  assert.equal(f.template.appearance.logoUrl, '')
})

test('template logo upload checks tenant and tariff before reading file, supports unsaved template', async () => {
  const f = fixture()
  await f.load('app/api/proposal-templates/route.js').POST(f.req({ name: 'Template' }))
  const route = f.load('app/api/proposal-templates/[id]/logo/route.js')
  const bytes = await sharp({ create: { width: 10, height: 20, channels: 4, background: '#ffffff00' } }).png().toBuffer()
  const req = { ...f.req({}), formData: async () => { const form = new FormData(); form.append('file', new File([bytes], 'logo.png', { type: 'image/png' })); return form } }
  assert.equal((await route.POST(req, { params: { id: templateId } })).status, 200)
  assert.equal((await route.POST(req, { params: { id: 'new' } })).status, 200)
  assert.equal(f.uploads.length, 2)
  f.setTenant(foreign)
  assert.equal((await route.POST(req, { params: { id: templateId } })).status, 404)
  f.setTenant(null)
  assert.equal((await route.POST(req, { params: { id: 'new' } })).status, 401)
  f.setTenant(tenant)
  f.setAllowed(false)
  assert.equal((await route.POST(req, { params: { id: 'new' } })).status, 403)
  assert.equal(f.uploads.length, 2)
})


test('контакты профиля не извлекаются из чужого tenant или аккаунта', () => {
  const { getProposalArtistProfile } = fixture().load('server/proposalRequestContext.js')
  const context = { user: { _id: tenant }, tenantId: tenant }
  assert.equal(getProposalArtistProfile(context, { user: { _id: foreign, tenantId: tenant, vk: 'secret' } }), null)
  assert.equal(getProposalArtistProfile(context, { user: { _id: tenant, tenantId: foreign, vk: 'secret' } }), null)
  assert.equal(getProposalArtistProfile(context, { user: { _id: tenant, tenantId: tenant, archive: true, vk: 'secret' } }), null)
})


test('новая версия сохраняется одним POST с правками, исходный снимок и служебные поля не перезаписываются', async () => {
  const f = fixture()
  const route = f.load('app/api/events/[id]/proposals/route.js')
  await route.POST(f.req({}), { params: { id: eventId } })
  const source = f.proposal
  source.status = 'published'
  source.publicId = 'original-public-id'
  source.appliedAt = new Date()
  const before = JSON.stringify(source)
  for (const payload of [{ title: '' }, { validUntil: 'bad-date' }, { appearance: { theme: 'bad' } }, { appearance: { theme: 'dark', logoUrl: `https://cloud.escalion.ru/uploads/vedelo/${foreign}/proposals/${proposalId}/logos/a/logo.webp` } }]) {
    const result = await route.POST(f.req({ sourceProposalId: proposalId, ...payload }), { params: { id: eventId } })
    assert.equal(result.status, 400)
    assert.equal(f.proposal, source, 'валидация до создания записи')
  }
  const result = await route.POST(f.req({
    sourceProposalId: proposalId, title: 'Новые условия', validUntil: '2030-12-31',
    blocks: [{ type: 'closing', enabled: true, contentHtml: '<p>Новый текст</p><script>bad()</script>' }],
    packages: [{ id: 'new', title: 'Новый вариант', manualTotal: true, total: 1234, lines: [] }],
    media: [{ id: 'vimeo', kind: 'video', url: 'https://vimeo.com/12345678' }],
    messageText: 'Новое сообщение', appearance: { theme: 'blue' },
    status: 'published', publicId: 'injected', tenantId: foreign, artistSnapshot: { phone: 'foreign' }, appliedAt: new Date(),
  }), { params: { id: eventId } })
  assert.equal(result.status, 201)
  assert.equal(result.body.data.status, 'draft')
  assert.equal(result.body.data.version, 2)
  assert.equal(result.body.data.title, 'Новые условия')
  assert.equal(result.body.data.packages[0].total, 1234)
  assert.equal(result.body.data.mediaSnapshot[0].id, 'vimeo')
  assert.equal(result.body.data.messageText, 'Новое сообщение')
  assert.equal(result.body.data.appearance.theme, 'blue')
  assert.equal(result.body.data.tenantId, tenant)
  assert.equal(result.body.data.publicId, undefined)
  assert.equal(result.body.data.appliedAt, undefined)
  assert.deepEqual(result.body.data.artistSnapshot, source.artistSnapshot)
  assert.doesNotMatch(JSON.stringify(result.body.data.blocksSnapshot), /script/)
  assert.equal(JSON.stringify(source), before)
})

test('создание версии проверяет исходный tenant, событие, ID и тариф до записи', async () => {
  const f = fixture()
  const route = f.load('app/api/events/[id]/proposals/route.js')
  await route.POST(f.req({}), { params: { id: eventId } })
  const source = f.proposal
  assert.equal((await route.POST(f.req({ sourceProposalId: 'invalid' }), { params: { id: eventId } })).status, 400)
  assert.equal((await route.POST(f.req({ sourceProposalId: foreign }), { params: { id: eventId } })).status, 404)
  source.eventId = foreign
  assert.equal((await route.POST(f.req({ sourceProposalId: proposalId }), { params: { id: eventId } })).status, 404)
  source.eventId = eventId
  f.setTenant(foreign)
  assert.equal((await route.POST(f.req({ sourceProposalId: proposalId }), { params: { id: eventId } })).status, 404)
  f.setTenant(tenant)
  f.setAllowed(false)
  assert.equal((await route.POST(f.req({ sourceProposalId: proposalId }), { params: { id: eventId } })).status, 403)
  assert.equal(f.proposal, source)
})


test('старое КП показывает актуальные соцсети профиля без изменения снимка, удалённые ссылки исчезают', async () => {
  const f = fixture()
  await f.load('app/api/events/[id]/proposals/route.js').POST(f.req({}), { params: { id: eventId } })
  f.proposal.artistSnapshot = { fullName: 'Иван', phone: '+79000000000', telegram: 'obsolete' }
  f.proposal.validUntil = new Date('2030-12-31')
  f.proposal.blocksSnapshot = []
  f.proposal.messageText = 'Предложение'
  f.proposal.clientSnapshot = { firstName: 'Анна' }
  const original = JSON.stringify(f.proposal.artistSnapshot)
  f.setProfile({ _id: tenant, tenantId: tenant, telegram: 'new_name', max: 'https://max.ru/u/new', password: 'secret' })
  const privateRoute = f.load('app/api/proposals/[id]/route.js')
  const details = await privateRoute.GET(f.req({}), { params: { id: proposalId } })
  assert.equal(details.body.data.socialContacts.telegram, 'new_name')
  assert.equal(details.body.data.socialContacts.password, undefined)
  const published = await privateRoute.PATCH(f.req({ action: 'publish' }), { params: { id: proposalId } })
  const parts = new URL(published.body.data.publicUrl).pathname.split('/')
  const params = { publicId: parts.at(-2), token: parts.at(-1) }
  const publicRoute = f.load('app/api/public/proposals/[publicId]/[token]/route.js')
  const read = () => publicRoute.GET(f.req({}), { params })
  const readsBefore = f.filters.filter(([name]) => name === 'Users').length
  assert.equal((await publicRoute.GET(f.req({}), { params: { ...params, token: 'invalid' } })).status, 404)
  assert.equal(f.filters.filter(([name]) => name === 'Users').length, readsBefore)
  const preview = await f.load('app/api/proposals/[id]/preview/route.js').POST(f.req({ socialContacts: { telegram: 'injected' } }), { params: { id: proposalId } })
  assert.equal(preview.body.data.socialContacts.telegram, 'new_name')
  const result = await read()
  assert.equal(result.status, 200)
  assert.equal(result.body.data.socialContacts.telegram, 'new_name')
  assert.equal(result.body.data.socialContacts.max, 'https://max.ru/u/new')
  assert.equal(result.body.data.socialContacts.phone, undefined)
  assert.equal(JSON.stringify(f.proposal.artistSnapshot), original)
  f.setProfile({ _id: tenant, tenantId: tenant, telegram: '', max: '' })
  assert.equal((await read()).body.data.socialContacts.telegram, '')
  for (const profile of [{ _id: foreign, tenantId: tenant }, { _id: tenant, tenantId: foreign }, { _id: tenant, archive: true }, null]) {
    f.setProfile(profile)
    assert.deepEqual((await read()).body.data.socialContacts, {})
  }
  f.setProfile({ _id: tenant, telegram: 'legacy_owner' })
  assert.equal((await read()).body.data.socialContacts.telegram, 'legacy_owner')
  for (const [, filter] of f.filters.filter(([name]) => name === 'Users')) {
    assert.equal(filter._id, tenant)
    assert.deepEqual(filter.$or, [{ tenantId: tenant }, { tenantId: null }])
    assert.deepEqual(filter.archive, { $ne: true })
  }
})


test('изменение срока сохраняет выбор, дату выбора и задачу, в том числе после применения; чужой tenant запрещён', async () => {
  const f = fixture()
  await f.load('app/api/events/[id]/proposals/route.js').POST(f.req({}), { params: { id: eventId } })
  const route = f.load('app/api/proposals/[id]/route.js')
  Object.assign(f.proposal, {
    status: 'published', blocksSnapshot: [], messageText: 'Предложение',
    clientSnapshot: { firstName: 'Анна' },
    packages: [{ id: 'main', title: 'Основной', total: 1000, manualTotal: true, lines: [] }],
    validUntil: new Date('2030-12-31'), selectedPackageId: 'main',
    selectedAt: new Date('2026-10-28T10:00:00Z'),
    selectionTaskCreatedAt: new Date('2026-10-28T10:00:00Z'), selectionTaskId: templateId,
    selectionHistory: [{ packageId: 'main' }],
  })
  const selection = () => JSON.stringify({
    id: f.proposal.selectedPackageId, at: f.proposal.selectedAt,
    taskAt: f.proposal.selectionTaskCreatedAt, taskId: f.proposal.selectionTaskId,
    history: f.proposal.selectionHistory,
  })
  const before = selection()
  for (const validUntil of ['2031-01-31', '2030-11-30', null, '2020-01-01']) {
    const revision = f.proposal.contentRevision || 0
    const result = await route.PATCH(f.req({ validUntil, contentRevision: revision }), { params: { id: proposalId } })
    assert.equal(result.status, 200, JSON.stringify(result.body))
    assert.equal(selection(), before)
    assert.equal(f.proposal.validUntil?.toISOString() || null, validUntil ? new Date(validUntil).toISOString() : null)
    assert.equal(f.proposal.contentRevision, revision + 1)
    assert.equal((await route.GET(f.req({}), { params: { id: proposalId } })).body.data.selectedPackageId, 'main')
  }
  f.proposal.appliedAt = new Date()
  f.proposal.appliedPackageId = 'main'
  assert.equal((await route.PATCH(f.req({ validUntil: '2031-02-01' }), { params: { id: proposalId } })).status, 200)
  assert.equal(selection(), before)
  const saved = JSON.stringify(f.proposal)
  assert.equal((await route.PATCH(f.req({ validUntil: 'bad-date' }), { params: { id: proposalId } })).status, 400)
  f.setTenant(foreign)
  assert.equal((await route.PATCH(f.req({ validUntil: '2032-01-01' }), { params: { id: proposalId } })).status, 404)
  assert.equal(JSON.stringify(f.proposal), saved)
})

test('карандаш обновляет опубликованное КП на месте, ссылка/ID/статус сохраняются; устаревшие редакторы и выбор отклоняются', async () => {
  const f = fixture()
  await f.load('app/api/events/[id]/proposals/route.js').POST(f.req({}), { params: { id: eventId } })
  f.proposal.clientSnapshot = { firstName: 'Анна' }
  f.proposal.validUntil = new Date('2030-12-31')
  f.proposal.blocksSnapshot = []
  f.proposal.messageText = 'Предложение'
  const route = f.load('app/api/proposals/[id]/route.js')
  const published = await route.PATCH(f.req({ action: 'publish' }), { params: { id: proposalId } })
  const publicUrl = published.body.data.publicUrl
  const before = f.proposal
  const edited = await route.PATCH(f.req({ title: 'Правка', contentRevision: 0 }), { params: { id: proposalId } })
  assert.equal(edited.status, 200)
  assert.equal(f.proposal, before)
  assert.equal(edited.body.data._id, proposalId)
  assert.equal(edited.body.data.status, 'published')
  assert.equal(edited.body.data.version, 1)
  assert.equal(edited.body.data.publicUrl, publicUrl)
  assert.equal(edited.body.data.title, 'Правка')
  assert.equal(edited.body.data.contentRevision, 1)
  const stale = await route.PATCH(f.req({ title: 'Старая правка', contentRevision: 0 }), { params: { id: proposalId } })
  assert.equal(stale.status, 409)
  assert.equal(f.proposal.title, 'Правка')
  const parts = new URL(publicUrl).pathname.split('/')
  const publicRoute = f.load('app/api/public/proposals/[publicId]/[token]/route.js')
  const params = { publicId: parts.at(-2), token: parts.at(-1) }
  assert.equal((await publicRoute.GET(f.req({}), { params })).body.data.title, 'Правка')
  assert.equal((await publicRoute.POST(f.req({ packageId: 'main', contentRevision: 0 }), { params })).status, 409)
  f.proposal.selectedPackageId = 'main'
  f.proposal.selectedAt = new Date()
  const packages = [{ id: 'main', title: 'Новая цена', total: 7000, manualTotal: true, lines: [] }]
  const priceEdit = await route.PATCH(f.req({ packages, contentRevision: 1 }), { params: { id: proposalId } })
  assert.equal(priceEdit.status, 200)
  assert.equal(f.proposal.selectedPackageId, '')
  assert.equal(f.proposal.selectedAt, null)
  assert.equal(f.proposal.packages[0].total, 7000)
  assert.equal(priceEdit.body.data.publicUrl, publicUrl)
  f.proposal.appliedAt = new Date()
  f.proposal.appliedPackageId = 'main'
  const locked = await route.PATCH(f.req({ packages: [] }), { params: { id: proposalId } })
  assert.equal(locked.status, 409)
  assert.equal(f.proposal.packages[0].total, 7000)
  assert.equal((await route.PATCH(f.req({ title: 'Новое название', media: [] }), { params: { id: proposalId } })).status, 200)
  f.setTenant(foreign)
  assert.equal((await route.PATCH(f.req({ title: 'Чужая правка' }), { params: { id: proposalId } })).status, 404)
  assert.equal(f.proposal.title, 'Новое название')
})
