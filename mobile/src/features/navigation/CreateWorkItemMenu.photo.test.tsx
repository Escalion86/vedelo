import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { CreateWorkItemMenu } from './CreateWorkItemMenu'
let mockAllow = true, mockOnline = true, mockEntity = 'заказ', mockDeveloper = true
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('../events/useAiDraftAccess', () => ({ useAiDraftAccess: () => ({ allowAi: mockAllow, online: mockOnline, isDeveloper: mockDeveloper }) }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ accusative: mockEntity }) }))
it('non-developer with AI sees voice/text but not photo', () => {
  mockAllow = true; mockOnline = true; mockDeveloper = false
  const screen = render(<CreateWorkItemMenu onSelect={jest.fn()} />)
  expect(screen.queryByText('Из фотографии')).toBeNull()
  expect(screen.getByText('Голосом')).toBeTruthy()
  expect(screen.getByText('Свободным текстом')).toBeTruthy()
})
it.each(['заказ', 'мероприятие'])('photo entry obeys tariff and offline, terminology %s', entity => {
  mockEntity = entity; mockAllow = true; mockOnline = true; mockDeveloper = true
  const select = jest.fn(), screen = render(<CreateWorkItemMenu onSelect={select} />)
  expect(screen.getByText(`Создать ${entity}`)).toBeTruthy()
  fireEvent.press(screen.getByText('Из фотографии')); expect(select).toHaveBeenCalledWith('photo')
  select.mockClear(); mockOnline = false; screen.rerender(<CreateWorkItemMenu onSelect={select} />)
  fireEvent.press(screen.getByText('Из фотографии')); expect(select).not.toHaveBeenCalled()
  mockAllow = false; screen.rerender(<CreateWorkItemMenu onSelect={select} />); expect(screen.queryByText('Из фотографии')).toBeNull()
})
