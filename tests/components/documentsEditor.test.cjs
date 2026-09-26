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
let openedModal

const mocks = {
  jotai: {
    useAtomValue: () => ({ add: (config) => { openedModal = config } }),
  },
  '@tanstack/react-query': {
    useQueryClient: () => ({ setQueryData() {}, setQueriesData() {} }),
  },
  '@state/atoms': { modalsFuncAtom: {} },
  '@components/Notice': ({ children }) => React.createElement('div', null, children),
  '@components/AddIconButton': ({ title, label, onClick }) => React.createElement('button', { title, onClick }, label),
  '@components/IconActionButton': ({ title, variant, onClick }) => React.createElement('button', { title, 'data-variant': variant || 'neutral', onClick }),
  '@components/DocumentCreateDialog': () => null,
  '@components/DocumentEditDialog': () => React.createElement('div', { 'data-edit-dialog': true }),
  '@components/ReceiptPaymentDialog': () => null,
  '@helpers/documentWorkflow': { getPaymentsWithoutReceipts: () => [] },
  '@helpers/documentTypes': {
    getDocumentDefaultTitle: () => 'Документ',
    getDocumentTypeLabel: (type, customTypeName) => customTypeName || type,
  },
  '@helpers/eventDocuments': { normalizeEventDocuments: (items) => items },
  '@helpers/apiClient': { apiJson: async () => ({}) },
  '@fortawesome/free-regular-svg-icons': { faTrashAlt: {} },
  '@fortawesome/free-solid-svg-icons/faPencilAlt': { faPencilAlt: {} },
}

function load(filename) {
  const absolute = path.resolve(filename)
  const { code } = transformSync(readFileSync(absolute, 'utf8'), {
    filename: absolute,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (id) => (id in mocks ? mocks[id] : require(id)),
    mod,
    mod.exports
  )
  return mod.exports
}

test.before(async () => loadBindings())
test.after(() => dom.window.close())

test('document actions keep edit before delete to the right of title and description', async () => {
  const DocumentsEditor = load('components/DocumentsEditor.js').default
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(
      React.createElement(DocumentsEditor, {
        documents: [
          {
            id: 'brief',
            type: 'other',
            customTypeName: 'Бриф',
            title: 'Бриф клиента',
            url: 'https://example.test/brief',
          },
        ],
        onChange() {},
      })
    )
  })

  const edit = container.querySelector('button[title="Редактировать документ"]')
  const remove = container.querySelector('button[title="Удалить документ"]')
  assert.ok(edit)
  assert.ok(remove)
  assert.equal(edit.parentElement, remove.parentElement)
  assert.ok(edit.compareDocumentPosition(remove) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)
  assert.match(edit.parentElement.parentElement.className, /justify-between/)
  assert.equal(remove.dataset.variant, 'danger')

  await React.act(async () => edit.click())
  assert.equal(openedModal.title, 'Редактировать документ')
  assert.equal(openedModal.confirmButtonName, 'Сохранить')

  await React.act(async () => root.unmount())
  container.remove()
})
