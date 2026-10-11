const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadBindings, transformSync } = require('next/dist/build/swc')
let pages, pagesGroups

test.before(async () => {
  await loadBindings()
  const filename = path.resolve('helpers/constants.js')
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    jsc: { parser: { syntax: 'ecmascript' } },
    module: { type: 'commonjs' },
  })
  const compiledModule = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    require,
    compiledModule,
    compiledModule.exports
  )
  ;({ pages, pagesGroups } = compiledModule.exports)
})
test('Отзывы — отдельная группа с двумя прежними маршрутами, без дублирования в Клиентах/Настройках', () => {
  const group = pagesGroups.find((item) => item.name === 'Отзывы')
  assert.ok(group, 'Нужна отдельная группа «Отзывы»')
  const children = pages.filter((item) => item.group === group.id)
  assert.deepEqual(
    children.map(({ name, href }) => ({ name, href })),
    [
      { name: 'Отзывы клиентов', href: 'client-reviews' },
      { name: 'Настройка страницы отзывов', href: 'review-page' },
    ]
  )
  for (const href of ['client-reviews', 'review-page']) {
    assert.equal(pages.filter((item) => item.href === href).length, 1)
    assert.equal(pages.find((item) => item.href === href).group, group.id)
  }
  assert.equal(pages.find((item) => item.href === 'clients').group, 4)
  assert.equal(pages.find((item) => item.href === 'settings').group, 6)
  assert.equal(
    new Set(pagesGroups.map((item) => item.id)).size,
    pagesGroups.length
  )
})

test('Пользователи вложены в Администрирование без изменения маршрута и доступа', () => {
  const group = pagesGroups.find((item) => item.id === 10)
  assert.equal(group.name, 'Администрирование')
  assert.equal(
    pagesGroups.some((item) => item.id === 8),
    false
  )
  assert.equal(
    pagesGroups.some((item) => item.name === 'Настройки сайта'),
    false
  )
  const users = pages.filter((item) => item.href === 'users')
  assert.equal(users.length, 1)
  assert.equal(users[0].group, 10)
  assert.equal(users[0].name, 'Пользователи')
  assert.deepEqual(users[0].accessRoles, ['admin', 'dev'])
  assert.deepEqual(
    pages.filter((item) => item.group === 10).map((item) => item.href),
    [
      'users',
      'site-contacts',
      'phone-auth',
      'tariffs',
      'site-referrals',
      'ai-usage',
      'billing-operations',
      'service-analytics',
      'registration-trial',
      'site-news',
    ]
  )
})
