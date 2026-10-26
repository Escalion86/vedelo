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
const openedModals = []
const requests = []
let templates = []
const snackbar = { success() {} }
const queryClient = {
  getQueryData: () => [],
  invalidateQueries: async () => {},
}

const Box = ({ children }) => React.createElement('div', null, children)
const Button = ({ children, label, title, disabled, onClick }) =>
  React.createElement(
    'button',
    { type: 'button', title, disabled, onClick },
    label || children
  )
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => ({ success: status < 400, data }),
})

const mocks = {
  '@helpers/proposalTemplateFromProposal.mjs': require('../../helpers/proposalTemplateFromProposal.mjs'),
  '@layouts/modals/modalsFunc/proposalTemplateFunc': (template, onSaved, options) => ({ title: 'Новый шаблон предложения', childrenProps: { template, onSaved, ...options } }),
  '@state/atoms/loggedUserAtom': 'loggedUser',
  '@helpers/proposalArtistContacts.mjs': require('../../helpers/proposalArtistContacts.mjs'),
  '@components/ProposalMediaEditor': Box,
  '@helpers/fieldHelp.json': require('../../helpers/fieldHelp.json'),
  '@components/FieldHelp': () => null,
  jotai: {
    useAtomValue: () => ({ add: (config) => openedModals.push(config) }),
  },
  '@state/atoms': { modalsFuncAtom: 'modals' },
  'next/dynamic': () => () => null,
  '@components/Notice': Box,
  '@components/ProposalShareDialog': Box,
  '@helpers/copyProposalText': { copyProposalText: async () => {} },
  '@components/LoadingSpinner': Box,
  '@components/ProposalStatusChip': ({ status }) => React.createElement('span', null, status === 'accepted' ? 'КП принято' : status === 'sent' ? 'КП отправлено' : ''),
  '@helpers/proposalStatus.mjs': require('../../helpers/proposalStatus.mjs'),
  '@helpers/useSnackbar': () => snackbar,
  '@components/CompactEventSection': Box,
  '@components/Input': () => null,
  '@components/Textarea': () => null,
  '@components/ComboBox': ({ label, value, onChange, items }) =>
    React.createElement(
      'label',
      null,
      label,
      React.createElement(
        'select',
        {
          'aria-label': label,
          value,
          onChange: (event) => onChange(event.target.value),
        },
        items.map((item) =>
          React.createElement(
            'option',
            { key: item.value, value: item.value },
            item.name
          )
        )
      )
    ),
  '@components/AppButton': Button,
  '@components/AddIconButton': Button,
  '@components/IconActionButton': Button,
  '@fortawesome/free-regular-svg-icons': { faTrashAlt: {} },
  '@fortawesome/free-solid-svg-icons/faPencilAlt': { faPencilAlt: {} },
  '@layouts/modals/modalsFunc/selectEventServicesFunc': () => ({}),
  '@helpers/queryKeys': {
    queryKeys: {
      services: () => ['services'],
      proposalStatuses: ['proposalStatuses'],
      eventProposals: (id) => ['eventProposals', id],
    },
  },
  '@helpers/useEventProposalsQuery': {
    useEventProposalsQuery: () => ({ data: [] }),
    cacheEventProposal: async () => {},
  },
  '@components/ProposalLineEditor': Box,
  '@components/ProposalLineDialog': Box,
  '@components/ProposalAppearanceEditor': Box,
  '@helpers/proposalAppearance.mjs': require('../../helpers/proposalAppearance.mjs'),
  '@components/IconCheckBox': Box,
  '@helpers/useEntityQueries': {
    useServicesQuery: () => ({ data: [], isError: false, isPending: false }),
  },
  '@helpers/proposalWorkflow': {
    calculatePackageTotal: () => 0,
    reconcileProposalServices: () => [],
    isProposalSelectionApplied: () => false,
  },
  '@helpers/formatMoney': { formatMoney: (value) => String(value) },
  '@helpers/cloudinary': { sendFile: async () => null },
  '@helpers/proposalContent': {
    toProposalEditorBlocks: require('../../helpers/proposalContent.js').toProposalEditorBlocks,
    hasProposalEditorSections: require('../../helpers/proposalContent.js').hasProposalEditorSections,
    getVisibleProposalBlocks: require('../../helpers/proposalContent.js').getVisibleProposalBlocks,
    renderProposalVariables: (value) => ({ text: value, unknown: [] }),
  },
  '@helpers/proposalRichText': {
    getProposalBlockContentHtml: () => '',
    PROPOSAL_RICH_TEXT_BLOCK_TYPES: [],
    renderProposalRichTextVariables: () => ({ html: '', unknown: [] }),
  },
  '@tanstack/react-query': {
    useQueryClient: () => queryClient,
  },
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

// Редактор КП использует общий редактор вариантов — грузим его настоящим.
mocks['@helpers/proposalWorkflow'] = load('helpers/proposalWorkflow.js')
mocks['@components/ProposalPackageForm'] = load('components/ProposalPackageForm.js')
mocks['@components/ProposalPackageDialog'] = load('components/ProposalPackageDialog.js')
mocks['@components/ProposalPackagesEditor'] = load(
  'components/ProposalPackagesEditor.js'
)

mocks['@components/ProposalContentEditor'] = load('components/ProposalContentEditor.js').default

test.before(async () => {
  await loadBindings()
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options })
    if (String(url) === '/api/proposal-templates') return response(templates)
    if (options.method === 'POST') {
      return response(
        {
          _id: 'created-proposal',
          version: 1,
          validUntil: '2026-10-10T00:00:00.000Z',
        },
        201
      )
    }
    return response([])
  }
})

