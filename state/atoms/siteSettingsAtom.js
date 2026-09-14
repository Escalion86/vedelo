import { atom } from 'jotai'

const siteSettingsAtom = atom({
  email: null,
  phone: null,
  whatsapp: null,
  viber: null,
  telegram: null,
  instagram: null,
  vk: null,
  towns: [],
  defaultTown: '',
  timeZone: 'Asia/Krasnoyarsk',
  storeCalendarResponse: false,
  custom: { cancelReasons: [], primaryEntityTerminology: 'auto' },
})

export default siteSettingsAtom
