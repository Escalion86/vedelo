import type { ClientReview, ReviewAppearance, ReviewEvent, ReviewFilters } from './types'
export const reviewLabels = { created: 'Ссылка создана', sent: 'Отправлено вручную', received: 'Отзыв получен', expired: 'Ссылка истекла', revoked: 'Ссылка отключена' }
export const canRequestReview = (event: ReviewEvent, now = Date.now()) => Boolean(event.clientId && !event.isDemo && (event.status === 'closed' || event.status === 'active' && (event.dateEnd || event.eventDate) && new Date(event.dateEnd || event.eventDate!).getTime() <= now))
export const reviewQuery = (filters: ReviewFilters) => new URLSearchParams(Object.entries(filters).filter(([,v]) => v !== undefined && v !== '').map(([k,v]) => [k,String(v)])).toString()
export const searchReviews = (rows: ClientReview[], text: string) => {
  const search = text.trim().toLocaleLowerCase('ru-RU')
  return rows.filter((row) => `${row.clientName || ''} ${row.eventTitle || ''} ${row.comment} ${row.note}`.toLocaleLowerCase('ru-RU').includes(search))
}
export const emptyAppearance: ReviewAppearance = { publicName: '', specialization: '', greeting: '', accent: 'sand', cover: 'plain', logoUrl: '' }
export const accents = [{value:'sand',label:'Песочный — фирменный'},{value:'terracotta',label:'Терракотовый'},{value:'emerald',label:'Изумрудный'},{value:'sky',label:'Небесный'},{value:'violet',label:'Сиреневый'}] as const
export const covers = [{value:'plain',label:'Спокойная'},{value:'warm',label:'Тёплая'},{value:'deep',label:'Глубокая'}] as const
// Только шесть полей публичного контракта; приватные поля профиля не подставляются.
export const publicAppearance = (value: ReviewAppearance): ReviewAppearance => ({ publicName:value.publicName, specialization:value.specialization, greeting:value.greeting, accent:value.accent, cover:value.cover, logoUrl:value.logoUrl })
export const validateLogo = (asset: { size?: number; mimeType?: string }) => !['image/png','image/jpeg','image/webp'].includes(asset.mimeType || '') ? 'Разрешены PNG, JPG и WebP' : !asset.size || asset.size > 5 * 1024 * 1024 ? 'Размер изображения — от 1 байта до 5 МБ' : ''
