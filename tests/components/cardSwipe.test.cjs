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
const { createRoot } = require('react-dom/client')

let SwipeableCard
let motionProps

test.before(async () => {
  await loadBindings()
  const filename = path.resolve('components/SwipeableCard.js')
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  })
  const compiled = { exports: {} }
  const resolve = (id) => {
    if (id === '@fortawesome/react-fontawesome') {
      return { FontAwesomeIcon: () => null }
    }
    if (id === '@fortawesome/free-solid-svg-icons') {
      return { faPencilAlt: {}, faTrashAlt: {} }
    }
    if (id === 'framer-motion') {
      return {
        motion: {
          div: ({ children, className, onClickCapture, style, ...props }) => {
            motionProps = props
            return React.createElement(
              'div',
              { className, onClickCapture, style },
              children
            )
          },
        },
      }
    }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(
    resolve,
    compiled,
    compiled.exports
  )
  SwipeableCard = compiled.exports.default
})

test.after(() => dom.window.close())

test('swipe maps actions and preserves a tap with minor pointer jitter', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  let edits = 0
  let deletes = 0
  let opens = 0

  try {
    await React.act(async () => {
      root.render(
        React.createElement(
          SwipeableCard,
          {
            onSwipeLeft: () => {
              edits += 1
            },
            onSwipeRight: () => {
              deletes += 1
            },
          },
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: () => {
                opens += 1
              },
            },
            'Карточка'
          )
        )
      )
    })

    const card = container.querySelector('button')
    await React.act(async () => card.click())
    assert.equal(opens, 1)

    motionProps.onDragStart()
    motionProps.onDragEnd(null, {
      offset: { x: -70 },
      velocity: { x: 0 },
    })
    await React.act(async () => {
      card.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    assert.equal(edits, 1)
    assert.equal(deletes, 0)
    assert.equal(opens, 1)

    motionProps.onDragStart()
    motionProps.onDragEnd(null, {
      offset: { x: 70 },
      velocity: { x: 0 },
    })
    await React.act(async () => {
      card.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    assert.equal(edits, 1)
    assert.equal(deletes, 1)
    assert.equal(opens, 1)

    motionProps.onDragEnd(null, {
      offset: { x: 2 },
      velocity: { x: 0 },
    })
    await React.act(async () => card.click())
    assert.equal(opens, 2)

    motionProps.onDragStart()
    motionProps.onDragEnd(null, {
      offset: { x: 20 },
      velocity: { x: 0 },
    })
    await React.act(async () => card.click())
    assert.equal(edits, 1)
    assert.equal(deletes, 1)
    assert.equal(opens, 2)
    motionProps.onPointerDownCapture()
    await React.act(async () => card.click())
    assert.equal(opens, 3)
    assert.equal(motionProps.dragSnapToOrigin, 'x')
    assert.match(container.textContent, /Удалить/)
    assert.match(container.textContent, /Изменить/)
  } finally {
    await React.act(async () => root.unmount())
  }
})

test('swipe content has an opaque background in both themes', () => {
  const css = readFileSync(path.resolve('app/globals.css'), 'utf8')
  assert.match(
    css,
    /\.card-swipe-content\s*\{[^}]*background-color:\s*#ffffff/s
  )
  assert.match(
    css,
    /body\.theme-dark\s+\.card-swipe-content\s*\{[^}]*background-color:\s*#18130d/s
  )
})

test('hover lift is applied outside the clipped swipe content', () => {
  const css = readFileSync(path.resolve('app/globals.css'), 'utf8')

  assert.match(
    css,
    /\.card-swipe-row:hover\s*\{[^}]*box-shadow:\s*var\(--surface-card-hover-shadow\)[^}]*transform:\s*translateY\(-1px\)/s
  )
  assert.match(
    css,
    /\.card-swipe-row\s+\.ui-surface-card--interactive:hover\s*\{[^}]*transform:\s*none/s
  )
  assert.match(
    css,
    /\.ui-surface-card--interactive:hover\s*\{[^}]*border-color:\s*var\(--surface-card-hover-border\)/s
  )
})

test('additional-event modals render a skeleton around async saves', () => {
  const listSource = readFileSync(
    path.resolve('layouts/modals/modalsFunc/eventAdditionalEventsFunc.js'),
    'utf8'
  )
  const eventSource = readFileSync(
    path.resolve('layouts/modals/modalsFunc/eventViewFunc.js'),
    'utf8'
  )

  assert.match(listSource, /setPendingAdditionalEvent\(\{ type: 'create' \}\)/)
  assert.match(listSource, /setPendingAdditionalEvent\(\{ type: 'edit', index \}\)/)
  assert.match(listSource, /<AdditionalEventCardSkeleton/)
  assert.match(eventSource, /setPendingAdditionalEventIndex\(index\)/)
  assert.match(eventSource, /<AdditionalEventCardSkeleton/)
})
