import { Schema } from 'mongoose'

const siteSettingsSchema = {
  syncVersion: {
    type: Number,
    default: 1,
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    default: null,
  },
  email: {
    type: String,
    lowercase: true,
    default: null,
  },
  phone: {
    type: Number,
    default: null,
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
    default: null,
  },
  instagram: {
    type: String,
    default: null,
  },
  vk: {
    type: String,
    default: null,
  },
  codeSendService: {
    type: String,
    default: 'telefonip',
  },
  phoneVerification: {
    type: {
      primaryMethod: { type: String, enum: ['call', 'sms'], default: 'call' },
    },
    default: undefined,
  },
  telefonipBalance: {
    type: { lastAlertAt: Date },
    default: undefined,
  },
  eventsTags: {
    type: [{ text: String, color: String }],
    default: [],
  },
  towns: {
    type: [String],
    default: [],
  },
  addresses: {
    type: [
      {
        town: { type: String, default: '' },
        street: { type: String, default: '' },
        house: { type: String, default: '' },
        entrance: { type: String, default: '' },
        floor: { type: String, default: '' },
        flat: { type: String, default: '' },
        comment: { type: String, default: '' },
        link2Gis: { type: String, default: '' },
        linkYandexNavigator: { type: String, default: '' },
        latitude: { type: String, default: '' },
        longitude: { type: String, default: '' },
      },
    ],
    default: [],
  },
  defaultTown: {
    type: String,
    default: '',
  },
  timeZone: {
    type: String,
    default: 'Asia/Krasnoyarsk',
  },
  storeCalendarResponse: {
    type: Boolean,
    default: false,
  },
  referralProgram: {
    type: {
      percent: {
        type: Number,
        default: 5,
      },
    },
    default: {
      percent: 5,
    },
  },
  aiBilling: {
    type: {
      markupCoefficient: {
        type: Number,
        default: 1.5,
        min: 1,
        max: 10,
      },
    },
    default: {
      markupCoefficient: 1.5,
    },
  },
  registrationTrial: {
    type: {
      enabled: { type: Boolean, default: false },
      tariffId: {
        type: Schema.Types.ObjectId,
        ref: 'Tariffs',
        default: null,
      },
      durationDays: { type: Number, default: 14, min: 1, max: 365 },
      welcomeMessage: { type: String, maxlength: 2000, default: '' },
    },
    default: undefined,
  },
  // Публичное оформление страницы отзыва (/review/[id]). Только эти поля
  // могут попасть в публичный слой по ID приглашения.
  reviewPage: {
    type: {
      publicName: { type: String, maxlength: 80, default: '' },
      specialization: { type: String, maxlength: 120, default: '' },
      greeting: { type: String, maxlength: 300, default: '' },
      accent: { type: String, default: 'sand' },
      cover: { type: String, default: 'plain' },
      logoUrl: { type: String, default: '' },
    },
    default: undefined,
  },
  custom: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {},
  },
  fabMenu: {
    type: [{}],
    default: [],
  },
  supervisor: {
    type: { name: String, photo: String, quote: String, showOnSite: Boolean },
    default: {},
  },
  dateStartProject: {
    type: Date,
    default: null,
  },
  headerInfo: {
    type: {
      whatsapp: {
        type: Number,
        default: null,
      },
      telegram: {
        type: String,
        default: null,
      },
      memberChatLink: {
        type: String,
        default: null,
      },
    },
  },
}

export default siteSettingsSchema
