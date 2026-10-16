import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CLIENT_TYPES, LEGACY_CLIENT_TYPES, resolveClientTypes, clientTypeOptions, validateClientTypes } from './clientTypes.mjs'

test('new defaults are universal; legacy settings retain all old codes', () => {
  assert.deepEqual(DEFAULT_CLIENT_TYPES.map(x => x.value), ['none', 'client', 'partner', 'colleague'])
  assert.equal(resolveClientTypes({}), LEGACY_CLIENT_TYPES)
  assert.equal(resolveClientTypes({ clientTypes: DEFAULT_CLIENT_TYPES }), DEFAULT_CLIENT_TYPES)
})
test('rename and hide preserve identity and selected historical value', () => {
  const items = validateClientTypes(LEGACY_CLIENT_TYPES.map(x => x.value === 'colleague' ? { ...x, name: 'Исполнитель', hidden: true } : x), LEGACY_CLIENT_TYPES)
  assert.equal(clientTypeOptions(items, 'none').some(x => x.value === 'colleague'), false)
  assert.equal(clientTypeOptions(items, 'colleague').find(x => x.value === 'colleague').name, 'Исполнитель (скрыт)')
  assert.equal(clientTypeOptions(DEFAULT_CLIENT_TYPES, 'host').find(x => x.value === 'host').name, 'Ведущий')
  assert.ok(clientTypeOptions(items, 'old_unknown').some(x => x.value === 'old_unknown'))
})
test('reject removal, duplicate names/ids, blank names, operators and malformed visibility', () => {
  const invalid = [
    LEGACY_CLIENT_TYPES.slice(1),
    LEGACY_CLIENT_TYPES.slice(0, -1),
    [...LEGACY_CLIENT_TYPES, { value: 'custom_12345678', name: ' клиент ', hidden: false }],
    [...LEGACY_CLIENT_TYPES, { value: 'custom_12345678', name: ' ', hidden: false }],
    [...LEGACY_CLIENT_TYPES, { value: { $ne: null }, name: 'X', hidden: false }],
    LEGACY_CLIENT_TYPES.map(x => x.value === 'none' ? { ...x, hidden: true } : x),
    LEGACY_CLIENT_TYPES.map(x => ({ ...x, hidden: 'false' })),
  ]
  for (const list of invalid) assert.throws(() => validateClientTypes(list, LEGACY_CLIENT_TYPES))
})
test('trim, reorder, add and discard untrusted fields', () => {
  const next = [{ value: 'custom_12345678', name: '  Подрядчик  ', hidden: false, tenantId: 'foreign' }, ...DEFAULT_CLIENT_TYPES]
  assert.deepEqual(validateClientTypes(next, DEFAULT_CLIENT_TYPES)[0], { value: 'custom_12345678', name: 'Подрядчик', hidden: false })
})
