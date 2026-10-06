import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getProposalBlockContentHtml,
  renderProposalRichTextVariables,
  sanitizeProposalRichText,
} from './proposalRichText.js'

test('proposal rich text removes unsafe markup and protocols', () => {
  const result = sanitizeProposalRichText(
    '<p>Текст<script>alert(1)</script><a href="javascript:alert(1)">ссылка</a></p>'
  )
  assert.equal(result.includes('<script'), false)
  assert.equal(result.includes('javascript:'), false)
  assert.equal(result.includes('Текст'), true)
})

test('proposal rich text renders variables as escaped values', () => {
  const result = renderProposalRichTextVariables(
    '<p>Для {{client.firstName}} — {{event.date}}</p>',
    { client: { firstName: '<Анна>' }, event: {} }
  )
  assert.equal(result.html.includes('&lt;Анна&gt;'), true)
  assert.deepEqual(result.unknown, ['event.date'])
})

test('proposal variable tokens survive sanitizing', () => {
  const result = sanitizeProposalRichText(
    '<p><span data-proposal-variable="event.date" data-proposal-variable-label="Дата мероприятия">{{event.date}}</span></p>'
  )
  assert.equal(result.includes('data-proposal-variable="event.date"'), true)
  assert.equal(result.includes('{{event.date}}'), true)
})

test('legacy proposal block text and benefits become rich text', () => {
  assert.equal(
    getProposalBlockContentHtml({ type: 'intro', text: 'Первая\nВторая' }),
    '<p>Первая</p><p>Вторая</p>'
  )
  assert.equal(
    getProposalBlockContentHtml({ type: 'benefits', items: ['Опыт', 'Шоу'] }),
    '<ul><li>Опыт</li><li>Шоу</li></ul>'
  )
})

test('proposal rich text keeps images and videos uploaded to the cloud', () => {
  const directory =
    'https://cloud.escalion.ru/uploads/artistcrm/proposal-templates/1'
  const result = sanitizeProposalRichText(
    `<p><img src="${directory}/photo.jpg" alt="Фото" loading="lazy"></p>` +
      `<p><video src="${directory}/clip.mp4" controls preload="metadata"></video></p>`
  )
  assert.equal(result.includes('<img'), true)
  assert.equal(result.includes('photo.jpg'), true)
  assert.equal(result.includes('<video'), true)
  assert.equal(result.includes('controls'), true)
  assert.equal(result.includes('preload="metadata"'), true)
})

test('proposal rich text drops media without a remote source', () => {
  const result = sanitizeProposalRichText(
    '<p><img src="data:image/png;base64,AAAA"><img src="javascript:alert(1)"><img src="blob:https://x/1"></p><p>Текст</p>'
  )
  assert.equal(result.includes('<img'), false)
  assert.equal(result.includes('data:'), false)
  assert.equal(result.includes('javascript:'), false)
  assert.equal(result.includes('Текст'), true)
})

test('proposal rich text drops a video without a remote source', () => {
  const result = sanitizeProposalRichText(
    '<p><video src="data:video/mp4;base64,AAAA"></video></p>'
  )
  assert.equal(result.includes('<video'), false)
  assert.equal(result.includes('data:'), false)
})
