import test from 'node:test'
import assert from 'node:assert/strict'
import { getProposalArtistContactLinks, pickProposalArtistContacts, proposalPhoneNumber } from '../helpers/proposalArtistContacts.mjs'
import { sanitizeProposalRichText } from '../helpers/proposalRichText.js'

test('только заполненные контакты, числовые телефоны и безопасные ссылки', () => {
  assert.deepEqual(getProposalArtistContactLinks({ phone: '79000000000' }), [])
  const links = getProposalArtistContactLinks({ vk: 'https://vk.ru/id123', telegram: '@ivan', instagram: 'https://instagram.com/ivan/', whatsapp: 79000000000, viber: '8 (900) 000-00-00', max: 'https://max.ru/u/ivan' })
  assert.equal(links.length, 6)
  assert.equal(links[0].url, 'https://vk.com/id123')
  assert.equal(links[1].url, 'https://t.me/ivan')
  assert.equal(links[3].url, 'https://wa.me/79000000000')
  assert.equal(links[4].url, 'viber://chat?number=%2B79000000000')
  assert.deepEqual(getProposalArtistContactLinks({ telegram: 'https://evil.test/ivan', vk: 'javascript:alert(1)', instagram: 'https://user:pass@instagram.com/ivan', max: 'https://user:pass@max.ru/u/ivan' }), [])
  assert.equal(pickProposalArtistContacts({ whatsapp: 79000000000, secret: 'hidden' }).whatsapp, '79000000000')
  assert.equal(pickProposalArtistContacts({ secret: 'hidden' }).secret, undefined)
  assert.equal(proposalPhoneNumber('8 (900) 000-00-00'), '79000000000')
})

test('телефон в тексте становится ссылкой без вложенных ссылок и изменения других номеров', () => {
  const html = sanitizeProposalRichText('<p>Телефон: 8 (900) 000-00-00</p><p>79001111111</p><a href="tel:+79000000000">79000000000</a><img src="https://example.test/a.png" alt="79000000000"><script>alert(1)</script>', { phone: '+7 900 000 00 00' })
  assert.match(html, /<a href="tel:\+79000000000">8 \(900\) 000-00-00<\/a>/)
  assert.equal((html.match(/href="tel:/g) || []).length, 2)
  assert.match(html, /<p>79001111111<\/p>/)
  assert.match(html, /alt="79000000000"/)
  assert.doesNotMatch(html, /script|<a[^>]*><a/)
})
