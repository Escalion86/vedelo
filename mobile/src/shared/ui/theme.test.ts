import { colors, darkPalette, lightPalette, pageTitleSize } from './theme'

describe('PWA palettes', () => {
  it('разделяет роли кнопок, навигации, транзакций и карточек', () => {
    expect([lightPalette.canvas, darkPalette.canvas]).toEqual(['#f3f1eb', '#100d0a'])
    expect([lightPalette.primary, darkPalette.primary]).toEqual(['#9a6b27', '#c9a86a'])
    expect([lightPalette.onPrimary, darkPalette.onPrimary]).toEqual(['#ffffff', '#1f1b14'])
    expect(darkPalette.secondaryPressedText).toBe('#ebd3a5')
    expect(lightPalette.secondaryPressedBorder).toBe('rgba(138,111,59,0.7)')
    expect(darkPalette.surfaceGradientStops).toEqual(['rgba(24,19,13,0.96)', 'rgba(30,23,14,0.94)'])
    expect([darkPalette.navigationBackground, darkPalette.navigationText, darkPalette.navigationActive])
      .toEqual(['#3b2f1d', 'rgba(247,239,225,0.62)', '#c9a86a'])
    expect([darkPalette.fabBackground, darkPalette.fabForeground]).toEqual(['#c9a86a', '#ffffff'])
    expect([lightPalette.cardTitle, lightPalette.cardMeta, lightPalette.cardMuted]).toEqual(['#111827', '#374151', '#656b77'])
    expect([lightPalette.transactionIncome, darkPalette.transactionIncomePressed, darkPalette.transactionExpenseOutline])
      .toEqual(['#22c55e', '#166534', '#b91c1c'])
    expect(darkPalette.transactionExpensePressedFill).toBe('rgba(185,28,28,0.12)')
    expect(colors.primary).toBe('#725B2F') // legacy bridge has not been mutated
  })

  it('сохраняет все точные пары временных chip и независимое синее ребро Завтра', () => {
    expect(Object.values(lightPalette.status).map(Object.values)).toEqual([
      ['#b91c1c', '#fef2f2', '#fca5a5'], ['#b45309', '#fffbeb', '#fcd34d'],
      ['#047857', '#ecfdf5', '#6ee7b7'], ['#0369a1', '#f0f9ff', '#7dd3fc'],
      ['#374151', '#f9fafb', '#d1d5db'],
    ])
    expect(Object.values(darkPalette.status).map(Object.values)).toEqual([
      ['#fecaca', 'rgba(127,29,29,0.3)', '#7f1d1d'], ['#fde68a', 'rgba(146,64,14,0.3)', '#92400e'],
      ['#a7f3d0', 'rgba(6,95,70,0.32)', '#065f46'], ['#bae6fd', 'rgba(7,89,133,0.28)', '#075985'],
      ['#cbd5e1', '#1f2937', '#4b5563'],
    ])
    expect(lightPalette.sectionAccent.tomorrow).toBe('#2563eb')
  })

  it('не смешивает закрытую работу, завершённую работу и успешный Notice', () => {
    expect(lightPalette.eventViewStatus.closed).toEqual({ text: '#334155', background: '#f1f5f9', border: '#cbd5e1' })
    expect(darkPalette.eventViewStatus.closed).toEqual({ text: '#cbd5e1', background: '#0f172a', border: '#334155' })
    expect(darkPalette.eventViewStatus.finished.background).toBe('#052e16')
    expect(darkPalette.eventViewStatus.canceled.background).toBe('#450a0a')
    expect(lightPalette.notice.success).toEqual({ text: '#047857', background: '#ecfdf5', border: '#a7f3d0' })
    expect(darkPalette.notice.info).toEqual({ text: '#bfdbfe', background: 'rgba(30,64,175,0.24)', border: 'rgba(96,165,250,0.4)' })
  })

  it.each([[320, 24], [360, 24], [390, 24], [700, 28], [1200, 32]])('clamp заголовка при ширине %s', (width, expected) => {
    expect(pageTitleSize(width)).toBe(expected)
  })
})
