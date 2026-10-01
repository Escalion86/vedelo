// Temporary, immutable light bridge for screens not yet migrated to useTheme.
// Keep the historical roles: they are not interchangeable with Notice/transaction roles.
export const colors = {
  background: '#F6F4EF',
  surface: '#FFFFFF',
  surfaceMuted: '#F0EEE8',
  text: '#1C1D1F',
  textMuted: '#6B6F76',
  border: '#DEDCD5',
  primary: '#725B2F',
  primaryPressed: '#594621',
  primarySoft: '#EEE5D2',
  success: '#27845B',
  successSoft: '#E2F3EB',
  warning: '#B36A19',
  warningSoft: '#FFF0D7',
  danger: '#B43A3A',
  dangerSoft: '#FBE7E7',
  blue: '#356EA8',
  blueSoft: '#E6F0FA',
} as const

export type SemanticColors = Readonly<{ text: string; background: string; border: string }>
const role = (text: string, background: string, border: string): SemanticColors =>
  Object.freeze({ text, background, border })

// Exact PWA values: docs/MOBILE_PWA_PARITY.md §4.2 and app/globals.css.
// Gradients are kept separately; a scalar surface is only the first-stop fallback.
export const lightPalette = {
  mode: 'light' as const,
  canvas: '#fffefa',
  text: '#1c1d1f',
  surface: '#ffffff',
  surfaceGradientStops: ['#ffffff', '#ffffff'] as readonly string[],
  surfaceGradientAngle: 145,
  border: '#dedbd3',
  toolbarBackground: '#fffefa',
  toolbarBorder: '#dedbd3',
  kpiBackground: '#f9fafb',
  kpiBorder: '#e5e7eb',
  primary: '#9a6b27',
  primaryPressed: '#80551c',
  onPrimary: '#ffffff',
  secondaryBorder: 'rgba(138,111,59,0.35)',
  secondaryBackground: 'rgba(255,255,255,0.86)',
  secondaryText: '#1c1d1f',
  secondaryPressedBackground: 'rgba(255,255,255,1)',
  secondaryPressedBorder: 'rgba(138,111,59,0.7)',
  secondaryPressedText: '#7d6435',
  cardTitle: '#111827',
  cardMeta: '#374151',
  cardMuted: '#6b7280',
  emptyIconBackground: '#f4ede1',
  navigationBackground: '#9a6b27',
  navigationText: 'rgba(255,255,255,0.92)',
  navigationActive: '#ffffff',
  fabBackground: '#ffffff',
  fabForeground: '#9a6b27',
  transactionIncome: '#22c55e',
  transactionIncomePressed: '#16a34a',
  transactionIncomeText: '#ffffff',
  transactionIncomeOutline: '#22c55e',
  transactionIncomePressedFill: 'rgba(34,197,94,0.08)',
  transactionExpense: '#ef4444',
  transactionExpensePressed: '#dc2626',
  transactionExpenseText: '#ffffff',
  transactionExpenseOutline: '#ef4444',
  transactionExpensePressedFill: 'rgba(239,68,68,0.08)',
  // Contact brands are identical in both PWA themes; trial channels stay red.
  contacts: { max: '#615cff', whatsapp: '#16a34a', telegram: '#2563eb', trial: '#f87171', onBadge: '#ffffff' },
  rowPressed: 'rgba(0,0,0,0.05)',
  rowSelected: 'rgba(154,107,39,0.14)',
  notice: {
    success: role('#047857', '#ecfdf5', '#a7f3d0'),
    warning: role('#92400e', '#fffbeb', '#fde68a'),
    danger: role('#b91c1c', '#fef2f2', '#fecaca'),
    info: role('#0369a1', '#f0f9ff', '#bae6fd'),
    neutral: role('#374151', '#f9fafb', '#d1d5db'),
  },
  status: {
    overdue: role('#b91c1c', '#fef2f2', '#fca5a5'),
    today: role('#b45309', '#fffbeb', '#fcd34d'),
    tomorrow: role('#047857', '#ecfdf5', '#6ee7b7'),
    upcoming: role('#0369a1', '#f0f9ff', '#7dd3fc'),
    neutral: role('#374151', '#f9fafb', '#d1d5db'),
  },
  eventViewStatus: {
    draft: role('#374151', '#f9fafb', '#d1d5db'),
    active: role('#1d4ed8', '#eff6ff', '#93c5fd'),
    canceled: role('#b91c1c', '#fef2f2', '#fca5a5'),
    finished: role('#15803d', '#f0fdf4', '#86efac'),
    closed: role('#334155', '#f1f5f9', '#cbd5e1'),
  },
  sectionAccent: { overdue: '#dc2626', today: '#d97706', tomorrow: '#2563eb', messages: '#7c3aed' },
} as const

