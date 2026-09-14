const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const React = require('react')
const { JSDOM } = require('jsdom')
const { atom, Provider, createStore } = require('jotai')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const dom = new JSDOM('<!doctype html><html><body></body></html>')
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = require('react-dom/client')
const settingsAtom = atom({})
const userAtom = atom({})
const servicesAtom = atom([])
const itemsAtom = atom({})
let Wizard, Tour, helpers, nameHelpers
let post, track, route, queryServices
const inputs = new Map()
const Input = (props) => {
  inputs.set(props.label, props)
  return React.createElement(
    'label',
    null,
    props.label,
    React.createElement('input', { value: props.value ?? '', readOnly: true }),
    props.error
      ? React.createElement('span', { role: 'alert' }, props.error)
      : null
  )
}
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
  helpers = compile('helpers/firstRunWizard.mjs')
  nameHelpers = compile('helpers/personName.mjs')
  const presets = compile('helpers/onboardingPresets.mjs')
  const resolve = (id) => {
    if (id === '@helpers/onboardingPresets.mjs') return presets
    if (id === '@helpers/firstRunWizard.mjs') return helpers
    if (id === '@helpers/personName.mjs') return nameHelpers
    if (id === '@helpers/getPersonFullName')
      return compile('helpers/getPersonFullName.js')
    if (id === '@helpers/getNoun') return compile('helpers/getNoun.js')
    if (id === '@helpers/socialInput')
      return { normalizeTelegramInput: (x) => x }
    if (id === '@helpers/metrikaGoals')
      return { reachGoalOnce: (x) => track.push(x) }
    if (id === '@helpers/useOnboardingTown')
      return (initial) => {
        const [town, changeTown] = React.useState(initial)
        return { town, changeTown, isDetected: false }
      }
    if (id === '@helpers/CRUD') return { postData: (...args) => post(...args) }
    if (id === '@helpers/useEntityQueries')
      return {
        useServicesQuery: () => ({
          data: queryServices,
          isFetching: false,
          isError: false,
          refetch: async () => ({ data: queryServices }),
        }),
      }
    if (id === 'next/navigation')
      return { useRouter: () => ({ push: (x) => route.push(x) }) }
    if (id === '@state/atoms/siteSettingsAtom') return settingsAtom
    if (id === '@state/atoms/loggedUserAtom') return userAtom
    if (id === '@state/atoms/servicesAtom') return servicesAtom
    if (id === '@state/atoms/itemsFuncAtom') return itemsAtom
    if (id === './firstRunTourFunc')
      return {
        FirstRunTourModal: () =>
          React.createElement('div', null, 'Учебный режим'),
      }
    if (id === '@components/Notice')
      return ({ children }) =>
        React.createElement('div', { role: 'alert' }, children)
    if (id.startsWith('@components/')) return Input
    return require(id)
  }
  Wizard = compile(
    'layouts/modals/modalsFunc/userOnboardingFunc.js',
    resolve
  ).FirstRunWizardModal
  Tour = compile('components/FirstRunTour.js', resolve).default
})
test.after(() => dom.window.close())

