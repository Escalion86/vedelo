import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PROPOSAL_MESSAGE,
  normalizeProposalMessage,
  getProposalUnknownVariables,
  normalizeProposalBlocks,
  normalizeProposalMedia,
  normalizeProposalPackages,
  renderProposalVariables,
} from './proposalContent.js'

test('proposal variables render known values and report missing keys', () => {
  const result = renderProposalVariables(
    'Здравствуйте, {{client.firstName}}! {{event.date}} {{missing.value}}',
    { client: { firstName: 'Анна' }, event: { date: '01.09.2026' } }
  )
  assert.equal(result.text, 'Здравствуйте, Анна! 01.09.2026 {{missing.value}}')
  assert.deepEqual(result.unknown, ['missing.value'])
})

test('proposal media accepts safe supported URLs and caps list at ten', () => {
  const source = Array.from({ length: 12 }, (_, index) => ({
    kind: index === 0 ? 'video' : 'image',
    url: `https://cloud.escalion.ru/uploads/${index}.jpg`,
  }))
  source[1].url = 'javascript:alert(1)'
  const result = normalizeProposalMedia(source)
  assert.equal(result.length, 9)
  assert.equal(
    result.some((item) => item.url.startsWith('javascript:')),
    false
  )
})

test('proposal packages normalize lines and calculate total when omitted', () => {
  const [result] = normalizeProposalPackages([
    {
      id: 'base',
      title: 'Базовый',
      lines: [
        { title: 'Выступление', price: 10000 },
        { title: 'Дорога', price: 2000 },
      ],
    },
  ])
  assert.equal(result.total, 12000)
  assert.equal(result.lines.length, 2)
})

test('proposal blocks have unique supported types and unknown variables are collected', () => {
  const blocks = normalizeProposalBlocks([
    {
      type: 'intro',
      title: 'Для {{client.firstName}}',
      contentHtml: '<p>{{event.date}} — {{artist.phone}}</p>',
    },
    { type: 'intro', title: 'Дубликат' },
    { type: 'unknown', title: 'Лишний' },
  ])
  assert.equal(blocks.length, 1)
  assert.equal(
    blocks[0].contentHtml,
    '<p>{{event.date}} — {{artist.phone}}</p>'
  )
  assert.deepEqual(
    getProposalUnknownVariables({
      blocks,
      messageText: '{{proposal.url}} {{artist.fullName}}',
      variables: { client: { firstName: 'Анна' }, proposal: { url: 'url' } },
    }),
    ['artist.fullName', 'event.date', 'artist.phone']
  )
})


test('standard proposal message is neutral and legacy defaults upgrade without replacing custom text', () => {
  const legacy = 'Здравствуйте, {{client.firstName}}! Подготовили предложение для вашего мероприятия: {{proposal.url}}'
  assert.equal(normalizeProposalMessage(legacy), DEFAULT_PROPOSAL_MESSAGE)
  const custom = 'Подготовили предложение лично для вас: {{proposal.url}}'
  assert.equal(normalizeProposalMessage(custom), custom)
  assert.equal(normalizeProposalMessage(''), '')
  assert.equal(renderProposalVariables(normalizeProposalMessage(legacy), {
    client: { firstName: 'Надежда Буренкова' }, proposal: { url: 'https://example.test/proposal' },
  }).text, 'Здравствуйте, Надежда Буренкова! Предложение для вашего мероприятия можете посмотреть по ссылке: https://example.test/proposal')
})
