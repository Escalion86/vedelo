import type { Client } from '../../shared/domain/types'
import { clientDisplayName, searchClients } from './clientSearch'

const anna: Client = {
  _id: 'anna',
  firstName: 'Анна',
  secondName: 'Петрова',
  phone: '79990000000',
  telegram: '@anna_p',
  email: 'anna@example.test',
}
const boris: Client = { _id: 'boris', firstName: 'Борис', phone: '79995550000' }
const vera: Client = { _id: 'vera', secondName: 'Соколова', whatsapp: '79992223344', instagram: 'vera.sok' }
const clients = [boris, anna, vera]

describe('поиск клиента в редакторе работы', () => {
  it('имя, телефон и контакты соцсетей доступны поиску', () => {
    expect(searchClients(clients, 'петр').map((item) => item._id)).toEqual(['anna'])
    expect(searchClients(clients, '7999000').map((item) => item._id)).toEqual(['anna'])
    expect(searchClients(clients, 'anna@example').map((item) => item._id)).toEqual(['anna'])
    expect(searchClients(clients, '@anna_p').map((item) => item._id)).toEqual(['anna'])
    expect(searchClients(clients, 'соколова').map((item) => item._id)).toEqual(['vera'])
    expect(searchClients(clients, '79992223344').map((item) => item._id)).toEqual(['vera'])
    expect(searchClients(clients, 'vera.sok').map((item) => item._id)).toEqual(['vera'])
  })

  it('пустой запрос возвращает всех, неизвестный запрос — никого; сортировка по имени', () => {
    expect(searchClients(clients, '   ').map((item) => item._id)).toEqual(['anna', 'boris', 'vera'])
    expect(searchClients(clients, 'иван иванович')).toEqual([])
    expect(searchClients(clients, '99555').map((item) => item._id)).toEqual(['boris'])
  })

  it('отображает имя по частям, иначе телефон, иначе нейтральную подпись', () => {
    expect(clientDisplayName(anna)).toBe('Анна Петрова')
    expect(clientDisplayName({ _id: 'x', phone: '79990000000' })).toContain('7')
    expect(clientDisplayName({ _id: 'x' })).toBe('Клиент')
    expect(clientDisplayName(undefined)).toBe('Клиент')
  })
})
