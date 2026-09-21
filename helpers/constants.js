import {
  faBan,
  faCheck,
  faClock,
  faGenderless,
  faBell,
  faLock,
  faMars,
  faPhone,
  faPlay,
  faVenus,
  faClockRotateLeft,
  faComments,
  faAddressBook,
  faWallet,
} from '@fortawesome/free-solid-svg-icons'

import {
  faBug,
  faMoneyBill,
  faUser,
  faUsers,
  faWandMagicSparkles,
  faGift,
  faNewspaper,
} from '@fortawesome/free-solid-svg-icons'
import { faCalendarCheck } from '@fortawesome/free-regular-svg-icons'

import {
  faInstagram,
  faTelegram,
  faVk,
  faWhatsapp,
} from '@fortawesome/free-brands-svg-icons'
import {
  faChartLine,
  faCog,
  faExclamationCircle,
  faFileLines,
  faFileImport,
  faList,
  faPlug,
} from '@fortawesome/free-solid-svg-icons'

export const TAILWIND_COLORS = [
  'blue-400',
  'green-400',
  'orange-400',
  'general',
  'yellow-400',
  'amber-400',
  'general',
  'danger',
]

export const PASTEL_COLORS = [
  '#B6D8F2',
  '#CCD4BF',
  '#D0BCAC',
  '#F4CFDF',
  '#F7F6CF',
  // '#5784BA',
  '#9AC8EB',
  '#98D4BB',
  '#E7CBA9',
  '#EEBAB2',
  '#F5F3E7',
  '#F5BFD2',
  '#E5DB9C',
  '#F5E2E4',
  '#D0BCAC',
  '#BEB4C5',
  '#E6A57E',
  // '#218B82',
  '#9AD9DB',
  '#E5DBD9',
  '#EB96AA',
  '#C6C9D0',
  // '#C54B6C',
  '#E5B3BB',
  '#F9968B',
  // '#C47482',
  '#F27348',
  // '#26474E',
  '#76CDCD',
  // '#37667E',
  '#7B92AA',
  '#E4CEE0',
  // '#A15D98',
  '#DC828F',
  '#F7CE76',
  // '#8C7386',
  // '#9C9359',
  // '#A57283',
  '#E8D595',
]

export const GRADIENT_COLORS = ['#504436', '#84725A']

export const MONTHS = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
]

export const MONTHS_FULL_1 = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

export const MONTHS_FULL = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

export const DAYS_OF_WEEK = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']

export const DAYS_OF_WEEK_FULL = [
  'воскресенье',
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
]

export const AUDIENCE = [
  { value: 'adults', name: 'Взрослые (18-99 лет)' },
  { value: 'teenagers', name: 'Подростки (10-18 лет)' },
  { value: 'kids', name: 'Дети (5-12 лет)' },
  { value: 'other', name: 'Смешанная аудитория' },
]

export const EVENT_TYPES = [
  { value: 'kids', name: 'Детский праздник' },
  { value: 'birthday', name: 'День рождения' },
  { value: 'wedding', name: 'Свадьба' },
  { value: 'corporate', name: 'Корпоратив' },
  { value: 'presentation', name: 'Презентация' },
  { value: 'opening', name: 'Открытие заведения' },
  { value: 'club', name: 'Клуб' },
  { value: 'other', name: 'Другое' },
]

export const SPECTATORS = ['1-15', '15-30', '30-70', '70-200', '200+']

export const DEFAULT_USERS_NOTIFICATIONS = Object.freeze({
  telegram: { active: false, userName: null, id: null },
})

export const DEFAULT_GOOGLE_CALENDAR_REMINDERS = Object.freeze({
  useDefault: false,
  overrides: [
    { method: 'popup', minutes: 60 },
    { method: 'popup', minutes: 24 * 60 },
  ],
})

export const DEFAULT_USER = Object.freeze({
  firstName: '',
  secondName: '',
  thirdName: '',
  password: '',
  email: '',
  phone: null,
  registrationSource: '',
  registrationSourceCapturedAt: null,
  whatsapp: null,
  viber: null,
  telegram: '',
  vk: '',
  instagram: '',
  images: [],
  tariffId: null,
  trialActivatedAt: null,
  trialEndsAt: null,
  trialUsed: false,
  balance: 0,
  billingStatus: 'active',
  tariffActiveUntil: null,
  nextChargeAt: null,
  role: 'user',
  lastActivityAt: null,
  prevActivityAt: null,
  archive: false,
})

