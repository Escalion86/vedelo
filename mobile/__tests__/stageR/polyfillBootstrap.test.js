const descriptors = ['URL', 'TextDecoder'].map((name) => [
  name,
  Object.getOwnPropertyDescriptor(globalThis, name),
])

test('Expo URL/TextDecoder готовы до теста и используют настоящие реализации', () => {
  for (const [name, descriptor] of descriptors) {
    expect(descriptor.get).toBeUndefined()
    expect(typeof descriptor.value).toBe('function')
    expect(descriptor.value[Symbol.for('expo.builtin')]).toBe(true)
    expect(globalThis[name]).toBe(descriptor.value)
  }

  expect(globalThis.URL).toBe(jest.requireActual('expo/src/winter/url').URL)
  expect(globalThis.TextDecoder).toBe(
    jest.requireActual('expo/src/winter/TextDecoder').TextDecoder
  )
  expect(new globalThis.URL('/заказ', 'https://vedelo.invalid').pathname).toBe(
    '/%D0%B7%D0%B0%D0%BA%D0%B0%D0%B7'
  )
  expect(new globalThis.TextDecoder().decode(new Uint8Array([0xd0, 0xaf]))).toBe('Я')
})
