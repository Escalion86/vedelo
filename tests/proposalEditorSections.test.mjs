import test from 'node:test'
import assert from 'node:assert/strict'
import * as content from '../helpers/proposalContent.js'
import { sanitizeProposalRichText } from '../helpers/proposalRichText.js'

test('RED: совместимый переход в три раздела сохраняет отключённые блоки, заголовки и медиа', () => {
  assert.equal(typeof content.toProposalEditorBlocks, 'function')
  const legacy = [
    { type: 'cover', title: 'Заголовок', enabled: true },
    {
      type: 'intro',
      title: 'Вступление',
      contentHtml:
        '<p>Текст {{client.firstName}}</p><img src="https://example.com/a.png">',
      enabled: true,
    },
    { type: 'packages', title: 'Программы', enabled: true },
    { type: 'terms', title: 'Скрытые условия', text: 'Секрет', enabled: false },
    { type: 'benefits', title: 'Преимущества', items: ['Опыт'], enabled: true },
    {
      type: 'cta',
      title: 'Свяжитесь',
      contentHtml: '<video src="https://example.com/a.mp4" controls></video>',
      enabled: true,
    },
    { type: 'contacts', title: 'Контакты', enabled: false },
  ]
  const migrated = content.toProposalEditorBlocks(legacy)
  assert.deepEqual(content.toProposalEditorBlocks(migrated), migrated)
  for (const block of content.normalizeProposalBlocks(legacy))
    assert.deepEqual(
      migrated.find((item) => item.type === block.type),
      block
    )
  const active = content.getVisibleProposalBlocks(migrated)
  assert.deepEqual(
    active.map((block) => block.type),
    ['header', 'packagesIntro', 'packages', 'closing']
  )
  const html = active.map((block) => block.contentHtml).join('')
  for (const expected of [
    'Заголовок',
    'Вступление',
    '{{client.firstName}}',
    'a.png',
    'Преимущества',
    'Опыт',
    'Свяжитесь',
    'a.mp4',
  ])
    assert.ok(html.includes(expected), expected)
  assert.ok(!html.includes('Секрет'))
  assert.ok(!html.includes('artist.phone'))
  assert.deepEqual(
    content.normalizeProposalBlocks(JSON.parse(JSON.stringify(migrated))),
    migrated
  )
})

test('RED: безопасное оформление сохраняется, произвольные CSS и XSS удаляются', () => {
  const result = sanitizeProposalRichText(
    '<p style="text-align:center;color:#123abc;font-family:Georgia;font-size:24px;position:fixed;background:url(javascript:alert(1))">Текст</p>'
  )
  for (const expected of [
    'text-align: center',
    'color: #123abc',
    'font-family: Georgia',
    'font-size: 24px',
  ])
    assert.ok(result.includes(expected), result)
  assert.ok(!/position|background|javascript/i.test(result))
})

test('новые разделы переживают правки, JSON roundtrip и нормализацию без повторного merge', () => {
  const blocks = content.toProposalEditorBlocks(undefined, {
    fullName: 'Иван',
    phone: '+7 900 000 00 00',
  })
  const header = blocks.find((block) => block.type === 'header')
  const intro = blocks.find((block) => block.type === 'packagesIntro')
  const closing = blocks.find((block) => block.type === 'closing')
  header.contentHtml =
    '<p><span style="font-family: Georgia; font-size: 24px; color: #abcdef">Новая шапка</span></p>'
  intro.contentHtml = '<p style="text-align: center">Выберите программу</p>'
  closing.contentHtml =
    '<p>Единые условия <img src="https://example.com/photo.png"></p>'
  const persisted = content.normalizeProposalBlocks(
    JSON.parse(JSON.stringify(blocks))
  )
  assert.deepEqual(content.toProposalEditorBlocks(persisted), persisted)
  assert.equal(
    content
      .getVisibleProposalBlocks(persisted)
      .filter((block) => block.type === 'intro').length,
    0
  )
  for (const type of ['header', 'packagesIntro', 'closing'])
    assert.equal(
      persisted.find((block) => block.type === type).contentHtml,
      blocks.find((block) => block.type === type).contentHtml
    )
  closing.contentHtml = ''
  assert.equal(
    content
      .toProposalEditorBlocks(blocks)
      .find((block) => block.type === 'closing').contentHtml,
    ''
  )
})