export const DEFAULT_ADDRESS = Object.freeze({
  town: '',
  street: '',
  house: '',
  entrance: '',
  floor: '',
  flat: '',
  comment: '',
  latitude: '',
  longitude: '',
  link2Gis: '',
  linkYandexNavigator: '',
  link2GisShow: true,
  linkYandexShow: true,
})

export const DEFAULT_EVENT = Object.freeze({
  clientId: null,
  description: '',
  eventType: '',
  financeComment: '',
  requestCreatedAt: null,
  additionalEvents: [],
  eventDate: null,
  dateEnd: null,
  otherContacts: [],
  invoiceLinks: [],
  receiptLinks: [],
  actLinks: [],
  contractLinks: [],
  documentFiles: [],
  documents: [],
  servicesIds: [],
  address: DEFAULT_ADDRESS,
  status: 'active',
  cancelReason: '',
  contractSum: 0,
  waitDeposit: false,
  depositDueAt: null,
  depositExpectedAmount: null,
  isTransferred: false,
  isByContract: false,
  importedFromCalendar: false,
  importedFromFile: false,
  fileImportChecked: false,
  calendarImportChecked: false,
  calendarSyncError: '',
  colleagueId: null,
  images: [],
  showOnSite: true,
  report: '',
  reportImages: [],
  warning: false,
  likes: false,
  likesProcessActive: true,
})

export const DEFAULT_CLIENT = Object.freeze({
  firstName: '',
  secondName: '',
  thirdName: '',
  phone: null,
  whatsapp: null,
  telegram: '',
  instagram: '',
  vk: '',
  max: '',
  preferredContactChannel: '',
  preferredContactChannelOther: '',
  messengerPushMuted: false,
  comment: '',
  significantDates: [],
  clientType: 'none',
  legalName: '',
  inn: '',
  kpp: '',
  ogrn: '',
  bankName: '',
  bik: '',
  checkingAccount: '',
  correspondentAccount: '',
  legalAddress: '',
  documents: [],
})

export const CLIENT_TYPES = Object.freeze([
  { value: 'none', name: 'Без типа' },
  { value: 'host', name: 'Ведущий' },
  { value: 'organizer', name: 'Организатор' },
  { value: 'colleague', name: 'Коллега' },
])

export const DEFAULT_TRANSACTION = Object.freeze({
  eventId: null,
  clientId: null,
  amount: 0,
  type: 'expense',
  category: 'other',
  date: null,
  comment: '',
})

export const DEFAULT_SUBEVENT = Object.freeze({
  title: '',
  description: '',
  price: 0,
  maxParticipants: null,
  maxMans: null,
  maxWomans: null,
  maxMansNovice: null,
  maxWomansNovice: null,
  maxMansMember: null,
  maxWomansMember: null,
  minMansAge: 35,
  minWomansAge: 30,
  maxMansAge: 50,
  maxWomansAge: 45,
  usersStatusAccess: {},
  usersStatusDiscount: {},
  usersRelationshipAccess: 'yes',
  isReserveActive: true,
})

export const DEFAULT_QUESTIONNAIRE = Object.freeze({
  title: '',
  data: [],
})

export const DEFAULT_QUESTIONNAIRE_ITEM = Object.freeze({
  type: 'text',
  label: '',
  key: '',
  show: true,
  required: false,
})

export const DEFAULT_IMAGE_CONSTRUCTOR_ITEM = Object.freeze({
  type: 'text',
  key: '',
  show: true,
})

export const EVENT_STATUSES_SIMPLE = Object.freeze([
  { value: 'draft', name: 'Заявка', color: 'gray' },
  { value: 'active', name: 'Подтверждено', color: 'blue' },
  { value: 'canceled', name: 'Отменено', color: 'red' },
  { value: 'closed', name: 'Закрыто', color: 'green' },
])

export const TRANSACTION_TYPES = Object.freeze([
  { value: 'expense', name: 'Расход', color: 'red' },
  { value: 'income', name: 'Доход', color: 'green' },
])

