import {
  DEFAULT_GOOGLE_CALENDAR_REMINDERS,
  DEFAULT_USERS_NOTIFICATIONS,
} from '@helpers/constants'
import { Schema } from 'mongoose'

const DEFAULT_GOOGLE_CALENDAR_STATUS_COLORS = Object.freeze({
  draft: '8',
  active: '9',
  canceled: '11',
  closed: '10',
})

const usersSchema = {
  aiFileImportBudgets: { type: Schema.Types.Mixed, default: {}, select: false },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    default: null,
  },
  firstName: {
    type: String,
    maxlength: [302, 'ФИО не может быть длиннее 302 символов'],
    default: '',
  },
  secondName: {
    type: String,
    maxlength: [
      100,
      'Фамилия не может быть больше 100 символов. Или это "Напу-Амо-Хала-Она-Она-Анека-Вехи-Вехи-Она-Хивеа-Нена-Вава-Кехо-Онка-Кахе-Хеа-Леке-Еа-Она-Ней-Нана-Ниа-Кеко-Оа-Ога-Ван-Ика-Ванао"? Тут 102 буквы, можешь загуглить....',
    ],
    default: '',
  },
  thirdName: {
    type: String,
    maxlength: [
      100,
      'Отчество не может быть больше 100 символов. Или это "Напу-Амо-Хала-Она-Она-Анека-Вехи-Вехи-Она-Хивеа-Нена-Вава-Кехо-Онка-Кахе-Хеа-Леке-Еа-Она-Ней-Нана-Ниа-Кеко-Оа-Ога-Ван-Ика-Ванао"? Тут 102 буквы, можешь загуглить....',
    ],
    default: '',
  },
  email: {
    type: String,
    lowercase: true,
    default: '',
  },
  password: {
    type: String,
    default: '',
  },
  consentPrivacyPolicyAccepted: {
    type: Boolean,
    default: false,
  },
  consentTermsAccepted: {
    type: Boolean,
    default: false,
  },
  consentPersonalDataAccepted: {
    type: Boolean,
    default: false,
  },
  privacyPolicyAcceptedAt: {
    type: Date,
    default: null,
  },
  termsAcceptedAt: {
    type: Date,
    default: null,
  },
  personalDataProcessingAcceptedAt: {
    type: Date,
    default: null,
  },
  termsVersion: {
    type: String,
    default: '',
  },
  privacyPolicyVersion: {
    type: String,
    default: '',
  },
  personalDataConsentVersion: {
    type: String,
    default: '',
  },
  lastSeenNewsAt: {
    type: Date,
    default: null,
  },
  images: {
    type: Array,
    default: [],
  },
  phone: {
    type: String,
    default: '',
  },
  registrationType: {
    type: String,
    default: 'phone',
  },
  registrationSource: {
    type: String,
    maxlength: 64,
    default: '',
  },
  registrationSourceCapturedAt: {
    type: Date,
    default: null,
  },
  acquisition: {
    type: {
      source: { type: String, maxlength: 160, default: '' },
      medium: { type: String, maxlength: 160, default: '' },
      campaign: { type: String, maxlength: 160, default: '' },
      content: { type: String, maxlength: 160, default: '' },
      term: { type: String, maxlength: 160, default: '' },
      yclid: { type: String, maxlength: 160, default: '' },
      landingPath: { type: String, maxlength: 240, default: '' },
      capturedAt: { type: Date, default: null },
    },
    default: null,
  },
  acquisitionFunnel: {
    type: {
      onboardingCompletedAt: { type: Date, default: null },
      firstCrmItemCreatedAt: { type: Date, default: null },
      firstNextActionAt: { type: Date, default: null },
      lastTrackedVisitAt: { type: Date, default: null },
      returnedWithin7DaysAt: { type: Date, default: null },
      activatedAt: { type: Date, default: null },
      paymentSucceededAt: { type: Date, default: null },
      pilotDemoRequestedAt: { type: Date, default: null },
    },
    default: () => ({}),
  },
  whatsapp: {
    type: Number,
    default: null,
  },
  viber: {
    type: Number,
    default: null,
  },
  telegram: {
    type: String,
    default: '',
  },
  instagram: {
    type: String,
    default: '',
  },
  vk: {
    type: String,
    default: '',
  },
  vkId: {
    type: String,
    default: undefined,
  },
  tariffId: {
    type: Schema.Types.ObjectId,
    ref: 'Tariffs',
    default: null,
  },
  referrerId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    default: null,
  },
  trialActivatedAt: {
    type: Date,
    default: null,
  },
  trialEndsAt: {
    type: Date,
    default: null,
  },
  trialUsed: {
    type: Boolean,
    default: false,
  },
  registrationOffer: {
    type: {
      tariffId: {
        type: Schema.Types.ObjectId,
        ref: 'Tariffs',
        default: null,
      },
      tariffTitle: { type: String, default: '' },
      startedAt: { type: Date, default: null },
      endsAt: { type: Date, default: null },
      welcomeMessage: { type: String, maxlength: 2400, default: '' },
      featureKeys: { type: [String], default: [] },
      featureLabels: { type: [String], default: [] },
    },
    default: null,
  },
  balance: {
    type: Number,
    default: 0,
    min: 0,
  },
  billingStatus: {
    type: String,
    default: 'active',
    enum: ['active', 'paused', 'debt', 'cancelled'],
  },
  tariffActiveUntil: {
    type: Date,
    default: null,
  },
  nextChargeAt: {
    type: Date,
    default: null,
  },
  role: {
    type: String,
    default: 'user',
  },
  lastActivityAt: {
    type: Date,
    default: () => Date.now(),
  },
  prevActivityAt: {
    type: Date,
    default: () => Date.now(),
  },
  archive: {
    type: Boolean,
    default: false,
  },
  notifications: {
    type: Map,
    of: Schema.Types.Mixed,
    default: DEFAULT_USERS_NOTIFICATIONS,
  },
  googleCalendar: {
    type: {
      enabled: { type: Boolean, default: false },
      calendarId: { type: String, default: '' },
      calendarName: { type: String, default: '' },
      refreshToken: { type: String, default: '' },
      accessToken: { type: String, default: '' },
      tokenExpiry: { type: Date, default: null },
      scope: { type: String, default: '' },
      syncToken: { type: String, default: '' },
      connectedAt: { type: Date, default: null },
      email: { type: String, default: '' },
      reminders: {
        useDefault: {
          type: Boolean,
          default: DEFAULT_GOOGLE_CALENDAR_REMINDERS.useDefault,
        },
        overrides: {
          type: Array,
          default: () =>
            DEFAULT_GOOGLE_CALENDAR_REMINDERS.overrides.map((item) => ({
              ...item,
            })),
        },
      },
      statusColors: {
        draft: {
          type: String,
          default: DEFAULT_GOOGLE_CALENDAR_STATUS_COLORS.draft,
        },
        active: {
          type: String,
          default: DEFAULT_GOOGLE_CALENDAR_STATUS_COLORS.active,
        },
        canceled: {
          type: String,
          default: DEFAULT_GOOGLE_CALENDAR_STATUS_COLORS.canceled,
        },
        closed: {
          type: String,
          default: DEFAULT_GOOGLE_CALENDAR_STATUS_COLORS.closed,
        },
      },
      deleteCanceledFromCalendar: {
        type: Boolean,
        default: false,
      },
      skipTransferredFromCalendar: {
        type: Boolean,
        default: false,
      },
      syncSettings: {
        titleMode: { type: String, default: 'eventType_services' },
        showDescription: { type: Boolean, default: true },
        showClient: { type: Boolean, default: true },
        showOtherContacts: { type: Boolean, default: true },
        showColleague: { type: Boolean, default: true },
        showContractSum: { type: Boolean, default: true },
        showFinanceComment: { type: Boolean, default: true },
        showTransactions: { type: Boolean, default: true },
        showAdditionalEvents: { type: Boolean, default: true },
        showNavigationLinks: { type: Boolean, default: true },
        showEventLink: { type: Boolean, default: true },
      },
    },
    default: () => ({}),
  },
  googleCalendarImport: {
    type: {
      enabled: { type: Boolean, default: false },
      calendarId: { type: String, default: '' },
      calendarName: { type: String, default: '' },
      refreshToken: { type: String, default: '' },
      accessToken: { type: String, default: '' },
      tokenExpiry: { type: Date, default: null },
      scope: { type: String, default: '' },
      connectedAt: { type: Date, default: null },
      email: { type: String, default: '' },
    },
    default: () => ({}),
  },
}

export default usersSchema
