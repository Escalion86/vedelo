import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import LearningScreen from '../../../app/more/learning'
const mockMutate = jest.fn(), mockPush = jest.fn()
const mockProgress = { enabled: true, readIds: [] as string[], knownIds: [] as string[], revision: 1 }
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) }, useLocalSearchParams: () => ({}) }))
jest.mock('./useLearning', () => ({
  learningRoute: () => '/more/documents',
  useLearning: () => ({
    catalog: { data: [{ id: 'documents', title: 'Документы', category: 'Работа', summary: 'По шаблону', steps: ['Откройте карточку'], href: '/cabinet/documents', action: 'Открыть документы', access: { available: false, label: 'На другом тарифе' } }] },
    progress: { data: mockProgress }, mutation: { mutate: mockMutate },
  }),
}))
it('material is readable without the paid feature; marks are explicit, and feature navigation remains gated', () => {
  const screen = render(<LearningScreen />)
  expect(mockMutate).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Как это сделать'))
  expect(screen.getByText('1. Откройте карточку')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Открыть документы' }).props.accessibilityState.disabled).toBe(true)
  fireEvent.press(screen.getByText('Отметить прочитанным'))
  expect(mockMutate).toHaveBeenCalledWith({ action: 'read', articleId: 'documents' })
  fireEvent.press(screen.getByText('Отключить советы'))
  expect(mockMutate).toHaveBeenCalledWith({ action: 'preference', enabled: false })
  expect(mockPush).not.toHaveBeenCalled()
})
