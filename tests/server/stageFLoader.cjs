const fs = require('node:fs')
const path = require('node:path')
const { transformSync } = require('next/dist/build/swc')

// Compile repository modules unchanged. Only explicitly supplied boundary mocks
// are substituted; helpers, renderers, sanitizers and route logic run for real.
exports.loader = function loader(mocks = {}) {
  const cache = new Map()
  function load(file) {
    const full = path.resolve(file)
    if (cache.has(full)) return cache.get(full).exports
    const module = { exports: {} }
    cache.set(full, module)
    const { code } = transformSync(fs.readFileSync(full, 'utf8'), {
      filename: full,
      jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
      module: { type: 'commonjs' },
    })
    const resolve = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      let target
      if (name.startsWith('@')) {
        const match = name.match(/^@(server|helpers|models)\/(.+)$/)
        if (match) target = path.resolve(match[1], match[2])
      } else if (name.startsWith('.')) target = path.resolve(path.dirname(full), name)
      if (!target) return require(name)
      if (!path.extname(target)) target += '.js'
      const relative = path.relative(process.cwd(), target)
      if (Object.hasOwn(mocks, relative)) return mocks[relative]
      return load(target)
    }
    new Function('require', 'module', 'exports', 'process', code)(
      resolve, module, module.exports,
      { env: { ESCALIONCLOUD_PASSWORD: 'synthetic-upload-fixture', NEXTAUTH_SECRET: 'synthetic-proposal-fixture' } }
    )
    return module.exports
  }
  return load
}
exports.json = { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) }
exports.chain = (value) => ({
  sort() { return this }, select() { return this }, skip() { return this }, limit() { return this },
  lean: async () => value,
  then: (ok, fail) => Promise.resolve(value).then(ok, fail),
})
