import { darkPalette, lightPalette, type Palette } from './theme'

// Контраст sRGB с композитингом альфы: проверка токенов, а не native рендера.
const rgba = (value: string): number[] => value.startsWith('#')
  ? [...value.slice(1).match(/../g)!.map(channel => parseInt(channel, 16)), 1]
  : value.match(/[\d.]+/g)!.map(Number)
const over = (value: string, base: number[]) => {
  const [r, g, b, alpha = 1] = rgba(value)
  return [r, g, b].map((channel, i) => channel * alpha + base[i] * (1 - alpha))
}
const luminance = (color: number[]) => color.map(channel => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}).reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0)
const contrast = (text: string, background: string, base: number[]) => {
  const behind = over(background, base), foreground = over(text, behind)
  const first = luminance(foreground), second = luminance(behind)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}
const testPairs = (p: Palette) => {
  const canvas = over(p.canvas, [255, 255, 255]), surface = over(p.surface, canvas)
  const pairs: [string, string, string, number[]][] = []
  for (const background of [p.canvas, p.surface, p.toolbarBackground, p.kpiBackground]) {
    for (const text of [p.text, p.cardTitle, p.cardMeta, p.cardMuted]) pairs.push(['основной текст', text, background, canvas])
    for (const role of Object.values(p.notice)) pairs.push(['семантический текст на поверхности', role.text, background, canvas])
  }
  for (const group of [p.notice, p.status, p.eventViewStatus]) for (const [name, role] of Object.entries(group)) {
    pairs.push([name, role.text, role.background, canvas], [name, role.text, role.background, surface])
  }
  for (const base of [canvas, surface]) {
    pairs.push(['текст выбора', p.selectionText, p.rowSelected, base], ['метаданные выбора', p.cardMeta, p.rowSelected, base],
      ['календарь: сегодня и счётчик', p.selectionText, p.emptyIconBackground, base])
    for (const role of Object.values(p.notice)) pairs.push(['подпись итогов', p.cardMeta, role.background, base])
  }
  pairs.push(['primary', p.onPrimary, p.primary, canvas], ['primary pressed', p.onPrimary, p.primaryPressed, canvas],
    ['secondary', p.secondaryText, p.secondaryBackground, canvas], ['secondary pressed', p.secondaryPressedText, p.secondaryPressedBackground, canvas],
    ['нижняя панель', p.navigationLabel, p.navigationBackground, canvas], ['активная нижняя панель', p.navigationActive, p.navigationBackground, canvas],
    ['числовой бейдж', p.counterBadge.text, p.counterBadge.background, canvas],
    ['MAX', p.contacts.onBadge, p.contacts.max, canvas], ['пробный MAX', p.contacts.onTrialBadge, p.contacts.trial, canvas])
  return pairs
}

it.each([lightPalette, darkPalette])('$mode: текстовые пары имеют контраст не ниже 4.5:1', palette => {
  const failed = testPairs(palette).map(([name, text, background, base]) => ({
    name, text, background, ratio: contrast(text, background, base),
  })).filter(pair => pair.ratio < 4.5)
  expect(failed).toEqual([])
})
it.each([lightPalette, darkPalette])('$mode: плюс FAB имеет контраст не ниже 3:1', palette => {
  const text = palette.mode === 'dark' ? palette.onPrimary : palette.fabForeground
  expect(contrast(text, palette.fabBackground, rgba(palette.canvas))).toBeGreaterThanOrEqual(3)
})
it('фиксирует реальные прежние неудачные пары', () => {
  const p = lightPalette, base = rgba(p.surface)
  expect(contrast(p.primary, p.rowSelected, base)).toBeLessThan(4.5)
  expect(contrast(p.cardMuted, p.rowSelected, base)).toBeLessThan(4.5)
  expect(contrast(p.navigationText, p.navigationBackground, base)).toBeLessThan(4.5)
  expect(contrast(p.transactionExpenseText, p.transactionExpense, base)).toBeLessThan(4.5)
  expect(contrast(p.contacts.onBadge, p.contacts.trial, base)).toBeLessThan(4.5)
})