test.after(() => dom.window.close())

test('proposal creation hides the inline selector and opens template choice only when needed', async (t) => {
  const EventProposalsSection = load(
    'components/EventProposalsSection.js'
  ).default

  templates = [{ _id: 'template-1', name: 'Основной шаблон', status: 'active' }]
  openedModals.length = 0
  requests.length = 0
  const withTemplates = await mount(t, EventProposalsSection, {
    eventId: 'event-1',
  })
  assert.equal(withTemplates.querySelector('select'), null)
  assert.equal(
    withTemplates.textContent.includes('Предложений по этой заявке ещё нет'),
    false
  )
  const createWithTemplate = [...withTemplates.querySelectorAll('button')].find(
    (button) => button.textContent.includes('Создать предложение')
  )
  assert.ok(createWithTemplate)
  await React.act(async () => createWithTemplate.click())
  const pickerModal = openedModals.at(-1)
  assert.equal(pickerModal.title, 'Выбор шаблона предложения')
  assert.equal(
    requests.some((item) => item.options.method === 'POST'),
    false
  )

  let confirm
  let closed = false
  const picker = await mount(t, pickerModal.Children, {
    ...pickerModal.childrenProps,
    closeModal: () => {
      closed = true
    },
    setOnConfirmFunc: (handler) => {
      confirm = handler
    },
  })
  assert.equal(
    picker.querySelector('[aria-label="Шаблон предложения"]').value,
    'template-1'
  )
  await React.act(async () => confirm())
  assert.equal(closed, true)
  const templateRequest = requests.find(
    (item) => item.options.method === 'POST'
  )
  assert.deepEqual(JSON.parse(templateRequest.options.body), {
    templateId: 'template-1',
  })

  templates = []
  openedModals.length = 0
  requests.length = 0
  const withoutTemplates = await mount(t, EventProposalsSection, {
    eventId: 'event-2',
  })
  const createWithoutTemplate = [
    ...withoutTemplates.querySelectorAll('button'),
  ].find((button) => button.textContent.includes('Создать предложение'))
  await React.act(async () => createWithoutTemplate.click())
  assert.equal(
    openedModals.some((modal) => modal.title === 'Выбор шаблона предложения'),
    false
  )
  const directRequest = requests.find((item) => item.options.method === 'POST')
  assert.deepEqual(JSON.parse(directRequest.options.body), { templateId: '' })
  assert.equal(openedModals.at(-1).title, 'Редактор коммерческого предложения')
})

