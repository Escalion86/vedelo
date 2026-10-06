import { uploadOnce } from '../profile/uploadOnce'
import { api } from '../../shared/api/client'
import { getAuthSession } from '../../shared/auth/tokenStore'
import * as support from './api'
import { SUPPORT_UNAVAILABLE_MESSAGE } from './userAccess'

jest.mock('../../shared/api/client', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), upload: jest.fn() },
}))
jest.mock('../profile/uploadOnce', () => ({ uploadOnce: jest.fn() }))
jest.mock('../../shared/auth/tokenStore', () => ({ getAuthSession: jest.fn() }))

const sessionMock = getAuthSession as jest.Mock
const image = { uri: 'file:///test.jpg', name: 'test.jpg', mimeType: 'image/jpeg', size: 100 }
const operations = [
  ['list', () => support.listSupportTickets()],
  ['detail', () => support.getSupportTicket('other-tenant-ticket')],
  ['create', () => support.createSupportTicket({ category: 'question', title: 'Вопрос', message: 'Текст', images: [image] })],
  ['reply', () => support.replySupportTicket('other-tenant-ticket', 'Ответ', [image])],
  ['read', () => support.markSupportTicketRead('other-tenant-ticket')],
  ['summary', () => support.getSupportUnreadCount()],
] as const

beforeEach(() => jest.resetAllMocks())

it.each(operations)('блокирует %s для developer bearer до сети и не меняет роль', async (_name, run) => {
  const session = Object.freeze({ user: Object.freeze({ role: 'dev', tenantId: 'own-tenant' }) })
  sessionMock.mockResolvedValue(session)
  await expect(run()).rejects.toThrow(SUPPORT_UNAVAILABLE_MESSAGE)
  for (const request of Object.values(api)) expect(request).not.toHaveBeenCalled()
  expect(uploadOnce).not.toHaveBeenCalled()
  expect(session.user.role).toBe('dev')
})

it.each(operations)('блокирует %s до появления авторизованной сессии', async (_name, run) => {
  sessionMock.mockResolvedValue(null)
  await expect(run()).rejects.toThrow('войдите')
  for (const request of Object.values(api)) expect(request).not.toHaveBeenCalled()
})

it.each(['user', 'admin'])('сохраняет личные endpoints, пагинацию и вложения для %s', async (role) => {
  sessionMock.mockResolvedValue({ user: { role, tenantId: 'own-tenant' } })
  await support.listSupportTickets({ status: 'open', category: 'bug', cursor: 'next-page' })
  expect(api.get).toHaveBeenCalledWith('/support-tickets?status=open&category=bug&cursor=next-page&limit=30')
  await support.getSupportTicket('own-ticket', 'older/page')
  expect(api.get).toHaveBeenCalledWith('/support-tickets/own-ticket?cursor=older%2Fpage')
  await support.markSupportTicketRead('own-ticket')
  expect(api.post).toHaveBeenCalledWith('/support-tickets/own-ticket/read')
  await support.getSupportUnreadCount()
  expect(api.get).toHaveBeenCalledWith('/support-tickets/summary')
  const append = jest.spyOn(FormData.prototype, 'append')
  await support.createSupportTicket({ category: 'question', title: 'Тема', message: 'Текст', images: [image] })
  await support.replySupportTicket('own-ticket', 'Ответ', [image])
  const uploads = (uploadOnce as jest.Mock).mock.calls
  expect(uploads.map(([path]) => path)).toEqual(['/support-tickets', '/support-tickets/own-ticket/messages'])
  expect(append.mock.calls).toEqual([
    ['category', 'question'], ['title', 'Тема'], ['message', 'Текст'],
    ['files', { uri: image.uri, name: image.name, type: image.mimeType }],
    ['message', 'Ответ'],
    ['files', { uri: image.uri, name: image.name, type: image.mimeType }],
  ])
  expect(uploads.every(([, form]) => form instanceof FormData)).toBe(true)
  append.mockRestore()
  expect(api.patch).not.toHaveBeenCalled()
  expect(support).not.toHaveProperty('updateSupportTicketStatus')
})

it('повторно проверяет сессию перед ответом после смены аккаунта', async () => {
  sessionMock.mockResolvedValueOnce({ user: { role: 'user' } }).mockResolvedValue({ user: { role: 'dev' } })
  await support.getSupportTicket('own-ticket')
  await expect(support.replySupportTicket('own-ticket', 'Ответ', [])).rejects.toThrow(SUPPORT_UNAVAILABLE_MESSAGE)
  expect(api.get).toHaveBeenCalledTimes(1)
  expect(api.upload).not.toHaveBeenCalled()
  expect(uploadOnce).not.toHaveBeenCalled()
})
