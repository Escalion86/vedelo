let subject: any = {}
try {
  subject = require('./bridge')
} catch (error) {
  if (
    !String((error as { message?: string })?.message).includes(
      "Cannot find module './bridge'"
    )
  )
    throw error
}
function read(value: unknown, key = 'one') {
  expect(subject.readEditorMessage).toBeDefined()
  return subject.readEditorMessage(JSON.stringify(value), key)
}
it('bridge accepts only correlated ready/change messages of bounded length', () => {
  expect(read({ key: 'one', type: 'ready' })).toEqual({
    key: 'one',
    type: 'ready',
  })
  expect(read({ key: 'one', type: 'change', html: '<p>Текст</p>' })).toEqual({
    key: 'one',
    type: 'change',
    html: '<p>Текст</p>',
  })
  for (const value of [
    { key: 'two', type: 'change', html: 'old' },
    { key: 'one', type: 'navigate', url: 'https://bad.invalid' },
    { key: 'one', type: 'change', html: 'a'.repeat(30001) },
    { key: 'one', type: 'change', html: 17 },
  ])
    expect(read(value)).toBeNull()
})
it('navigation allows only initial local document, never remote/javascript/intent/file', () => {
  expect(subject.allowLocalNavigation).toBeDefined()
  expect(subject.allowLocalNavigation('about:blank')).toBe(true)
  for (const url of [
    'https://cloud.escalion.ru',
    'javascript:alert(1)',
    'file:///tmp/a',
    'intent://open',
    'data:text/html,bad',
    'about:blank#other',
  ])
    expect(subject.allowLocalNavigation(url)).toBe(false)
})
it('native commands quote untrusted strings as data and whitelist operations', () => {
  expect(subject.editorCommand).toBeDefined()
  const command = subject.editorCommand({
    type: 'insertMedia',
    kind: 'image',
    url: 'https://cloud.escalion.ru/uploads/a.png',
    title: '</script>\u2028";attack()',
  })
  expect(command).not.toContain('</script>')
  expect(command).toContain('window.vedeloEditor(')
  expect(() =>
    subject.editorCommand({ type: 'execute', js: 'attack()' })
  ).toThrow()
  expect(() =>
    subject.editorCommand({
      type: 'insertMedia',
      kind: 'image',
      url: 'javascript:attack()',
    })
  ).toThrow()
})
it('busy/read-only mode is a boolean bridge command, never arbitrary script', () => {
  expect(
    subject.editorCommand({ type: 'setEditable', editable: false })
  ).toContain('"editable":false')
  expect(() =>
    subject.editorCommand({ type: 'setEditable', editable: 'script' })
  ).toThrow()
})
