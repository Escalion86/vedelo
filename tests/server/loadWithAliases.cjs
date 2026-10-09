// Загрузчик серверных модулей Ведело для node --test: компилирует ESM/JSX-исходники
// в CommonJS через swc и сам разрешает алиасы Next.js (`@models/...`, `@helpers/...`).
// Нужен потому, что часть файлов (например `server/dbConnect.js`) смешивает `require`
// и `export default` и вне сборщика Next.js обычным Node не загружается.
const fs = require('node:fs')
const path = require('node:path')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const ROOT = path.resolve(__dirname, '..', '..')

const ALIASES = {
  '@models': 'models',
  '@schemas': 'schemas',
  '@server': 'server',
  '@helpers': 'helpers',
  '@components': 'components',
  '@state': 'state',
  '@layouts': 'layouts',
  '@utils': 'utils',
  '@pages': 'pages',
  '@styles': 'styles',
  '@blocks': 'blocks',
}

const candidatesFor = (base) => [
  base,
  `${base}.js`,
  `${base}.mjs`,
  `${base}.cjs`,
  `${base}.json`,
  path.join(base, 'index.js'),
  path.join(base, 'index.mjs'),
]

const resolveTarget = (name, fromDirectory) => {
  let base = null
  const [prefix, ...rest] = name.split('/')
  if (name.startsWith('@') && Object.prototype.hasOwnProperty.call(ALIASES, prefix)) {
    base = path.join(ROOT, ALIASES[prefix], rest.join('/'))
  } else if (name.startsWith('.')) {
    base = path.resolve(fromDirectory, name)
  } else {
    return null
  }
  const found = candidatesFor(base).find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  )
  if (!found) throw new Error(`Не найдено: ${name} (из ${fromDirectory})`)
  return found
}

// mocks: { '<specifier>': moduleExports }
const createLoader = async (mocks = {}) => {
  await loadBindings()
  const cache = new Map()
  const load = (file) => {
    const filename = path.resolve(file)
    if (cache.has(filename)) return cache.get(filename).exports
    if (filename.endsWith('.json')) {
      const exports = JSON.parse(fs.readFileSync(filename, 'utf8'))
      cache.set(filename, { exports })
      return exports
    }
    const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      jsc: { parser: { syntax: 'ecmascript', jsx: true } },
      module: { type: 'commonjs' },
    })
    const mod = { exports: {} }
    cache.set(filename, mod)
    const requireShim = (name) => {
      if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name]
      const target = resolveTarget(name, path.dirname(filename))
      if (target) return load(target)
      return require(name)
    }
    new Function(
      'require',
      'module',
      'exports',
      '__filename',
      '__dirname',
      code
    )(requireShim, mod, mod.exports, filename, path.dirname(filename))
    return mod.exports
  }
  return { load, resolveTarget }
}

module.exports = { createLoader, resolveTarget, ROOT }
