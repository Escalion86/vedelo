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

// Управляемые мок-зависимости модалки смены пароля.
const crud = { getData: async () => null, postData: async () => undefined }
const snackbar = { success() {}, error() {}, warning() {}, info() {} }

const mocks = {
  '@components/Notice': { __esModule: true, default: ({ children }) => React.createElement('div', null, children) },
  '@components/AppButton': { __esModule: true, default: ({ children, onClick }) => React.createElement('button', { type: 'button', onClick }, children) },
  '@components/FormWrapper': {
    __esModule: true,
    default: ({ children }) => React.createElement('form', null, children),
  },
  '@components/Input': {
    __esModule: true,
    default: ({ label, value, onChange, error }) =>
      React.createElement(
        'label',
        null,
        label,
        React.createElement('input', {
          'aria-label': label,
          value: value ?? '',
          onChange: (event) => onChange?.(event.target.value),
        }),
        error
          ? React.createElement(
              'span',
              { 'data-field-error': label },
              error
            )
          : null
      ),
  },
  '@helpers/CRUD': {
    getData: (...args) => crud.getData(...args),
    postData: (...args) => crud.postData(...args),
  },
  '@helpers/useSnackbar': { __esModule: true, default: () => snackbar },
}

let ChangePasswordModal

const loadModal = () => {
  const filename = path.resolve('layouts/modals/modalsFunc/changePasswordFunc.js')
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
      return require(id)
    },
    loaded,
    loaded.exports
  )
  return loaded.exports.default
}

test.before(async () => {
  await loadBindings()
  ChangePasswordModal = loadModal()().Children
})

test.after(() => dom.window.close())