export const TRANSACTION_CATEGORIES = Object.freeze([
  { value: 'deposit', name: 'Задаток', type: 'income' },
  { value: 'final_payment', name: 'Остаток оплаты', type: 'income' },
  { value: 'referral_in', name: 'Рекомендация (входящий %)', type: 'income' },
  {
    value: 'referral_out',
    name: 'Рекомендация (исходящий %)',
    type: 'expense',
  },
  // Legacy categories for backward compatibility
  { value: 'client_payment', name: 'Оплата клиента (legacy)', type: 'income' },
  { value: 'advance', name: 'Задаток (legacy)', type: 'income' },
  { value: 'tips', name: 'Чаевые', type: 'income' },
  {
    value: 'colleague_percent',
    name: 'Процент от коллеги (legacy)',
    type: 'income',
  },
  { value: 'refund', name: 'Возврат клиенту', type: 'expense' },
  { value: 'organizer', name: 'Организатору', type: 'expense' },
  { value: 'travel', name: 'Дорога', type: 'expense' },
  { value: 'taxes', name: 'Налоги', type: 'expense' },
  { value: 'expense', name: 'Расходники', type: 'expense' },
  { value: 'other', name: 'Другое', type: 'both' },
])

export const TRANSACTION_PAYMENT_METHODS = Object.freeze([
  { value: 'transfer', name: 'Перевод' },
  { value: 'account', name: 'Расчетный счет' },
  { value: 'cash', name: 'Наличка' },
  { value: 'barter', name: 'Бартер' },
  { value: 'obligation', name: 'Обязательство' },
])
export const DEFAULT_ADDITIONAL_BLOCK = Object.freeze({
  title: '',
  description: '',
  image: null,
  menuName: '',
  index: null,
  showOnSite: true,
})

export const DEFAULT_SERVICE = Object.freeze({
  title: '',
  description: '',
  images: [],
  duration: 0,
  price: 0,
  groupId: null,
})

export const DEFAULT_SERVICE_GROUP = Object.freeze({
  title: '',
  order: 0,
})

export const DEFAULT_TARIFF = Object.freeze({
  title: '',
  eventsPerMonth: 0,
  price: 0,
  allowCalendarSync: false,
  allowStatistics: false,
  allowDocuments: false,
  allowProposals: false,
  allowTelephony: false,
  allowAi: false,
  allowAvitoIntegration: false,
  allowVkIntegration: false,
  allowTelegramIntegration: false,
  allowPublicLeadApi: false,
  hidden: false,
})

export const DEFAULT_PRODUCT = Object.freeze({
  title: '',
  description: '',
  shortDescription: '',
  images: [],
  menuName: '',
  index: null,
  showOnSite: true,
  price: 0,
  questionnaire: null,
  usersStatusAccess: {},
  usersStatusDiscount: {},
})

export const DEFAULT_SERVICE_USER = Object.freeze({
  userId: '',
  serviceId: '',
  answers: {},
  status: 'active',
})

export const DEFAULT_SITE_SETTINGS = Object.freeze({
  email: '',
  phone: '',
  whatsapp: '',
  viber: '',
  telegram: '',
  instagram: '',
  vk: '',
  codeSendService: 'telefonip',
  timeZone: 'Asia/Krasnoyarsk',
  storeCalendarResponse: false,
  referralProgram: {
    percent: 5,
  },
  custom: {
    primaryEntityTerminology: 'auto',
  },
})

export const EVENT_RELATIONSHIP_ACCESS = [
  { value: 'yes', name: 'Всем', color: 'green-400' },
  { value: 'no', name: 'Без пары', color: 'blue-400' },
  { value: 'only', name: 'Только с парой', color: 'red-400' },
]

export const EVENT_STATUSES = [
  { value: 'draft', name: 'Заявка', color: 'gray-400', icon: faClock },
  { value: 'active', name: 'Подтверждено', color: 'blue-400', icon: faPlay },
  { value: 'canceled', name: 'Отменено', color: 'red-400', icon: faBan },
  { value: 'closed', name: 'Закрыто', color: 'green-400', icon: faLock },
]

export const SERVICE_USER_STATUSES = [
  { value: 'active', name: 'Активно', color: 'blue-400', icon: faPlay },
  { value: 'canceled', name: 'Отменено', color: 'red-400', icon: faBan },
  { value: 'closed', name: 'Закрыто', color: 'green-400', icon: faLock },
]

export const PRODUCT_USER_STATUSES = [
  { value: 'active', name: 'Активно', color: 'blue-400', icon: faPlay },
  { value: 'canceled', name: 'Отменено', color: 'red-400', icon: faBan },
  { value: 'closed', name: 'Закрыто', color: 'green-400', icon: faLock },
]

export const EVENT_STATUSES_WITH_TIME = [
  ...EVENT_STATUSES,
  { value: 'finished', name: 'Завершено', color: 'green-400', icon: faCheck },
  { value: 'inProgress', name: 'В процессе', color: 'blue-400', icon: faClock },
]

