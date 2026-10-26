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
const InputStub = ({ ariaLabel, label, value, onChange, disabled }) =>
  React.createElement('input', {
    'aria-label': ariaLabel || label,
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
  '@helpers/proposalArtistContacts.mjs': require('../../helpers/proposalArtistContacts.mjs'),
  '@components/ProposalAppearanceEditor': Box,
  '@helpers/proposalAppearance.mjs': require('../../helpers/proposalAppearance.mjs'),
  '@components/ProposalMediaEditor': Box,
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
  '@helpers/fieldHelp.json': require('../../helpers/fieldHelp.json'),
  '@components/FieldHelp': () => null,
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
  '@helpers/apiClient': {
    apiJson: async (url, options) => {
      savedRequests.push({ url, payload: JSON.parse(options.body), method: options.method })
      return { success: true }
    },
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
    toProposalEditorBlocks: require('../../helpers/proposalContent.js').toProposalEditorBlocks,
    hasProposalEditorSections: require('../../helpers/proposalContent.js').hasProposalEditorSections,
    getVisibleProposalBlocks: require('../../helpers/proposalContent.js').getVisibleProposalBlocks,
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
mocks['@components/ProposalPackageForm'] = load('components/ProposalPackageForm.js')
mocks['@components/ProposalPackageDialog'] = load('components/ProposalPackageDialog.js')
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

const openVariant = async (t, element, adding = false) => {
  await React.act(async () => (adding ? findButton(element, 'Добавить вариант') : element.querySelector('button[title="Редактировать вариант 1"]')).click())
  const config = openedModals.at(-1)
  const state = {}
  const dialog = await mount(t, config.Children, {
    ...config.childrenProps,
    closeModal: () => dialog.remove(),
    setOnConfirmFunc: handler => { state.confirm = handler },
    setDisableConfirm: value => { state.disabled = value },
    setOnShowOnCloseConfirmDialog: value => { state.dirty = value },
  })
  element.append(dialog)
  return { state, dialog, confirm: () => state.confirm() }
}

const template = {
  _id: 't1',
  name: 'Основной шаблон',
  status: 'active',
  blocks: [
    { type: 'cover', title: 'Обложка', enabled: true },
    { type: 'packages', title: 'Варианты программы', enabled: true },
  ],
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
  const dialog = await openVariant(t, element)
  return { element, changes, applyVariant: dialog.confirm, variantState: dialog.state, dismissVariant: () => dialog.dialog.remove() }

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

mocks['@components/ProposalContentEditor'] = load('components/ProposalContentEditor.js').default

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
  assert.equal(element.textContent.includes('Варианты и цены'), true)
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
  assert.equal(element.querySelector('input[aria-label="Итого"]').value, '12000')

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
  const { element, applyVariant } = await mountEditor(t)
  await React.act(async () => findButton(element, 'Выбрать услуги').click())
  await React.act(async () => pickerCalls[0].onApply(['s1']))

  const recommend = element.querySelector('[role="checkbox"]')
  await React.act(async () => recommend.click())
  assert.equal(
    element.querySelector('[role="checkbox"]').getAttribute('aria-checked'),
    'false'
  )

  const manualToggle = [...element.querySelectorAll('label')]
    .find(label => label.textContent.includes('Указать итоговую цену вручную'))
    .querySelector('input[type="checkbox"]')
  assert.ok(manualToggle)
  await React.act(async () => manualToggle.click())
  const totalInput = element.querySelector('input[aria-label="Итого"]')
  assert.equal(totalInput.disabled, false)
  await React.act(async () => {
    valueSetterFor(totalInput).call(totalInput, '9000')
    totalInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  assert.equal(totalInput.value, '9000')
  await React.act(async () => applyVariant())
  const added = await openVariant(t, element, true)
  const titles = [...element.querySelectorAll('input[aria-label="Название варианта"]')]
  assert.equal(titles.length, 1)
  assert.equal(titles[0].value, 'Вариант 2')
  assert.equal(element.querySelector('input[aria-label="Итого"]').disabled, true)
  assert.equal(element.querySelectorAll('.proposal-package').length, 1, 'новый вариант не добавлен до подтверждения')
  await React.act(async () => added.confirm())
  // Новый вариант пустой; услуги и ручная цена первого не наследуются.
  const variants = element.querySelectorAll('.proposal-package')
  assert.equal(variants[0].textContent.includes('9000 ₽ · Позиций: 1'), true)
  assert.equal(variants[1].textContent.includes('0 ₽ · Позиций: 0'), true)
  assert.ok(
    [...element.querySelectorAll('button')].some(
      (button) => button.getAttribute('title') === 'Удалить вариант 2'
    )
  )
})

test('сохранение отправляет варианты шаблона и услуги вариантов', async (t) => {
  const { element, changes, applyVariant } = await mountEditor(t, { ...template, _id: null, name: '' })
  await React.act(async () => findButton(element, 'Выбрать услуги').click())
  await React.act(async () => pickerCalls[0].onApply(['s1', 's2']))

  const nameInput = element.querySelector('input[aria-label="Название шаблона"]')
  await React.act(async () => {
    valueSetterFor().call(nameInput, 'Новый шаблон')
    nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  await React.act(async () => applyVariant())
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

test('шаблон из КП создаётся только по сохранению, предупреждает о ручном тексте и защищает закрытие', async (t) => {
  servicesState = { data: servicesCatalog, isPending: false, isError: false }
  savedRequests.length = 0
  const prepared = require('../../helpers/proposalTemplateFromProposal.mjs').proposalTemplateFromProposal({
    _id:'source-proposal',clientId:'source-client',status:'published',title:'Новый шаблон из КП',
    blocksSnapshot:[{type:'header',contentHtml:'<p>{{client.firstName}}</p>',enabled:true}],
    messageText:'',packages:[{id:'main',title:'Интерактив',lines:[],total:4000,manualTotal:true,recommended:true}],
  })
  let confirm,dirty,closed=false,saved=false
  const Editor=load('components/ProposalTemplateEditor.js').default
  const element=await mount(t,Editor,{
    template:prepared,fromProposal:true,
    closeModal:()=>{closed=true},onSaved:()=>{saved=true},
    setOnConfirmFunc:handler=>{confirm=handler},setDisableConfirm:()=>{},
    setOnShowOnCloseConfirmDialog:value=>{dirty=value},
  })
  assert.equal(element.querySelector('[aria-label="Название шаблона"]').value,'Новый шаблон из КП')
  assert.match(element.textContent,/Проверьте имена, даты и индивидуальные условия/)
  assert.equal(dirty,true)
  assert.equal(savedRequests.length,0)
  await React.act(async()=>confirm())
  assert.equal(closed,true)
  assert.equal(saved,true)
  assert.equal(savedRequests.length,1)
  assert.equal(savedRequests[0].url,'/api/proposal-templates')
  assert.equal(savedRequests[0].payload.messageTemplate,'')
  assert.equal(savedRequests[0].payload.defaults.packages[0].total,4000)
  assert.equal(savedRequests[0].payload.clientId,undefined)
  assert.equal(savedRequests[0].payload._id,undefined)
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
  await openVariant(t, element)
  assert.equal(findButton(element, 'Выбрать услуги').disabled, true)
})

test('изменение существующего шаблона использует реальный контракт PATCH', async (t) => {
  const { changes } = await mountEditor(t)
  await React.act(async () => changes.confirm())
  assert.equal(savedRequests.length, 1)
  assert.equal(savedRequests[0].url, '/api/proposal-templates/t1')
  assert.equal(savedRequests[0].method, 'PATCH')
  assert.deepEqual(savedRequests[0].payload.blocks.filter(block => ['header', 'packagesIntro', 'closing'].includes(block.type)).map(block => block.type), ['header', 'packagesIntro', 'closing'])
})


test('правки варианта локальны до применения, отмена сохраняет исходные данные', async (t) => {
  const { element, changes, variantState, dismissVariant } = await mountEditor(t)
  const field = element.querySelector('input[aria-label="Название варианта"]')
  await React.act(async () => {
    valueSetterFor().call(field, 'Несохранённое название')
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  assert.equal(variantState.dirty, true)
  assert.equal(changes.showConfirmDialog, false)
  assert.equal(element.querySelector('.proposal-package').textContent.includes('Несохранённое название'), false)
  dismissVariant()
  const reopened = await openVariant(t, element)
  assert.equal(reopened.dialog.querySelector('input[aria-label="Название варианта"]').value, 'Основной вариант')
})

test('отмена добавления не создаёт вариант; удаление требует подтверждения', async (t) => {
  const { element, dismissVariant } = await mountEditor(t)
  dismissVariant()
  const added = await openVariant(t, element, true)
  assert.equal(added.dialog.querySelectorAll('.proposal-line-card').length, 0)
  assert.equal(element.querySelectorAll('.proposal-package').length, 1)
  added.dialog.remove()
  assert.equal(element.querySelectorAll('.proposal-package').length, 1)
  const next = await openVariant(t, element, true)
  await React.act(async () => next.confirm())
  await React.act(async () => element.querySelector('button[title="Удалить вариант 2"]').click())
  assert.equal(element.querySelectorAll('.proposal-package').length, 2)
  await React.act(async () => openedModals.at(-1).onConfirm())
  assert.equal(element.querySelectorAll('.proposal-package').length, 1)
})