type Widen<T> = T extends string ? string : T extends number ? number
  : T extends readonly string[] ? readonly string[] : { readonly [K in keyof T]: Widen<T[K]> }
export type Palette = Omit<Widen<typeof lightPalette>, 'mode'> & { readonly mode: 'light' | 'dark' }
export type ThemePreference = Palette['mode'] | 'system'
export type TemporalStatus = keyof Palette['status']
export type EventViewStatus = keyof Palette['eventViewStatus']
export type NoticeTone = keyof Palette['notice']

export const darkPalette: Palette = {
  ...lightPalette,
  mode: 'dark',
  canvas: '#100d0a',
  text: '#e2e8f0',
  surface: 'rgba(24,19,13,0.96)',
  surfaceGradientStops: ['rgba(24,19,13,0.96)', 'rgba(30,23,14,0.94)'],
  border: 'rgba(201,168,106,0.28)',
  toolbarBackground: 'rgba(24,19,13,0.82)',
  toolbarBorder: 'rgba(201,168,106,0.34)',
  kpiBackground: '#100d0a',
  kpiBorder: '#2b2418',
  primary: '#c9a86a',
  primaryPressed: '#ebd3a5',
  onPrimary: '#1f1b14',
  secondaryBorder: 'rgba(201,168,106,0.45)',
  secondaryBackground: 'rgba(28,22,15,0.78)',
  secondaryText: '#f1e7d4',
  secondaryPressedBackground: 'rgba(37,30,20,0.92)',
  secondaryPressedBorder: 'rgba(235,211,165,0.85)',
  secondaryPressedText: '#ebd3a5',
  cardTitle: '#f3f4f6',
  cardMeta: '#d1d5db',
  cardMuted: '#9ca3af',
  emptyIconBackground: 'rgba(201,168,106,0.16)',
  navigationBackground: '#3b2f1d',
  navigationText: 'rgba(247,239,225,0.62)',
  navigationActive: '#c9a86a',
  fabBackground: '#c9a86a',
  fabForeground: '#ffffff',
  transactionIncome: '#15803d',
  transactionIncomePressed: '#166534',
  transactionIncomeText: '#f8fafc',
  transactionIncomeOutline: '#15803d',
  transactionIncomePressedFill: 'rgba(21,128,61,0.12)',
  transactionExpense: '#b91c1c',
  transactionExpensePressed: '#991b1b',
  transactionExpenseText: '#f8fafc',
  transactionExpenseOutline: '#b91c1c',
  transactionExpensePressedFill: 'rgba(185,28,28,0.12)',
  rowPressed: 'rgba(255,255,255,0.06)',
  rowSelected: 'rgba(201,168,106,0.14)',
  notice: {
    success: role('#a7f3d0', 'rgba(6,78,59,0.28)', 'rgba(52,211,153,0.42)'),
    warning: role('#fde68a', 'rgba(146,64,14,0.26)', 'rgba(251,191,36,0.42)'),
    danger: role('#fecaca', 'rgba(127,29,29,0.28)', 'rgba(248,113,113,0.42)'),
    info: role('#bfdbfe', 'rgba(30,64,175,0.24)', 'rgba(96,165,250,0.4)'),
    neutral: role('#d8c9ad', 'rgba(255,255,255,0.04)', 'rgba(201,168,106,0.28)'),
  },
  status: {
    overdue: role('#fecaca', 'rgba(127,29,29,0.3)', '#7f1d1d'),
    today: role('#fde68a', 'rgba(146,64,14,0.3)', '#92400e'),
    tomorrow: role('#a7f3d0', 'rgba(6,95,70,0.32)', '#065f46'),
    upcoming: role('#bae6fd', 'rgba(7,89,133,0.28)', '#075985'),
    neutral: role('#cbd5e1', '#1f2937', '#4b5563'),
  },
  eventViewStatus: {
    draft: role('#cbd5e1', '#1f2937', '#4b5563'),
    active: role('#bfdbfe', '#172554', '#1d4ed8'),
    canceled: role('#fecaca', '#450a0a', '#7f1d1d'),
    finished: role('#bbf7d0', '#052e16', '#14532d'),
    closed: role('#cbd5e1', '#0f172a', '#334155'),
  },
}

// Native elevation is a visual approximation, not a CSS shadow conversion.
export const surfaceElevation = { light: 2, dark: 6 } as const
export const pageTitleSize = (width: number) => Math.min(32, Math.max(24, width * 0.04))
// RN 0.83 Android ReactTypefaceUtils only accepts weights in steps of 100.
export const typography = {
  pageTitleWeight: 650,
  filterWeight: 550,
  nativePageTitleWeight: '600',
  nativeFilterWeight: '600',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const
