import type { Palette } from '../../shared/ui/theme'

// Отдельные роли просмотра клиента из app/globals.css (.client-view-*).
// Они не заменяют общую семантическую палитру Notice или карточек списков.
const clientViewPalettes = {
  light: {
    headerBorder: '#bfdbfe', headerBackground: '#eff6ff',
    headerGradient: 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)',
    avatarBorder: '#bfdbfe', avatarBackground: '#ffffff', avatarText: '#1d4ed8',
    actionBorder: '#2563eb', actionBackground: '#eff6ff', actionText: '#2563eb',
    neutral: { background: '#f9fafb', border: '#e5e7eb', text: '#374151' },
    success: { background: '#f0fdf4', border: '#86efac', text: '#047857' },
    danger: { background: '#fef2f2', border: '#fca5a5', text: '#b91c1c' },
  },
  dark: {
    headerBorder: '#2b2418', headerBackground: '#1b160f',
    headerGradient: 'linear-gradient(135deg, #1b160f 0%, #221a11 100%)',
    avatarBorder: '#3b2f1d', avatarBackground: '#14110d', avatarText: '#ebd3a5',
    actionBorder: '#3b82f6', actionBackground: 'rgba(30,58,138,0.28)', actionText: '#bfdbfe',
    neutral: { background: '#100d0a', border: '#2b2418', text: '#d1d5db' },
    success: { background: 'rgba(6,78,59,0.35)', border: '#14532d', text: '#a7f3d0' },
    danger: { background: 'rgba(127,29,29,0.28)', border: '#7f1d1d', text: '#fecaca' },
  },
} as const

export const getClientViewPalette = (mode: Palette['mode']) => clientViewPalettes[mode]
