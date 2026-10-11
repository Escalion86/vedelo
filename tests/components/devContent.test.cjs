const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { JSDOM } = require('jsdom')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const mocks = {
  jotai: { useAtom: () => [{ storeCalendarResponse: false }, () => {}] },
  '@state/atoms/siteSettingsAtom': {},
  '@helpers/CRUD': {
    postData: () => {
      throw new Error('Запись в API в проверке разметки запрещена')
    },
  },
  '@components/Button': ({ name, disabled, loading }) =>
    React.createElement('button', { disabled: disabled || loading }, name),
  '@components/IconCheckBox': ({ label, checked }) =>
    React.createElement(
      'button',
      { role: 'checkbox', 'aria-checked': checked },
      label
    ),
  '@components/Input': ({ label, type, value, min, max }) =>
    React.createElement(
      'label',
      null,
      label,
      React.createElement('input', { type, defaultValue: value, min, max })
    ),
}
const cache = new Map()
function load(file) {
  const filename = path.resolve(file)
  if (cache.has(filename)) return cache.get(filename)
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  })
  const compiled = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id in mocks) return mocks[id]
      if (id.startsWith('@components/'))
        return load(`components/${id.slice(12)}.js`)
      return require(id)
    },
    compiled,
    compiled.exports
  )
  cache.set(filename, compiled.exports)
  return compiled.exports
}
let document

test.before(async () => {
  await loadBindings()
  const Dev = load('layouts/content/DevContent.js').default
  const html = renderToStaticMarkup(React.createElement(Dev))
  document = new JSDOM(html).window.document
})

test('В контенте Разработчика нет второго заголовка или оставленной пустой панели', () => {
  const duplicates = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(
    (node) => node.textContent.trim() === 'Разработчик'
  )
  assert.equal(
    duplicates.length,
    0,
    'Название остаётся только в общей шапке кабинета'
  )
  assert.equal(
    document.querySelectorAll('.content-toolbar').length,
    0,
    'Под заголовком не остаётся пустая панель'
  )
  const map = fs.readFileSync('layouts/content/contentsMap.js', 'utf8')
  assert.match(
    map,
    /dev:\s*{\s*Component:\s*DevContent,\s*name:\s*'Разработчик'/,
    'Название в общей шапке сохранено'
  )
})

test('Календарь, очистка импорта, экспорт и генерация данных остались на странице', () => {
  const text = document.body.textContent
  for (const label of [
    'Сохранять ответ Google Calendar в поле мероприятия',
    'Синхронизировать календарь',
    'Удалить непроверенные импорты',
    'Скопировать данные для проверки',
    'Генерация тестовых данных',
  ])
    assert.ok(text.includes(label), label)
  assert.equal(document.querySelectorAll('.ui-surface-card').length, 1)
  assert.equal(
    document
      .querySelector('button[role="checkbox"]')
      .getAttribute('aria-checked'),
    'false'
  )
  assert.equal(document.querySelectorAll('input[type="number"]').length, 5)
  assert.deepEqual(
    [...document.querySelectorAll('input[type="number"]')].map(
      (node) => node.value
    ),
    ['5', '3', '5', '5', '10']
  )
})
