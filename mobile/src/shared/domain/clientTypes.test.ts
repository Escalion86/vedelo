import { clientTypeOptions, legacyClientTypes } from './clientTypes'

it('hidden types are selectable only when already stored on this client', () => {
  const items = legacyClientTypes.map(item => item.value === 'colleague' ? { ...item, name: 'Исполнитель', hidden: true } : item)
  expect(clientTypeOptions(items, 'none').some(item => item.value === 'colleague')).toBe(false)
  expect(clientTypeOptions(items, 'colleague').find(item => item.value === 'colleague')?.name).toBe('Исполнитель (скрыт)')
  expect(clientTypeOptions(items, 'legacy_unknown').some(item => item.value === 'legacy_unknown')).toBe(true)
})