const mountModal = async () => {
  const state = {
    closeCalls: 0,
    disables: [],
    confirmNames: [],
    titles: [],
    confirm: null,
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      React.createElement(ChangePasswordModal, {
        closeModal: () => {
          state.closeCalls += 1
        },
        setOnConfirmFunc: (fn) => {
          state.confirm = fn
        },
        setDisableConfirm: (value) => {
          state.disables.push(value)
        },
        setConfirmButtonName: (value) => {
          state.confirmNames.push(value)
        },
        setTitle: (value) => {
          state.titles.push(value)
        },
      })
    )
  })
  return {
    state,
    container,
    root,
    label: (name) => container.querySelector(`[aria-label="${name}"]`),
    fieldError: (name) =>
      container.querySelector(`[data-field-error="${name}"]`)?.textContent || '',
    findByText: (text) =>
      [...container.querySelectorAll('button, span, p, div')].find(
        (node) => node.textContent === text
      ),
    press: async (selector) => {
      const node = container.querySelector(selector)
      assert.ok(node, `Узел ${selector} должен существовать`)
      await act(async () => {
        node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    pressText: async (text) => {
      const node = [...container.querySelectorAll('button')].find(
        (button) => button.textContent.trim() === text
      )
      assert.ok(node, `Кнопка «${text}» должна существовать`)
      await act(async () => {
        node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    type: async (name, value) => {
      const input = container.querySelector(`[aria-label="${name}"]`)
      assert.ok(input, `Поле ${name} должно существовать`)
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          'value'
        ).set
        setter.call(input, value)
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
    },
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

const defaultStatus = (hasPassword) => () => ({
  success: true,
  hasPassword,
})

test('первый пароль: без поля текущего, с повтором и «Установить пароль»', async () => {
  crud.getData = defaultStatus(false)
  crud.postData = async (url, body, onSuccess) => {
    onSuccess({ success: true, mode: 'set' })
  }
  const view = await mountModal()
  assert.equal(view.state.titles.at(-1), 'Установка пароля')
  assert.equal(view.state.confirmNames.at(-1), 'Установить пароль')
  assert.equal(view.label('Текущий пароль'), null)
  assert.ok(view.label('Новый пароль'))
  assert.ok(view.label('Повторите пароль'))
  assert.equal(view.state.disables.at(-1), true)

  await view.type('Новый пароль', 'abcdefgh')
  await view.type('Повторите пароль', 'abcdefgi')
  assert.equal(
    view.fieldError('Повторите пароль'),
    'Пароли не совпадают'
  )
  assert.equal(view.state.disables.at(-1), true)

  await view.type('Повторите пароль', 'abcdefgh')
  assert.equal(view.state.disables.at(-1), false)
  let posted = null
  crud.postData = async (url, body, onSuccess) => {
    posted = { url, body }
    onSuccess({ success: true, mode: 'set' })
  }
  await act(async () => {
    await view.state.confirm()
  })
  assert.deepEqual(posted, {
    url: '/api/auth/change-password',
    body: { currentPassword: '', newPassword: 'abcdefgh' },
  })
  assert.equal(view.state.closeCalls, 1)
  await view.unmount()
})

test('установленный пароль: поле текущего, пустой текущий и неверный текущий не отправляются', async () => {
  crud.getData = defaultStatus(true)
  const calls = []
  crud.postData = async (url, form, onSuccess, onError) => {
    calls.push(form)
    onError(new Error('Текущий пароль указан неверно'))
  }
  const view = await mountModal()
  assert.equal(view.state.titles.at(-1), 'Смена пароля')
  assert.equal(view.state.confirmNames.at(-1), 'Сменить пароль')
  assert.ok(view.label('Текущий пароль'))
  await view.type('Новый пароль', 'abcdefgh')
  await view.type('Повторите пароль', 'abcdefgh')
  assert.equal(view.state.disables.at(-1), true, 'без текущего пароля отправка запрещена')
  await view.type('Текущий пароль', 'wrong-pass')
  assert.equal(view.state.disables.at(-1), false)
  await act(async () => {
    await view.state.confirm()
  })
  assert.deepEqual(calls, [
    { currentPassword: 'wrong-pass', newPassword: 'abcdefgh' },
  ])
  assert.equal(view.state.closeCalls, 0, 'при ошибке окно не закрывается')
  await view.unmount()
})

test('короткий новый пароль не отправляется, ошибка у поля', async () => {
  crud.getData = defaultStatus(false)
  let posted = 0
  crud.postData = async () => {
    posted += 1
  }
  const view = await mountModal()
  await view.type('Новый пароль', 'short12')
  await view.type('Повторите пароль', 'short12')
  assert.equal(view.fieldError('Новый пароль'), 'Минимум 8 символов')
  assert.equal(view.state.disables.at(-1), true)
  await act(async () => {
    await view.state.confirm()
  })
  assert.equal(posted, 0)
  await view.unmount()
})

test('неизвестный статус не считается отсутствием пароля: ошибка и повтор', async () => {
  crud.getData = async () => null
  let posted = 0
  crud.postData = async () => {
    posted += 1
  }
  const view = await mountModal()
  assert.equal(view.state.confirmNames.at(-1), 'Сохранить')
  assert.equal(view.state.disables.at(-1), true)
  assert.equal(view.label('Новый пароль'), null, 'поля скрыты, пока статус неизвестен')
  assert.equal(view.fieldError('Новый пароль'), '')
  assert.ok(
    [...view.container.querySelectorAll('*')].some((node) =>
      node.textContent.includes('Не удалось проверить состояние пароля')
    )
  )

  crud.getData = async () => ({ success: true, hasPassword: false })
  await view.pressText('Повторить')
  assert.equal(view.state.titles.at(-1), 'Установка пароля')
  assert.ok(view.label('Новый пароль'))
  assert.equal(view.state.disables.at(-1), true)
  await view.unmount()
})

test('сервер вернул неверный статус — это ошибка, а не отсутствие пароля', async () => {
  crud.getData = async () => ({ success: true })
  const view = await mountModal()
  assert.equal(view.label('Новый пароль'), null)
  assert.ok(
    [...view.container.querySelectorAll('*')].some((node) =>
      node.textContent.includes('Не удалось проверить состояние пароля')
    )
  )
  await view.unmount()
})
