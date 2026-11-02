import { proposalPatch } from './proposalPatch'
const initial = { title: 'Согласованное КП', blocks: [{ type: 'contacts', custom: 'keep' }], media: [], packages: [], message: '',
  validUntil: '2026-12-01', appearance: { theme: 'dark', logoUrl: '', logoAlignment: 'right' }, contentRevision: 7 }
it('published metadata edits retain the original revision without rewriting accepted terms', () => {
  expect(proposalPatch({ ...initial, title: 'Новое название' }, JSON.stringify(initial))).toEqual({ title: 'Новое название', contentRevision: 7 })
})
it('clear and appearance changes are explicit and preserve alignment', () => {
  expect(proposalPatch({ ...initial, validUntil: '', appearance: { ...initial.appearance, theme: 'light' } }, JSON.stringify(initial)))
    .toEqual({ contentRevision: 7, validUntil: null, appearance: { theme: 'light', logoUrl: '', logoAlignment: 'right' } })
})
