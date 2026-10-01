import type { MaterialCommunityIcons } from '@expo/vector-icons'

export type MenuItem = {
  title: string
  href: string
  pendingDescription?: string
  icon: keyof typeof MaterialCommunityIcons.glyphMap
}
export type MenuGroup = { title: string; items: readonly MenuItem[] }

// A user catalogue for every role. Platform administration never belongs here.
export const menuGroups: readonly MenuGroup[] = [
  { title: 'Клиенты', items: [{ title: 'Отзывы клиентов', href: '/more/client-reviews', icon: 'comment-text-outline', pendingDescription: 'Отзывы клиентов пока доступны в веб-версии. Раздел появится в одном из следующих обновлений Android.' }] },
  { title: 'История действий', items: [{ title: 'История действий', href: '/history', icon: 'history' }] },
  { title: 'Статистика', items: [{ title: 'Статистика', href: '/more/statistics', icon: 'chart-box-outline' }] },
  { title: 'Транзакции', items: [{ title: 'Транзакции', href: '/(tabs)/finance', icon: 'wallet-outline' }] },
  { title: 'Звонки', items: [{ title: 'Звонки', href: '/more/calls', icon: 'phone-log-outline' }] },
  { title: 'Настройки', items: [
    { title: 'Общие настройки', href: '/more/settings', icon: 'cog-outline' },
    { title: 'Личный профиль', href: '/(tabs)/profile', icon: 'account-circle-outline' },
    { title: 'Мои услуги', href: '/more/services', icon: 'briefcase-outline' },
    { title: 'Интеграции', href: '/more/integrations', icon: 'connection' },
    { title: 'Импорт и экспорт', href: '/more/import', icon: 'swap-vertical' },
    { title: 'Документы', href: '/more/documents', icon: 'file-document-outline' },
    { title: 'Списки', href: '/more/lists', icon: 'format-list-bulleted' },
    { title: 'Уведомления', href: '/more/notifications', icon: 'bell-outline' },
    { title: 'Реферальная система', href: '/more/referrals', icon: 'account-cash-outline' },
    { title: 'Баланс и платежи', href: '/billing', icon: 'wallet-outline' },
  ] },
  { title: 'Поддержка', items: [
    { title: 'Обратная связь', href: '/support', icon: 'message-alert-outline' },
    { title: 'Обучение', href: '/more/learning', icon: 'book-open-outline', pendingDescription: 'Уроки и персональный прогресс обучения пока доступны в веб-версии. Раздел появится в одном из следующих обновлений Android.' },
  ] },
]

const sectionItems = new Map(menuGroups.flatMap((group) => group.items)
  .filter((item) => item.href.startsWith('/more/'))
  .map((item) => [item.href.slice('/more/'.length), item]))

// Legacy/PWA section names resolve only to existing user screens.
const personalItems = menuGroups.flatMap((group) => group.items)
sectionItems.set('profile', personalItems.find((item) => item.href === '/(tabs)/profile')!)
sectionItems.set('billing-history', personalItems.find((item) => item.href === '/billing')!)

export const getMenuSection = (section: unknown): MenuItem | undefined =>
  typeof section === 'string' ? sectionItems.get(section) : undefined

export const badgeLabel = (count: number) => count > 99 ? '99+' : String(count)
export const isMenuRoute = (path: string) =>
  /^\/(more|finance|tasks|profile|history|support|sync|billing|calls)(\/|$)/.test(path.replace('/(tabs)', ''))
