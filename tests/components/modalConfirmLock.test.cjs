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

let Modal

const compile = (file, resolve = require) => {
  const filename = path.resolve(file)
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports)
  return mod.exports
}

test.before(async () => {
  await loadBindings()
  const resolve = (id) => {
    if (id === '@components/Tooltip') {
      return ({ children }) => React.createElement(React.Fragment, null, children)
    }
    if (id === '@fortawesome/react-fontawesome') {
      return { FontAwesomeIcon: () => null }
    }
    if (id === '@fortawesome/free-solid-svg-icons') return { faTimes: {} }
    if (id === '@layouts/modals/ModalButtons') {
      return ({ onConfirmClick, onConfirm2Click, confirmPending }) =>
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: onConfirm2Click || onConfirmClick,
            disabled: confirmPending,
          },
          'Подтвердить'
        )
    }
    if (id === '@state/atoms/modalsAtom') return {}
    if (id === '@state/atoms') return { modalsFuncAtom: {} }
    if (id === 'jotai') {
      return {
        useAtomValue: () => ({ confirm: () => {} }),
        useSetAtom: () => () => {},
      }
    }
    if (id === 'next/navigation') {
      return { useRouter: () => ({ refresh: () => {} }) }
    }
    if (id === 'framer-motion') {
      return { motion: { div: 'div' } }
    }
    return require(id)
  }
  Modal = compile('layouts/modals/Modal.js', resolve).default
})

test.after(() => dom.window.close())

test('modal runs only one async confirm action while the first is pending', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  let releaseRequest
  let requestCount = 0

  const pendingRequest = new Promise((resolve) => {
    releaseRequest = resolve
  })

  const Form = ({ setOnConfirmFunc }) => {
    React.useEffect(() => {
      setOnConfirmFunc(async () => {
        requestCount += 1
        await pendingRequest
      })
    }, [setOnConfirmFunc])
    return null
  }

  try {
    await React.act(async () => {
      root.render(
        React.createElement(Modal, {
          id: 'modal-test',
          Children: Form,
          confirmButtonName: 'Создать',
        })
      )
    })

    const button = container.querySelector('button')
    await React.act(async () => {
      button.click()
      button.click()
    })

    assert.equal(requestCount, 1)
    assert.equal(button.disabled, true)

    await React.act(async () => {
      releaseRequest()
      await pendingRequest
    })

    assert.equal(button.disabled, false)
  } finally {
    await React.act(async () => root.unmount())
  }
})

test('second confirmation waits for saving before closing and blocks repeated clicks', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  let release
  let calls = 0
  let closes = 0
  const pending = new Promise((resolve) => { release = resolve })
  try {
    await React.act(async () => root.render(React.createElement(Modal, {
      id: 'second-confirm-test',
      title: 'Контакт',
      waitForConfirm: true,
      onClose: () => { closes++ },
      onConfirm2: async () => { calls++; await pending },
    })))
    const button = container.querySelector('button')
    await React.act(async () => { button.click(); button.click() })
    assert.equal(calls, 1)
    assert.equal(closes, 0)
    assert.equal(button.disabled, true)
    assert.match(container.textContent, /Контакт/)
    await React.act(async () => { release(); await pending })
    assert.equal(closes, 1)
  } finally {
    await React.act(async () => root.unmount())
  }
})
