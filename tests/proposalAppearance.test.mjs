import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeProposalAppearance, isProposalLogoUrl } from '../helpers/proposalAppearance.mjs'
const tenant = '0123456789abcdef01234567'
const url = `https://cloud.escalion.ru/uploads/vedelo/${tenant}/proposals/abcdef0123456789abcdef01/logos/a123-456/logo.webp`
test('legacy proposals keep classic appearance and unsafe themes fall back', () => {
  assert.deepEqual(normalizeProposalAppearance(), { theme: 'classic', logoUrl: '' })
  assert.deepEqual(normalizeProposalAppearance({ theme: 'unknown', logoUrl: 'javascript:alert(1)' }), { theme: 'classic', logoUrl: '' })
  for (const theme of ['classic', 'light', 'blue', 'dark']) assert.equal(normalizeProposalAppearance({ theme }).theme, theme)
})
test('logo references accept owned public branding and reject foreign tenants and URLs', () => {
  assert.equal(isProposalLogoUrl(url, tenant), true)
  for (const candidate of [url.replace(tenant, 'aaaaaaaaaaaaaaaaaaaaaaaa'), url.replace('https:', 'http:'), url.replace('cloud.escalion.ru', 'example.com'), url + '?x=1', url.replace('logo.webp', 'logo.svg'), url.replace('/logos/', '/../')]) assert.equal(isProposalLogoUrl(candidate, tenant), false)
  assert.equal(normalizeProposalAppearance({ theme: 'dark', logoUrl: url }, tenant).logoUrl, url)
})
