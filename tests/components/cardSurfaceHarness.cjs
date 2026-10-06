// Real JSX/CSS without a database, credentials or Next.js env loading.
// Only query data and unrelated action widgets are replaced with fixed fixtures.
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const client = { _id: 'client', firstName: 'Анна', secondName: 'Иванова' }
const defaultModule = (value) => ({ __esModule: true, default: value })
const emptyWidget = defaultModule(() => null)

const createLoader = () => {
  const cache = new Map()
  const load = (filename) => {
    filename = path.resolve(filename)
    if (cache.has(filename)) return cache.get(filename).exports
    const compiled = { exports: {} }
    cache.set(filename, compiled)
    const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      jsc: {
        parser: { syntax: 'ecmascript', jsx: true },
        transform: { react: { runtime: 'automatic' } },
      },
      module: { type: 'commonjs' },
    })
    const resolve = (id) => {
      if (id === 'jotai')
        return {
          useAtomValue: (atom) =>
            atom === 'settings'
              ? { defaultTown: 'Красноярск' }
              : atom === 'modals'
                ? { event: {} }
                : atom === 'services'
                  ? []
                  : false,
        }
      if (id === '@state/atoms') return { modalsFuncAtom: 'modals' }
      if (id.endsWith('/siteSettingsAtom')) return defaultModule('settings')
      if (id.endsWith('/servicesAtom')) return defaultModule('services')
      if (id.endsWith('/loadingAtom') || id.endsWith('/errorAtom'))
        return defaultModule(() => false)
      if (id === '@helpers/useEventsQuery') return { useEventQuery: () => ({}) }
      if (id === '@helpers/useClientsQuery')
        return { useClientsQuery: () => ({ data: [client] }) }
      if (id === '@helpers/useTransactionsQuery')
        return { useTransactionsQuery: () => ({ data: [] }) }
      if (id === '@helpers/constants')
        return {
          EVENT_STATUSES: ['draft', 'active', 'canceled', 'closed'].map(
            (value) => ({ value })
          ),
          EVENT_STATUSES_SIMPLE: [],
        }
      if (id === 'next/image')
        return defaultModule(({ src, alt, width, height }) =>
          React.createElement('img', { src, alt, width, height })
        )
      if (
        [
          '@components/CardButtons',
          '@components/ContactsIconsButtons',
          '@components/DropDown',
          '@components/EventProposalStatus',
          '@components/EventClientReviewStatus',
        ].includes(id)
      )
        return emptyWidget
      if (id.startsWith('@helpers/'))
        return load(
          path.join('helpers', id.slice(9) + (path.extname(id) ? '' : '.js'))
        )
      if (id.startsWith('@components/'))
        return load(path.join('components', id.slice(12) + '.js'))
      if (id.startsWith('.'))
        return load(
          path.resolve(
            path.dirname(filename),
            id + (path.extname(id) ? '' : '.js')
          )
        )
      return require(id)
    }
    new Function('require', 'module', 'exports', code)(
      resolve,
      compiled,
      compiled.exports
    )
    return compiled.exports
  }
  return load
}

exports.buildCardSurfaceHarness = async () => {
  await loadBindings()
  const load = createLoader()
  const EventCard = load('layouts/cards/EventCard.js').default
  const CardWrapper = load('components/CardWrapper.js').default
  const events = [
    {
      _id: 'empty',
      status: 'draft',
      clientId: 'client',
      calendarImportChecked: true,
      additionalEvents: [
        { title: 'Связаться с клиентом', date: '2020-10-04T16:36:00+07:00' },
      ],
    },
    {
      _id: 'dated',
      status: 'draft',
      clientId: 'client',
      calendarImportChecked: true,
      eventDate: '2099-10-09T21:00:00+07:00',
      address: { town: 'Красноярск' },
    },
    {
      _id: 'past',
      status: 'active',
      clientId: 'client',
      calendarImportChecked: true,
      eventDate: '2020-01-01',
      contractSum: 15000,
    },
    {
      _id: 'past-draft',
      status: 'draft',
      clientId: 'client',
      calendarImportChecked: true,
      eventDate: '2020-01-01',
    },
  ]
  const cards = events
    .map((event) =>
      renderToStaticMarkup(
        React.createElement(EventCard, {
          eventId: event._id,
          event,
          transactions: [],
          style: {
            height: event._id === 'past-draft' ? 258 : 194,
            padding: '6px 8px',
          },
        })
      )
    )
    .join('')
  const plain = renderToStaticMarkup(
    React.createElement(
      CardWrapper,
      { className: 'p-4', style: { height: 100 } },
      'Карточка без свайпа'
    )
  )
  const swipe = renderToStaticMarkup(
    React.createElement(
      CardWrapper,
      { onSwipeLeft: () => {}, className: 'p-4', style: { height: 100 } },
      'Общая карточка со свайпом'
    )
  )
  const css = (
    await require('postcss')([require('@tailwindcss/postcss')()]).process(
      fs.readFileSync('app/globals.css', 'utf8'),
      {
        from: path.resolve('app/globals.css'),
      }
    )
  ).css
  return `<!doctype html><html><head><meta charset="utf-8"><title>Проверка карточек</title><style>${css}</style></head><body><main class="cabinet-canvas" style="min-height:100vh">${cards}${plain}${swipe}</main><aside>Фон вне кабинета</aside></body></html>`
}

if (require.main === module)
  exports
    .buildCardSurfaceHarness()
    .then((html) => fs.writeFileSync(process.argv[2], html))
