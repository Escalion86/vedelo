import { sameOperationPayload } from './operationIdentity'
jest.mock('./localEntityIds', () => ({ resolveLocalEntityId: async (type: string, id: string) => type === 'clients' && id === 'local-client' ? 'server-client' : id }))
it('compares remapped nested references and ignores object insertion order', async () => {
  expect(await sameOperationPayload({ otherContacts: [{ clientId: 'local-client', comment: 'Текст' }], clientId: 'local-client' },
    { clientId: 'server-client', otherContacts: [{ comment: 'Текст', clientId: 'server-client' }] })).toBe(true)
})
it('does not equate changed content or a missing reference with another record', async () => {
  expect(await sameOperationPayload({ clientId: 'local-unknown' }, { clientId: 'server-client' })).toBe(false)
  expect(await sameOperationPayload({ clientId: 'local-client', title: 'First' }, { clientId: 'server-client', title: 'Second' })).toBe(false)
})