test('архивные и отключённые переменные не мешают публикации новых разделов', () => {
  const blocks = content.toProposalEditorBlocks([
    {
      type: 'intro',
      title: 'Скрыто {{missing.hidden}}',
      enabled: false,
      text: 'Скрытый текст',
    },
    { type: 'terms', title: 'Условия', text: '{{missing.old}}' },
    { type: 'packages', title: 'Цены' },
  ])
  blocks.find((block) => block.type === 'closing').contentHtml =
    '<p>Исправленные условия</p>'
  assert.deepEqual(
    content.getProposalUnknownVariables({
      blocks,
      messageText: '',
      variables: {},
    }),
    []
  )
})

test('CSS/XSS отрицательные: URL, функции, наследование, экранирование, произвольные атрибуты и обход через alt', () => {
  for (const style of [
    'position:fixed;top:0',
    'font-size:9999px',
    'font-size:calc(100px)',
    'color:var(--secret)',
    'color:expression(alert(1))',
    'color:red!important',
    'font-family:evil',
    'font-family:Arial,url(https://evil)',
    'font-family:Arial\\3b position:fixed',
    'background:url(https://evil)',
    'text-align:inherit',
    '--x:red',
    'color:rgb(256,0,0)',
  ]) {
    const clean = sanitizeProposalRichText(
      `<p style="${style}" onclick="alert(1)" data-other="x">Текст</p>`
    )
    assert.equal(clean, '<p>Текст</p>', style)
  }
  const clean = sanitizeProposalRichText(
    '<img src="data:image/png;base64,AAAA" alt="src=https://safe.test/a.png"><video src="blob:https://safe.test/a" title="src=https://safe.test/a"></video><iframe src="https://evil.test"></iframe>'
  )
  assert.equal(clean, '')
  for (const value of ['rgb(255, 0, 170)', '#f0a'])
    assert.ok(
      sanitizeProposalRichText(
        `<span style="color:${value}">Цвет</span>`
      ).includes('style=')
    )
})

test('отключённый новый раздел не возвращает архивный текст при проверке переменных', () => {
  const blocks = content.toProposalEditorBlocks([
    { type: 'terms', title: 'Старое', text: '{{missing.archived}}' },
  ])
  blocks.find((block) => block.type === 'closing').enabled = false
  assert.deepEqual(
    content.getProposalUnknownVariables({
      blocks,
      messageText: '',
      variables: {},
    }),
    []
  )
  assert.ok(
    !content
      .getVisibleProposalBlocks(blocks)
      .some((block) => block.type === 'terms')
  )
})

test('merge legacy сохраняет заданный порядок заголовков, списков и inline media', () => {
  const blocks = content.toProposalEditorBlocks([
    { type: 'packages', title: 'Цены' },
    { type: 'terms', title: 'Сначала условия', contentHtml: '<p>Порядок оплаты</p><img src="https://example.test/terms.png">' },
    { type: 'benefits', title: 'Затем преимущества', items: ['Опыт команды'] },
    { type: 'cta', title: 'Последний призыв', contentHtml: '<video src="https://example.test/final.mp4" controls></video>' },
  ])
  const html = blocks.find(block => block.type === 'closing').contentHtml
  const parts = ['Сначала условия', 'terms.png', 'Затем преимущества', 'Опыт команды', 'Последний призыв', 'final.mp4']
  for (let i = 1; i < parts.length; i++) assert.ok(html.indexOf(parts[i - 1]) < html.indexOf(parts[i]), html)
  assert.equal((html.match(/terms.png/g) || []).length, 1)
  assert.equal((html.match(/final.mp4/g) || []).length, 1)
})
