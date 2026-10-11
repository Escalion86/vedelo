const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

test(
  'редактор новостей принимает ввод и форматирование на узком и широком экране',
  {
    timeout: 120000,
    skip: !process.env.ESBUILD_MODULE || !process.env.PLAYWRIGHT_MODULE,
  },
  async () => {
    const esbuild = require(process.env.ESBUILD_MODULE)
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
    const result = await esbuild.build({
      stdin: {
        contents: `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
      import {Provider,createStore} from 'jotai'; import modalsAtom from './state/atoms/modalsAtom';
      import ModalsPortal from './layouts/modals/ModalsPortal'; import newsFunc from './layouts/modals/modalsFunc/newsFunc';
      const initialNews=location.search.includes('edit') ? {_id:'news-existing',title:'Прежний заголовок',version:'1.34.2',contentHtml:'<p>Сохранённый текст</p>',isPublished:true} : null;
      const store=createStore(); store.set(modalsAtom,[{id:'news',props:newsFunc(initialNews)}]);
      createRoot(document.getElementById('root')).render(<Provider store={store}><ModalsPortal/></Provider>);`,
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
          name: 'aliases',
          setup(build) {
            const mocks = {
              'next/dynamic':
                process.env.NEWS_STALLED_LOADING === '1'
                  ? 'export default function dynamic(load,options){return options.loading}'
                  : null,
              '@state/atoms':
                'import {atom} from "jotai"; export const modalsFuncAtom=atom({confirm(){}});',
              'next/navigation': 'export const useRouter=()=>({refresh(){}});',
              '@components/Tooltip':
                'export default function Tooltip({children}){return children}',
              '@helpers/CRUD':
                'export const postData=async (url,payload,onSuccess)=>{window.savedNews=payload}; export const putData=postData;',
            }
            build.onResolve(
              {
                filter:
                  /^(@state\/atoms$|next\/dynamic$|next\/navigation$|@components\/Tooltip$|@helpers\/CRUD$)/,
              },
              (args) =>
                mocks[args.path]
                  ? { path: args.path, namespace: 'mock' }
                  : undefined
            )
            build.onResolve({ filter: /^@helpers\/cloudinary$/ }, (args) => ({
              path: args.path,
              namespace: 'mock',
            }))
            build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
              contents:
                mocks[args.path] ||
                'export const sendImage=async()=>{throw new Error("Загрузка не запрашивалась")}',
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
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox'],
    })
    try {
      for (const width of [320, 390, 1365])
        for (const dark of [false, true]) {
          const page = await browser.newPage({
            viewport: { width, height: 850 },
          })
          const errors = []
          page.on('pageerror', (e) => errors.push(e.message))
          await page.goto(
            `http://127.0.0.1:${server.address().port}${dark ? '/?edit' : '/'}`
          )
          await page.evaluate(
            (d) => document.body.classList.toggle('theme-dark', d),
            dark
          )
          const editor = page.locator('[contenteditable="true"]')
          await editor.waitFor({ timeout: 5000 }).catch((e) => {
            assert.deepEqual(errors, [])
            throw e
          })
          if (dark) assert.equal(await editor.innerText(), 'Сохранённый текст')
          await page.locator('input').first().fill('Тестовая новость')
          await editor.fill('Проверка новости')
          await page.getByTitle('Полужирный', { exact: true }).click()
          await page.keyboard.type(' жирный')
          await page
            .getByRole('button', { name: 'Сохранить', exact: true })
            .click()
          await page
            .waitForFunction(() => Boolean(window.savedNews), null, {
              timeout: 3000,
            })
            .catch(async (e) => {
              console.log(
                'Ошибки',
                errors,
                'Форма',
                await page.locator('body').innerText()
              )
              throw e
            })
          assert.match(
            await page.evaluate(() => window.savedNews.contentHtml),
            /<strong>/
          )
          assert.equal(
            await page.evaluate(() => window.savedNews.title),
            'Тестовая новость'
          )
          assert.equal(
            await page.evaluate(() => window.savedNews.version),
            dark ? '1.34.2' : ''
          )
          assert.equal(
            await page.evaluate(() => window.savedNews.isPublished),
            dark
          )
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth
            ),
            true
          )
          assert.deepEqual(errors, [])
          await page.close()
        }
    } finally {
      await browser.close()
      await new Promise((resolve) => server.close(resolve))
    }
  }
)
