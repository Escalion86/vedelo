import React from 'react'
import { NavigationContext } from '@react-navigation/native'
import { act, fireEvent, render } from '@testing-library/react-native'
import { Modal, ScrollView, TextInput, StyleSheet } from 'react-native'
import { CompactField, Field, PageHeader, SectionTitle } from './components'
import { ThemeProvider } from './ThemeProvider'
import { darkPalette, lightPalette } from './theme'

const longText = 'Длинное объяснение. '.repeat(200)
describe.each(['light', 'dark'] as const)('Подсказки: %s', (mode) => {
  it('открывает, прокручивает и закрывает текст без изменения введённого значения', () => {
    const change = jest.fn()
    const screen = render(<ThemeProvider forcedMode={mode} storage={null}>
      <CompactField label="Запрос" help={longText} value="Введённый запрос" onChangeText={change} />
      <Field label="Сумма" help="Второй текст" value="1200" onChangeText={change} />
    </ThemeProvider>)
    const trigger = screen.getByRole('button', { name: 'Подсказка: Запрос' })
    expect(trigger.props.accessibilityState).toMatchObject({ expanded: false })
    expect(StyleSheet.flatten(trigger.props.style)).toMatchObject({ minWidth: 44, minHeight: 44 })
    fireEvent.press(trigger, { stopPropagation: jest.fn() })
    expect(screen.getByText(longText)).toBeTruthy()
    expect(screen.UNSAFE_getAllByType(ScrollView)).toHaveLength(1)
    expect(screen.getByTestId('field-help-panel')).toHaveStyle({ backgroundColor: (mode === 'dark' ? darkPalette : lightPalette).surface })
    fireEvent.press(screen.getByRole('button', { name: 'Закрыть подсказку' }))
    expect(screen.queryByText(longText)).toBeNull()
    fireEvent.press(trigger)
    fireEvent(screen.UNSAFE_getAllByType(Modal).find((node) => node.props.visible)!, 'requestClose')
    expect(screen.queryByText(longText)).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: 'Подсказка: Сумма' }))
    expect(screen.getByText('Второй текст')).toBeTruthy()
    fireEvent.press(screen.getByTestId('field-help-outside'))
    expect(screen.queryByText('Второй текст')).toBeNull()
    expect(screen.UNSAFE_getAllByType(TextInput).map((node) => node.props.value)).toEqual(['Введённый запрос', '1200'])
    expect(change).not.toHaveBeenCalled()
    screen.unmount()
  })
  it('закрывает окно при потере экраном фокуса даже без размонтирования', () => {
    let blur: (() => void) | undefined
    const remove = jest.fn()
    const navigation = { addListener: jest.fn((_event: string, callback: () => void) => { blur = callback; return remove }) }
    const screen = render(<NavigationContext.Provider value={navigation as any}>
      <ThemeProvider forcedMode={mode} storage={null}><Field label="Поле" help="Не переносить" value="Черновик" /></ThemeProvider>
    </NavigationContext.Provider>)
    fireEvent.press(screen.getByRole('button', { name: 'Подсказка: Поле' }))
    expect(screen.getByText('Не переносить')).toBeTruthy()
    expect(blur).toBeDefined()
    act(() => blur!())
    expect(screen.queryByText('Не переносить')).toBeNull()
    expect(screen.getByDisplayValue('Черновик')).toBeTruthy()
    screen.unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  })
  it('возвращает фокус ввода после закрытия подсказки', async () => {
    const focusedInput = { focus: jest.fn() }
    const focus = jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(focusedInput as any)
    const frames = jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })
    try {
      const screen = render(<ThemeProvider forcedMode={mode} storage={null}><Field label="Поле" help="Текст" value="Черновик" /></ThemeProvider>)
      fireEvent.press(screen.getByRole('button', { name: 'Подсказка: Поле' }))
      fireEvent.press(screen.getByRole('button', { name: 'Закрыть подсказку' }))
      expect(focusedInput.focus).toHaveBeenCalledTimes(1)
    } finally { focus.mockRestore(); frames.mockRestore() }
  })
  it('повторное нажатие на значок закрывает подсказку', () => {
    const screen = render(<ThemeProvider forcedMode={mode} storage={null}><Field label="Поле" help="Текст" value="Исходное" /></ThemeProvider>)
    const trigger = screen.getByRole('button', { name: 'Подсказка: Поле' })
    fireEvent.press(trigger)
    expect(trigger.props.accessibilityState.expanded).toBe(true)
    fireEvent.press(trigger)
    expect(screen.queryByText('Текст')).toBeNull()
    expect(trigger.props.accessibilityState.expanded).toBe(false)
  })
  it('поддерживает заголовки и удаляет открытое окно при уходе с экрана', () => {
    const screen = render(<ThemeProvider forcedMode={mode} storage={null}>
      <PageHeader title="Обзор" help="Объяснение обзора" />
      <SectionTitle help="Объяснение раздела">Раздел</SectionTitle>
    </ThemeProvider>)
    fireEvent.press(screen.getByRole('button', { name: 'Подсказка: Раздел' }))
    expect(screen.getByText('Объяснение раздела')).toBeTruthy()
    screen.rerender(<ThemeProvider forcedMode={mode} storage={null}><PageHeader title="Другой экран" /></ThemeProvider>)
    expect(screen.queryByText('Объяснение раздела')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Закрыть подсказку' })).toBeNull()
  })
})
