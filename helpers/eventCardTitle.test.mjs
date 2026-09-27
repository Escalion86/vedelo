import assert from 'node:assert/strict'
import test from 'node:test'
import { getEventCardTitle } from './eventCardTitle.mjs'

test('заголовок мероприятия включает тип и названия выбранных услуг', () => {
  const event = { eventType: ' Свадьба ', servicesIds: ['2', '1'] }
  const services = [
    { _id: '1', title: 'Ведущий' },
    { _id: '2', title: 'Музыка' },
    { _id: '3', title: 'Декор' },
  ]

  assert.equal(getEventCardTitle(event, services), 'Свадьба • Ведущий, Музыка')
})

test('заголовок сохраняет плейсхолдеры при пустых полях', () => {
  assert.equal(
    getEventCardTitle({ eventType: ' ', servicesIds: [] }),
    'Событие не указано • Услуга не указана'
  )
})
