import { DEFAULT_USERS_NOTIFICATIONS } from '@helpers/constants'
import { isValidMaxContact } from '@helpers/maxContact'
import { Schema } from 'mongoose'
import documentSchema from './documentSchema'

const clientsSchema = {
  syncVersion: {
    type: Number,
    default: 1,
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    default: null,
  },
  firstName: {
    type: String,
    maxlength: [
      100,
      'Имя не может быть больше 100 символов. Или это "Напу-Амо-Хала-Она-Она-Анека-Вехи-Вехи-Она-Хивеа-Нена-Вава-Кехо-Онка-Кахе-Хеа-Леке-Еа-Она-Ней-Нана-Ниа-Кеко-Оа-Ога-Ван-Ика-Ванао"? Тут 102 буквы, можешь загуглить....',
    ],
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
  images: {
    type: Array,
    default: [],
  },
  gender: {
    type: String,
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
  whatsappPhoneUnavailable: {
    type: Boolean,
    default: false,
  },
  viber: {
    type: Number,
    default: null,
  },
  telegram: {
    type: String,
    default: '',
  },
  telegramPhone: {
    type: Number,
    default: null,
  },
  telegramPhoneUnavailable: {
    type: Boolean,
    default: false,
  },
  telegramUserId: {
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
  max: {
    type: String,
    maxlength: 500,
    validate: {
      validator: isValidMaxContact,
      message: 'Укажите ссылку на контакт MAX или российский номер телефона',
    },
    default: '',
  },
  preferredContactChannel: {
    type: String,
    enum: ['phone', 'telegram', 'whatsapp', 'max', 'vk', 'other', ''],
    default: '',
  },
  preferredContactChannelOther: {
    type: String,
    maxlength: 100,
    default: '',
  },
  messengerPushMuted: {
    type: Boolean,
    default: false,
  },
  comment: {
    type: String,
    maxlength: 2000,
    default: '',
  },
  significantDates: {
    type: [
      {
        title: {
          type: String,
          maxlength: 100,
          default: '',
        },
        date: {
          type: Date,
          default: null,
        },
        comment: {
          type: String,
          maxlength: 500,
          default: '',
        },
      },
    ],
    default: [],
  },
  role: {
    type: String,
    default: 'client',
  },
  clientType: {
    type: String,
    default: 'none',
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
  town: {
    type: String,
    default: null,
  },
  legalName: {
    type: String,
    default: '',
  },
  inn: {
    type: String,
    default: '',
  },
  kpp: {
    type: String,
    default: '',
  },
  ogrn: {
    type: String,
    default: '',
  },
  bankName: {
    type: String,
    default: '',
  },
  bik: {
    type: String,
    default: '',
  },
  checkingAccount: {
    type: String,
    default: '',
  },
  correspondentAccount: {
    type: String,
    default: '',
  },
  legalAddress: {
    type: String,
    default: '',
  },
  documents: {
    type: [documentSchema],
    default: [],
  },
}

export default clientsSchema
