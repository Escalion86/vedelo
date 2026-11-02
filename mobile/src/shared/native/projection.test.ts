import { buildDeviceProjection } from './projection'
it('projects only caller fields, numeric phones and open work; excludes documents and other private CRM content', () => {
  const data = buildDeviceProjection([{ _id: 'c', firstName: 'Имя', phone: 79990000000, telegramPhone: '+79991111111', inn: 'private', documents: [] }], [
    { _id: 'e', clientId: 'c', status: 'draft', eventDate: '2026-10-31T12:00:00Z', description: '<p>Описание</p>',
      additionalEvents: [{ title: 'Позвонить', date: '2026-10-31T10:00:00Z' }, { title: 'Закрыто', done: true }] },
    { _id: 'closed', status: 'closed' }, { _id: 'canceled', status: 'canceled' },
  ], '2026-10-31T09:00:00Z')
  expect(data.clients[0]).toEqual({ id: 'c', name: 'Имя', phones: ['79990000000', '+79991111111'] })
  expect(data.events).toHaveLength(1)
  expect(data.events[0]).toMatchObject({ status: 'draft', tasks: [{ title: 'Позвонить', date: Date.parse('2026-10-31T10:00:00Z') }] })
  expect(data.syncedAt).toBe(Date.parse('2026-10-31T09:00:00Z'))
  expect(JSON.stringify(data)).not.toContain('private')
})
it('does not present local republishing as a successful server sync', () => {
  expect(buildDeviceProjection([], [], null).syncedAt).toBe(0)
  expect(buildDeviceProjection([], [], 'invalid').syncedAt).toBe(0)
})
