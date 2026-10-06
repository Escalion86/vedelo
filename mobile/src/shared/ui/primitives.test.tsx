import React, { useState } from 'react'
import { Dimensions, Text, View } from 'react-native'
import { fireEvent, render } from '@testing-library/react-native'
import { ThemeProvider } from './ThemeProvider'
import { Button, EmptyState, Field, PageHeader, StatusChip, Surface } from './components'
import { CompactField } from './CompactField'
import { Notice } from './Notice'
import { FilterControl, FilterOverlay, filterOverlayLayout } from './FilterOverlay'
import { darkPalette, lightPalette, type NoticeTone } from './theme'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}))
const themed = (children: React.ReactNode, dark = false) =>
  <ThemeProvider storage={null} initialPreference={dark ? 'dark' : 'light'}>{children}</ThemeProvider>

describe('Notice / EmptyState', () => {
  it.each(['success', 'warning', 'danger', 'info', 'neutral'] as NoticeTone[])('Notice %s передаёт смысл и цвета обеих тем', (tone) => {
    for (const palette of [lightPalette, darkPalette]) {
      const screen = render(themed(<Notice tone={tone} message="Результат операции" testID="notice" />, palette.mode === 'dark'))
      expect(screen.getByTestId('notice')).toHaveStyle({ backgroundColor: palette.notice[tone].background, borderColor: palette.notice[tone].border })
      expect(screen.getByText('Результат операции')).toHaveStyle({ color: palette.notice[tone].text })
      expect(screen.getByTestId('notice').props.accessibilityLabel).toMatch(/: Результат операции$/)
      expect(screen.getByTestId('notice').props.accessibilityLiveRegion).toBe('polite')
      screen.unmount()
    }
  })
  it('EmptyState допускает отсутствие CTA и иконки, выполняет явное действие', () => {
    const onPress = jest.fn()
    const screen = render(themed(<EmptyState title="Ничего не найдено" description="Измените фильтры" />))
    expect(screen.queryByRole('button')).toBeNull()
    screen.rerender(themed(<EmptyState title="Ничего не найдено" icon={<Text>○</Text>}
      action={{ title: 'Сбросить фильтры', onPress }} />))
    fireEvent.press(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('○')).toBeNull() // decorative icon stays out of TalkBack
    expect(screen.getByText('○', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('Ничего не найдено')).toHaveStyle({ fontSize: 16, fontWeight: '600' })
  })
})

it('CompactField сохраняет ввод и фокус при загрузке и смене темы', () => {
  const Input = ({ loading }: { loading: boolean }) => {
    const [value, setValue] = useState('')
    return <CompactField label="Поиск клиента" search loading={loading} value={value} onChangeText={setValue} />
  }
  const screen = render(<ThemeProvider storage={null} forcedMode="light"><Input loading={false} /></ThemeProvider>)
  const input = screen.getByLabelText('Поиск клиента')
  fireEvent.changeText(input, 'Анна')
  fireEvent(input, 'focus', {})
  expect(input).toHaveStyle({ minHeight: 40, borderWidth: 2, borderRadius: 4, paddingHorizontal: 8, borderColor: lightPalette.primary })
  screen.rerender(<ThemeProvider storage={null} forcedMode="dark"><Input loading /></ThemeProvider>)
  expect(screen.getByDisplayValue('Анна').props.accessibilityState).toMatchObject({ busy: true, disabled: false })
  expect(screen.getByLabelText('Поиск клиента')).toHaveStyle({ color: darkPalette.text, borderColor: darkPalette.primary })
  fireEvent.changeText(screen.getByLabelText('Поиск клиента'), 'Анна Петрова')
  expect(screen.getByDisplayValue('Анна Петрова')).toBeTruthy()
})

it('CompactField показывает ошибку, а Field сохраняет размеры многострочной формы', () => {
  const screen = render(themed(<><CompactField label="Поиск" editable={false} error="Повторите ввод" />
    <Field label="Комментарий" multiline /></>))
  expect(screen.getByLabelText('Поиск').props.accessibilityState).toMatchObject({ disabled: true })
  expect(screen.getByRole('alert')).toHaveTextContent('Повторите ввод')
  expect(screen.getByLabelText('Комментарий')).toHaveStyle({ minHeight: 96, borderRadius: 12 })
})

it('PageHeader показывает нулевой счётчик; Surface имеет отдельные варианты', () => {
  const screen = render(themed(<><PageHeader title="Клиенты" count={0} />
    <Surface testID="card" /><Surface variant="toolbar" testID="toolbar" /><Surface variant="kpi" testID="kpi" /></>))
  expect(screen.getByText('0')).toHaveStyle({ fontSize: 16, fontWeight: '500' })
  const size = Math.min(32, Math.max(24, Dimensions.get('window').width * 0.04))
  expect(screen.getByRole('header')).toHaveStyle({ fontSize: size, lineHeight: size * 1.05, letterSpacing: size * -0.035 })
  expect(screen.getByTestId('card')).toHaveStyle({ borderWidth: 1, borderRadius: 8 })
  expect(screen.getByTestId('toolbar')).toHaveStyle({ backgroundColor: lightPalette.toolbarBackground, borderRadius: 0 })
  expect(screen.getByTestId('kpi')).toHaveStyle({ backgroundColor: lightPalette.kpiBackground, borderRadius: 8 })
})

it('chip имеет текстовый смысл; Завтра и Закрыто используют разные роли', () => {
  const screen = render(themed(<><StatusChip label="Завтра" tone="tomorrow" />
    <StatusChip label="Закрыто" eventStatus="closed" /></>, true))
  expect(screen.getByLabelText('Завтра')).toHaveStyle({ backgroundColor: darkPalette.status.tomorrow.background })
  expect(screen.getByText('Завтра')).toHaveStyle({ color: darkPalette.status.tomorrow.text })
  expect(screen.getByLabelText('Закрыто')).toHaveStyle({ backgroundColor: '#0f172a' })
})

it.each(['primary', 'secondary'] as const)('кнопка %s: pressed обеих палитр, блокировка loading, сохранение подписи', (variant) => {
  for (const palette of [lightPalette, darkPalette]) {
    const onPress = jest.fn()
    const screen = render(themed(<Button title="Сохранить" variant={variant} onPress={onPress} testOnly_pressed
      accessibilityState={{ selected: true, expanded: true }} />, palette.mode === 'dark'))
    expect(screen.getByRole('button')).toHaveStyle({
      backgroundColor: variant === 'primary' ? palette.primaryPressed : palette.secondaryPressedBackground,
    })
    if (variant === 'secondary') expect(screen.getByRole('button')).toHaveStyle({ borderColor: palette.secondaryPressedBorder })
    expect(screen.getByText('Сохранить')).toHaveStyle({
      color: variant === 'primary' ? palette.onPrimary : palette.secondaryPressedText,
    })
    fireEvent.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
    screen.rerender(themed(<Button title="Сохранить" variant={variant} loading onPress={onPress}
      accessibilityState={{ selected: true, expanded: true }} />, palette.mode === 'dark'))
    expect(screen.getByText('Сохранить')).toBeTruthy()
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ disabled: true, busy: true, selected: true, expanded: true })
    expect(screen.getByRole('button')).toHaveStyle({ opacity: 0.65 })
    fireEvent.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
    screen.unmount()
  }
})

