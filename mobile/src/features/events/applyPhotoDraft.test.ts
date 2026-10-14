import { applyPhotoDraft, photoDraftHighlights } from './applyPhotoDraft'
import { createEventDraft } from '../../shared/domain/eventForm'
it('photo transfer validates client/services and all supported fields without saving', () => {
  const draft = createEventDraft()
  const result = applyPhotoDraft(draft, { eventType: 'Шоу', clientId: 'foreign', servicesIds: ['foreign', 'service-a'], isByContract: true, financeComment: 'Проверить оплату', address: { comment: 'Со двора' } }, new Set(['client-a']), new Set(['service-a']))
  expect(result.values.clientId).toBe('')
  expect(result.serviceIds).toEqual(['service-a'])
  expect(result.values).toMatchObject({ eventType: 'Шоу', isByContract: true, financeComment: 'Проверить оплату', addressComment: 'Со двора' })
  expect(draft.values.eventType).toBe('')
})
it('перенос фото сохраняет копейки и явно распознанную нулевую сумму', () => {
  const draft = createEventDraft()
  draft.values.contractSum = '900'
  draft.values.depositExpectedAmount = '100'
  const result = applyPhotoDraft(draft, { contractSum: 1250.5, depositExpectedAmount: 120.25 }, new Set(), new Set())
  expect(result.values.contractSum).toBe('1250.5')
  expect(result.values.depositExpectedAmount).toBe('120.25')
  const zero = applyPhotoDraft(draft, { contractSum: 0 }, new Set(), new Set())
  expect(zero.values.contractSum).toBe('0')
  expect(draft.values.contractSum).toBe('900')
})

it('подсветка принимает только валидные распознанные поля и известные связи', () => {
  const fields = { eventType: 'Заказ', clientId: 'client-a', servicesIds: ['foreign', 'service-a'], contractSum: 0,
    depositExpectedAmount: 12.25, waitDeposit: false, isByContract: true, eventDate: '2026-10-15T12:00:00Z',
    address: { town: 'Город', street: ' Улица ', house: ' ', comment: 'Вход справа' } }
  expect([...photoDraftHighlights(fields, ['eventType', 'clientId', 'servicesIds', 'contractSum', 'depositExpectedAmount', 'waitDeposit', 'isByContract', 'eventDate', 'address'], new Set(['client-a']), new Set(['service-a']))])
    .toEqual(['eventType', 'clientId', 'servicesIds', 'contractSum', 'depositExpectedAmount', 'waitDeposit', 'isByContract', 'eventDate', 'town', 'street', 'addressComment'])
})
it('подсветка исключает чужие связи, неверные суммы/даты, пустой текст и служебные поля', () => {
  const fields = { clientId: 'foreign', servicesIds: ['foreign'], eventDate: 'не дата', dateEnd: '', contractSum: -1,
    depositExpectedAmount: Infinity, eventType: ' ', description: '', financeComment: ' ', address: { town: ' ' },
    tenantId: 'foreign', status: 'closed' }
  expect([...photoDraftHighlights(fields, Object.keys(fields), new Set(['client-a']), new Set(['service-a']))]).toEqual([])
})
it('подсветка ограничена aiFilledFields, распознанные поля без маркера не выделяются', () => {
  expect([...photoDraftHighlights({ eventType: 'Заказ', description: 'Текст' }, ['description'], new Set(), new Set())]).toEqual(['description'])
})
