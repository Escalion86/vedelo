import { contactDuplicates, importSelectedContacts } from './contactImport'
let mockClients: any[] = []
const mockSave = jest.fn(async ({ values }) => { const item = { ...values, _id: 'created' }; mockClients.push(item); return item })
jest.mock('../storage/cache', () => ({ listCachedEntities: async () => mockClients }))
jest.mock('../storage/mutations', () => ({ saveLocalEntity: (...args: any[]) => (mockSave as any)(...args) }))
jest.mock('../storage/localEntityIds', () => ({ localEntityIdentity: async () => 'tenant', assertLocalEntityIdentity: async () => {} }))
const contact = { id: 'device-only', name: 'Анна', phones: ['8 (999) 111-22-33', '+7 999 111 22 44'] }
beforeEach(() => { mockClients = []; mockSave.mockClear() })
it('requires primary choice; only confirmed contacts enter the mutation queue', async () => {
  await expect(importSelectedContacts([{ contact, primary: '', keepAdditional: false }])).rejects.toThrow('основной')
  expect(mockSave).not.toHaveBeenCalled()
  await importSelectedContacts([{ contact, primary: contact.phones[0], keepAdditional: true }])
  expect(mockSave).toHaveBeenCalledWith({ entityType: 'clients', values: { firstName: 'Анна', phone: '79991112233', comment: 'Дополнительные телефоны: +7 999 111 22 44' } })
})
it('reopening/repeating a confirmed selection and alternate phones do not create a duplicate', async () => {
  const selection = [{ contact, primary: contact.phones[0], keepAdditional: false }]
  await importSelectedContacts(selection)
  expect((await importSelectedContacts(selection)).duplicates).toEqual(['device-only'])
  expect(mockSave).toHaveBeenCalledTimes(1)
  expect(contactDuplicates(contact, [{ _id: 'other', phone: '79991112244' }])).toHaveLength(1)
})
