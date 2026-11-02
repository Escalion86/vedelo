export const GOOGLE_STATUS_COLORS = { draft: '8', active: '9', canceled: '11', closed: '10' }
export const GOOGLE_TITLE_MODES = [
  { value: 'eventType_services', label: 'Тип и услуги' },
  { value: 'services_eventType', label: 'Услуги и тип' },
  { value: 'eventType', label: 'Только тип' },
  { value: 'services', label: 'Только услуги' },
  { value: 'eventTitle', label: 'Название' },
  { value: 'client_eventType', label: 'Клиент и тип' },
] as const
export const GOOGLE_SYNC_FLAGS = [
  { key: 'showDescription', label: 'Описание' },
  { key: 'showClient', label: 'Клиент и его контакты' },
  { key: 'showOtherContacts', label: 'Прочие контакты' },
  { key: 'showColleague', label: 'Данные коллеги' },
  { key: 'showContractSum', label: 'Стоимость' },
  { key: 'showFinanceComment', label: 'Финансовый комментарий' },
  { key: 'showTransactions', label: 'Оплаты и расходы' },
  { key: 'showAdditionalEvents', label: 'Следующие контакты' },
  { key: 'showNavigationLinks', label: 'Ссылки на карты' },
  { key: 'showEventLink', label: 'Ссылка на запись в Ведело' },
  { key: 'showStatusIcons', label: 'Значки оплаты и передачи' },
] as const
export type GoogleSyncSettings = Record<typeof GOOGLE_SYNC_FLAGS[number]['key'], boolean> & {
  titleMode: typeof GOOGLE_TITLE_MODES[number]['value']
}
export const GOOGLE_SYNC_DEFAULTS: GoogleSyncSettings = {
  titleMode: 'eventType_services', showDescription: true, showClient: true,
  showOtherContacts: true, showColleague: true, showContractSum: true,
  showFinanceComment: true, showTransactions: true, showAdditionalEvents: true,
  showNavigationLinks: true, showEventLink: true, showStatusIcons: true,
}
export const GOOGLE_COLOR_OPTIONS = ['Лаванда', 'Шалфей', 'Виноград', 'Фламинго', 'Банан', 'Мандарин', 'Павлин', 'Графит', 'Черника', 'Базилик', 'Томат']
  .map((label, index) => ({ value: String(index + 1), label }))

// Compare only fields intentionally edited. Server responses may contain other
// PWA settings, whose presence must not turn a confirmed patch into an error.
export const matchesGoogleSettingsPatch = (actual: unknown, patch: unknown): boolean => {
  if (Array.isArray(patch)) return JSON.stringify(actual) === JSON.stringify(patch)
  if (patch && typeof patch === 'object') return !!actual && typeof actual === 'object' && !Array.isArray(actual) && Object.entries(patch).every(([key, value]) => matchesGoogleSettingsPatch((actual as Record<string, unknown>)[key], value))
  return actual === patch
}
