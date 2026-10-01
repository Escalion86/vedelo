import { confirmPhoneContact } from './phoneContactConfirmation'
import { getCachedEntity } from '../storage/cache'
import { saveLocalEntity } from '../storage/mutations'

jest.mock('../storage/cache', () => ({ getCachedEntity: jest.fn() }))
jest.mock('../storage/mutations', () => ({ saveLocalEntity: jest.fn() }))
const client = { _id: 'local-client', phone: '79991234567' }
beforeEach(() => { jest.clearAllMocks(); jest.mocked(getCachedEntity).mockResolvedValue(client) })
it.each(['whatsapp', 'telegram', 'max'] as const)('подтверждение %s — только разрешённые поля в outbox', async (provider) => {
  const patch = await confirmPhoneContact(client, provider, '+79991234567', true)
  expect(patch).toEqual({ [`${provider}PhoneUnavailable`]: false, [provider === 'telegram' ? 'telegramPhone' : provider]: provider === 'max' ? '+79991234567' : client.phone })
  expect(saveLocalEntity).toHaveBeenCalledWith({ entityType: 'clients', entityId: client._id, values: patch })
})
it('ответ Нет сохраняет только недоступность, без подмены контакта', async () => {
  expect(await confirmPhoneContact(client, 'max', '+79991234567', false)).toEqual({ maxPhoneUnavailable: true })
})
it.each([null, { ...client, phone: '79997654321' }, { ...client, max: 'https://max.ru/u/new' }])('не восстанавливает удалённого/изменённого клиента', async (current) => {
  jest.mocked(getCachedEntity).mockResolvedValue(current)
  await expect(confirmPhoneContact(client, 'max', '+79991234567', true)).rejects.toThrow('Контакт изменился')
  expect(saveLocalEntity).not.toHaveBeenCalled()
})