export const EVENT_USER_STATUSES = [
  { value: 'participant', name: 'Участник', color: 'green-400' },
  { value: 'assistant', name: 'Ведущий', color: 'blue-400' },
  { value: 'reserve', name: 'Резерв', color: 'yellow-400' },
  { value: 'ban', name: 'Бан', color: 'red-400' },
]

export const GENDERS = [
  { value: 'male', name: 'Мужчина', color: 'blue-400', icon: faMars },
  { value: 'famale', name: 'Женщина', color: 'red-400', icon: faVenus },
]

export const GENDERS_WITH_NO_GENDER = [
  ...GENDERS,
  { value: 'null', name: 'Не выбрано', color: 'gray-400', icon: faGenderless },
]

export const ORIENTATIONS = [
  { value: 'getero', name: 'Гетеросексуал', color: 'blue-400' },
  { value: 'bi', name: 'Бисексуал', color: 'general' },
  { value: 'homo', name: 'Гомосексуал', color: 'red-400' },
]

export const CODE_SEND_SERVICES = [
  { value: 'telefonip', name: 'TelefonIP', color: 'orange-400' },
  { value: 'ucaller', name: 'UCaller', color: 'blue-400' },
]

export const SOCIALS = [
  { name: 'Whatsapp', value: 'whatsapp', icon: faWhatsapp, color: 'green-500' },
  { name: 'VK', value: 'vk', icon: faVk, color: 'blue-500' },
  {
    name: 'Instagram',
    value: 'instagram',
    icon: faInstagram,
    color: 'general',
  },
  {
    name: 'Telegram',
    value: 'telegram',
    icon: faTelegram,
    color: 'blue-400',
  },
]

export const pages = [
  // {
  //   id: 0,
  //   group: 0,
  //   name: 'Моя статистика',
  //   href: 'userStatistics',
  //   icon: faTrophy,
  //   accessRoles: CONTENTS['userStatistics'].accessRoles,
  //   roleAccess: CONTENTS['userStatistics'].roleAccess,
  // },
  {
    id: 34,
    group: 1,
    name: 'Важное',
    href: 'attention',
    icon: faExclamationCircle,
  },
  {
    id: 4,
    group: 2,
    name: 'Предстоящие',
    href: 'eventsUpcoming',
    icon: faCalendarCheck,
  },
  {
    id: 5,
    group: 2,
    name: 'Прошедшие',
    href: 'eventsPast',
    icon: faClock,
  },
  // {
  //   id: 5,
  //   group: 3,
  //   name: 'Направления',
  //   href: 'directions',
  //   icon: faHeart,
  // },
  {
    id: 10,
    group: 4,
    name: 'Список клиентов',
    href: 'clients',
    icon: faUser,
  },
  {
    id: 14,
    group: 9,
    name: 'Звонки',
    href: 'calls',
    icon: faPhone,
  },
  {
    id: 11,
    group: 5,
    name: 'Транзакции',
    href: 'transactions',
    icon: faMoneyBill,
  },
  {
    id: 16,
    group: 11,
    name: 'История действий',
    href: 'history',
    icon: faClockRotateLeft,
  },
  {
    id: 12,
    group: 7,
    name: 'Статистика',
    href: 'statistics',
    icon: faChartLine,
  },
  {
    id: 13,
    group: 8,
    name: 'Пользователи',
    href: 'users',
    icon: faUsers,
    accessRoles: ['admin', 'dev'],
  },
  {
    id: 20,
    group: 6,
    name: 'Общие настройки',
    href: 'settings',
    icon: faCog,
  },
  {
    id: 6,
    group: 6,
    name: 'Мои услуги',
    href: 'services',
    icon: faWandMagicSparkles,
  },
  {
    id: 22,
    group: 6,
    name: 'Интеграции',
    href: 'integrations',
    icon: faPlug,
  },
  {
    id: 30,
    group: 6,
    name: 'Импорт и экспорт',
    href: 'import',
    icon: faFileImport,
  },
  {
    id: 23,
    group: 6,
    name: 'Документы',
    href: 'documents',
    icon: faFileLines,
  },
  {
    id: 24,
    group: 6,
    name: 'Списки',
    href: 'lists',
    icon: faList,
  },
  {
    id: 25,
    group: 6,
    name: 'Уведомления',
    href: 'notifications',
    icon: faBell,
  },
  {
    id: 26,
    group: 6,
    name: 'Реферальная система',
    href: 'referrals',
    icon: faMoneyBill,
  },
  {
    id: 36,
    group: 6,
    name: 'Баланс и платежи',
    href: 'billing-history',
    icon: faWallet,
  },
  {
    id: 33,
    group: 10,
    name: 'Контакты',
    href: 'site-contacts',
    icon: faAddressBook,
    accessRoles: ['dev'],
  },
  {
    id: 21,
    group: 10,
    name: 'Тарифы',
    href: 'tariffs',
    icon: faMoneyBill,
    accessRoles: ['dev'],
  },
  {
    id: 27,
    group: 10,
    name: 'Реферальная система',
    href: 'site-referrals',
    icon: faMoneyBill,
    accessRoles: ['dev'],
  },
  {
    id: 28,
    group: 10,
    name: 'ИИ и расходы',
    href: 'ai-usage',
    icon: faChartLine,
    accessRoles: ['dev'],
  },
  {
    id: 37,
    group: 10,
    name: 'Все операции',
    href: 'billing-operations',
    icon: faWallet,
    accessRoles: ['dev'],
  },
  {
    id: 29,
    group: 10,
    name: 'Пробный тариф',
    href: 'registration-trial',
    icon: faGift,
    accessRoles: ['dev', 'admin'],
  },
  {
    id: 35,
    group: 10,
    name: 'Новости платформы',
    href: 'site-news',
    icon: faNewspaper,
    accessRoles: ['dev'],
  },
  {
    id: 32,
    group: 12,
    name: 'Обратная связь',
    href: 'feedback',
    icon: faComments,
  },
  {
    id: 99,
    group: 99,
    name: 'Разработчик',
    href: 'dev',
    icon: faBug,
    accessRoles: ['dev'],
  },
]

