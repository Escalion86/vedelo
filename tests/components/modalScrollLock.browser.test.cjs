const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

// Настоящие ModalsPortal, Modal, Jotai и глобальные стили; без БД и авторизации.
test(
  'модалки: защита жеста, внутренняя прокрутка, вложенные окна и восстановление страницы',
  {
    timeout: 120000,
    skip: !process.env.ESBUILD_MODULE || !process.env.PLAYWRIGHT_MODULE,
  },
  async () => {
    const esbuild = require(process.env.ESBUILD_MODULE)
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
    const result = await esbuild.build({
      stdin: {
        contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {Provider, createStore} from 'jotai';
        import modalsAtom from './state/atoms/modalsAtom';
        import ModalsPortal from './layouts/modals/ModalsPortal';
        const store = createStore();
        function Form(){return <div><input aria-label="Название заявки" defaultValue="Несохранённая заявка"/>
          <button onClick={()=>window.openNested()}>Вложенное окно</button>
          {Array.from({length:45},(_,i)=><p key={i} style={{height:40}}>Строка формы {i+1}</p>)}</div>}
        const main={id:'main',props:{title:'Создание заявки',Children:Form}};
        window.openMain=()=>store.set(modalsAtom,[main]);
        window.openNested=()=>store.set(modalsAtom,[main,{id:'nested',props:{title:'Выбор клиента',Children:()=> <p>Вложенное окно</p>}}]);
        window.closeTop=()=>store.set(modalsAtom,current=>current.slice(0,-1));
        window.unmountPortal=()=>root.unmount();
        const root=createRoot(document.getElementById('root'));
        root.render(<Provider store={store}><ModalsPortal/></Provider>);
      `,
        resolveDir: process.cwd(),
        loader: 'jsx',
      },
      bundle: true,
      write: false,
      platform: 'browser',
      jsx: 'automatic',
      loader: { '.js': 'jsx' },
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
      plugins: [
        {
          name: 'modal-harness',
          setup(build) {
            const mocks = {
              '@state/atoms':
                'import {atom} from "jotai"; export const modalsFuncAtom=atom({confirm(){}});',
              'next/navigation':
                'export const useRouter=()=>({refresh(){throw new Error("Неожиданное обновление")}});',
              '@components/Tooltip':
                'export default function Tooltip({children}){return children}',
            }
            build.onResolve(
              {
                filter:
                  /^(@state\/atoms$|next\/navigation$|@components\/Tooltip$)/,
              },
              (args) => ({ path: args.path, namespace: 'mock' })
            )
            build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
              contents: mocks[args.path],
              resolveDir: process.cwd(),
              loader: 'jsx',
            }))
            build.onResolve(
              { filter: /^@(state|layouts|components|helpers)\// },
              (args) => ({
                path: path.resolve(
                  args.path.slice(1) + (path.extname(args.path) ? '' : '.js')
                ),
              })
            )
          },
        },
      ],
    })
    const css = (
      await require('postcss')([require('@tailwindcss/postcss')()]).process(
        await fs.readFile('app/globals.css', 'utf8'),
        { from: path.resolve('app/globals.css') }
      )
    ).css
    const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main style="height:3000px">Фоновая страница</main><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const browser = await chromium.launch({ headless: true })
    try {
      for (const width of [390, 1365])
        for (const dark of [false, true])
          for (const initialScroll of [0, 320]) {
            const context = await browser.newContext({
              viewport: { width, height: 850 },
              hasTouch: true,
            })
            const page = await context.newPage()
            const errors = []
            page.on('pageerror', (error) => errors.push(error.message))
            let navigations = 0
            page.on('request', (request) => {
              if (
                request.isNavigationRequest() &&
                request.frame() === page.mainFrame()
              )
                navigations++
            })
            await page.goto(`http://127.0.0.1:${server.address().port}`)
            await page
              .waitForFunction(
                () => typeof window.openMain === 'function',
                null,
                { timeout: 5000 }
              )
              .catch((error) => {
                assert.deepEqual(
                  errors,
                  [],
                  'Ошибки загрузки браузерного стенда'
                )
                throw error
              })
            await page.evaluate(
              ({ dark, initialScroll }) => {
                document.body.classList.toggle('theme-dark', dark)
                window.scrollTo(0, initialScroll)
              },
              { dark, initialScroll }
            )
            await page.waitForFunction(
              (expected) => Math.abs(window.scrollY - expected) < 1,
              initialScroll
            )
            const original = await page.evaluate(() =>
              [document.documentElement, document.body].map((el) => ({
                overflow: getComputedStyle(el).overflow,
                overscroll: getComputedStyle(el).overscrollBehaviorY,
              }))
            )
            await page.evaluate(() => window.openMain())
            const field = page.getByRole('textbox', { name: 'Название заявки' })
            await field.waitFor()
            await field.fill('Проверка сохранности формы')
            const content = page.locator('div.overflow-y-auto').last()
            const surfaceStyles = await page.evaluate(() => ({
              roots: [document.documentElement, document.body].map((el) => ({
                overflow: getComputedStyle(el).overflow,
                overscroll: getComputedStyle(el).overscrollBehaviorY,
              })),
              scrollContainers: [
                ...document.querySelectorAll('div.overflow-y-auto'),
              ].map((el) => getComputedStyle(el).overscrollBehaviorY),
              overflow: document.documentElement.scrollWidth > innerWidth,
            }))
            assert.deepEqual(surfaceStyles.roots, [
              { overflow: 'hidden', overscroll: 'none' },
              { overflow: 'hidden', overscroll: 'none' },
            ])
            assert.deepEqual(surfaceStyles.scrollContainers, [
              'contain',
              'contain',
            ])
            assert.equal(surfaceStyles.overflow, false)

            const cdp = await context.newCDPSession(page)
            const gesture = async (x, startY, endY) => {
              await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchStart',
                touchPoints: [{ x, y: startY, id: 1 }],
              })
              for (let step = 1; step <= 10; step++) {
                await cdp.send('Input.dispatchTouchEvent', {
                  type: 'touchMove',
                  touchPoints: [
                    { x, y: startY + ((endY - startY) * step) / 10, id: 1 },
                  ],
                })
              }
              await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchEnd',
                touchPoints: [],
              })
            }
            // Начало жеста в заголовке, а не внутри прокручиваемой формы.
            const heading = page.getByText('Создание заявки', { exact: true })
            const bounds = await heading.boundingBox()
            await gesture(
              width / 2,
              bounds.y + bounds.height / 2,
              bounds.y + bounds.height / 2 + 160
            )
            assert.equal(await field.inputValue(), 'Проверка сохранности формы')
            assert.equal(
              await page.evaluate(() => window.scrollY),
              initialScroll
            )
            assert.equal(navigations, 1)

            // Внутри длинной формы настоящий жест вверх прокручивает содержимое.
            const box = await content.boundingBox()
            await gesture(
              width / 2,
              box.y + box.height * 0.7,
              box.y + box.height * 0.3
            )
            await page.waitForFunction(
              () =>
                [...document.querySelectorAll('div.overflow-y-auto')].at(-1)
                  .scrollTop > 0
            )
            const beforeWheel = await content.evaluate((el) => el.scrollTop)
            await page.mouse.move(width / 2, box.y + box.height / 2)
            await page.mouse.wheel(0, 150)
            await page.waitForFunction(
              (before) =>
                [...document.querySelectorAll('div.overflow-y-auto')].at(-1)
                  .scrollTop > before,
              beforeWheel
            )
            await content.evaluate((el) => {
              el.scrollTop = 0
            })
            await gesture(width / 2, box.y + 20, box.y + 160)
            assert.equal(
              await page.evaluate(() => window.scrollY),
              initialScroll
            )
            assert.equal(await field.inputValue(), 'Проверка сохранности формы')

            if (
              width === 390 &&
              !dark &&
              initialScroll === 0 &&
              process.env.QA_HTML_PATH
            ) {
              const snapshot = await page.evaluate(() => {
                const clone = document.documentElement.cloneNode(true)
                clone
                  .querySelectorAll('script')
                  .forEach((node) => node.remove())
                const originals = document.querySelectorAll('style')
                clone.querySelectorAll('style').forEach((node, index) => {
                  node.textContent = [
                    ...(originals[index].sheet?.cssRules || []),
                  ]
                    .map((rule) => rule.cssText)
                    .join('\n')
                })
                return '<!doctype html>' + clone.outerHTML
              })
              await fs.writeFile(process.env.QA_HTML_PATH, snapshot)
            }
            await page.evaluate(() => window.openNested())
            await page.getByText('Выбор клиента', { exact: true }).waitFor()
            await page.evaluate(() => window.closeTop())
            await page
              .getByText('Выбор клиента', { exact: true })
              .waitFor({ state: 'detached' })
            assert.equal(await field.inputValue(), 'Проверка сохранности формы')
            assert.equal(
              await page.evaluate(
                () =>
                  getComputedStyle(document.documentElement).overscrollBehaviorY
              ),
              'none'
            )
            await page.evaluate(() => window.closeTop())
            await field.waitFor({ state: 'detached' })
            assert.deepEqual(
              await page.evaluate(() =>
                [document.documentElement, document.body].map((el) => ({
                  overflow: getComputedStyle(el).overflow,
                  overscroll: getComputedStyle(el).overscrollBehaviorY,
                }))
              ),
              original
            )
            assert.equal(
              await page.evaluate(() => window.scrollY),
              initialScroll
            )
            await page.mouse.move(width / 2, 400)
            await page.mouse.wheel(0, 250)
            await page.waitForFunction(
              (before) => window.scrollY > before,
              initialScroll
            )
            assert.deepEqual(errors, [])
            console.log(
              `Проверено: ${width} px, ${dark ? 'тёмная' : 'светлая'} тема, прокрутка страницы ${initialScroll}; жесты, колесо, вложенность, сохранность ввода`
            )
            await context.close()
          }
    } finally {
      await browser.close()
      await new Promise((resolve) => server.close(resolve))
    }
  }
)
