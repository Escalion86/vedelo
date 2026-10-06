const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const bcrypt = require('bcryptjs')
const { loadBindings, transformSync } = require('next/dist/build/swc')

function load(file, mocks) {
  const { code } = transformSync(readFileSync(file, 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
      return mocks[name]
    },
    loaded,
    loaded.exports
  )
  return loaded.exports
}

const createModel = (state) => ({
  findOne: (filter) => {
    state.lastFindOne = filter
    return {
      select: () => ({
        lean: async () => state.user,
      }),
    }
  },
  findOneAndUpdate: async (filter, update, options) => {
    state.lastUpdate = { filter, update, options }
    return state.updated
  },
})

const loadModule = (state) =>
  load('server/passwordChange.js', {
    bcryptjs: bcrypt,
    '@models/Users': createModel(state),
  })

test.before(async () => {
  await loadBindings()
})

test('первый пароль: пустой сохранённый пароль устанавливается атомарно и с tenant-фильтром', async () => {
  const state = { user: { _id: 'u1', password: '' }, updated: { _id: 'u1' } }
  const { changeOrSetPassword } = loadModule(state)
  const result = await changeOrSetPassword({
    userId: 'u1',
    tenantId: 't1',
    currentPassword: '',
    newPassword: 'first-pass-123',
  })
  assert.deepEqual(result, { ok: true, mode: 'set' })
  assert.deepEqual(state.lastFindOne, {
    _id: 'u1',
    tenantId: 't1',
    archive: { $ne: true },
  })
  const { filter, update } = state.lastUpdate
  assert.equal(filter._id, 'u1')
  assert.equal(filter.tenantId, 't1')
  assert.deepEqual(filter.archive, { $ne: true })
  assert.deepEqual(filter.$or, [
    { password: '' },
    { password: null },
    { password: { $exists: false } },
  ])
  assert.match(update.$set.password, /^\$2[aby]\$/)
  assert.equal(await bcrypt.compare('first-pass-123', update.$set.password), true)
})

test('новый пароль проверяется: короткий, не строка и слишком длинный отклоняются без записи', async () => {
  const { changeOrSetPassword, PASSWORD_MAX_LENGTH } = loadModule({
    user: { _id: 'u1', password: '' },
    updated: { _id: 'u1' },
  })
  for (const value of ['short', '', 12345678, null, { toString: () => 'longenough1' }]) {
    const result = await changeOrSetPassword({
      userId: 'u1',
      tenantId: 't1',
      currentPassword: '',
      newPassword: value,
    })
    assert.deepEqual(result, { ok: false, reason: 'INVALID_NEW_PASSWORD' })
  }
  const long = await changeOrSetPassword({
    userId: 'u1',
    tenantId: 't1',
    newPassword: 'x'.repeat(PASSWORD_MAX_LENGTH + 1),
  })
  assert.deepEqual(long, { ok: false, reason: 'NEW_PASSWORD_TOO_LONG' })
})

test('установленный пароль: пустой текущий отклоняется, верный — меняет, неверный — нет', async () => {
  const stored = await bcrypt.hash('current-123', 4)
  const state = { user: { _id: 'u1', password: stored }, updated: { _id: 'u1' } }
  const { changeOrSetPassword } = loadModule(state)
  const empty = await changeOrSetPassword({
    userId: 'u1',
    tenantId: 't1',
    currentPassword: '',
    newPassword: 'next-pass-123',
  })
  assert.deepEqual(empty, { ok: false, reason: 'CURRENT_PASSWORD_REQUIRED' })
  assert.equal(state.lastUpdate, undefined)
  const wrong = await changeOrSetPassword({
    userId: 'u1',
    tenantId: 't1',
    currentPassword: 'wrong-123',
    newPassword: 'next-pass-123',
  })
  assert.deepEqual(wrong, { ok: false, reason: 'CURRENT_PASSWORD_INVALID' })
  assert.equal(state.lastUpdate, undefined)
  const ok = await changeOrSetPassword({
    userId: 'u1',
    tenantId: 't1',
    currentPassword: 'current-123',
    newPassword: 'next-pass-123',
  })
  assert.deepEqual(ok, { ok: true, mode: 'change' })
  const { filter, update } = state.lastUpdate
  assert.equal(filter.password, stored)
  assert.equal(filter.tenantId, 't1')
  assert.equal(await bcrypt.compare('next-pass-123', update.$set.password), true)
})

