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
global.navigator = dom.window.navigator
global.IS_REACT_ACT_ENVIRONMENT = true

const { createRoot } = require('react-dom/client')

// Каталог услуг приходит из useServicesQuery(): на странице «Документы»
// legacy-атом servicesAtom пуст, поэтому редактор шаблона обязан брать данные
// тем же способом, что и редактор коммерческого предложения.
const servicesCatalog = [
  {
    _id: 's1',
    title: 'Стрижка',
    description: 'Стрижка и укладка',
    price: 5000,
  },
  { _id: 's2', title: 'Макияж', price: 7000 },
]

const openedModals = []
const pickerCalls = []
let servicesState = {
  data: servicesCatalog,
  isPending: false,
  isError: false,
}

const modalsFunc = { add: (config) => openedModals.push(config) }
const loggedUser = {
  _id: 'u1',
  firstName: 'Алексей',
  lastName: 'Белинский',
  phone: '+7 900 000-00-00',
}

const Box = ({ children }) => React.createElement('div', null, children)
const Button = ({ children, label, title, disabled, onClick }) =>
  React.createElement(
    'button',
    { type: 'button', title, disabled, onClick },
    label || children
  )
const InputStub = ({ label, value, onChange }) =>
  React.createElement('input', {
    'aria-label': label,
    value: value ?? '',
    onChange: (event) => onChange?.(event.target.value),
  })
const TextareaStub = ({ label, value, onChange }) =>
  React.createElement('textarea', {
    'aria-label': label,
    value: value ?? '',
    onChange: (event) => onChange?.(event.target.value),
  })

const mocks = {
  jotai: {
    useAtomValue: (atom) => (atom === 'loggedUserAtom' ? loggedUser : modalsFunc),
  },
  '@state/atoms/loggedUserAtom': 'loggedUserAtom',
  '@state/atoms/modalsFuncAtom': 'modalsFuncAtom',
  'next/dynamic': () => () => null,
  '@components/AppButton': Button,
  '@components/FormWrapper': Box,
  '@components/IconActionButton': Button,
  '@components/Input': InputStub,
  '@components/Notice': Box,
  '@components/Textarea': TextareaStub,
  '@components/ProposalPageView': Box,
  '@layouts/modals/modalsFunc/selectEventServicesFunc': (
    initialIds,
    onApply,
    options = {}
  ) => {
    pickerCalls.push({ initialIds, onApply, options })
    return { title: 'Выбор услуг', confirmButtonName: 'Применить' }
  },
  '@layouts/modals/modalsFunc/serviceFunc': () => ({ title: 'Услуга' }),
  '@helpers/CRUD': { postData: async () => ({}), putData: async () => ({}) },
  '@helpers/cloudinary': { sendFile: async () => null },
  '@helpers/escalionCloudUpload.mjs': { resolveUploadedFileUrl: () => null },
  '@helpers/formatMoney': { formatMoney: (value) => `${value} ₽` },
  '@helpers/getPersonFullName': (user) =>
    [user?.firstName, user?.lastName].filter(Boolean).join(' '),
  '@helpers/useEntityQueries': {
    useServicesQuery: () => servicesState,
  },
  '@helpers/proposalContent': {
    DEFAULT_PROPOSAL_BLOCKS: [{ type: 'cover', title: 'Обложка', enabled: true }],
    DEFAULT_PROPOSAL_MESSAGE: 'Здравствуйте, {{client.firstName}}!',
    PROPOSAL_TEMPLATE_SERVICES_LIMIT: 30,
    normalizeProposalTemplateDefaults: (defaults) => ({
      servicesIds: Array.isArray(defaults?.servicesIds)
        ? defaults.servicesIds.map(String)
        : [],
    }),
    renderProposalVariables: (value) => ({ text: value, unknown: [] }),
  },
  '@helpers/proposalRichText': {
    PROPOSAL_RICH_TEXT_BLOCK_TYPES: [],
    getProposalBlockContentHtml: () => '',
    renderProposalRichTextVariables: () => ({ html: '', unknown: [] }),
  },
  '@fortawesome/free-regular-svg-icons': { faTrashAlt: {} },
  '@fortawesome/free-solid-svg-icons/faArrowUp': { faArrowUp: {} },
  '@fortawesome/free-solid-svg-icons/faArrowDown': { faArrowDown: {} },
  '@fortawesome/free-solid-svg-icons/faPencilAlt': { faPencilAlt: {} },
}

const load = (file) => {
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
  const resolve = (id) => (id in mocks ? mocks[id] : require(id))
  new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports)
  return mod.exports
}