it('overlay отдельно от списка: выбор, outside и Android Back работают', () => {
  const select = jest.fn()
  const Harness = () => {
    const [visible, setVisible] = useState(false)
    return <View><FilterOverlay visible={visible} onOpen={() => setVisible(true)} onClose={() => setVisible(false)}
      options={[{ value: 'all', label: 'Все клиенты', selected: true }, { value: 'disabled', label: 'Недоступно', disabled: true }]}
      onSelect={select} maxWidth={260} /><View testID="first-card" style={{ height: 178 }} /></View>
  }
  const screen = render(themed(<Harness />))
  const card = screen.getByTestId('first-card')
  expect(screen.queryByText('Все клиенты')).toBeNull()
  fireEvent.press(screen.getByTestId('filter-overlay-trigger'))
  expect(screen.getByTestId('filter-overlay-trigger').props.accessibilityState).toMatchObject({ expanded: true })
  expect(screen.getByRole('button', { name: 'Все клиенты' }).props.accessibilityState).toMatchObject({ selected: true })
  fireEvent.press(screen.getByRole('button', { name: 'Все клиенты' }))
  fireEvent.press(screen.getByRole('button', { name: 'Недоступно' }))
  expect(select.mock.calls).toEqual([['all']])
  expect(screen.getByTestId('filter-overlay')).toHaveStyle({ position: 'absolute', width: 260 })
  expect(screen.getByTestId('first-card')).toBe(card)
  expect(screen.getByTestId('first-card')).toHaveStyle({ height: 178 })
  fireEvent(screen.getByTestId('filter-overlay-layer'), 'requestClose')
  expect(screen.queryByText('Все клиенты')).toBeNull()
  expect(screen.getByTestId('filter-overlay-trigger').props.accessibilityState).toMatchObject({ expanded: false })
  fireEvent.press(screen.getByTestId('filter-overlay-trigger'))
  fireEvent.press(screen.getByTestId('filter-overlay-outside', { includeHiddenElements: true }))
  expect(screen.queryByText('Все клиенты')).toBeNull()
}, 15000)

it.each([320, 360, 390, 800])('overlay ограничен viewport %s и safe area', (width) => {
  for (const maxWidth of [260, 340] as const) {
    const result = filterOverlayLayout({ width, height: 600 }, { top: 24, bottom: 34, left: 8, right: 8 }, maxWidth, { x: width - 10, bottom: 590 })
    expect(result.width).toBe(Math.min(maxWidth, width - 40))
    expect(result.left + result.width).toBeLessThanOrEqual(width - 20)
    expect(result.top + result.maxHeight).toBe(554)
  }
})

it('FilterControl отдаёт selected/expanded и зону касания', () => {
  const screen = render(themed(<FilterControl title="Фильтры" selected expanded />))
  expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ selected: true, expanded: true })
  expect(screen.getByRole('button').props.hitSlop).toBe(6)
  expect(screen.getByRole('button')).toHaveStyle({ minHeight: 36, borderRadius: 10 })
})

it.each([false, true])('общая поверхность отделена от canvas, рамка и тень сохраняются: dark=%s', (dark) => {
  const palette = dark ? darkPalette : lightPalette
  const screen = render(themed(<Surface testID="surface"><Text>Карточка</Text></Surface>, dark))
  expect(palette.canvas).not.toBe(palette.surface)
  expect(screen.getByTestId('surface')).toHaveStyle({ backgroundColor: palette.surface, borderColor: palette.border,
    borderWidth: 1, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, shadowOpacity: dark ? 0.35 : 0.1 })
})