test('legacy plaintext пароль сравнивается и заменяется с точным фильтром', async () => {
  const state = { user: { _id: 'u1', password: 'legacy-pass' }, updated: { _id: 'u1' } }
  const { changeOrSetPassword } = loadModule(state)
  assert.deepEqual(
    await changeOrSetPassword({
      userId: 'u1',
      tenantId: 't1',
      currentPassword: 'mismatch',
      newPassword: 'next-pass-123',
    }),
    { ok: false, reason: 'CURRENT_PASSWORD_INVALID' }
  )
  assert.deepEqual(
    await changeOrSetPassword({
      userId: 'u1',
      tenantId: 't1',
      currentPassword: 'legacy-pass',
      newPassword: 'next-pass-123',
    }),
    { ok: true, mode: 'change' }
  )
  assert.equal(state.lastUpdate.filter.password, 'legacy-pass')
})

test('гонка: проигравший конкурентный запрос не перезаписывает пароль', async () => {
  const first = loadModule({ user: { _id: 'u1', password: '' }, updated: null })
  assert.deepEqual(
    await first.changeOrSetPassword({
      userId: 'u1',
      tenantId: 't1',
      newPassword: 'loser-pass-123',
    }),
    { ok: false, reason: 'PASSWORD_ALREADY_SET' }
  )
  const stored = await bcrypt.hash('current-123', 4)
  const second = loadModule({ user: { _id: 'u1', password: stored }, updated: null })
  assert.deepEqual(
    await second.changeOrSetPassword({
      userId: 'u1',
      tenantId: 't1',
      currentPassword: 'current-123',
      newPassword: 'loser-pass-123',
    }),
    { ok: false, reason: 'PASSWORD_CHANGED' }
  )
})

test('чужой tenant, отсутствующий пользователь и пустой tenant не трогают пароль', async () => {
  const state = { user: null, updated: { _id: 'u1' } }
  const { changeOrSetPassword, getPasswordStatus } = loadModule(state)
  assert.deepEqual(
    await changeOrSetPassword({ userId: 'u1', tenantId: 't-foreign', newPassword: 'first-pass-123' }),
    { ok: false, reason: 'USER_NOT_FOUND' }
  )
  assert.deepEqual(
    await changeOrSetPassword({ userId: '', tenantId: 't1', newPassword: 'first-pass-123' }),
    { ok: false, reason: 'USER_NOT_FOUND' }
  )
  assert.deepEqual(
    await changeOrSetPassword({ userId: 'u1', tenantId: '', newPassword: 'first-pass-123' }),
    { ok: false, reason: 'USER_NOT_FOUND' }
  )
  assert.equal(state.lastUpdate, undefined)
  assert.deepEqual(await getPasswordStatus({ userId: 'u1', tenantId: 't-foreign' }), {
    ok: false,
    reason: 'USER_NOT_FOUND',
  })
})

test('статус пароля — безопасный boolean без утечки пароля и хеша', async () => {
  const stored = await bcrypt.hash('current-123', 4)
  const state = { user: { _id: 'u1', password: stored } }
  const { getPasswordStatus } = loadModule(state)
  const status = await getPasswordStatus({ userId: 'u1', tenantId: 't1' })
  assert.deepEqual(status, { ok: true, hasPassword: true })
  assert.equal(JSON.stringify(status).includes(stored), false)
  assert.equal('password' in status, false)
  assert.equal('hash' in status, false)
  assert.deepEqual(state.lastFindOne, {
    _id: 'u1',
    tenantId: 't1',
    archive: { $ne: true },
  })
  state.user = { _id: 'u1', password: '' }
  assert.deepEqual(await getPasswordStatus({ userId: 'u1', tenantId: 't1' }), {
    ok: true,
    hasPassword: false,
  })
  state.user = { _id: 'u1' }
  assert.deepEqual(await getPasswordStatus({ userId: 'u1', tenantId: 't1' }), {
    ok: true,
    hasPassword: false,
  })
})

test('сообщения об ошибках едины для web и mobile, коды причин стабильны', async () => {
  const { PASSWORD_ERROR_MESSAGES, PASSWORD_MIN_LENGTH } = loadModule({ user: null })
  assert.equal(PASSWORD_MIN_LENGTH, 8)
  assert.deepEqual(PASSWORD_ERROR_MESSAGES, {
    INVALID_NEW_PASSWORD: 'Новый пароль должен быть не менее 8 символов',
    NEW_PASSWORD_TOO_LONG: 'Новый пароль слишком длинный',
    CURRENT_PASSWORD_REQUIRED: 'Введите текущий пароль',
    CURRENT_PASSWORD_INVALID: 'Текущий пароль указан неверно',
    USER_NOT_FOUND: 'Пользователь не найден',
    PASSWORD_ALREADY_SET: 'Пароль уже установлен. Обновите форму и повторите',
    PASSWORD_CHANGED: 'Пароль уже был изменён. Повторите попытку',
  })
})