export const pagesGroups = [
  // {
  //   id: 0,
  //   name: 'Моя статистика',
  //   icon: faTrophy,
  // },
  {
    id: 1,
    name: 'Важное',
    icon: faExclamationCircle,
  },
  {
    id: 2,
    name: 'Мероприятия',
    icon: faCalendarCheck,
  },
  {
    id: 3,
    name: 'Услуги',
    icon: faWandMagicSparkles,
  },
  {
    id: 4,
    name: 'Клиенты',
    icon: faUser,
  },
  {
    id: 5,
    name: 'Транзакции',
    icon: faMoneyBill,
  },
  {
    id: 11,
    name: 'История действий',
    icon: faClockRotateLeft,
  },
  {
    id: 7,
    name: 'Статистика',
    icon: faChartLine,
  },
  {
    id: 6,
    name: 'Настройки',
    icon: faCog,
  },
  {
    id: 8,
    name: 'Пользователи',
    icon: faUsers,
  },
  {
    id: 9,
    name: 'Звонки',
    icon: faPhone,
  },
  {
    id: 10,
    name: 'Настройки сайта',
    icon: faCog,
  },
  {
    id: 12,
    name: 'Поддержка',
    icon: faComments,
  },
  {
    id: 99,
    name: 'Разработчик',
    icon: faBug,
    // accessRoles: ['dev']
  },
]

export const PRODUCT_PAY_INTERNAL = [
  {
    value: 'toInternal',
    name: 'Затраты',
    color: 'red-400',
    icon: faMoneyBill, //faBriefcase,
  },
  {
    value: 'toUser',
    name: 'Зарплата работнику',
    color: 'red-400',
    icon: faMoneyBill, //faUserAlt,
  },
  {
    value: 'fromInternal',
    name: 'Доп. доходы',
    color: 'green-400',
    icon: faMoneyBill, //faBriefcase,
  },
]

export const DEFAULT_USERS_STATUS_ACCESS = {
  noReg: true,
  novice: true,
  member: true,
}

export const DEFAULT_USERS_STATUS_DISCOUNT = {
  novice: 0,
  member: 0,
}

export const USERS_STATUSES = [
  { value: 'novice', name: 'Новичок', color: 'green-400', icon: faUser },
  {
    value: 'member',
    name: 'Участник клуба',
    color: 'blue-400',
    imageSrc: '/img/svg_icons/medal.svg',
  },
  { value: 'ban', name: 'Бан', color: 'danger', icon: faBan },
]

export const USERS_ROLES = [
  { value: 'user', name: 'Пользователь', color: 'blue-400' },
  { value: 'moder', name: 'Модератор', color: 'green-400' },
  { value: 'admin', name: 'Администратор', color: 'orange-400' },
  { value: 'supervisor', name: 'Руководитель', color: 'general' },
  { value: 'dev', name: 'Разработчик', color: 'danger' },
]

export const UCALLER_VOICE = true
export const UCALLER_MIX = true
