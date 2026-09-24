export const PRIMARY_ENTITY_TERMINOLOGY_VALUES = Object.freeze([
  'auto',
  'events',
  'orders',
])

export const KNOWN_ACTIVITY_PRESETS = Object.freeze([
  'events',
  'photo_video',
  'custom_products',
  'beauty',
  'consulting',
  'repair_home',
  'transport_delivery',
  'digital_services',
  'other',
])

const KNOWN_ACTIVITY_PRESETS_SET = new Set(KNOWN_ACTIVITY_PRESETS)

const FORMS = Object.freeze({
  events: Object.freeze({
    mode: 'events',
    label: 'мероприятие',
    labelCapitalized: 'Мероприятие',
    newLabel: 'Новое мероприятие',
    genitive: 'мероприятия',
    dative: 'мероприятию',
    accusative: 'мероприятие',
    instrumental: 'мероприятием',
    prepositional: 'мероприятии',
    plural: 'мероприятия',
    pluralCapitalized: 'Мероприятия',
    pluralGenitive: 'мероприятий',
    pluralDative: 'мероприятиям',
    pluralAccusative: 'мероприятия',
    pluralInstrumental: 'мероприятиями',
    pluralPrepositional: 'мероприятиях',
  }),
  orders: Object.freeze({
    mode: 'orders',
    label: 'заказ',
    labelCapitalized: 'Заказ',
    newLabel: 'Новый заказ',
    genitive: 'заказа',
    dative: 'заказу',
    accusative: 'заказ',
    instrumental: 'заказом',
    prepositional: 'заказе',
    plural: 'заказы',
    pluralCapitalized: 'Заказы',
    pluralGenitive: 'заказов',
    pluralDative: 'заказам',
    pluralAccusative: 'заказы',
    pluralInstrumental: 'заказами',
    pluralPrepositional: 'заказах',
  }),
})

const toPlainCustom = (custom) => {
  if (!custom || typeof custom !== 'object') return {}
  if (typeof custom.get === 'function') return Object.fromEntries(custom)
  return custom
}

export const resolvePrimaryEntityMode = (siteSettings = {}) => {
  const custom = toPlainCustom(siteSettings?.custom)
  const explicit = String(custom.primaryEntityTerminology || 'auto')

  if (explicit === 'events' || explicit === 'orders') return explicit

  const preset = String(custom.onboardingActivityPreset || '').trim()
  if (!preset || !KNOWN_ACTIVITY_PRESETS_SET.has(preset)) return 'events'
  return preset === 'events' ? 'events' : 'orders'
}

export const resolveWorkItemTerminology = (siteSettings = {}) =>
  FORMS[resolvePrimaryEntityMode(siteSettings)]

export const getWorkItemTemplateVariables = (siteSettings = {}) => {
  const terms = resolveWorkItemTerminology(siteSettings)
  return {
    workItemLabel: terms.label,
    workItemLabelGenitive: terms.genitive,
    workItemLabelPlural: terms.plural,
    workItemLabelPluralGenitive: terms.pluralGenitive,
  }
}

export const replaceWorkItemTerms = (value, siteSettings = {}) => {
  if (typeof value !== 'string') return value
  const terms = resolveWorkItemTerminology(siteSettings)
  if (terms.mode === 'events') return value

  return value
    .replace(/для участия в мероприятии/g, 'для выполнения заказа')
    .replace(/на мероприятии/g, 'при выполнении заказа')
    .replace(/в мероприятии/g, 'в заказе')
    .replace(/Мероприятие не найдено/g, 'Заказ не найден')
    .replace(/мероприятие не найдено/g, 'заказ не найден')
    .replace(/Мероприятиями/g, 'Заказами')
    .replace(/мероприятиями/g, 'заказами')
    .replace(/Мероприятиях/g, 'Заказах')
    .replace(/мероприятиях/g, 'заказах')
    .replace(/Мероприятиям/g, 'Заказам')
    .replace(/мероприятиям/g, 'заказам')
    .replace(/Мероприятий/g, 'Заказов')
    .replace(/мероприятий/g, 'заказов')
    .replace(/Мероприятии/g, 'Заказе')
    .replace(/мероприятии/g, 'заказе')
    .replace(/Мероприятием/g, 'Заказом')
    .replace(/мероприятием/g, 'заказом')
    .replace(/Мероприятия/g, 'Заказы')
    .replace(/мероприятия/g, 'заказа')
    .replace(/Мероприятию/g, 'Заказу')
    .replace(/мероприятию/g, 'заказу')
    .replace(/Мероприятие/g, 'Заказ')
    .replace(/мероприятие/g, 'заказ')
}
