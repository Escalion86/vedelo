const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')

test('social auth UI: admin save, login visibility, explicit link, mobile and dark theme', { timeout: 120000 }, async () => {
  const esbuild = require('../../mobile/node_modules/esbuild')
  const { chromium } = require('playwright')
  const mocks = {
    '@helpers/useSnackbar': 'const s={success:()=>{},error:()=>{}};export default ()=>s;',
    '@helpers/metrikaGoals': 'export const reachGoal=()=>{};export const reachGoalOnce=()=>{};',
    'next/link': 'export default function Link({children,...props}){return <a {...props}>{children}</a>}',
    'next/image': 'export default function Image({priority,fill,...props}){return <img {...props}/>}',
    'next-auth/react': 'export const signIn=async()=>({error:"mock-error"}); export const signOut=async()=>{};',
  }
  const bundle = await esbuild.build({
    stdin: { contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import Admin from './layouts/content/PhoneAuthSettingsContent';
      import Login from './app/login/loginInputs';
      import Complete from './app/auth/yandex/complete/yandexComplete';
      const p=new URLSearchParams(location.search);
      createRoot(document.getElementById('root')).render(location.pathname==='/login'?<Login initialMode={p.get('mode')} initialPhone={p.has('registerYandex')?'79000000001':''} callbackUrl={p.get('callback')||'/cabinet'}/>:location.pathname.includes('/complete')?<Complete signedIn={p.has('signed')} phone={p.has('wrong')?'79000000002':'79000000001'}/>:<Admin/>);
    `, resolveDir: process.cwd(), loader: 'jsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [{
      name: 'test-boundaries', setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'mock' }
          if (/^@(state|layouts|components|helpers)\//.test(args.path))
            return { path: path.resolve(args.path.slice(1) + (path.extname(args.path) ? '' : '.js')) }
        })
        build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ contents: mocks[args.path], loader: 'jsx', resolveDir: process.cwd() }))
      },
    }],
  })
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(
    await fs.readFile('app/globals.css', 'utf8'), { from: path.resolve('app/globals.css') }
  )).css
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<!doctype html><html><head><title>Social auth QA</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const screenshots = process.env.QA_SCREENSHOT_DIR || path.join(os.tmpdir(), 'vedelo-social-auth-qa')
  await fs.mkdir(screenshots, { recursive: true })
  try {
    for (const width of [390, 1365]) for (const dark of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
      await page.addInitScript((dark) => {
        document.addEventListener('DOMContentLoaded', () => { if (dark) document.body.classList.add('theme-dark') })
      }, dark)
      let settings = { primaryMethod: 'call', vkEnabled: true, yandexEnabled: false, vkConfigured: true, yandexConfigured: true, callConfigured: true, smsConfigured: true, telefonipBalance: { status: 'unconfigured' } }
      let saved
      let linked = false
      let action
      await page.route('**/api/site/phone-auth', (route) => {
        if (route.request().method() === 'POST') {
          saved = route.request().postDataJSON()
          settings = { ...settings, ...saved }
        }
        return route.fulfill({ json: { success: true, data: settings } })
      })
      await page.route('**/api/global/auth/vk-status', (route) => route.fulfill({ json: { data: { allowVkAuth: false, allowYandexAuth: settings.yandexEnabled } } }))
      await page.route('**/api/yandex-id/complete', (route) => {
        if (route.request().method() === 'POST') {
          action = route.request().postDataJSON().action
          return route.fulfill({ json: { token: 'test-token' } })
        }
        return route.fulfill({ json: { linked, phone: "79000000001", accountExists: false } })
      })
      const origin = `http://127.0.0.1:${server.address().port}`
      await page.goto(`${origin}/cabinet/phone-auth`)
      assert.equal(await page.title(), 'Social auth QA')
      const vk = page.getByRole('switch', { name: 'Разрешить вход через VK ID', exact: true })
      const yandex = page.getByRole('switch', { name: 'Разрешить вход через Яндекс ID', exact: true })
      await vk.waitFor()
      await vk.click()
      await yandex.focus()
      await page.keyboard.press('Space')
      assert.equal(await yandex.isChecked(), true)
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('button[aria-busy="true"]') === null)
      assert.deepEqual(saved, { primaryMethod: 'call', vkEnabled: false, yandexEnabled: true })
      await page.reload()
      await yandex.waitFor()
      assert.equal(await yandex.isChecked(), true)
      assert.equal(await vk.isChecked(), false)
      await page.screenshot({ path: path.join(screenshots, `admin-${width}-${dark}.png`), fullPage: true })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.goto(`${origin}/login`)
      await page.getByRole('link', { name: 'Войти через Яндекс ID' }).waitFor()
      assert.equal(await page.getByText('Войти через VK ID', { exact: true }).count(), 0)
      settings.yandexEnabled = false
      await page.reload()
      await page.getByRole('heading', { name: 'Вход в кабинет' }).waitFor()
      await page.waitForTimeout(150)
      assert.equal(await page.getByRole('link', { name: 'Войти через Яндекс ID' }).count(), 0)
      await page.goto(`${origin}/auth/yandex/complete`)
      const login = page.getByRole('link', { name: 'Войти в существующий аккаунт' })
      await login.waitFor()
      assert.match(await login.getAttribute('href'), /callbackUrl=%2Fauth%2Fyandex%2Fcomplete/)
      assert.equal(action, undefined)
      const register = page.getByRole('link', { name: 'Зарегистрироваться через Яндекс', exact: true })
      assert.match(await register.getAttribute('href'), /mode=register/)
      await page.goto(`${origin}/login?mode=register&registerYandex=1&callback=/auth/yandex/complete`)
      const phoneInput = page.locator('input[type="tel"]').first()
      await phoneInput.waitFor()
      assert.equal(await phoneInput.isDisabled(), true)
      assert.match(await phoneInput.inputValue(), /900/)
      await page.screenshot({ path: path.join(screenshots, `register-${width}-${dark}.png`), fullPage: true })
      await page.goto(`${origin}/auth/yandex/complete?signed=1&wrong=1`)
      await page.getByRole('button', { name: 'Войти с номером Яндекса' }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Подключить Яндекс ID', exact: true }).count(), 0)
      await page.goto(`${origin}/auth/yandex/complete?signed=1`)
      const connect = page.getByRole('button', { name: 'Подключить Яндекс ID', exact: true })
      await connect.waitFor()
      await page.screenshot({ path: path.join(screenshots, `link-${width}-${dark}.png`), fullPage: true })
      await connect.click()
      await page.getByRole('alert').waitFor()
      assert.equal(action, 'link')
      linked = true
      await page.reload()
      await page.getByRole('button', { name: 'Войти в кабинет', exact: true }).click()
      await page.getByRole('alert').waitFor()
      assert.equal(action, 'login')
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
