jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: { _id: 'test-user', tenantId: 'test-tenant' } }) }))
import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
const mockList = jest.fn(),
  mockRouter = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...a: any[]) => mockRouter(...a) },
  useFocusEffect: (callback: any) =>
    require('react').useEffect(callback, [callback]),
}))
jest.mock('./api', () => ({ proposalsApi: { templates: () => mockList() } }))
let subject: any = {}
try {
  subject = require('./ProposalTemplatesScreen')
} catch (e) {
  if (
    !String((e as any)?.message).includes(
      "Cannot find module './ProposalTemplatesScreen'"
    )
  )
    throw e
}
function draw() {
  expect(subject.ProposalTemplatesScreen).toBeDefined()
  return render(<subject.ProposalTemplatesScreen />)
}
beforeEach(() => mockList.mockReset())
it('read failure offers retry and never claims empty library', async () => {
  mockList.mockRejectedValueOnce(Error('network')).mockResolvedValueOnce([])
  const s = draw()
  await s.findByText('Не удалось загрузить шаблоны.')
  expect(s.queryByText('Пока нет шаблонов')).toBeNull()
  fireEvent.press(s.getByText('Повторить'))
  await s.findByText('Пока нет шаблонов')
})
it('opens separate create and exact template screens', async () => {
  mockList.mockResolvedValue([
    { _id: 't', name: 'Сохранённый', status: 'active' },
  ])
  const s = draw()
  await s.findByText('Сохранённый')
  fireEvent.press(s.getByText('Создать шаблон'))
  expect(mockRouter).toHaveBeenCalledWith('/more/proposal-templates/new')
  fireEvent.press(s.getByText('Сохранённый'))
  expect(mockRouter).toHaveBeenCalledWith('/more/proposal-templates/t')
})
