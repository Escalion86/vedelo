import { serviceCatalog, servicePatch, serviceValues } from './serviceUi'

it('V: группы по порядку, услуги по названию, архив скрыт, удалённая группа попадает в «Без группы»', () => {
  const catalog = serviceCatalog([
    { _id: 'z', title: 'Я', groupId: 'g' }, { _id: 'a', title: 'А', groupId: 'g' },
    { _id: 'orphan', groupId: 'deleted' }, { _id: 'plain' }, { _id: 'archive', archive: true, groupId: 'g' },
  ], [{ _id: 'g', order: 10 }, { _id: 'first', order: -1 }])
  expect(catalog.groups.map((item) => item._id)).toEqual(['first', 'g'])
  expect(catalog.visible.filter((item) => item.groupId === 'g').map((item) => item._id)).toEqual(['a', 'z'])
  expect(catalog.ungrouped.map((item) => item._id)).toEqual(['orphan', 'plain'])
  expect(catalog.visible.some((item) => item._id === 'archive')).toBe(false)
})
it('V: partial patch не подставляет defaults вместо отсутствующих полей и не стирает описание', () => {
  const initial = serviceValues({ _id: 's', title: 'Услуга', description: ' Текст ', groupId: 'gone' })
  expect(servicePatch({ ...initial, title: 'Новое название' }, initial, false, false)).toEqual({ title: 'Новое название' })
})
it('V: новая услуга сохраняет local groupId и числа с запятой', () => {
  const initial = serviceValues()
  expect(servicePatch({ ...initial, title: ' Съёмка ', price: '12 345,67', duration: '90', groupId: 'local-group' }, initial, true, false)).toMatchObject({ title: 'Съёмка', price: 12345.67, duration: 90, groupId: 'local-group' })
})
it.each([{ title: '' }, { title: 'Услуга', price: '-1' }, { title: 'Услуга', duration: 'abc' }])('V: валидация блокирует некорректную запись %o', (values) => {
  const initial = serviceValues()
  expect(() => servicePatch({ ...initial, ...values }, initial, true, false)).toThrow()
})
