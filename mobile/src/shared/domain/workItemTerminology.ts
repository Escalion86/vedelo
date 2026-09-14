import type { MobileSettings } from './types'

export type PrimaryEntityTerminology = 'auto' | 'events' | 'orders'

const knownPresets = new Set([
  'events', 'photo_video', 'custom_products', 'beauty', 'consulting',
  'repair_home', 'transport_delivery', 'digital_services', 'other',
])

const forms = {
  events: {
    mode: 'events' as const,
    label: 'мероприятие',
    labelCapitalized: 'Мероприятие',
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
  },
  orders: {
    mode: 'orders' as const,
    label: 'заказ',
    labelCapitalized: 'Заказ',
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
  },
}

export const resolveMobileWorkItemTerminology = (settings?: MobileSettings | null) => {
  const explicit = settings?.custom?.primaryEntityTerminology
  if (explicit === 'events' || explicit === 'orders') return forms[explicit]
  const preset = String(settings?.custom?.onboardingActivityPreset || '')
  if (!preset || !knownPresets.has(preset)) return forms.events
  return preset === 'events' ? forms.events : forms.orders
}
