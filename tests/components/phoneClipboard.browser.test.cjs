const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs/promises')
const http = require('node:http')

// Real phone fields, modal stack and CSS; only clipboard and toast delivery are mocked.
const entry = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Provider, createStore} from 'jotai';
import PhoneInput from './components/PhoneInput';
import ModalsPortal from './layouts/modals/ModalsPortal';
import modalsFuncAtom from './state/atoms/modalsFuncAtom';
import addModal from './state/selectors/addModalSelector';
const store=createStore();
store.set(modalsFuncAtom, {add: props => store.set(addModal, props)});
function Form(){
  const [phone,setPhone]=useState(79001112233),[whatsapp,setWhatsapp]=useState(79032223344),[locked,setLocked]=useState(false);
  return <div className="flex flex-col gap-3 py-3">
    <input aria-label="Имя клиента" defaultValue="Несохранённое имя"/>
    <section aria-label="Основной телефон"><PhoneInput className="w-full" label="Телефон" value={phone} disabled={locked} copyPasteButtons onChange={v=>{window.changes.push(v);setPhone(v)}}/></section>
    <section aria-label="WhatsApp"><PhoneInput className="w-full" label="WhatsApp" value={whatsapp} copyPasteButtons onChange={setWhatsapp}/></section>
    <button onClick={()=>setLocked(v=>!v)}>Переключить блокировку</button>
  </div>
}
function App(){return <main className="cabinet-canvas"><button onClick={()=>store.set(addModal,{title:'Клиент',Children:Form})}>Открыть форму</button><ModalsPortal/></main>}
document.title='Проверка вставки телефона';
window.changes=[];
createRoot(document.getElementById('root')).render(<Provider store={store}><App/></Provider>);
`

test('вставка телефона из текста: один/несколько/дубли/отмена/ошибка, 390/1365 px и обе темы', { timeout: 180000 }, async () => {
  const esbuild = require(process.env.ESBUILD_MODULE || path.resolve('mobile/node_modules/esbuild'))
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.resolve('node_modules/playwright'))
  const mocks = {
    '@state/atoms': "export {default as modalsAtom} from './state/atoms/modalsAtom'; export {default as modalsFuncAtom} from './state/atoms/modalsFuncAtom';",
    'next/navigation': 'export const useRouter=()=>({refresh(){throw Error("Unexpected refresh")}});',
    '@helpers/useSnackbar': 'export default ()=>({info:t=>window.toast=t,error:t=>window.toast=t});',
  }
  const bundle = await esbuild.build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'jsx' },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    loader: { '.js': 'jsx' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [{ name: 'phone-harness', setup(build) {
      build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: 'mock' } : undefined)
      build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], resolveDir: process.cwd(), loader: 'jsx' }))
      build.onResolve({ filter: /^@(helpers|components|layouts|state)\// }, args => ({ path: path.resolve(args.path.slice(1) + (path.extname(args.path) ? '' : '.js')) }))
    } }],
  })
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('app/globals.css', 'utf8'), { from: path.resolve('app/globals.css') })).css
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) })
    for (const width of [390, 1365]) for (const dark of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
      await page.addInitScript(() => {
        window.clipboardText = ''; window.reads = 0
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          readText: async () => {
            window.reads++
            if (window.clipboardMode === 'denied') throw Error('denied')
            if (window.clipboardMode === 'pending') return new Promise(resolve => { window.resolveClipboard = resolve })
            return window.clipboardText
          },
          writeText: async value => { window.copied = value },
        } })
      })
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}`)
        assert.equal(await page.title(), 'Проверка вставки телефона')
        await page.evaluate(dark => document.body.classList.toggle('theme-dark', dark), dark)
        assert.equal(await page.evaluate(() => window.reads), 0)
        await page.getByRole('button', { name: 'Открыть форму' }).click()
        const region = page.getByRole('region', { name: 'Основной телефон' })
        const input = page.getByRole('textbox', { name: 'Телефон', exact: true })
        const paste = region.getByRole('button', { name: 'Вставить номер' })
        const title = page.getByText('Выбор номера телефона', { exact: true })
        const setClipboard = text => page.evaluate(text => { window.clipboardText = text; window.toast = '' }, text)
        await input.waitFor()
        await setClipboard('Анна, 26.10.2026, сумма 25000. Тел.: +7 (999) 123-45-67, после 18:00')
        await paste.click()
        await page.waitForFunction(() => window.changes.at(-1) === 79991234567)
        assert.equal(await input.inputValue(), '(999) 123-45-67')
        assert.equal(await title.count(), 0)
        await setClipboard('8 (999) 123-45-67; +7 999 123 45 67; 9991234567')
        await paste.click()
        assert.equal(await title.count(), 0)
        const multiple = 'Анна: +7 (999) 123-45-67\nИван: 8 (913) 765-43-21\nАнна: 89991234567'
        await setClipboard(multiple)
        const beforeChoice = await page.evaluate(() => window.changes.length)
        await paste.click()
        await title.waitFor()
        const first = page.getByRole('button', { name: '+7 (999) 123-45-67', exact: true })
        const second = page.getByRole('button', { name: '+7 (913) 765-43-21', exact: true })
        assert.equal(await first.count(), 1)
        assert.equal(await page.evaluate(() => window.changes.length), beforeChoice)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden')
        await page.waitForFunction(() => [...document.querySelectorAll('.fixed.inset-0')].every(element =>
          getComputedStyle(element).opacity === '1' && getComputedStyle(element.firstElementChild).opacity === '1'
        ))
        const box = await second.boundingBox()
        assert.ok(box.height >= 40 && box.x >= 0 && box.x + box.width <= width)
        if (process.env.QA_SCREENSHOT_DIR) {
          await fs.mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true })
          await page.screenshot({ path: path.join(process.env.QA_SCREENSHOT_DIR, `phone-choice-${width}-${dark ? 'dark' : 'light'}.png`) })
        }
        await first.focus()
        await page.keyboard.press('Tab')
        await page.keyboard.press('Enter')
        await title.waitFor({ state: 'detached' })
        assert.equal(await input.inputValue(), '(913) 765-43-21')
        assert.equal(await page.getByRole('textbox', { name: 'WhatsApp', exact: true }).inputValue(), '(903) 222-33-44')
        assert.equal(await page.getByRole('textbox', { name: 'Имя клиента' }).inputValue(), 'Несохранённое имя')
        await paste.click()
        await title.waitFor()
        await page.getByRole('button', { name: 'Отмена', exact: true }).click()
        await title.waitFor({ state: 'detached' })
        assert.equal(await input.inputValue(), '(913) 765-43-21')
        await paste.click()
        await title.waitFor()
        await first.focus()
        await page.keyboard.press('Escape')
        await title.waitFor({ state: 'detached' })
        assert.equal(await input.inputValue(), '(913) 765-43-21')
        await setClipboard('Дата 26.10.2026, заказ 25000 ₽')
        await paste.click()
        await page.waitForFunction(() => window.toast === 'В буфере обмена не найден номер телефона')
        assert.equal(await input.inputValue(), '(913) 765-43-21')
        await setClipboard('')
        await paste.click()
        await page.waitForFunction(() => window.toast === 'В буфере обмена не найден номер телефона')
        assert.equal(await input.inputValue(), '(913) 765-43-21')
        await page.evaluate(() => { window.clipboardMode = 'denied' })
        await paste.click()
        await page.waitForFunction(() => window.toast.startsWith('Не удалось прочитать'))
        assert.equal(await input.inputValue(), '(913) 765-43-21')
        await region.getByRole('button', { name: 'Скопировать номер' }).click()
        await page.waitForFunction(() => window.copied === '+79137654321')
        await page.getByRole('region', { name: 'WhatsApp' }).getByRole('button', { name: 'Скопировать номер' }).click()
        await page.waitForFunction(() => window.copied === '+79032223344')
        await page.evaluate(() => { window.clipboardMode = 'pending' })
        await paste.click()
        assert.equal(await paste.isDisabled(), true)
        const reads = await page.evaluate(() => window.reads)
        await paste.dispatchEvent('click')
        assert.equal(await page.evaluate(() => window.reads), reads)
        await page.getByRole('button', { name: 'Переключить блокировку' }).click()
        await page.evaluate(() => window.resolveClipboard('79991234567'))
        assert.equal(await input.isDisabled(), true)
        assert.equal(await input.inputValue(), '(913) 765-43-21')
        assert.equal(await region.getByRole('button', { name: 'Вставить номер' }).count(), 0)
        assert.deepEqual(errors, [])
        console.log(`Телефон: ${width}px, ${dark ? 'dark' : 'light'} — выбор, отмена, дубли, ошибки, клавиатура, изоляция полей OK`)
      } finally { await page.close() }
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)) }
})
