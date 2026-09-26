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
  jotai: { useAtomValue: () => ({ add: (config) => openedModals.push(config) }) },
  '@state/atoms': { modalsFuncAtom: 'modals' },
  'next/dynamic': () => () => null,
  '@components/Notice': Box,
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
          React.createElement('option', { key: item.value, value: item.value }, item.name)
        )
      )
    ),
  '@components/AppButton': Button,
  '@components/AddIconButton': Button,
  '@components/IconActionButton': Button,
  '@fortawesome/free-regular-svg-icons': { faTrashAlt: {} },
  '@fortawesome/free-solid-svg-icons/faPencilAlt': { faPencilAlt: {} },
  '@layouts/modals/modalsFunc/selectEventServicesFunc': () => ({}),
  '@helpers/queryKeys': { queryKeys: { services: () => ['services'] } },
  '@components/ProposalLineEditor': Box,
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

test.before(async () => {
  await loadBindings()
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options })
    if (String(url) === '/api/proposal-templates') return response(templates)
    if (options.method === 'POST') {
      return response({
        _id: 'created-proposal',
        version: 1,
        validUntil: '2026-10-10T00:00:00.000Z',
      }, 201)
    }
    return response([])
  }
})

test.after(() => dom.window.close())

test('proposal creation hides the inline selector and opens template choice only when needed', async (t) => {
  const EventProposalsSection = load('components/EventProposalsSection.js').default

  templates = [{ _id: 'template-1', name: 'Основной шаблон', status: 'active' }]
  openedModals.length = 0
  requests.length = 0
  const withTemplates = await mount(t, EventProposalsSection, { eventId: 'event-1' })
  assert.equal(withTemplates.querySelector('select'), null)
  assert.equal(withTemplates.textContent.includes('Предложений по этой заявке ещё нет'), false)
  const createWithTemplate = [...withTemplates.querySelectorAll('button')]
    .find((button) => button.textContent.includes('Создать предложение'))
  assert.ok(createWithTemplate)
  await React.act(async () => createWithTemplate.click())
  const pickerModal = openedModals.at(-1)
  assert.equal(pickerModal.title, 'Выбор шаблона предложения')
  assert.equal(requests.some((item) => item.options.method === 'POST'), false)

  let confirm
  let closed = false
  const picker = await mount(t, pickerModal.Children, {
    ...pickerModal.childrenProps,
    closeModal: () => { closed = true },
    setOnConfirmFunc: (handler) => { confirm = handler },
  })
  assert.equal(
    picker.querySelector('[aria-label="Шаблон предложения"]').value,
    'template-1'
  )
  await React.act(async () => confirm())
  assert.equal(closed, true)
  const templateRequest = requests.find((item) => item.options.method === 'POST')
  assert.deepEqual(JSON.parse(templateRequest.options.body), { templateId: 'template-1' })

  templates = []
  openedModals.length = 0
  requests.length = 0
  const withoutTemplates = await mount(t, EventProposalsSection, { eventId: 'event-2' })
  const createWithoutTemplate = [...withoutTemplates.querySelectorAll('button')]
    .find((button) => button.textContent.includes('Создать предложение'))
  await React.act(async () => createWithoutTemplate.click())
  assert.equal(openedModals.some((modal) => modal.title === 'Выбор шаблона предложения'), false)
  const directRequest = requests.find((item) => item.options.method === 'POST')
  assert.deepEqual(JSON.parse(directRequest.options.body), { templateId: '' })
  assert.equal(openedModals.at(-1).title, 'Редактор коммерческого предложения')
})