test('сохранение КП как шаблона читает актуальную версию, не создаёт записи до сохранения и обновляет выбор шаблонов', async (t) => {
  const previousHook = mocks['@helpers/useEventProposalsQuery']
  const previousFetch = global.fetch
  const source = { _id: 'proposal-template-source', title: 'Устаревший заголовок', version: 1, status: 'published', selectedPackageId: 'main', packages: [{id:'main',title:'Интерактив',lines:[],total:5000,manualTotal:true,recommended:true}] }
  const calls = []
  let refreshed = false
  mocks['@helpers/useEventProposalsQuery'] = { useEventProposalsQuery: () => ({ data: [source] }) }
  global.fetch = async (url, options = {}) => {
    calls.push({url,options})
    if (url === '/api/proposal-templates') return response(refreshed ? [{_id:'new-template',name:'Актуальное КП',status:'active'}] : [])
    return response({...source,title:'Актуальное КП',blocksSnapshot:[],messageText:'{{client.firstName}}',mediaSnapshot:[]})
  }
  t.after(() => { mocks['@helpers/useEventProposalsQuery'] = previousHook; global.fetch = previousFetch })
  openedModals.length = 0
  const Section = load('components/EventProposalsSection.js').default
  const element = await mount(t, Section, {eventId:'event-template-source'})
  const button = [...element.querySelectorAll('button')].find(button=>button.textContent==='Сохранить как шаблон')
  assert.ok(button)
  await React.act(async()=>{button.click();button.click()})
  assert.equal(calls.filter(call=>call.url==='/api/proposals/proposal-template-source').length,1)
  assert.equal(calls.some(call=>call.options.method),false)
  assert.equal(openedModals.length,1)
  const editor = openedModals[0]
  assert.equal(editor.title,'Новый шаблон предложения')
  assert.equal(editor.childrenProps.fromProposal,true)
  assert.equal(editor.childrenProps.template._id,undefined)
  assert.equal(editor.childrenProps.template.name,'Актуальное КП')
  assert.equal(editor.childrenProps.template.selectedPackageId,undefined)
  assert.equal(source.title,'Устаревший заголовок')
  refreshed=true
  await React.act(async()=>{editor.childrenProps.onSaved();await new Promise(resolve=>setTimeout(resolve,10))})
  await React.act(async()=>{[...element.querySelectorAll('button')].find(button=>button.textContent==='Создать предложение').click()})
  assert.equal(openedModals.at(-1).childrenProps.templates[0]._id,'new-template')
})

test('недоступное исходное КП не открывает редактор шаблона и не отправляет запись', async (t) => {
  const previousHook = mocks['@helpers/useEventProposalsQuery']
  const previousFetch = global.fetch
  mocks['@helpers/useEventProposalsQuery'] = { useEventProposalsQuery: () => ({data:[{_id:'unavailable',title:'КП',version:1,status:'draft',packages:[]}]}) }
  const calls=[]
  global.fetch=async(url,options={})=>{calls.push({url,options});return url==='/api/proposal-templates'?response([]):response(null,404)}
  t.after(()=>{mocks['@helpers/useEventProposalsQuery']=previousHook;global.fetch=previousFetch})
  openedModals.length=0
  const Section=load('components/EventProposalsSection.js').default
  const element=await mount(t,Section,{eventId:'event-unavailable'})
  await React.act(async()=>{[...element.querySelectorAll('button')].find(button=>button.textContent==='Сохранить как шаблон').click()})
  assert.equal(openedModals.length,0)
  assert.equal(calls.some(call=>call.options.method),false)
  assert.match(element.textContent,/Не удалось открыть предложение/)
})

