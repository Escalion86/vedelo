import { ExportController } from './ExportController'
import { exportFixture, exportTerms, exportDeferred, flushExport } from './exportFixtures'
const create = () => {
  const deps = { online: jest.fn().mockResolvedValue(true), load: jest.fn().mockResolvedValue(exportFixture()), share: jest.fn().mockResolvedValue({ opened: true, error: false, cleanupFailed: false }), next: jest.fn().mockResolvedValue(true) }
  const controller = new ExportController(deps)
  return { controller, deps }
}
it('все три выбранных набора; fresh tariff/data перед share; один повторный click', async () => {
  const { controller, deps } = create(); controller.focus({ user: 'a' }); await flushExport()
  const wait = exportDeferred<any>(); deps.share.mockReturnValueOnce(wait.promise)
  const run = controller.export(['events', 'requests', 'transactions'], exportTerms); await flushExport()
  await controller.export(['events'], exportTerms); expect(deps.share).toHaveBeenCalledTimes(1)
  expect(deps.load).toHaveBeenCalledTimes(2); wait.resolve({ opened: true, error: false, cleanupFailed: false }); await run
  expect(deps.share.mock.calls.map(([key]) => key)).toEqual(['events', 'requests', 'transactions']); expect(deps.next).toHaveBeenCalledTimes(2)
  expect(controller.state.notice).toContain('Отправка файлов не подтверждена'); expect(controller.state.sharing).toBe(false)
})
it.each([['events'], ['requests'], ['transactions']])('только выбранный набор %p', async key => {
  const { controller, deps } = create(); controller.focus('a'); await flushExport(); await controller.export([key as any], exportTerms)
  expect(deps.share).toHaveBeenCalledTimes(1); expect(deps.share.mock.calls[0][0]).toBe(key)
})
it('пустой выбор не запускает чтение/share', async () => {
  const { controller, deps } = create(); controller.focus('a'); await flushExport(); await controller.export([], exportTerms)
  expect(deps.load).toHaveBeenCalledTimes(1); expect(deps.share).not.toHaveBeenCalled()
})
it.each([401, 403, 500])('ошибка %s без фиктивного empty и без ПДн', async status => {
  const { controller, deps } = create(); deps.load.mockRejectedValue({ status, message: 'PRIVATE' }); controller.focus('a'); await flushExport()
  expect(controller.state.data).toBeNull(); expect(controller.state.error).not.toContain('PRIVATE'); expect(controller.state.error).not.toBe(''); expect(controller.state.loading).toBe(false)
  await controller.export(['events'], exportTerms); expect(deps.share).not.toHaveBeenCalled()
})
it('offline не читает cache/server и не открывает share; отсутствие сети перед экспортом', async () => {
  const { controller, deps } = create(); deps.online.mockResolvedValue(false); controller.focus('a'); await flushExport()
  expect(deps.load).not.toHaveBeenCalled(); expect(controller.state.error).toContain('Нет сети')
  deps.online.mockResolvedValue(true); await controller.load(); deps.online.mockResolvedValue(false); await controller.export(['events'], exportTerms)
  expect(deps.share).not.toHaveBeenCalled(); expect(controller.state.sharing).toBe(false)
})
it('отзыв тарифа после загрузки запрещает share и очищает копию', async () => {
  const { controller, deps } = create(); controller.focus('a'); await flushExport(); deps.load.mockRejectedValue({ status: 403 }); await controller.export(['events'], exportTerms)
  expect(deps.share).not.toHaveBeenCalled(); expect(controller.state.data).toBeNull(); expect(controller.state.error).toContain('Нужен тариф')
})
it('отмена следующего файла останавливает несколько наборов без заявления об отправке', async () => {
  const { controller, deps } = create(); deps.next.mockResolvedValue(false); controller.focus('a'); await flushExport(); await controller.export(['events', 'requests', 'transactions'], exportTerms)
  expect(deps.share).toHaveBeenCalledTimes(1); expect(controller.state.notice).toContain('1 из 3'); expect(controller.state.notice).not.toMatch(/отправлен[ыо]/i)
})
it('share error/cleanup failure показываются и освобождают lock', async () => {
  const { controller, deps } = create(); controller.focus('a'); await flushExport(); deps.share.mockResolvedValue({ opened: false, error: true, cleanupFailed: true }); await controller.export(['events', 'transactions'], exportTerms)
  expect(deps.share).toHaveBeenCalledTimes(1); expect(controller.state.cleanupFailed).toBe(true); expect(controller.state.error).toContain('Не удалось'); expect(controller.state.sharing).toBe(false)
})
it('late read после blur/unmount не хранит данные; signal aborted', async () => {
  const { controller, deps } = create(); const wait = exportDeferred<any>(); deps.load.mockReturnValue(wait.promise); controller.focus('a'); await flushExport(); controller.blur(); wait.resolve(exportFixture()); await flushExport()
  expect(deps.load.mock.calls[0][0].aborted).toBe(true); expect(controller.state.data).toBeNull(); expect(deps.share).not.toHaveBeenCalled()
})
it('новый профиль не получает late данные и ошибки старого tenant', async () => {
  const { controller, deps } = create(); const old = exportDeferred<any>(); deps.load.mockReturnValueOnce(old.promise); controller.focus('a'); await flushExport(); controller.blur(); deps.load.mockResolvedValue({ events: [], clients: [], services: [], transactions: [] }); controller.focus('b'); await flushExport(); old.resolve(exportFixture()); await flushExport()
  expect(controller.state.data?.events).toEqual([]); expect(controller.state.owner).toBe('b'); expect(controller.state.error).toBe('')
})
it('late fresh export read после blur не открывает file; повтор focus работает', async () => {
  const { controller, deps } = create(); controller.focus('a'); await flushExport(); const late = exportDeferred<any>(); deps.load.mockReturnValueOnce(late.promise)
  const run = controller.export(['events'], exportTerms); await flushExport(); controller.blur(); controller.focus('b'); late.resolve(exportFixture()); await run; await flushExport()
  expect(deps.share).not.toHaveBeenCalled(); expect(controller.state.sharing).toBe(false); expect(controller.state.loading).toBe(false)
})
it('late native share после profile switch прекращает следующие файлы и сохраняет только общий cleanup warning', async () => {
  const { controller, deps } = create(); controller.focus('a'); await flushExport(); const wait = exportDeferred<any>(); deps.share.mockReturnValueOnce(wait.promise)
  const run = controller.export(['events', 'requests'], exportTerms); await flushExport(); controller.blur(); controller.focus('b'); await controller.export(['transactions'], exportTerms)
  wait.resolve({ opened: true, error: false, cleanupFailed: true }); await run; await flushExport()
  expect(deps.share).toHaveBeenCalledTimes(1); expect(controller.state.notice).toBe(''); expect(controller.state.cleanupFailed).toBe(true); expect(controller.state.sharing).toBe(false)
})
it('blur отменяет pending confirmation без зависшего lock; старое подтверждение не начинает share', async () => {
  const { controller, deps } = create(); controller.focus('a'); await flushExport(); const wait = exportDeferred<boolean>(); deps.next.mockReturnValue(wait.promise)
  const run = controller.export(['events', 'transactions'], exportTerms); await flushExport(); expect(deps.next).toHaveBeenCalled(); controller.blur(); controller.focus('b'); await run; await flushExport()
  wait.resolve(true); await flushExport(); expect(deps.share).toHaveBeenCalledTimes(1); expect(controller.state.sharing).toBe(false); expect(controller.state.notice).toBe('')
})
it('пустые наборы отправляются как CSV только с заголовками', async () => {
  const { controller, deps } = create(); deps.load.mockResolvedValue({ events: [], clients: [], services: [], transactions: [] }); controller.focus('a'); await flushExport(); await controller.export(['requests'], exportTerms)
  expect(deps.share.mock.calls[0][1]).toMatch(/^\ufeffID;Дата заявки/); expect(deps.share.mock.calls[0][1]).not.toContain('\r\n')
})
