const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const ref = '6976304ca24ad0fe7d7b2b15'
let session = null
let settingsReads = 0
const LoginInputs = () => null
const mocks = {
  'next-auth': { getServerSession: async () => session },
  'next/navigation': { redirect: (url) => { throw Object.assign(new Error('redirect'), { url }) } },
  '@server/phoneAuthSettings': {
    getPhoneAuthSettings: async () => { settingsReads++; return { primaryMethod: 'sms' } },
  },
}
function load(file) {
  const filename = path.resolve(file)
  assert.ok(fs.existsSync(filename), `Маршрут отсутствует: ${file}`)
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  })
  const compiledModule = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => {
    if (id in mocks) return mocks[id]
    if (id === './loginInputs') return LoginInputs
    if (id.includes('_options')) return {}
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), `${id}.js`))
    return require(id)
  }, compiledModule, compiledModule.exports)
  return compiledModule.exports
}
async function render(file, params = {}) {
  return load(file).default({ searchParams: Promise.resolve(params) })
}
test.before(async () => loadBindings())
test.beforeEach(() => { session = null; settingsReads = 0 })

test('/register сразу открывает регистрацию без параметра mode и сохраняет ref/callback', async () => {
  const result = await render('app/register/page.js', { ref, callbackUrl: '/cabinet/tariff-select' })
  assert.ok(React.isValidElement(result))
  assert.equal(result.type, LoginInputs)
  assert.deepEqual(result.props, { initialMode: 'register', initialReferrerId: ref, callbackUrl: '/cabinet/tariff-select', primaryMethod: 'sms' })
})
test('/register без ref открывает обычную регистрацию', async () => {
  const result = await render('app/register/page.js')
  assert.equal(result.props.initialMode, 'register')
  assert.equal(result.props.initialReferrerId, '')
  assert.equal(result.props.callbackUrl, '/cabinet')
})
test('/register не позволяет параметру mode переключить стартовый экран на вход', async () => {
  const result = await render('app/register/page.js', { mode: 'login', ref })
  assert.equal(result.props.initialMode, 'register')
  assert.equal(result.props.initialReferrerId, ref)
})
test('/register игнорирует некорректный или повторённый ref', async () => {
  for (const value of ['bad-id', [ref, ref], undefined]) {
    assert.equal((await render('app/register/page.js', { ref: value })).props.initialReferrerId, '')
  }
})
test('/register сохраняет регистр валидного идентификатора', async () => {
  assert.equal((await render('app/register/page.js', { ref: ref.toUpperCase() })).props.initialReferrerId, ref.toUpperCase())
})
test('авторизованный посетитель /register переходит в безопасный callback без чтения настроек', async () => {
  session = { user: { id: ref } }
  for (const [callbackUrl, expected] of [['/cabinet/tariff-select', '/cabinet/tariff-select'], ['https://evil.example', '/cabinet'], ['//evil.example', '/cabinet'], [undefined, '/cabinet']]) {
    await assert.rejects(render('app/register/page.js', { callbackUrl }), (error) => error.url === expected)
  }
  assert.equal(settingsReads, 0)
})
test('/register имеет собственный заголовок и не индексируется', () => {
  const { metadata, dynamic } = load('app/register/page.js')
  assert.equal(metadata.title, 'Регистрация в Ведело')
  assert.deepEqual(metadata.robots, { index: false, follow: false })
  assert.equal(dynamic, 'force-dynamic')
})
test('старые /login и /login?mode=register&ref остаются совместимыми', async () => {
  assert.equal((await render('app/login/page.js')).props.initialMode, 'login')
  const result = await render('app/login/page.js', { mode: 'register', ref })
  assert.equal(result.props.initialMode, 'register')
  assert.equal(result.props.initialReferrerId, ref)
})