async function setup(t, custom = {}, overrides = {}, existingServices = []) {
  const store = createStore()
  inputs.clear()
  track = []
  route = []
  queryServices = existingServices
  const savedUsers = [],
    savedServices = [],
    requests = []
  store.set(settingsAtom, {
    defaultTown: 'Красноярск',
    timeZone: 'Asia/Krasnoyarsk',
    custom: { timeZoneConfirmed: true, ...custom },
  })
  store.set(userAtom, {
    _id: 'user-1',
    firstName: 'Анна',
    secondName: 'Иванова',
  })
  store.set(servicesAtom, [])
  store.set(itemsAtom, {
    user: {
      set: async (x) => {
        savedUsers.push(x)
        return x
      },
    },
    service: {
      set: async (x) => {
        savedServices.push(x)
        return { ...x, _id: x._id || 'service-' + savedServices.length }
      },
    },
    ...overrides,
  })
  post = async (url, patch) => {
    requests.push({ url, patch })
    return { ...store.get(settingsAtom), ...patch }
  }
  const oldFetch = global.fetch
  global.fetch = async (url) => {
    requests.push({ url })
    return {}
  }
  let confirm,
    title,
    confirmButtonName,
    disabled,
    closed = false
  const props = {
    closeModal: () => {
      closed = true
    },
    setOnConfirmFunc: (fn) => {
      confirm = fn
    },
    setTitle: (value) => {
      title = value
    },
    setDisableConfirm: (value) => {
      disabled = value
    },
    setConfirmButtonName: (value) => {
      confirmButtonName = value
    },
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = () =>
    root.render(
      React.createElement(
        Provider,
        { store },
        React.createElement(Wizard, props)
      )
    )
  await React.act(render)
  t.after(async () => {
    await React.act(() => root.unmount())
    container.remove()
    global.fetch = oldFetch
  })
  return {
    container,
    store,
    requests,
    savedUsers,
    savedServices,
    confirm: () => React.act(() => confirm()),
    rawConfirm: () => confirm(),
    edit: (label, value) => React.act(() => inputs.get(label).onChange(value)),
    title: () => title,
    confirmButtonName: () => confirmButtonName,
    disabled: () => disabled,
    closed: () => closed,
    remount: async () => {
      await React.act(() => root.render(null))
      await React.act(render)
    },
  }
}

test('four screens save full name and track completion only after services', async (t) => {
  const ui = await setup(t)
  assert.equal(inputs.get('ФИО').value, 'Анна Иванова')
  await ui.confirm()
  assert.deepEqual(
    {
      firstName: ui.savedUsers[0].firstName,
      secondName: ui.savedUsers[0].secondName,
      thirdName: ui.savedUsers[0].thirdName,
    },
    { firstName: 'Анна Иванова', secondName: '', thirdName: '' }
  )
  await ui.confirm()
  assert.deepEqual(track, [])
  await ui.confirm()
  assert.equal(ui.title(), 'Что у вас заказывают?')
  await ui.confirm()
  assert.equal(ui.savedServices.length, 1)
  assert.equal(ui.store.get(settingsAtom).custom.firstRunWizardCompleted, true)
  assert.deepEqual(track, ['onboarding_complete'])
  assert.equal(ui.title(), 'Всё готово к работе')
  assert.equal(
    ui.requests.some((x) => x.url.startsWith('/api/events')),
    false
  )
})

test('existing service makes service creation optional', async (t) => {
  const ui = await setup(t, { firstRunWizardStep: 'services' }, {}, [
    { _id: 'service-existing', title: 'Готовая услуга' },
  ])

  assert.match(ui.container.textContent, /уже есть 1 услуга/i)
  assert.doesNotMatch(ui.container.textContent, /Добавить ещё услугу/)
  assert.equal(ui.confirmButtonName(), 'Пропустить и завершить')

  await ui.confirm()

  assert.equal(ui.savedServices.length, 0)
  assert.equal(ui.store.get(settingsAtom).custom.firstRunWizardCompleted, true)
  assert.equal(ui.title(), 'Всё готово к работе')
})

test('profile errors and failed network never advance the step', async (t) => {
  const ui = await setup(t)
  await ui.edit('ФИО', '   ')
  await ui.confirm()
  assert.equal(ui.savedUsers.length, 0)
  assert.match(ui.container.textContent, /Укажите ФИО/)
  await ui.edit('ФИО', 'Анна')
  post = async () => undefined
  await ui.confirm()
  assert.equal(ui.title(), 'Как вас зовут?')
  assert.match(ui.container.textContent, /Не удалось сохранить/)
})

test('resume after reload and retry partial service saves without duplicates', async (t) => {
  let calls = 0
  const seen = []
  const ui = await setup(
    t,
    { firstRunWizardStep: 'services' },
    {
      service: {
        set: async (x) => {
          seen.push(x)
          calls++
          return calls === 2 ? null : { ...x, _id: x._id || 's-' + calls }
        },
      },
    }
  )
  assert.equal(ui.title(), 'Что у вас заказывают?')
  const add = [...ui.container.querySelectorAll('button')].find((x) =>
    x.textContent.includes('Добавить ещё')
  )
  await React.act(() => add.click())
  await ui.edit('Название услуги', 'Вторая услуга')
  await ui.confirm()
  assert.equal(ui.title(), 'Что у вас заказывают?')
  await ui.confirm()
  assert.equal(seen[2]._id, 's-1')
  assert.equal(ui.title(), 'Всё готово к работе')
})

test('saved step is resumed after unmount and only one request runs on double click', async (t) => {
  const ui = await setup(t)
  await ui.confirm()
  await ui.remount()
  assert.equal(ui.title(), 'Где вы работаете?')
  let release
  post = () =>
    new Promise((resolve) => {
      release = resolve
    })
  let pending
  await React.act(async () => {
    pending = ui.rawConfirm()
    await ui.rawConfirm()
  })
  // The lock is exercised by calling the same callback again while saving.
  assert.equal(ui.disabled(), true)
  post = async (url, patch) => ({ ...ui.store.get(settingsAtom), ...patch })
  await React.act(async () => {
    release({ ...ui.store.get(settingsAtom) })
    await pending
  })
  assert.equal(ui.title(), 'Чем вы занимаетесь?')
})

test('tour actions are local, support skip and complete without any fetch', async (t) => {
  const oldFetch = global.fetch
  global.fetch = () => {
    throw new Error('Tour must not use network')
  }
  const results = []
  const container = document.createElement('div')
  const root = createRoot(container)
  await React.act(() =>
    root.render(
      React.createElement(Tour, {
        presetKey: 'events',
        onExit: (x) => results.push(x),
      })
    )
  )
  t.after(async () => {
    await React.act(() => root.unmount())
    global.fetch = oldFetch
  })
  const click = async (text) => {
    const button = [...container.querySelectorAll('button')].find(
      (x) => x.textContent === text
    )
    assert.ok(button, text)
    await React.act(() => button.click())
  }
  await click('Перейти в кабинет')
  assert.deepEqual(results, ['skipped'])
  await click('Посмотреть следующий шаг')
  await click('Связаться завтра в 12:00')
  assert.match(container.textContent, /12:00 — связаться/)
  await click('Подтвердить заказ')
  assert.match(container.textContent, /Подтверждено/)
  await click('Ожидать задаток завтра')
  await click('Отметить учебный задаток полученным')
  assert.match(container.textContent, /Задаток получен/)
  await click('Завершить знакомство')
  assert.deepEqual(results, ['skipped', 'completed'])
})
