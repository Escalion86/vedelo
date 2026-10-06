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
const savedRequests = []
let servicesState = {
  data: servicesCatalog,
  isPending: false,
  isError: false,
}

const modalsFunc = { add: (config) => openedModals.push(config) }
let catalog = servicesCatalog
const queryClient = { getQueryData: () => catalog }
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
const SectionStub = ({ title, summary, children }) =>
  React.createElement(
    'section',
    null,
    React.createElement('div', null, title),
    React.createElement('div', null, summary),
    children
  )
const InputStub = ({ label, value, onChange, disabled }) =>
  React.createElement('input', {
    'aria-label': label,
    value: value ?? '',
    disabled,
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
  '@state/atoms': { modalsFuncAtom: 'modalsFuncAtom' },
  '@state/atoms/loggedUserAtom': 'loggedUserAtom',
  '@state/atoms/modalsFuncAtom': 'modalsFuncAtom',
  'next/dynamic': () => () => null,
  '@components/AppButton': Button,
  '@components/FormWrapper': Box,
  '@components/IconActionButton': Button,
  '@components/AddIconButton': Button,
  '@components/IconCheckBox': Box,
  '@components/Input': InputStub,
  '@components/Notice': Box,
  '@components/Textarea': TextareaStub,
  '@components/ProposalPageView': Box,
  '@components/ProposalLineDialog': Box,
  '@components/CompactEventSection': SectionStub,
  '@layouts/modals/modalsFunc/selectEventServicesFunc': (
    initialIds,
    onApply,
    options = {}
  ) => {
    pickerCalls.push({ initialIds, onApply, options })
    return { title: 'Выбор услуг', confirmButtonName: 'Применить' }
  },
  '@helpers/CRUD': {
    postData: async (url, payload) => {
      savedRequests.push({ url, payload })
      return {}
    },
    putData: async (url, payload) => {
      savedRequests.push({ url, payload })
      return {}
    },
  },
  '@helpers/cloudinary': { sendFile: async () => null },
  '@helpers/escalionCloudUpload.mjs': { resolveUploadedFileUrl: () => null },
  '@helpers/formatMoney': { formatMoney: (value) => `${value} ₽` },
  '@helpers/getPersonFullName': (user) =>
    [user?.firstName, user?.lastName].filter(Boolean).join(' '),
  '@helpers/useEntityQueries': {
    useServicesQuery: () => servicesState,
  },
  '@helpers/queryKeys': { queryKeys: { services: () => ['services'] } },
  '@tanstack/react-query': { useQueryClient: () => queryClient },
  '@helpers/proposalContent': {
    DEFAULT_PROPOSAL_BLOCKS: [{ type: 'cover', title: 'Обложка', enabled: true }],
    DEFAULT_PROPOSAL_MESSAGE: 'Здравствуйте, {{client.firstName}}!',
    normalizeProposalTemplateDefaults: (defaults) => ({
      packages: Array.isArray(defaults?.packages) ? defaults.packages : [],
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
  '@fortawesome/free-solid-svg-icons/faCircleCheck': { faCircleCheck: {} },
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

// Настоящие хелперы вариантов: считаем итоги и переносим услуги каталога.
mocks['@helpers/proposalWorkflow'] = load('helpers/proposalWorkflow.js')
// Общий редактор вариантов — тот же, что в редакторе КП.
mocks['@components/ProposalPackagesEditor'] = load(
  'components/ProposalPackagesEditor.js'
)

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
  defaults: {},
}

const mountEditor = async (t, templateData = template) => {
  openedModals.length = 0
  pickerCalls.length = 0
  savedRequests.length = 0
  servicesState = { data: servicesCatalog, isPending: false, isError: false }
  const ProposalTemplateEditor =
    load('components/ProposalTemplateEditor.js').default
  const changes = {}
  const element = await mount(t, ProposalTemplateEditor, {
    template: templateData,
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

const findButton = (element, text) =>
  [...element.querySelectorAll('button')].find((button) =>
    button.textContent.includes(text)
  )

// React слушает onInput, поэтому значение поля задаём нативным сеттером.
const valueSetterFor = () =>
  Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value'
  ).set

test.before(async () => {
  await loadBindings()
})

test.after(() => dom.window.close())

test('редактор шаблона устроен как редактор КП: варианты, услуги, цена, «Рекомендуем», ручной итог', async (t) => {
  const source = readFileSync(
    path.resolve('components/ProposalTemplateEditor.js'),
    'utf8'
  )
  assert.equal(source.includes('servicesAtom'), false)
  assert.equal(source.includes('useServicesQuery'), true)
  assert.equal(source.includes('ProposalPackagesEditor'), true)

  const { element } = await mountEditor(t)
  assert.equal(element.textContent.includes('Что предлагаем клиенту'), true)
  // Вариант с названием, позициями, ценой и отметкой «Рекомендуем».
  assert.equal(
    element.querySelector('input[aria-label="Название варианта"]').value,
    'Основной вариант'
  )
  assert.equal(
    element.querySelector('[role="checkbox"]').getAttribute('aria-checked'),
    'true'
  )
  assert.equal(element.querySelector('textarea[aria-label="Описание варианта"]') !== null, true)
  assert.ok(findButton(element, 'Выбрать услуги'))
  assert.ok(findButton(element, 'Своя позиция'))
  assert.ok(findButton(element, 'Добавить вариант'))
  assert.equal(
    element.querySelector('input[aria-label="Итого"]').disabled,
    true
  )
  assert.equal(
    element.textContent.includes('Указать итоговую цену вручную'),
    true
  )
})

test('«Выбрать услуги» открывает общий список с каталогом и наполняет вариант', async (t) => {
  const { element } = await mountEditor(t)
  await React.act(async () => findButton(element, 'Выбрать услуги').click())

  assert.equal(pickerCalls.length, 1)
  assert.deepEqual(pickerCalls[0].initialIds, [])
  assert.equal(pickerCalls[0].options.services, servicesCatalog)
  assert.equal(openedModals.at(-1).title, 'Выбор услуг')

  // Применяем выбор из существующих услуг каталога.
  await React.act(async () => pickerCalls[0].onApply(['s1', 's2']))
  assert.equal(element.textContent.includes('Стрижка'), true)
  assert.equal(element.textContent.includes('5000 ₽'), true)
  assert.equal(element.textContent.includes('Макияж'), true)
  assert.equal(element.textContent.includes('12000 ₽ · Позиций: 2'), true)

  // Итог варианта, посчитанный из позиций, попадает в предпросмотр и в вариант.
  assert.equal(pickerCalls.at(-1).options.services, servicesCatalog)
})

test('услуга убирается из варианта, лимит 30 позиций соблюдается, «Своя позиция» открывает диалог', async (t) => {
  const { element } = await mountEditor(t)
  await React.act(async () => findButton(element, 'Выбрать услуги').click())
  await React.act(async () => pickerCalls[0].onApply(['s1']))

  const removeButton = [...element.querySelectorAll('button')].find(
    (button) => button.getAttribute('title') === 'Удалить позицию 1'
  )
  assert.ok(removeButton)
  await React.act(async () => removeButton.click())
  // Удаление позиции подтверждается в диалоге, как в редакторе КП.
  await React.act(async () => openedModals.at(-1).onConfirm())
  assert.equal(element.textContent.includes('Стрижка'), false)
  assert.equal(element.textContent.includes('Позиций: 0'), true)

  // В варианте не может быть больше 30 позиций: каталог из 31 услуги.
  catalog = Array.from({ length: 31 }, (_, index) => ({
    _id: `s${index + 1}`,
    title: `Услуга ${index + 1}`,
    price: 100,
  }))
  const tooMany = catalog.map((service) => service._id)
  await React.act(async () => pickerCalls.at(-1).onApply(tooMany))
  assert.equal(element.textContent.includes('до 30 позиций'), true)
  assert.equal(element.textContent.includes('Позиций: 0'), true)
  catalog = servicesCatalog

  await React.act(async () => findButton(element, 'Своя позиция').click())
  assert.equal(openedModals.at(-1).title, 'Добавление услуги в КП')
})

test('редактор показывает варианты, которые отдал сервер (в т.ч. переведённый старый шаблон)', async (t) => {
  const { element, changes } = await mountEditor(t, {
    ...template,
    defaults: {
      packages: [
        {
          id: 'main',
          title: 'Основной вариант',
          description: 'Полная программа',
          manualTotal: false,
          total: 5000,
          lines: [{ serviceId: 's1', title: 'Стрижка', price: 5000 }],
          recommended: true,
        },
      ],
      servicesIds: ['s1'],
    },
  })
  assert.equal(element.textContent.includes('Стрижка'), true)
  assert.equal(element.textContent.includes('5000 ₽ · Позиций: 1'), true)
  assert.equal(
    element.querySelector('textarea[aria-label="Описание варианта"]').value,
    'Полная программа'
  )
  // Просмотр вариантов сервера не считается ручным изменением.
  assert.equal(changes.showConfirmDialog, false)
})

test('«Рекомендуем», ручная цена варианта и второй вариант работают', async (t) => {
  const { element } = await mountEditor(t)
  await React.act(async () => findButton(element, 'Выбрать услуги').click())
  await React.act(async () => pickerCalls[0].onApply(['s1']))

  const recommend = element.querySelector('[role="checkbox"]')
  await React.act(async () => recommend.click())
  assert.equal(
    element.querySelector('[role="checkbox"]').getAttribute('aria-checked'),
    'false'
  )

  const manualToggle = element.querySelector('label input[type="checkbox"]')
  assert.ok(manualToggle)
  await React.act(async () => manualToggle.click())
  const totalInput = element.querySelector('input[aria-label="Итого"]')
  assert.equal(totalInput.disabled, false)
  await React.act(async () => {
    valueSetterFor(totalInput).call(totalInput, '9000')
    totalInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  assert.equal(element.textContent.includes('9000 ₽ · Позиций: 1'), true)

  await React.act(async () => findButton(element, 'Добавить вариант').click())
  const titles = [...element.querySelectorAll('input[aria-label="Название варианта"]')]
  assert.equal(titles.length, 2)
  assert.equal(titles[1].value, 'Вариант 2')
  // Позиции основного варианта скопированы во второй, как в редакторе КП.
  assert.equal(element.textContent.includes('Позиций: 1'), true)
  assert.ok(
    [...element.querySelectorAll('button')].some(
      (button) => button.getAttribute('title') === 'Удалить вариант'
    )
  )
})

test('сохранение отправляет варианты шаблона и услуги вариантов', async (t) => {
  const { element, changes } = await mountEditor(t, { ...template, _id: null, name: '' })
  await React.act(async () => findButton(element, 'Выбрать услуги').click())
  await React.act(async () => pickerCalls[0].onApply(['s1', 's2']))

  const nameInput = element.querySelector('input[aria-label="Название шаблона"]')
  await React.act(async () => {
    valueSetterFor().call(nameInput, 'Новый шаблон')
    nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  assert.equal(changes.disabled, false)
  await React.act(async () => changes.confirm())

  assert.equal(savedRequests.length, 1)
  assert.equal(savedRequests[0].url, '/api/proposal-templates')
  const defaults = savedRequests[0].payload.defaults
  assert.equal(defaults.packages.length, 1)
  assert.equal(defaults.packages[0].title, 'Основной вариант')
  assert.equal(defaults.packages[0].lines.length, 2)
  assert.equal(defaults.packages[0].total, 12000)
  assert.deepEqual(defaults.servicesIds, ['s1', 's2'])
})

test('ошибка загрузки услуг видна и блокирует выбор', async (t) => {
  servicesState = { data: [], isPending: false, isError: true }
  const ProposalTemplateEditor =
    load('components/ProposalTemplateEditor.js').default
  const element = await mount(t, ProposalTemplateEditor, {
    template,
    closeModal: () => {},
    setOnConfirmFunc: () => {},
    setDisableConfirm: () => {},
    setOnShowOnCloseConfirmDialog: () => {},
  })
  assert.equal(
    element.textContent.includes('Не удалось загрузить каталог услуг'),
    true
  )
  assert.equal(findButton(element, 'Выбрать услуги').disabled, true)
})