test('line dialog keeps edits local until apply and protects unsaved changes', async (t) => {
  let changeLine
  mocks['@components/ProposalLineEditor'] = ({ onChange }) => {
    changeLine = onChange
    return null
  }
  const Dialog = load('components/ProposalLineDialog.js').default
  const original = { title: 'Услуга', description: 'Описание', price: 100 }
  let confirm
  let dirty
  let disabled
  let applied
  let closed = false
  await mount(t, Dialog, {
    initialLine: original,
    index: 0,
    services: [],
    onApply: (line) => {
      applied = line
    },
    closeModal: () => {
      closed = true
    },
    setOnConfirmFunc: (handler) => {
      confirm = handler
    },
    setDisableConfirm: (value) => {
      disabled = value
    },
    setOnShowOnCloseConfirmDialog: (value) => {
      dirty = value
    },
  })
  assert.equal(dirty, false)
  await React.act(async () => changeLine({ title: '  ', price: 250 }))
  assert.equal(disabled, true)
  assert.equal(dirty, true)
  await React.act(async () => confirm())
  assert.equal(applied, undefined)
  assert.equal(closed, false)
  assert.equal(original.price, 100)
  await React.act(async () => changeLine({ title: ' Новое название ' }))
  assert.equal(disabled, false)
  assert.equal(applied, undefined)
  await React.act(async () => confirm())
  assert.deepEqual(applied, {
    title: 'Новое название',
    description: 'Описание',
    price: 250,
  })
  assert.equal(closed, true)
  assert.equal(original.title, 'Услуга')
})

test('publication from the card updates the shared list and old GET cannot restore draft', async (t) => {
  const actualQuery = require('@tanstack/react-query')
  const client = new actualQuery.QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  t.after(() => client.clear())
  const previousQuery = mocks['@tanstack/react-query']
  const previousHook = mocks['@helpers/useEventProposalsQuery']
  const previousFetch = global.fetch
  t.after(() => {
    mocks['@tanstack/react-query'] = previousQuery
    mocks['@helpers/useEventProposalsQuery'] = previousHook
    global.fetch = previousFetch
  })
  mocks['@tanstack/react-query'] = actualQuery
  mocks['@helpers/apiClient'] = {
    apiJson: async (url, options) => (await fetch(url, options)).json(),
  }
  const hook = load('helpers/useEventProposalsQuery.js')
  mocks['@helpers/useEventProposalsQuery'] = hook
  const key = ['eventProposals', 'event-publish']
  let proposal = {
    _id: 'proposal-1',
    title: 'Проверка публикации',
    status: 'draft',
    version: 1,
    validUntil: '2027-10-10',
    packages: [],
    blocksSnapshot: [],
    mediaSnapshot: [],
  }
  client.setQueryData(key, [proposal])
  let resolveOldRequest
  const oldRequest = client
    .fetchQuery({
      queryKey: key,
      queryFn: () =>
        new Promise((resolve) => {
          resolveOldRequest = resolve
        }),
    })
    .catch(() => {})
  await hook.cacheEventProposal(client, 'event-publish', {
    ...proposal,
    status: 'published',
  })
  resolveOldRequest([proposal])
  await oldRequest
  assert.equal(client.getQueryData(key)[0].status, 'published')
  client.setQueryData(key, [proposal])
  global.fetch = async (url, options = {}) => {
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body)
      if (body.action === 'publish')
        proposal = { ...proposal, status: 'published' }
      return response(proposal)
    }
    if (url === '/api/proposal-templates') return response([])
    return response([proposal])
  }
  const Section = load('components/EventProposalsSection.js').default
  const Wrapper = () =>
    React.createElement(
      actualQuery.QueryClientProvider,
      { client },
      React.createElement(Section, { eventId: 'event-publish' })
    )
  const element = await mount(t, Wrapper, {})
  const publish = [...element.querySelectorAll('button')].find(
    (button) => button.textContent === 'Опубликовать'
  )
  await React.act(async () => {
    publish.click()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  assert.equal(client.getQueryData(key)[0].status, 'published')
  assert.match(
    element.querySelector('.proposal-list-item').textContent,
    /опубликовано/
  )
  assert.doesNotMatch(
    element.querySelector('.proposal-list-item').textContent,
    /черновик/
  )
})

