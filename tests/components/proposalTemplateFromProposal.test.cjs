const test = require('node:test')
const assert = require('node:assert/strict')
const { proposalTemplateFromProposal } = require('../../helpers/proposalTemplateFromProposal.mjs')
const { renderProposalVariables } = require('../../helpers/proposalContent.js')

const source = () => ({
  _id: 'old-proposal', eventId: 'old-event', clientId: 'old-client', tenantId: 'old-tenant',
  templateId: 'old-template', status: 'published', version: 7, validUntil: '2026-01-01',
  publicUrl: 'https://vedelo.ru/old-secret', publicTokenHash: 'old-secret',
  selectedPackageId: 'first', appliedAt: '2026-01-01', selectionTaskId: 'task',
  clientSnapshot: { firstName: 'Старый клиент' }, eventSnapshot: { date: '01.01.2026' },
  title: 'Готовое КП',
  appearance: { logoAlignment: 'center', theme: 'dark', logoUrl: 'https://cloud.escalion.ru/uploads/vedelo/aaaaaaaaaaaaaaaaaaaaaaaa/proposals/bbbbbbbbbbbbbbbbbbbbbbbb/logos/cccccccc-cccc-cccc-cccc-cccccccccccc/logo.webp' },
  blocksSnapshot: [
    { id: 'header', type: 'header', enabled: true, contentHtml: '<p>Здравствуйте, {{client.firstName}}! {{event.date}}</p>' },
    { id: 'packages', type: 'packages', enabled: false, title: 'Варианты' },
    { id: 'closing', type: 'closing', enabled: true, contentHtml: '<p>Индивидуальное условие</p>' },
  ],
  packages: [
    { id: 'first', title: 'Интерактив', description: 'Первый вариант', lines: [{ serviceId: 'dddddddddddddddddddddddd', title: 'Услуга', description: 'Описание', price: 5000 }], total: 4000, manualTotal: true, recommended: true },
    { id: 'second', title: 'Пустой вариант', description: '', lines: [], total: 0, manualTotal: false, recommended: false },
  ],
  mediaSnapshot: [{ id: 'photo', kind: 'image', url: 'https://cloud.escalion.ru/photo.jpg', title: 'Фото' }],
  messageText: '{{client.firstName}} — {{proposal.url}}',
})

test('КП превращается в независимый активный шаблон с ценами, медиа и переменными', () => {
  const proposal = source()
  const before = JSON.stringify(proposal)
  const template = proposalTemplateFromProposal(proposal)
  assert.deepEqual(Object.keys(template).sort(), ['name', 'status', 'appearance', 'blocks', 'defaults', 'media', 'messageTemplate'].sort())
  assert.equal(template.name, 'Готовое КП')
  assert.equal(template.status, 'active')
  assert.deepEqual(template.appearance, proposal.appearance)
  assert.deepEqual(template.defaults.packages, proposal.packages)
  assert.deepEqual(template.defaults.servicesIds, ['dddddddddddddddddddddddd'])
  assert.equal(template.media[0].url, proposal.mediaSnapshot[0].url)
  assert.equal(template.blocks.find(block => block.type === 'packages').enabled, false)
  assert.match(template.blocks.find(block => block.type === 'header').contentHtml, /{{client.firstName}}/)
  assert.equal(template.messageTemplate, proposal.messageText)
  assert.equal(JSON.stringify(proposal), before)
  template.defaults.packages[0].lines[0].price = 100
  template.media[0].url = 'https://example.com/new.jpg'
  template.blocks[0].contentHtml = '<p>Изменено</p>'
  assert.equal(JSON.stringify(proposal), before)
})

test('новое КП подставляет нового клиента и дату; пустое сообщение не заменяется старой ссылкой', () => {
  const proposal = source()
  const template = proposalTemplateFromProposal(proposal)
  const values = { client: { firstName: 'Новая Анна' }, event: { date: '20.12.2026' }, proposal: { url: 'https://vedelo.ru/new-link' } }
  const { renderProposalRichTextVariables: renderHtml } = require('../../helpers/proposalRichText.js')
  const html = renderHtml(template.blocks.find(block => block.type === 'header').contentHtml, values).html
  assert.match(html, /Новая Анна/)
  assert.match(html, /20.12.2026/)
  assert.doesNotMatch(html, /Старый клиент/)
  assert.match(renderProposalVariables(template.messageTemplate, values).text, /new-link/)
  proposal.messageText = ''
  assert.equal(proposalTemplateFromProposal(proposal).messageTemplate, '')
})
