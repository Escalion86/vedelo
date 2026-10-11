const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { JSDOM } = require('jsdom')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const ref = '6976304ca24ad0fe7d7b2b15'
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://vedelo.ru' })
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = require('react-dom/client')
let copied = ''
let qrUrls = []
Object.defineProperty(global, 'navigator', { configurable: true, value: { clipboard: { writeText: async (value) => { copied = value } } } })
global.fetch = async (url, options) => {
  if (String(url).includes('/qr/generate')) {
    qrUrls.push(JSON.parse(options.body).data.url)
    return new Response(new Blob(['qr'], { type: 'image/png' }))
  }
  return Response.json({ success: true, data: url === '/api/site/referral' ? { percent: 5 } : { referrals: [], referralsCount: 0 } })
}
const Box = ({ children }) => React.createElement('div', null, children)
const mocks = {
  '@components/Button': ({ name, onClick, disabled }) => React.createElement('button', { onClick, disabled }, name),
  '@components/LoadingSpinner': () => null,
  '@components/MutedText': Box,
  '@helpers/formatDate': String,
  '@helpers/formatMoney': { formatMoney: String },
  '@helpers/useSnackbar': () => ({ success() {}, error() {} }),
  '@state/atoms/loggedUserAtom': {},
  jotai: { useAtomValue: () => ({ _id: ref }) },
  'next/image': () => null,
  'next/navigation': { useRouter: () => ({ push() {} }) },
}
function load() {
  const filename = path.resolve('layouts/content/ReferralsContent.js')
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  })
  const compiledModule = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => id in mocks ? mocks[id] : require(id), compiledModule, compiledModule.exports)
  return compiledModule.exports.default
}
test.before(async () => loadBindings())
test.after(() => dom.window.close())
test('Web: показ, копирование и QR используют /register?ref без mode', async () => {
  copied = ''; qrUrls = []
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await React.act(async () => { root.render(React.createElement(load())); await new Promise((resolve) => setTimeout(resolve, 30)) })
    const expected = `https://vedelo.ru/register?ref=${ref}`
    assert.ok(container.textContent.includes(expected), `Отображается короткая ссылка: ${container.textContent}`)
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Скопировать ссылку')
    assert.ok(button)
    await React.act(async () => { button.click() })
    assert.equal(copied, expected)
    assert.ok(qrUrls.includes(expected), 'QR кодирует ту же короткую ссылку')
    assert.ok(qrUrls.every((url) => !url.includes('mode=')))
  } finally {
    await React.act(async () => root.unmount())
    container.remove()
  }
})