test('event view shows only published proposals and hides an empty section', async (t) => {
  const previousHook = mocks['@helpers/useEventProposalsQuery']
  t.after(() => {
    mocks['@helpers/useEventProposalsQuery'] = previousHook
  })
  mocks['@components/SurfaceCard'] = Box
  let data = [
    {
      _id: 'published',
      title: 'Опубликованное КП',
      status: 'published',
      version: 2,
      sentAt: '2026-09-28',
      packages: [],
    },
    { _id: 'accepted', title: 'Принятое КП', status: 'expired', selectedPackageId: 'main' },
    { _id: 'draft', title: 'Скрытый черновик', status: 'draft' },
    { _id: 'revoked', title: 'Отозванное КП', status: 'revoked' },
    { _id: 'expired', title: 'Истёкшее КП', status: 'expired' },
  ]
  mocks['@helpers/useEventProposalsQuery'] = {
    useEventProposalsQuery: () => ({ data }),
  }
  const View = load('components/EventPublishedProposals.js').default
  const element = await mount(t, View, { eventId: 'event-view' })
  assert.match(element.textContent, /Опубликованное КП/)
  assert.match(element.textContent, /КП отправлено/)
  assert.match(element.textContent, /КП принято/)
  assert.doesNotMatch(
    element.textContent,
    /Скрытый черновик|Отозванное КП|Истёкшее КП/
  )
  data = []
  const empty = await mount(t, View, { eventId: 'event-empty' })
  assert.equal(empty.textContent, '')
})

