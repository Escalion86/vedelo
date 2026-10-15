import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import {
  getProposalBlockContentHtml,
  renderProposalRichTextVariables,
} from '../../helpers/proposalRichText.js'
import { renderProposalVariables } from '../../helpers/proposalContent.js'
const file = new URL('../../server/proposalPreview.mjs', import.meta.url)
const subject = existsSync(file) ? await import(file.href) : {}
function render(proposal, input = {}) {
  assert.equal(
    typeof subject.buildProposalPreview,
    'function',
    'Приватный безопасный rendered snapshot отсутствует'
  )
  return subject.buildProposalPreview(proposal, input)
}
const source = {
  _id: 'p',
  tenantId: 'a'.repeat(24),
  title: 'КП',
  version: 2,
  status: 'draft',
  blocksSnapshot: [
    {
      id: 'intro',
      type: 'intro',
      title: 'Здравствуйте, {{client.firstName}}',
      contentHtml:
        '<p>{{client.firstName}} <strong>текст</strong></p><img src="https://cloud.escalion.ru/uploads/a.png"><video src="https://cloud.escalion.ru/uploads/a.mp4" controls></video><script>attack()</script>',
      enabled: true,
    },
  ],
  packages: [
    {
      id: 'main',
      title: 'Основной',
      lines: [{ title: 'Снимок', description: 'Текст', price: 50 }],
      total: 50,
      manualTotal: false,
      recommended: true,
    },
  ],
  mediaSnapshot: [
    { id: 'm', kind: 'image', url: 'https://example.invalid/a.png' },
  ],
  clientSnapshot: { firstName: 'Анна <script>attack()</script>' },
  eventSnapshot: { type: 'Праздник' },
  artistSnapshot: { fullName: 'Исполнитель' },
  publicTokenHash: 'synthetic-hidden',
  publicTokenNonce: 'synthetic-hidden',
}
test('private preview uses exact public rich-text variable rendering with safe media', () => {
  const result = render(source)
  const variables = {
    client: source.clientSnapshot,
    event: source.eventSnapshot,
    artist: source.artistSnapshot,
  }
  assert.equal(
    result.blocks[0].title,
    renderProposalVariables(source.blocksSnapshot[0].title, variables).text
  )
  assert.equal(
    result.blocks[0].contentHtml,
    renderProposalRichTextVariables(
      getProposalBlockContentHtml(source.blocksSnapshot[0]),
      variables
    ).html
  )
  assert.match(result.blocks[0].contentHtml, /a\.png/)
  assert.match(result.blocks[0].contentHtml, /a\.mp4/)
  assert.doesNotMatch(result.blocks[0].contentHtml, /<script/)
  assert.equal(result.publicTokenHash, undefined)
  assert.equal(result.tenantId, undefined)
})
test('preview of unsaved title keeps full block/media snapshot without persistence', () => {
  const original = JSON.stringify(source)
  const result = render(source, { title: 'Новый заголовок' })
  assert.equal(result.title, 'Новый заголовок')
  assert.deepEqual(result.media, source.mediaSnapshot)
  assert.equal(JSON.stringify(source), original)
})
test('unsafe draft block does not introduce JS/data/blob in preview', () => {
  const result = render(source, {
    blocks: [
      {
        type: 'intro',
        title: 'Текст',
        contentHtml:
          '<p>До</p><img src="data:image/png;base64,AAAA"><video src="blob:bad"></video><p>После</p>',
      },
    ],
  })
  assert.match(result.blocks[0].contentHtml, /До/)
  assert.match(result.blocks[0].contentHtml, /После/)
  assert.doesNotMatch(result.blocks[0].contentHtml, /data:|blob:|<img|<video/)
})
test('preview сохраняет блокировку реального КП, не принимает её из клиентского input', () => {
  const applied = render({ ...source, selectedPackageId: 'other', appliedPackageId: 'main', appliedAt: '2026-10-01' }, { appliedAt: null, appliedPackageId: '', selectionLocked: false })
  assert.equal(applied.selectionLocked, true)
  assert.equal(applied.appliedPackageId, 'main')
  assert.equal(applied.selectedPackageId, 'other')
  assert.equal(render(source, { selectionLocked: true, appliedPackageId: 'main' }).selectionLocked, false)
})

test('pending из сохранённого КП передаётся без ложного утверждения и без деталей операции', () => {
  const pending = render({ ...source, applyOperation: { id: 'internal' } }, { applicationPending: false })
  assert.equal(pending.applicationPending, true)
  assert.equal(pending.selectionLocked, true)
  assert.equal(pending.appliedPackageId, '')
  assert.equal('applyOperation' in pending, false)
  assert.equal(render(source, { applicationPending: true }).applicationPending, false)
  const confirmed = render({ ...source, applyOperation: { state: 'confirmed' }, appliedAt: '2026-10-01', appliedPackageId: 'main' })
  assert.equal(confirmed.applicationPending, false)
  assert.equal(confirmed.selectionLocked, true)
  assert.equal(confirmed.appliedPackageId, 'main')
})

test('unsaved clear expiry overrides the saved expiry', () => {
  const result = render(
    { ...source, validUntil: '2020-01-01' },
    { validUntil: null }
  )
  assert.equal(result.validUntil, null)
  assert.equal(result.expired, false)
})
