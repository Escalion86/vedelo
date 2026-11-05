import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getProposalUnknownVariables,
  renderProposalVariables,
} from './proposalContent.js'
import {
  PROPOSAL_VARIABLE_OPTIONS,
  renderProposalRichTextVariables,
  sanitizeProposalRichText,
} from './proposalRichText.js'
import { buildProposalPreview } from '../server/proposalPreview.mjs'

test('меню предлагает дату словами; обе переменные выводят одну дату в двух форматах', () => {
  assert.ok(
    PROPOSAL_VARIABLE_OPTIONS.some(
      ({ key, label }) => key === 'event.dateLong' && label.includes('словами')
    )
  )
  const variables = { event: { date: '26.12.2026' } }
  assert.deepEqual(
    renderProposalVariables('{{event.date}} / {{event.dateLong}}', variables),
    {
      text: '26.12.2026 / 26 декабря 2026г.',
      unknown: [],
    }
  )
})

test('русские месяцы стоят в родительном падеже, без лишнего пробела перед г.', () => {
  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ]
  months.forEach((month, index) => {
    assert.equal(
      renderProposalVariables('{{event.dateLong}}', {
        event: { date: `01.${String(index + 1).padStart(2, '0')}.2026` },
      }).text,
      `1 ${month} 2026г.`
    )
  })
  assert.equal(
    renderProposalVariables('{{event.dateLong}}', {
      event: { date: '29.02.2028' },
    }).text,
    '29 февраля 2028г.'
  )
})

test('нет даты или дата некорректна — переменная остаётся незаполненной', () => {
  for (const date of [
    undefined,
    null,
    '',
    'bad',
    '31.02.2026',
    '29.02.2025',
    '26.13.2026',
    '<script>bad()</script>',
  ]) {
    const variables = { event: { date } }
    assert.deepEqual(renderProposalVariables('{{event.dateLong}}', variables), {
      text: '{{event.dateLong}}',
      unknown: ['event.dateLong'],
    })
    assert.deepEqual(
      getProposalUnknownVariables({
        blocks: [{ type: 'header', contentHtml: '<p>{{event.dateLong}}</p>' }],
        variables,
      }),
      ['event.dateLong']
    )
  }
})

test('старый снимок КП и шаблонный токен подставляются в rich text и preview без изменения снимка', () => {
  const contentHtml =
    '<p><span data-proposal-variable="event.dateLong" data-proposal-variable-label="Дата мероприятия словами">{{event.dateLong}}</span> / {{event.date}}</p>'
  const proposal = {
    eventSnapshot: { date: '26.12.2026', eventDate: '2026-12-25T23:00:00Z' },
    blocksSnapshot: [{ type: 'header', contentHtml }],
  }
  const original = JSON.stringify(proposal)
  assert.match(
    sanitizeProposalRichText(contentHtml),
    /data-proposal-variable="event.dateLong"/
  )
  const result = renderProposalRichTextVariables(contentHtml, {
    event: proposal.eventSnapshot,
  })
  assert.match(result.html, /26 декабря 2026г\./)
  assert.match(result.html, /26\.12\.2026/)
  assert.deepEqual(result.unknown, [])
  assert.match(
    buildProposalPreview(proposal).blocks[0].contentHtml,
    /26 декабря 2026г\./
  )
  assert.equal(JSON.stringify(proposal), original)
})
