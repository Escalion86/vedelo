import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PROPOSAL_MESSAGE,
  buildProposalDefaultLines,
  buildProposalDefaultPackages,
  materializeProposalTemplateDefaults,
  normalizeProposalMessage,
  getProposalUnknownVariables,
  normalizeProposalBlocks,
  normalizeProposalMedia,
  normalizeProposalPackages,
  normalizeProposalTemplateDefaults,
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

test('template defaults keep only unique valid service ids', () => {
  const first = 'a'.repeat(24)
  const second = 'B'.repeat(24)
  assert.deepEqual(
    normalizeProposalTemplateDefaults({
      servicesIds: [first, first, second, 'bad', 42, null, `${first} `],
    }).servicesIds,
    [first, second]
  )
  assert.deepEqual(normalizeProposalTemplateDefaults('junk').servicesIds, [])
  assert.deepEqual(normalizeProposalTemplateDefaults(null).servicesIds, [])
  const many = Array.from({ length: 35 }, (_, index) =>
    index.toString(16).padStart(24, '0')
  )
  assert.equal(
    normalizeProposalTemplateDefaults({ servicesIds: many }).servicesIds.length,
    30
  )
})

test('proposal default lines prefer template services and fall back to event services', () => {
  const showService = { _id: 'a'.repeat(24), title: 'Шоу', price: 5000 }
  const extraService = { _id: 'b'.repeat(24), title: 'Доп', price: 1000 }
  const eventService = { _id: 'c'.repeat(24), title: 'Из заявки', price: 7000 }

  const fromTemplate = buildProposalDefaultLines({
    templateDefaults: { servicesIds: [extraService._id, showService._id] },
    templateServices: [showService, extraService],
    eventServices: [eventService],
  })
  assert.deepEqual(
    fromTemplate.map((line) => line.title),
    ['Доп', 'Шоу']
  )
  assert.equal(fromTemplate[0].serviceId, extraService._id)

  assert.deepEqual(
    buildProposalDefaultLines({
      templateDefaults: { servicesIds: ['f'.repeat(24)] },
      templateServices: [],
      eventServices: [eventService],
    }).map((line) => line.title),
    ['Из заявки']
  )

  assert.deepEqual(
    buildProposalDefaultLines({
      templateDefaults: {},
      templateServices: [showService],
      eventServices: [eventService],
    }).map((line) => line.title),
    ['Из заявки']
  )
})

test('шаблон хранит варианты и выводит из них услуги', () => {
  const first = 'a'.repeat(24)
  const second = 'b'.repeat(24)
  const result = normalizeProposalTemplateDefaults({
    packages: [
      {
        id: 'main',
        title: 'Основной',
        description: 'Полная программа',
        recommended: true,
        manualTotal: true,
        total: 12000,
        lines: [
          { serviceId: first, title: 'Шоу', description: 'Описание', price: 5000 },
          { serviceId: second, title: 'Доп', price: 5000 },
        ],
      },
    ],
    servicesIds: [second],
  })
  assert.equal(result.packages.length, 1)
  assert.equal(result.packages[0].title, 'Основной')
  assert.equal(result.packages[0].description, 'Полная программа')
  assert.equal(result.packages[0].lines.length, 2)
  assert.equal(result.packages[0].total, 12000)
  assert.equal(result.packages[0].manualTotal, true)
  assert.equal(result.packages[0].recommended, true)
  assert.deepEqual(result.servicesIds, [first, second])

  // Шаблон старого формата сохраняется как список услуг без вариантов.
  const legacy = normalizeProposalTemplateDefaults({ servicesIds: [first] })
  assert.deepEqual(legacy.packages, [])
  assert.deepEqual(legacy.servicesIds, [first])
})

test('шаблон старого формата материализуется в вариант с услугами каталога', () => {
  const showService = { _id: 'a'.repeat(24), title: 'Шоу', price: 5000 }
  const result = materializeProposalTemplateDefaults(
    { servicesIds: [showService._id] },
    [showService]
  )
  assert.equal(result.packages.length, 1)
  assert.equal(result.packages[0].title, 'Основной вариант')
  assert.deepEqual(
    result.packages[0].lines.map((line) => line.title),
    ['Шоу']
  )
  assert.equal(result.packages[0].total, 5000)
  assert.equal(result.packages[0].manualTotal, false)
  assert.deepEqual(result.servicesIds, [showService._id])

  // Готовые варианты шаблона не переписываются.
  const ready = materializeProposalTemplateDefaults(
    { packages: [{ title: 'Свой вариант', lines: [] }] },
    [showService]
  )
  assert.equal(ready.packages.length, 1)
  assert.equal(ready.packages[0].title, 'Свой вариант')
})

test('варианты шаблона становятся вариантами предложения', () => {
  const showService = { _id: 'a'.repeat(24), title: 'Шоу', price: 5000 }
  const extraService = { _id: 'b'.repeat(24), title: 'Доп', price: 1000 }
  const eventService = { _id: 'c'.repeat(24), title: 'Из заявки', price: 7000 }

  // Старый формат: один вариант из услуг шаблона, итог — сумма заявки.
  const fromServices = buildProposalDefaultPackages({
    templateDefaults: { servicesIds: [extraService._id, showService._id] },
    templateServices: [showService, extraService],
    eventServices: [eventService],
    eventTotal: 12000,
  })
  assert.equal(fromServices.length, 1)
  assert.deepEqual(
    fromServices[0].lines.map((line) => line.title),
    ['Доп', 'Шоу']
  )
  assert.equal(fromServices[0].total, 12000)
  assert.equal(fromServices[0].manualTotal, true)

  // Новый формат: варианты шаблона переносятся как есть, включая ручной итог.
  const variants = buildProposalDefaultPackages({
    templateDefaults: {
      packages: [
        {
          id: 'main',
          title: 'Вариант А',
          manualTotal: false,
          lines: [{ serviceId: '', title: 'Позиция', price: 3000 }],
        },
        {
          id: 'vip',
          title: 'Вариант Б',
          recommended: true,
          manualTotal: true,
          total: 9000,
          lines: [],
        },
      ],
    },
    eventServices: [eventService],
    eventTotal: 50000,
  })
  assert.deepEqual(
    variants.map((item) => item.title),
    ['Вариант А', 'Вариант Б']
  )
  assert.equal(variants[0].total, 3000)
  assert.equal(variants[1].total, 9000)
  assert.equal(variants[1].recommended, true)

  // Без услуг шаблона вариант собирается из услуг заявки.
  const fromEvent = buildProposalDefaultPackages({
    templateDefaults: {},
    templateServices: [],
    eventServices: [eventService],
    eventTotal: 0,
  })
  assert.deepEqual(
    fromEvent[0].lines.map((line) => line.title),
    ['Из заявки']
  )
  assert.equal(fromEvent[0].total, 7000)
  assert.equal(fromEvent[0].manualTotal, false)
})
