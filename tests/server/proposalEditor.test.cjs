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
        (filter._id && value && filter._id !== value._id)
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
            Object.entries(proposal).filter(
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
  const visible = getVisibleProposalBlocks(publicResult.body.data.blocks)
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
    if (name !== 'Proposals' || !filter.publicId)
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
    409
  )
  assert.equal(f.uploads.length, 1)
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
