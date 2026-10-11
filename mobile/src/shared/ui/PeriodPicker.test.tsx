import React from 'react'
import { fireEvent, render, within } from '@testing-library/react-native'
import { PeriodPicker } from './PeriodPicker'
import { ThemeProvider } from './ThemeProvider'
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
it('сначала открывает только готовые периоды, календарь по отдельному действию', () => {
  const screen = render(<ThemeProvider storage={null}><PeriodPicker value={{ from: '', to: '' }} onChange={jest.fn()} /></ThemeProvider>)
  fireEvent.press(screen.getByTestId('period-picker-trigger'))
  expect(screen.getByRole('button', { name: 'Последние 7 дней' })).toBeTruthy()
  expect(screen.queryByLabelText('Следующий месяц')).toBeNull()
  expect(screen.queryByLabelText('С даты')).toBeNull()
  fireEvent.press(screen.getByText('Выбрать даты'))
  expect(screen.getByLabelText('Следующий месяц')).toBeTruthy()
  expect(screen.queryByText('Последние 7 дней')).toBeNull()
})

import { act } from '@testing-library/react-native'
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet } from 'react-native'
import { darkPalette, lightPalette } from './theme'
import type { PeriodRange } from './periodPickerDates'
const blank = { from: '', to: '' }
const original = { from: '2026-10-01', to: '2026-10-09' }
function draw(value: PeriodRange = blank, onChange = jest.fn(), props: Partial<React.ComponentProps<typeof PeriodPicker>> = {}, mode: 'light' | 'dark' = 'light') {
  return <ThemeProvider forcedMode={mode} storage={null}><PeriodPicker value={value} onChange={onChange} {...props} /></ThemeProvider>
}
function custom(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByTestId('period-picker-trigger')); fireEvent.press(screen.getByText('Выбрать даты'))
}
function manual(screen: ReturnType<typeof render>) {
  custom(screen); fireEvent.press(screen.getByText('Ввести даты вручную'))
}
beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date(2026, 9, 9, 12)) })
afterEach(() => { act(() => jest.runOnlyPendingTimers()); jest.useRealTimers(); jest.restoreAllMocks() })
it.each(['light', 'dark'] as const)('закрытое поле %s: тема, полный диапазон и доступные состояния', (mode) => {
  const screen = render(draw(original, jest.fn(), {}, mode))
  const palette = mode === 'dark' ? darkPalette : lightPalette
  expect(StyleSheet.flatten(screen.getByText('Период').props.style).color).toBe(palette.generalText)
  expect(screen.getByTestId('period-picker-trigger')).toHaveStyle({ backgroundColor: palette.surface, borderColor: palette.border, minHeight: 40 })
  expect(screen.getByRole('button', { name: 'Период: 1 октября 2026 г. — 9 октября 2026 г.', selected: true, expanded: false })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Сбросить период' })).toBeTruthy()
  expect(screen.queryByText('Выберите период')).toBeNull()
})
it.each([
  ['За всё время', blank], ['Сегодня', { from: '2026-10-09', to: '2026-10-09' }],
  ['Последние 7 дней', { from: '2026-10-03', to: '2026-10-09' }],
  ['Текущий месяц', { from: '2026-10-01', to: '2026-10-31' }],
  ['Прошлый месяц', { from: '2026-09-01', to: '2026-09-30' }],
] as const)('пресет %s сразу и ровно один раз применяет обе границы', (label, expected) => {
  const change = jest.fn(), screen = render(draw(original, change))
  fireEvent.press(screen.getByTestId('period-picker-trigger')); fireEvent.press(screen.getByRole('button', { name: label }))
  expect(change).toHaveBeenCalledTimes(1); expect(change).toHaveBeenCalledWith(expected)
  expect(screen.queryByText('Выберите период')).toBeNull()
})
it('selected пресет и отдельный календарь, ручной шаг без соседних контролов', () => {
  const screen = render(draw({ from: '2026-10-09', to: '2026-10-09' }))
  fireEvent.press(screen.getByTestId('period-picker-trigger')); expect(within(screen.getByTestId('period-picker')).getByRole('button', { name: 'Сегодня', selected: true })).toBeTruthy(); expect(screen.getByText('Сегодня ✓')).toBeTruthy()
  fireEvent.press(screen.getByText('Выбрать даты')); expect(screen.queryByText('Последние 7 дней')).toBeNull()
  expect(screen.queryByLabelText('С даты')).toBeNull(); fireEvent.press(screen.getByText('Ввести даты вручную'))
  expect(screen.getByLabelText('С даты')).toHaveProp('value', '09.10.2026'); expect(screen.queryByLabelText('Следующий месяц')).toBeNull()
  fireEvent.changeText(screen.getByLabelText('С даты'), '03.10.2026'); fireEvent.press(screen.getByText('Выбрать в календаре'))
  expect(screen.queryByLabelText('С даты')).toBeNull(); expect(screen.getByTestId('period-day-2026-10-03')).toHaveProp('accessibilityState', { selected: true, disabled: false })
})
it('календарь применяет диапазон атомарно; дни доступны по полной дате, не только цвет', () => {
  const change = jest.fn(), screen = render(draw(blank, change, { activeDates: new Set(['2026-10-05']) }))
  custom(screen); fireEvent.press(screen.getByRole('button', { name: '3 октября 2026 г.' })); fireEvent.press(screen.getByRole('button', { name: '7 октября 2026 г.' }))
  expect(change).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '5 октября 2026 г.', selected: true })).toHaveProp('accessibilityHint', 'Есть транзакции')
  expect(screen.getByTestId('period-active-2026-10-05', { includeHiddenElements: true })).toBeTruthy(); expect(screen.getByText('5 ✓')).toBeTruthy()
  expect(screen.getByTestId('period-day-2026-10-03')).toHaveProp('accessibilityHint', 'Начало периода')
  expect(screen.getByTestId('period-day-2026-10-07')).toHaveProp('accessibilityHint', 'Конец периода')
  fireEvent.press(screen.getByText('Применить')); expect(change.mock.calls).toEqual([[{ from: '2026-10-03', to: '2026-10-07' }]])
})
it('обратный второй клик сортирует границы без третьего нажатия', () => {
  const change = jest.fn(), screen = render(draw(blank, change)); custom(screen)
  fireEvent.press(screen.getByTestId('period-day-2026-10-09')); fireEvent.press(screen.getByTestId('period-day-2026-10-01'))
  expect(screen.getByText('Выберите начало периода')).toBeTruthy()
  fireEvent.press(screen.getByText('Применить'))
  expect(change.mock.calls).toEqual([[{ from: '2026-10-01', to: '2026-10-09' }]])
})
it.each([
  [{ from: '2026-10-01', to: '2026-10-09' }, '1–9 окт. 2026'],
  [{ from: '2026-09-29', to: '2026-10-02' }, '29 сент. – 2 окт. 2026'],
  [{ from: '2025-12-31', to: '2026-01-02' }, '31.12.2025 – 02.01.2026'],
])('закрытое поле показывает обе границы кратко: %s', (range, caption) => {
  const screen = render(draw(range))
  expect(screen.getByText(caption)).toBeTruthy()
  expect(screen.getByTestId('period-picker-trigger').props.accessibilityLabel).toContain(range.to.slice(0, 4))
})
it('одно нажатие календаря выбирает один включённый день', () => {
  const change = jest.fn(), screen = render(draw(blank, change)); custom(screen)
  fireEvent.press(screen.getByTestId('period-day-2026-10-04')); fireEvent.press(screen.getByText('Применить'))
  expect(change).toHaveBeenCalledWith({ from: '2026-10-04', to: '2026-10-04' })
})
it.each(['Отмена', 'Закрыть выбор периода', 'outside', 'android-back', 'Назад к готовым периодам'])('черновик не применяется: %s', (action) => {
  const change = jest.fn(), screen = render(draw(original, change)); manual(screen)
  fireEvent.changeText(screen.getByLabelText('С даты'), '03.10.2026')
  if (action === 'android-back') fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose')
  else if (action === 'outside') fireEvent.press(screen.getByTestId('period-picker-outside', { includeHiddenElements: true }))
  else fireEvent.press(screen.getByRole('button', { name: action }))
  expect(change).not.toHaveBeenCalled()
  if (action === 'Назад к готовым периодам') fireEvent.press(screen.getByText('Выбрать даты'))
  else custom(screen)
  fireEvent.press(screen.getByText('Применить')); expect(change).toHaveBeenCalledWith(original)
})
it('сброс к пустому диапазону и controlled update между открытиями', () => {
  const change = jest.fn(), screen = render(draw(original, change)); manual(screen)
  fireEvent.changeText(screen.getByLabelText('С даты'), '02.10.2026'); fireEvent.press(screen.getByText('Отмена'))
  const external = { from: '', to: '2024-02-29' }; screen.rerender(draw(external, change)); manual(screen)
  expect(screen.getByLabelText('С даты')).toHaveProp('value', ''); expect(screen.getByLabelText('По дату')).toHaveProp('value', '29.02.2024')
  fireEvent.press(screen.getByText('Отмена')); fireEvent.press(screen.getByRole('button', { name: 'Сбросить период' }))
  expect(change.mock.calls).toEqual([[blank]])
})
it('disabled блокирует поле, reset, и закрывает уже открытый draft без применения', () => {
  const change = jest.fn(), screen = render(draw(original, change, { disabled: true }))
  expect(screen.getByTestId('period-picker-trigger')).toBeDisabled(); expect(screen.getByRole('button', { name: 'Сбросить период' })).toBeDisabled()
  fireEvent.press(screen.getByTestId('period-picker-trigger')); fireEvent.press(screen.getByRole('button', { name: 'Сбросить период' })); expect(change).not.toHaveBeenCalled()
  screen.rerender(draw(original, change)); fireEvent.press(screen.getByTestId('period-picker-trigger'))
  screen.rerender(draw(original, change, { disabled: true })); expect(screen.queryByText('Сегодня')).toBeNull(); expect(change).not.toHaveBeenCalled()
})
it.each([
  ['31.02.2026', '', 'Введите существующую дату'], ['29.02.2023', '', 'Введите существующую дату'], ['01.02.20', '', 'Введите существующую дату'],
  ['2026-10-01', '', 'Введите существующую дату'], ['', '32.10.2026', 'Введите существующую дату'], ['10.10.2026', '09.10.2026', 'Конец периода'],
])('не применяет invalid/incomplete/reverse: %s — %s', (from, to, error) => {
  const change = jest.fn(), screen = render(draw(blank, change)); manual(screen)
  fireEvent.changeText(screen.getByLabelText('С даты'), from); fireEvent.changeText(screen.getByLabelText('По дату'), to)
  expect(screen.getAllByText(new RegExp(error)).length).toBeGreaterThan(0); expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled()
  fireEvent.press(screen.getByText('Применить')); expect(change).not.toHaveBeenCalled()
})
it.each([
  ['29.02.2024', '29.02.2024', { from: '2024-02-29', to: '2024-02-29' }],
  ['01.10.2026', '', { from: '2026-10-01', to: '' }], ['', '09.10.2026', { from: '', to: '2026-10-09' }], ['', '', blank],
])('високосная/открытая/пустая граница: %s — %s', (from, to, range) => {
  const change = jest.fn(), screen = render(draw(original, change)); manual(screen)
  fireEvent.changeText(screen.getByLabelText('С даты'), from); fireEvent.changeText(screen.getByLabelText('По дату'), to); fireEvent.press(screen.getByText('Применить'))
  expect(change.mock.calls).toEqual([[range]])
})
it('навигация месяца с переходом года не меняет applied range', () => {
  const change = jest.fn(), screen = render(draw({ from: '2026-01-01', to: '' }, change)); custom(screen)
  fireEvent.press(screen.getByLabelText('Предыдущий месяц')); expect(screen.getByTestId('period-day-2025-12-31')).toBeTruthy()
  fireEvent.press(screen.getByLabelText('Следующий месяц')); expect(screen.getByTestId('period-day-2026-01-01')).toBeTruthy(); expect(change).not.toHaveBeenCalled()
})
it('узкая короткая панель ограничена viewport, manual и Apply внутри scroll/keyboard avoiding', () => {
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 280, height: 360, scale: 1, fontScale: 1 })
  const screen = render(draw()); manual(screen)
  expect(screen.getByTestId('period-picker')).toHaveStyle({ width: 256, maxHeight: 336 })
  expect(screen.UNSAFE_getByType(KeyboardAvoidingView)).toBeTruthy()
  expect(screen.UNSAFE_getByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled')
  expect(screen.getByText('Применить')).toBeTruthy()
})
