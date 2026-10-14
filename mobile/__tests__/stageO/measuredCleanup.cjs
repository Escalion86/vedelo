// Та же обвязка, что в установленном RNTL index, с явным измеренным hook deadline.
// pure entry позволяет не запускать второй автоматический cleanup параллельно.
function installMeasuredCleanup() {
  require('@testing-library/react-native/build/helpers/ensure-peer-deps')
  require('@testing-library/react-native/build/matchers/extend-expect')
  const { cleanupAsync } = require('@testing-library/react-native/pure')
  const { flushMicroTasks } = require('@testing-library/react-native/build/flush-micro-tasks')
  const { getIsReactActEnvironment, setReactActEnvironment } = require('@testing-library/react-native/build/act')
  const { trace } = require('../stageN/readiness.cjs')
  const { performance } = require('node:perf_hooks')
  let previous
  beforeAll(() => { previous = getIsReactActEnvironment(); setReactActEnvironment(true) })
  afterAll(() => setReactActEnvironment(previous))
  afterEach(async () => {
    const start = performance.now()
    trace({ phase: 'cleanup-start' })
    try {
      await flushMicroTasks()
      await cleanupAsync()
    } finally {
      jest.restoreAllMocks()
      trace({ phase: 'cleanup-end', duration: performance.now() - start })
    }
  }, 10000)
}
module.exports = { installMeasuredCleanup }
