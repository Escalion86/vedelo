import {
  consumePendingEventClient,
  resetPendingEventClient,
  setPendingEventClient,
} from './eventClientHandoff'

beforeEach(() => resetPendingEventClient())

describe('возврат созданного клиента в редактор работы', () => {
  it('значение выдаётся ровно один раз', () => {
    expect(consumePendingEventClient()).toBeNull()
    setPendingEventClient('local-client')
    expect(consumePendingEventClient()).toBe('local-client')
    expect(consumePendingEventClient()).toBeNull()
  })

  it('пустой идентификатор не создаёт ожидание', () => {
    setPendingEventClient('')
    expect(consumePendingEventClient()).toBeNull()
  })

  it('новое значение заменяет прежнее', () => {
    setPendingEventClient('first')
    setPendingEventClient('second')
    expect(consumePendingEventClient()).toBe('second')
  })
})