const mount = async (t, Component, props) => {
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  await React.act(async () => {
    root.render(React.createElement(Component, props))
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  t.after(async () => {
    await React.act(async () => root.unmount())
    element.remove()
  })
  return element
}

const template = {
  _id: 't1',
  name: 'Основной шаблон',
  status: 'active',
  blocks: [{ type: 'cover', title: 'Обложка', enabled: true }],
  messageTemplate: '{{client.firstName}}, добрый день!',
  media: [],
  defaults: { servicesIds: ['s1'] },
}

const mountEditor = async (t) => {
  openedModals.length = 0
  pickerCalls.length = 0
  servicesState = { data: servicesCatalog, isPending: false, isError: false }
  const ProposalTemplateEditor = load('components/ProposalTemplateEditor.js').default
  const changes = {}
  const element = await mount(t, ProposalTemplateEditor, {
    template,
    onSaved: () => {},
    closeModal: () => {},
    setOnConfirmFunc: (handler) => {
      changes.confirm = handler
    },
    setDisableConfirm: (value) => {
      changes.disabled = value
    },
    setOnShowOnCloseConfirmDialog: (value) => {
      changes.showConfirmDialog = value
    },
  })
  return { element, changes }
}

test.before(async () => {
  await loadBindings()
})

test.after(() => dom.window.close())

test('шаблон берёт услуги из запроса, а не из legacy-атома', async (t) => {
  const source = readFileSync(
    path.resolve('components/ProposalTemplateEditor.js'),
    'utf8'
  )
  assert.equal(source.includes('servicesAtom'), false)
  assert.equal(source.includes('useServicesQuery'), true)

  const { element } = await mountEditor(t)
  // Выбранная услуга показана карточкой с ценой из каталога запроса.
  assert.equal(element.textContent.includes('Стрижка'), true)
  assert.equal(element.textContent.includes('5000 ₽'), true)
  assert.equal(element.textContent.includes('1 из 30'), true)
})

test('кнопка «Выбрать услуги» открывает общий список с каталогом услуг', async (t) => {
  const { element } = await mountEditor(t)
  const chooseButton = [...element.querySelectorAll('button')].find((button) =>
    button.textContent.includes('Выбрать услуги')
  )
  assert.ok(chooseButton)
  await React.act(async () => chooseButton.click())

  assert.equal(pickerCalls.length, 1)
  assert.deepEqual(pickerCalls[0].initialIds, ['s1'])
  assert.equal(pickerCalls[0].options.services, servicesCatalog)
  assert.equal(openedModals.at(-1).title, 'Выбор услуг')

  // Применяем выбор из существующих услуг каталога.
  await React.act(async () => pickerCalls[0].onApply(['s1', 's2']))
  assert.equal(element.textContent.includes('Макияж'), true)
  assert.equal(element.textContent.includes('7000 ₽'), true)
  assert.equal(element.textContent.includes('2 из 30'), true)
})

test('услугу можно убрать из шаблона, а лимит шаблона соблюдается', async (t) => {
  const { element } = await mountEditor(t)
  const removeButton = [...element.querySelectorAll('button')].find(
    (button) =>
      button.getAttribute('title') === 'Убрать услугу «Стрижка» из шаблона'
  )
  assert.ok(removeButton)
  await React.act(async () => removeButton.click())
  assert.equal(element.textContent.includes('Стрижка'), false)
  assert.equal(
    element.textContent.includes('Услуги не выбраны'),
    true
  )

  const chooseButton = [...element.querySelectorAll('button')].find((button) =>
    button.textContent.includes('Выбрать услуги')
  )
  await React.act(async () => chooseButton.click())
  const tooMany = Array.from(
    { length: 31 },
    (_, index) => `s${index + 1}`
  )
  await React.act(async () => pickerCalls.at(-1).onApply(tooMany))
  assert.equal(element.textContent.includes('не больше 30 услуг'), true)
  assert.equal(element.textContent.includes('Услуги не выбраны'), true)
})

test('ошибка загрузки услуг видна и блокирует выбор', async (t) => {
  servicesState = { data: [], isPending: false, isError: true }
  const ProposalTemplateEditor = load('components/ProposalTemplateEditor.js').default
  const element = await mount(t, ProposalTemplateEditor, {
    template,
    closeModal: () => {},
    setOnConfirmFunc: () => {},
    setDisableConfirm: () => {},
    setOnShowOnCloseConfirmDialog: () => {},
  })
  assert.equal(
    element.textContent.includes('Не удалось загрузить услуги'),
    true
  )
  const chooseButton = [...element.querySelectorAll('button')].find((button) =>
    button.textContent.includes('Выбрать услуги')
  )
  assert.equal(chooseButton.disabled, true)
})
