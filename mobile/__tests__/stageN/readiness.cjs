// Пассивные измерения стенда: настоящий render/queries/API, без смены deadlines.
// Каждый Jest VM пишет отдельный exclusive файл, только при явном evidence-dir.
const { performance: monotonicClock } = require('node:perf_hooks')
let writer
function installReadiness(label) {
  const dir = process.env.STAGE_N_READINESS_DIR
  if (!dir) return
  const fs = require('node:fs'), path = require('node:path')
  fs.mkdirSync(dir, { recursive: true })
  const fd = fs.openSync(path.join(dir, label + '.jsonl'), 'wx')
  writer = event => fs.writeSync(fd, JSON.stringify({ at: monotonicClock.now(), test: expect.getState().currentTestName || null, event }) + '\n')
  beforeEach(() => trace({ phase: 'test-start' }))
  afterEach(() => trace({ phase: 'test-cleanup-complete' }))
  afterAll(() => { trace({ phase: 'suite-finished' }); fs.closeSync(fd); writer = undefined })
}
function trace(event) { writer?.(event) }
function measureCall(call, args, name) {
  trace({ phase: 'fetch-start', boundary: name, path: args[0] })
  const result = call(...args)
  if (result?.then) result.then(() => trace({ phase: 'fetch-settled', boundary: name, path: args[0] }), () => trace({ phase: 'fetch-rejected', boundary: name, path: args[0] }))
  return result
}
function measureRender(nativeRender) {
  return ((...args) => {
    const start = monotonicClock.now()
    trace({ phase: 'render-start' })
    const screen = nativeRender(...args)
    trace({ phase: 'render-end', duration: monotonicClock.now() - start })
    for (const key of Object.keys(screen).filter(key => key.startsWith('find'))) {
      const find = screen[key]
      screen[key] = (...params) => {
        const started = monotonicClock.now()
        trace({ phase: 'readiness-start', query: key })
        const promise = find(...params)
        promise.then(() => trace({ phase: 'readiness-found', query: key, duration: monotonicClock.now() - started }), () => trace({ phase: 'readiness-failed', query: key, duration: monotonicClock.now() - started }))
        return promise
      }
    }
    const unmount = screen.unmount
    screen.unmount = (...params) => { trace({ phase: 'unmount-start' }); const value = unmount(...params); trace({ phase: 'unmount-end' }); return value }
    return screen
  })
}

function measureEvents(events) {
  const wrapped = typeof events === 'function' ? (...args) => events(...args) : {}
  for (const key of Object.keys(events)) {
    const call = events[key]
    wrapped[key] = (...args) => {
      const start = monotonicClock.now(); trace({ phase: 'interaction-start', kind: key })
      try { return call(...args) } finally { trace({ phase: 'interaction-end', kind: key, duration: monotonicClock.now() - start }) }
    }
  }
  return wrapped
}

module.exports = { installReadiness, trace, measureCall, measureRender, measureEvents }
