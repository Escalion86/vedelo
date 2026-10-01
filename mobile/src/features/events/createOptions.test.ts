import { createWorkItemRoute, initialWorkItemMode, initialWorkItemStatus } from './createOptions'

it.each(['draft', 'active'] as const)('разрешает начальный статус %s', (status) => {
  expect(initialWorkItemStatus(status)).toBe(status)
  expect(createWorkItemRoute(status).params.initialStatus).toBe(status)
})
it.each(['closed', 'canceled', 'ACTIVE', '', undefined, null, ['active'], { status: 'active' }])('игнорирует недопустимый status %s', (status) => {
  expect(initialWorkItemStatus(status)).toBe('draft')
})
it('URL содержит только валидированные режим и статус, без полей клиента или черновика', () => {
  for (const mode of ['voice', 'text'] as const) {
    expect(createWorkItemRoute(mode)).toEqual({ pathname: '/events/edit/new', params: { initialStatus: 'draft', mode } })
    expect(initialWorkItemMode(mode)).toBe(mode)
  }
  expect(initialWorkItemMode(['voice'])).toBe('manual')
  expect(initialWorkItemMode('unknown')).toBe('manual')
})
