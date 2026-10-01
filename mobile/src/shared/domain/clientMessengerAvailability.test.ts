import { resetClientMessengerAvailability } from './clientMessengerAvailability'
it('смена телефона убирает подтверждение Telegram и MAX старого номера, сохраняя явную ссылку', () => {
  const existing = { _id: 'client', phone: '79990000000', max: '+79990000000' }
  expect(resetClientMessengerAvailability(existing, { phone: '79991111111', max: existing.max })).toEqual({ phone: '79991111111', max: '', telegramPhone: null, maxPhoneUnavailable: false, telegramPhoneUnavailable: false })
  expect(resetClientMessengerAvailability(existing, { phone: '79991111111', max: 'https://max.ru/u/new' }).max).toBe('https://max.ru/u/new')
  expect(existing.max).toBe('+79990000000')
})
it('не сбрасывает недоступность при правке других данных или форматирования', () => {
  const existing = { _id: 'client', phone: '79990000000', telegram: 'Anna' }
  expect(resetClientMessengerAvailability(existing, { phone: '+7 (999) 000-00-00', telegram: '@anna' })).toEqual({ phone: '+7 (999) 000-00-00', telegram: '@anna' })
})
