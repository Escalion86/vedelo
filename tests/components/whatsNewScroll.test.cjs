const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const React = require('react')
const { JSDOM } = require('jsdom')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const dom = new JSDOM('<!doctype html><html><body></body></html>')
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true
const { act } = React
const { createRoot } = require('react-dom/client')

const NOW = Date.parse('2026-10-10T12:00:00.000Z')

const NEWS = [
  {
    _id: 'n1',
    version: '1.35.17',
    title: 'ИИ для всех и не только',
    publishedAt: '2026-10-10T06:00:00.000Z',
    body: '🤖 ИИ теперь доступен на всех тарифах.',
  },
  {
    _id: 'n2',
    version: '1.34.3',
    title: 'Что нового в Ведело',
    publishedAt: '2026-10-07T06:00:00.000Z',
    body: '💡 Добавлены подсказки к полям.',
  },
  {
    _id: 'n3',
    version: '1.27.22',
    title: 'Небольшое обновление',
    publishedAt: '2026-09-26T06:00:00.000Z',
    body: '• Улучшили компактную форму.',
  },
  {
    _id: 'n4',
    version: '1.20.1',
    title: 'Обновление регистрации',
    publishedAt: '2026-09-15T06:00:00.000Z',
    body: '• Новый экран регистрации.',
  },
]

let setLoggedUserCalls = []

const mocks = {
  jotai: {
    useAtomValue: (atom) => atom,
    useSetAtom: () => (updater) => {
      setLoggedUserCalls.push(updater)
    },
  },
  '@state/atoms/newsAtom': { __esModule: true, default: NEWS },
  '@state/atoms/loggedUserAtom': {
    __esModule: true,
    default: { _id: 'u1', lastSeenNewsAt: '2026-10-01T00:00:00.000Z' },
  },
  '@components/NewsRichTextView': {
    __esModule: true,
    default: ({ newsItem }) =>
      React.createElement('div', { 'data-news-body': newsItem?._id }, newsItem?.body),
  },
  // Логику «прочитано» тестируем не здесь: подменяем её простой реализацией.
  '@helpers/whatsNew.mjs': {
    __esModule: true,
    filterUnreadNews: (items, seenAt) =>
      (Array.isArray(items) ? items : []).filter(
        (item) =>
          !seenAt || Date.parse(item?.publishedAt ?? 0) > Date.parse(seenAt)
      ),
    getLatestUnreadNews: (items, seenAt) =>
      (Array.isArray(items) ? items : []).find(
        (item) =>
          !seenAt || Date.parse(item?.publishedAt ?? 0) > Date.parse(seenAt)
      ) ?? null,
    buildNewsToastLabel: () => 'есть новости',
  },
  '@fortawesome/react-fontawesome': {
    __esModule: true,
    FontAwesomeIcon: ({ className }) =>
      React.createElement('span', { className }),
  },
  '@fortawesome/free-solid-svg-icons': {
    faChevronDown: {},
    faChevronRight: {},
  },
}

const loadViaAliases = (filename) => {
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id in mocks) return mocks[id]
      if (id === '@components/FormWrapper')
        return loadViaAliases(path.resolve('components/FormWrapper.js'))
      return require(id)
    },
    loaded,
    loaded.exports
  )
  return loaded.exports.default
}

test.before(async () => {
  await loadBindings()
})

test.after(() => dom.window.close())

const mountModal = async () => {
  setLoggedUserCalls = []
  const whatsNewFunc = loadViaAliases(
    path.resolve('layouts/modals/modalsFunc/whatsNewFunc.js')
  )
  const WhatsNewModal = whatsNewFunc().Children
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WhatsNewModal, {}))
  })
  return { container, root }
}

test('список новостей прокручивается внутри модального окна', async () => {
  const { container } = await mountModal()

  const scroll = container.querySelector('div.overflow-y-auto')
  assert.ok(scroll, 'должен быть контейнер с прокруткой')
  assert.match(scroll.className, /min-h-0/)
  assert.match(scroll.className, /flex-1/)
  assert.match(scroll.className, /flex-col/)

  // Все карточки лежат в контейнере прокрутки и не сжимаются: иначе они сплющиваются.
  const cards = [...scroll.children]
  assert.equal(cards.length, NEWS.length, 'все новости должны попасть в список')
  for (const card of cards) {
    assert.match(card.className, /shrink-0/, 'карточка не должна сжиматься')
    assert.ok(card.querySelector('button'), 'у карточки есть заголовок-кнопка')
  }
})

test('раскрытая карточка показывает текст новости', async () => {
  const { container } = await mountModal()

  // Первая (свежая) новость раскрыта, остальные свёрнуты.
  const bodies = [...container.querySelectorAll('[data-news-body]')].map(
    (node) => node.getAttribute('data-news-body')
  )
  assert.deepEqual(bodies, ['n1'])

  const buttons = [...container.querySelectorAll('button[aria-expanded]')]
  const collapsed = buttons.find((b) => b.getAttribute('aria-expanded') === 'false')
  assert.ok(collapsed, 'должны быть свёрнутые новости')
  await act(async () => {
    collapsed.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })

  const opened = [...container.querySelectorAll('[data-news-body]')].map((n) =>
    n.getAttribute('data-news-body')
  )
  assert.equal(opened.length, 2, 'раскрытая новость добавляет свой текст')
})

test('окно помечает прочитанные новости', async () => {
  await mountModal()
  assert.ok(setLoggedUserCalls.length > 0, 'дата просмотра должна сохраняться')
})
