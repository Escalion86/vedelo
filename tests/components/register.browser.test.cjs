const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { loadBindings, transformSync } = require('next/dist/build/swc')

// Сессия и чтение настроек изолированы; маршруты и клиентская форма настоящие.
function loadRoute(file) {
  const filename = path.resolve(file)
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  })
  const compiledModule = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => {
    if (id === 'next-auth') return { getServerSession: async () => null }
    if (id === 'next/navigation') return { redirect: () => { throw new Error('Неожиданный redirect') } }
    if (id === '@server/phoneAuthSettings') return { getPhoneAuthSettings: async () => ({ primaryMethod: 'call' }) }
    if (id === './loginInputs') return () => null
    if (id.includes('_options')) return {}
    if (id.startsWith('.')) return loadRoute(path.resolve(path.dirname(filename), `${id}.js`))
    return require(id)
  }, compiledModule, compiledModule.exports)
  return compiledModule.exports
}

test('Chromium: /register и legacy, мобильная/широкая форма, ref и переключение на вход', { timeout: 180000 }, async () => {
  const esbuild = require(process.env.ESBUILD_MODULE)
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
  await loadBindings()
  const bundle = await esbuild.build({
    stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `import React from 'react';import {createRoot} from 'react-dom/client';import LoginInputs from './app/login/loginInputs';createRoot(document.getElementById('root')).render(<LoginInputs {...window.initialProps}/>);` },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [{ name: 'framework', setup(build) {
      const mocks = {
        'next/link': 'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}',
        'next/image': 'import React from "react";export default function Image({unoptimized,...props}){return <img {...props}/>}',
        'next-auth/react': 'export const signIn=()=>{throw new Error("Авторизация запрещена на стенде")};',
      }
      build.onResolve({ filter: /^(next\/link|next\/image|next-auth\/react)$/ }, (args) => ({ path: args.path, namespace: 'mock' }))
      build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ contents: mocks[args.path], resolveDir: process.cwd(), loader: 'jsx' }))
      build.onResolve({ filter: /^@(state|layouts|components|helpers)\// }, (args) => ({ path: path.resolve(args.path.slice(1) + (path.extname(args.path) ? '' : '.js')) }))
    } }],
  })
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('app/globals.css', 'utf8'), { from: path.resolve('app/globals.css') })).css
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname.startsWith('/api/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, data: { allowVkAuth: false } })); return
      }
      const route = loadRoute(url.pathname === '/register' ? 'app/register/page.js' : 'app/login/page.js')
      const element = await route.default({ searchParams: Promise.resolve(Object.fromEntries(url.searchParams)) })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${route.metadata.title}</title><style>${css}</style></head><body><div id="root"></div><script>window.initialProps=${JSON.stringify(element.props).replaceAll('<', '\\u003c')}</script><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`)
    } catch (error) { res.writeHead(500); res.end(error.message) }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox'] })
    const origin = `http://127.0.0.1:${server.address().port}`
    const ref = '6976304ca24ad0fe7d7b2b15'
    for (const width of [390, 1365]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } })
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/*', (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort())
      for (const route of ['/register', `/register?ref=${ref}`, `/register?mode=login&ref=${ref}`, `/login?mode=register&ref=${ref}`]) {
        await page.goto(origin + route)
        await page.getByRole('heading', { name: 'Регистрация', exact: true }).waitFor()
        assert.equal(await page.getByRole('checkbox').count(), 3)
        const appLink = page.locator('a[href^="vedelo://"]')
        assert.equal(await appLink.count(), route.includes('ref=') ? 1 : 0)
        if (route.includes('ref=')) assert.equal(await appLink.getAttribute('href'), `vedelo://login?mode=register&ref=${ref}`)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: без горизонтального переполнения`)
        assert.equal(new URL(page.url()).pathname, route.split('?')[0])
      }
      await page.getByRole('button', { name: 'Вернуться ко входу', exact: true }).click()
      await page.getByRole('heading', { name: 'Вход в кабинет', exact: true }).waitFor()
      await page.goto(origin + '/login')
      await page.getByRole('heading', { name: 'Вход в кабинет', exact: true }).waitFor()
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally {
    if (browser) await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
