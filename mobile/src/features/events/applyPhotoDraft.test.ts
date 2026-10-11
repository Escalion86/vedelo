import { applyPhotoDraft } from './applyPhotoDraft'
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