test('proposal loading stays visible until templates and list finish; refetch retains cards', async (t) => {
  const actualQuery = require('@tanstack/react-query')
  const client = new actualQuery.QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const previousQuery = mocks['@tanstack/react-query']
  const previousHook = mocks['@helpers/useEventProposalsQuery']
  const previousFetch = global.fetch
  t.after(() => {
    client.clear()
    mocks['@tanstack/react-query'] = previousQuery
    mocks['@helpers/useEventProposalsQuery'] = previousHook
    global.fetch = previousFetch
  })
  mocks['@tanstack/react-query'] = actualQuery
  mocks['@helpers/apiClient'] = {
    apiJson: async (url, options) => (await fetch(url, options)).json(),
  }
  mocks['@helpers/useEventProposalsQuery'] = load(
    'helpers/useEventProposalsQuery.js'
  )
  let templatesDone, listDone
  const templatesPending = new Promise((resolve) => {
    templatesDone = resolve
  })
  let listPending = new Promise((resolve) => {
    listDone = resolve
  })
  global.fetch = async (url) =>
    url === '/api/proposal-templates' ? templatesPending : listPending
  const Section = load('components/EventProposalsSection.js').default
  const Wrapper = () =>
    React.createElement(
      actualQuery.QueryClientProvider,
      { client },
      React.createElement(Section, { eventId: 'loading-event' })
    )
  const element = await mount(t, Wrapper, {})
  const createButton = () =>
    [...element.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Создать предложение')
    )
  assert.match(
    element.querySelector('[role="status"]').textContent,
    /Загружаем/
  )
  assert.equal(createButton().disabled, true)
  await React.act(async () => {
    templatesDone(response([]))
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  assert.ok(element.querySelector('[role="status"]'))
  assert.equal(createButton().disabled, true)
  const proposal = {
    _id: 'loading-proposal',
    title: 'Загруженное КП',
    status: 'draft',
    version: 1,
  }
  await React.act(async () => {
    listDone(response([proposal]))
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  assert.equal(element.querySelector('[role="status"]'), null)
  assert.equal(createButton().disabled, false)
  assert.match(element.textContent, /Загруженное КП/)
  listPending = new Promise((resolve) => {
    listDone = resolve
  })
  let refresh
  await React.act(async () => {
    refresh = client.refetchQueries({
      queryKey: ['eventProposals', 'loading-event'],
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  assert.match(
    element.querySelector('[role="status"]').textContent,
    /Обновляем/
  )
  assert.match(
    element.querySelector('.proposal-list-item').textContent,
    /Загруженное КП/
  )
  await React.act(async () => {
    listDone(response([proposal]))
    await refresh
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  assert.equal(element.querySelector('[role="status"]'), null)
})


test('accepted proposal can be deleted only after confirmation', async (t) => {
  const previousHook = mocks['@helpers/useEventProposalsQuery']
  const previousFetch = global.fetch
  const proposal = { _id: 'accepted-delete', title: 'Принятое КП', version: 3, status: 'published', selectedPackageId: 'main', appliedAt: '2026-09-28', packages: [{ id: 'main', title: 'Основной' }] }
  let deleted = 0, cached = [proposal]
  mocks['@helpers/useEventProposalsQuery'] = { useEventProposalsQuery: () => ({ data: cached }) }
  queryClient.cancelQueries = async () => {}
  queryClient.setQueryData = (_key, update) => { cached = update(cached) }
  global.fetch = async (_url, options = {}) => {
    if (options.method === 'DELETE') { deleted += 1; return response({ id: proposal._id }) }
    return response([])
  }
  t.after(() => {
    mocks['@helpers/useEventProposalsQuery'] = previousHook
    global.fetch = previousFetch
    delete queryClient.cancelQueries
    delete queryClient.setQueryData
  })
  const Section = load('components/EventProposalsSection.js').default
  const element = await mount(t, Section, { eventId: 'event-delete' })
  const revokeButton = element.querySelector('button[title="Принятое клиентом предложение нельзя отозвать"]')
  assert.equal(revokeButton.disabled, true)
  const button = element.querySelector('button[title="Удалить предложение"]')
  assert.equal(button.disabled, false)
  await React.act(async () => button.click())
  assert.equal(deleted, 0)
  const confirmation = openedModals.at(-1)
  assert.equal(confirmation.confirmButtonName, 'Удалить')
  assert.equal(confirmation.closeButtonName, 'Отмена')
  assert.match(confirmation.text, /Клиент уже выбрал вариант/)
  assert.match(confirmation.text, /услуги и сумма заказа сохранятся/)
  await React.act(async () => confirmation.onConfirm())
  assert.equal(deleted, 1)
  assert.deepEqual(cached, [])
})




test('применение скрыто и при историческом расхождении; новая несогласованная версия допускает применение', async (t) => {
  const previousHook = mocks['@helpers/useEventProposalsQuery']
  t.after(() => { mocks['@helpers/useEventProposalsQuery'] = previousHook })
  const proposal = {
    _id: 'lock-ui', title: 'КП', version: 1, status: 'published',
    selectedPackageId: 'extended', appliedPackageId: 'basic', appliedAt: '2026-10-01',
    packages: [{ id: 'basic', title: 'Основной' }, { id: 'extended', title: 'Полный' }],
  }
  for (const applied of [true, false]) {
    mocks['@helpers/useEventProposalsQuery'] = {
      useEventProposalsQuery: () => ({ data: [{ ...proposal, appliedAt: applied ? proposal.appliedAt : null, appliedPackageId: applied ? 'basic' : '' }] }),
    }
    const Section = load('components/EventProposalsSection.js').default
    const element = await mount(t, Section, { eventId: `lock-ui-${applied}` })
    const applyButtons = [...element.querySelectorAll('button')].filter((button) => button.textContent.includes('Применить'))
    assert.equal(applyButtons.length, applied ? 0 : 1)
    if (applied) assert.match(element.textContent, /выбор изменён после применения/)
  }
})

test('pending предлагает только завершение/сверку, confirmed больше не предлагает применение', async (t) => {
  const previousHook = mocks['@helpers/useEventProposalsQuery']
  t.after(() => { mocks['@helpers/useEventProposalsQuery'] = previousHook })
  for (const state of ['pending', 'confirmed']) {
    mocks['@helpers/useEventProposalsQuery'] = {
      useEventProposalsQuery: () => ({ data: [{
        _id: `operation-${state}`, title: 'КП', version: 1, status: 'published',
        selectedPackageId: 'main', selectedAt: '2026-10-01',
        applyOperation: { id: 'op', state },
        appliedAt: state === 'confirmed' ? '2026-10-02' : null,
        appliedPackageId: state === 'confirmed' ? 'main' : '',
        appliedSelectionAt: state === 'confirmed' ? '2026-10-01' : null,
        packages: [{ id: 'main', title: 'Основной' }],
      }] }),
    }
    const Section = load('components/EventProposalsSection.js').default
    const element = await mount(t, Section, { eventId: `operation-${state}` })
    const retries = [...element.querySelectorAll('button')].filter((button) => button.textContent.includes('Завершить / сверить'))
    assert.equal(retries.length, state === 'pending' ? 1 : 0)
    if (state === 'pending') {
      assert.match(element.textContent, /применение ожидает сверки/)
      assert.doesNotMatch(element.textContent, /применено к заказу/)
    } else {
      assert.match(element.textContent, /применено к заказу/)
      assert.doesNotMatch(element.textContent, /применение ожидает сверки/)
    }
  }
})

test('modal save appears only for changed drafts, persists after failure, and hides after success', async (t) => {
  const previousInput = mocks['@components/Input']
  const previousFetch = global.fetch
  let changeTitle, confirm, disabled, buttonName
  mocks['@components/Input'] = ({ label, onChange }) => {
    if (label === 'Название предложения') changeTitle = onChange
    return null
  }
  let fail = true
  const proposal = { _id: 'footer-draft', title: 'Исходное название', status: 'draft', validUntil: '2027-10-10', packages: [], blocksSnapshot: [], mediaSnapshot: [] }
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body)
    return fail ? response(null, 500) : response({ ...proposal, ...body })
  }
  t.after(() => { mocks['@components/Input'] = previousInput; global.fetch = previousFetch })
  const Section = load('components/EventProposalsSection.js').default
  const element = await mount(t, Section, {
    eventId: 'footer-event', initialProposal: proposal,
    setOnConfirmFunc: (value) => { confirm = value },
    setDisableConfirm: (value) => { disabled = value },
    setConfirmButtonName: (value) => { buttonName = value },
  })
  assert.equal(confirm, undefined)
  assert.equal(buttonName, 'Сохранить')
  assert.equal(element.textContent.includes('Опубликовать'), false)
  await React.act(async () => changeTitle('Новое название'))
  assert.equal(typeof confirm, 'function')
  await React.act(async () => changeTitle('Исходное название'))
  assert.equal(confirm, undefined)
  await React.act(async () => changeTitle('Новое название'))
  await React.act(async () => confirm())
  assert.equal(typeof confirm, 'function')
  assert.equal(disabled, false)
  fail = false
  await React.act(async () => confirm())
  assert.equal(confirm, undefined)
})


test('share copies the proposal and opens contact choice without sending it', async (t) => {
  const previousHook = mocks['@helpers/useEventProposalsQuery']
  const previousCopy = mocks['@helpers/copyProposalText']
  const previousFetch = global.fetch
  const proposal = { _id: 'share', status: 'published', clientId: 'client-share', title: 'КП', packages: [], publicUrl: 'https://vedelo.ru/proposal/demo', renderedMessage: 'Здравствуйте! Предложение: https://example.test/proposal/demo' }
  let copied, writes = 0
  mocks['@helpers/useEventProposalsQuery'] = { useEventProposalsQuery: () => ({ data: [proposal] }) }
  mocks['@helpers/copyProposalText'] = { copyProposalText: async (text) => { copied = text } }
  global.fetch = async (url, options) => {
    if (options?.method && options.method !== 'GET') writes++
    return response(String(url).includes('/api/proposals/share') ? proposal : [])
  }
  t.after(() => { mocks['@helpers/useEventProposalsQuery'] = previousHook; mocks['@helpers/copyProposalText'] = previousCopy; global.fetch = previousFetch })
  const Section = load('components/EventProposalsSection.js').default
  const element = await mount(t, Section, { eventId: 'share-event' })
  assert.equal(element.textContent.includes('В Telegram'), false)
  assert.equal(element.textContent.includes('Копировать'), false)
  const send = [...element.querySelectorAll('button')].find((button) => button.textContent === 'Отправить')
  await React.act(async () => send.click())
  assert.equal(copied, proposal.renderedMessage)
  assert.equal(writes, 0)
  const dialog = openedModals.at(-1)
  assert.equal(dialog.title, 'Отправить предложение')
  assert.deepEqual(dialog.childrenProps, { clientId: proposal.clientId, message: proposal.renderedMessage, publicUrl: proposal.publicUrl, initiallyCopied: true })
  mocks['@helpers/copyProposalText'].copyProposalText = async () => { throw new Error('denied') }
  // A new module captures the changed clipboard helper, as in a browser denial.
  const FailedSection = load('components/EventProposalsSection.js').default
  const failedElement = await mount(t, FailedSection, { eventId: 'share-event' })
  await React.act(async () => [...failedElement.querySelectorAll('button')].find((button) => button.textContent === 'Отправить').click())
  assert.equal(openedModals.at(-1).childrenProps.initiallyCopied, false)
})

test('contact choices include supported channels, respect unavailable numbers and preserve MAX message', async () => {
  mocks['./maxContact'] = load('helpers/maxContact.js')
  const { getProposalContactOptions } = load('helpers/proposalContactOptions.js')
  const message = 'Здравствуйте! https://example.test/a?b=1&c=2'
  const choices = getProposalContactOptions({ phone: 79000000000, telegram: '@sample', email: 'test@example.test', preferredContactChannel: 'telegram' }, message)
  assert.equal(choices[0].id, 'telegram')
  assert.equal(choices[0].url, 'tg://resolve?domain=sample')
  assert.equal(new URL(choices.find((item) => item.id === 'whatsapp').url).searchParams.get('text'), message)
  assert.equal(new URL(choices.find((item) => item.id === 'email').url).searchParams.get('body'), message)
  assert.match(choices.find((item) => item.id === 'max').detail, /79000000000/)
  assert.deepEqual(getProposalContactOptions(null, message), [])
  assert.deepEqual(getProposalContactOptions({ phone: 79000000000, whatsappPhoneUnavailable: true, telegramPhoneUnavailable: true, maxPhoneUnavailable: true }, message).map((item) => item.id), ['sms'])
})

test('share dialog copies the message or only the public link on demand', async (t) => {
  const restore = []
  const setMock = (key, value) => {
    const previous = mocks[key]
    mocks[key] = value
    restore.push(() => {
      if (previous === undefined) delete mocks[key]
      else mocks[key] = previous
    })
  }
  const copied = []
  setMock('@helpers/copyProposalText', { copyProposalText: async (text) => copied.push(text) })
  setMock('@helpers/useClientsQuery', { useClientQuery: () => ({ data: { _id: 'client-share', phone: 79000000000 }, isPending: false, isError: false, refetch: () => {} }) })
  setMock('@helpers/proposalContactOptions', { getProposalContactOptions: () => [] })
  setMock('@components/InputWrapper', Box)
  t.after(() => restore.reverse().forEach((undo) => undo()))

  const message = 'Здравствуйте! Предложение: https://vedelo.ru/proposal/demo'
  const publicUrl = 'https://vedelo.ru/proposal/demo'
  const Dialog = load('components/ProposalShareDialog.js').default
  const button = (element, text) => [...element.querySelectorAll('button')].find((item) => item.textContent === text)

  const element = await mount(t, Dialog, { clientId: 'client-share', message, publicUrl })
  await React.act(async () => button(element, 'Скопировать текст').click())
  assert.deepEqual(copied, [message])
  assert.match(element.textContent, /Текст предложения скопирован/)
  await React.act(async () => button(element, 'Скопировать ссылку').click())
  assert.deepEqual(copied, [message, publicUrl])
  assert.match(element.textContent, /Ссылка на предложение скопирована/)

  const withoutUrl = await mount(t, Dialog, { clientId: 'client-share', message })
  assert.equal(button(withoutUrl, 'Скопировать ссылку'), undefined)
  assert.equal(button(withoutUrl, 'Скопировать текст') === undefined, false)
})
