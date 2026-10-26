import test from 'node:test'
import assert from 'node:assert/strict'
import { phoneNumbersFromText } from './phoneNumbersFromText.mjs'

test('находит единственный телефон внутри сообщения с датой и суммой', () => {
  assert.deepEqual(
    phoneNumbersFromText('Анна, 26.10.2026 в 18:30, заказ 25000 ₽. Тел.: +7 (999) 123-45-67, звонить вечером'),
    ['79991234567']
  )
})

test('принимает российские номера с 7, 8 и без префикса', () => {
  for (const phone of ['79991234567', '89991234567', '9991234567', '+7(999)1234567', '8 999 123 45 67', '(999)123-45-67'])
    assert.deepEqual(phoneNumbersFromText(phone), ['79991234567'], phone)
})

test('понимает неразрывные пробелы, табуляцию, точки и типографские тире', () => {
  for (const separator of [' ', '\t', '\u00a0', '\u202f', '.', '-', '‑', '–', '—'])
    assert.deepEqual(phoneNumbersFromText(`+7${separator}(999)${separator}123${separator}45${separator}67`), ['79991234567'])
})

test('понимает городские коды из четырёх и пяти цифр', () => {
  assert.deepEqual(phoneNumbersFromText('Офис: 8 (3952) 12-34-56; филиал: +7 (39543) 1-23-45'), ['73952123456', '73954312345'])
})

test('извлекает несколько номеров по порядку, в том числе из одной строки', () => {
  for (const separator of [', ', '; ', '\n', ' / ', ' '])
    assert.deepEqual(
      phoneNumbersFromText(`Анна: +7 (999) 123-45-67${separator}8 (913) 765-43-21${separator}3951234567`),
      ['79991234567', '79137654321', '73951234567']
    )
})

test('дедупликация разных записей одного номера не меняет порядок', () => {
  assert.deepEqual(phoneNumbersFromText('+7 (999) 123-45-67; 89991234567; 9991234567; 89137654321; +7 913 765 43 21'), ['79991234567', '79137654321'])
})

test('не вырезает телефон из длинного числа, буквенного ID или иностранного номера', () => {
  for (const text of ['123799912345679', '19991234567', 'A79991234567B', 'код_9991234567', '+1 999 123 45 67', '+44 (999) 123-45-67', '+8 (999) 123-45-67', '+799912345678', '8 (999) 123-45', '9999999999'])
    assert.deepEqual(phoneNumbersFromText(text), [], text)
})

test('пустой буфер, обычный текст и неподходящие типы не дают номеров', () => {
  for (const text of ['', 'Клиент Анна, заказ 25000 на 26.10.2026', null, undefined, 79991234567])
    assert.deepEqual(phoneNumbersFromText(text), [])
})

test('повторные вызовы независимы', () => {
  assert.deepEqual(phoneNumbersFromText('79991234567'), ['79991234567'])
  assert.deepEqual(phoneNumbersFromText('89137654321'), ['79137654321'])
})
