import { expectBoundRead } from './boundRead'

const fixture = () => {
  const controller = new AbortController()
  const options = {
    headers: { Authorization: 'Bearer synthetic-only' },
    skipAuth: true,
    skipRefresh: true,
    signal: controller.signal,
  }
  return { controller, options, calls: [['/mobile/v1/events/e', options]] }
}

it('strict bound read accepts the exact synthetic captured request', () => {
  const { controller, calls } = fixture()
  expect(expectBoundRead(calls, 'synthetic-only', controller.signal)).toBe(controller.signal)
})

it.each(['headers', 'skipAuth', 'skipRefresh', 'signal'] as const)(
  'strict bound read rejects missing mandatory %s', (key) => {
    const { controller, options, calls } = fixture()
    Reflect.deleteProperty(options, key)
    expect(() => expectBoundRead(calls, 'synthetic-only', controller.signal)).toThrow()
  },
)

it.each(['skipAuth', 'skipRefresh'] as const)('strict bound read rejects false %s', (key) => {
  const { controller, options, calls } = fixture()
  options[key] = false
  expect(() => expectBoundRead(calls, 'synthetic-only', controller.signal)).toThrow()
})

it('strict bound read rejects wrong captured authorization', () => {
  const { controller, options, calls } = fixture()
  options.headers.Authorization = 'Bearer wrong-synthetic'
  expect(() => expectBoundRead(calls, 'synthetic-only', controller.signal)).toThrow()
})

it('strict bound read rejects missing and duplicate actual calls', () => {
  const { controller, calls } = fixture()
  expect(() => expectBoundRead([], 'synthetic-only', controller.signal)).toThrow()
  expect(() => expectBoundRead([...calls, ...calls], 'synthetic-only', controller.signal)).toThrow()
})

it('strict bound read rejects wrong path, fake, foreign and aborted lifecycle signals', () => {
  const { controller, options } = fixture()
  expect(() => expectBoundRead([['/mobile/v1/events/other', options]], 'synthetic-only', controller.signal)).toThrow()
  expect(() => expectBoundRead([['/mobile/v1/events/e', { ...options, signal: { aborted: false } }]], 'synthetic-only', controller.signal)).toThrow()
  expect(() => expectBoundRead([['/mobile/v1/events/e', { ...options, signal: new AbortController().signal }]], 'synthetic-only', controller.signal)).toThrow()
  controller.abort()
  expect(() => expectBoundRead([['/mobile/v1/events/e', options]], 'synthetic-only', controller.signal)).toThrow()
})

const initialAndApply = () => {
  const initial = fixture(), apply = fixture()
  const request = jest.fn()
  request('/mobile/v1/events/e', initial.options)
  request('/proposals/p', { ...apply.options, method: 'PATCH', body: { action: 'apply' } })
  const applyCall = request.mock.calls[1]
  request('/mobile/v1/events/e', apply.options)
  return { ...apply, initial, request, applyCall }
}

it('strict bound read accepts initial and apply readback with different actual signals', () => {
  const { initial, controller, request, applyCall } = initialAndApply()
  expect(initial.controller.signal).not.toBe(applyCall[1].signal)
  expect(applyCall[1].signal).toBe(controller.signal)
  expect(expectBoundRead(request.mock.calls, 'synthetic-only', applyCall[1].signal, applyCall)).toBe(controller.signal)
})

it('strict bound read rejects a wrong signal read inside the apply invocation window', () => {
  const { initial, request, applyCall } = initialAndApply()
  request('/mobile/v1/events/e', initial.options)
  expect(() => expectBoundRead(request.mock.calls, 'synthetic-only', applyCall[1].signal, applyCall)).toThrow()
})

it('strict bound read rejects duplicate readback of the same apply operation after initial read', () => {
  const { options, request, applyCall } = initialAndApply()
  request('/mobile/v1/events/e', options)
  expect(() => expectBoundRead(request.mock.calls, 'synthetic-only', applyCall[1].signal, applyCall)).toThrow()
})
