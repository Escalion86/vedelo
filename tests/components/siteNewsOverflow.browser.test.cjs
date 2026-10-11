const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

test(
  'страница новостей не расширяет сетку кабинета и карточки',
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
 import React from 'react'; import {createRoot} from 'react-dom/client';
 import CabinetWrapper from './layouts/wrappers/CabinetWrapper';
 import ContentWrapper from './layouts/wrappers/ContentWrapper';
 import CabinetHeader from './layouts/CabinetHeader';
 import SiteNewsContent from './layouts/content/SiteNewsContent';
 window.fetch=async()=>({ok:true,json:async()=>({success:true,data:[{_id:'1',title:'ArtistCRM стал «Ведело»: новый адрес и важные обновления',version:'1.20.2',isPublished:true,contentHtml:'<p>Новость</p>',publishedAt:'2026-09-15'}, {_id:'2',title:'А'.repeat(120),version:'1.34.2',isPublished:false}]})});
 createRoot(document.getElementById('root')).render(<CabinetWrapper><CabinetHeader title="Настройки сайта / Новости платформы"/><ContentWrapper page="site-news"><SiteNewsContent/></ContentWrapper></CabinetWrapper>);
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
          name: 'mocks',
          setup(build) {
            const mocks = {
              '@components/MobileBottomNav': 'export default ()=>null',
              '@components/WhatsNewToast': 'export default ()=>null',
              '@state/selectors/windowDimensionsTailwindSelector':
                'import {atom} from "jotai"; export default atom(innerWidth < 768 ? "phoneV" : "desktop")',
              '@state/selectors/unreadNewsSelector':
                'import {atom} from "jotai"; export default atom([])',
              '@state/selectors/loggedUserActiveRoleSelector':
                'import {atom} from "jotai"; export default atom({dev:true})',
              '@state/atoms':
                'import {atom} from "jotai";export const modalsFuncAtom=atom({news:{add(){},edit(){}}})',
              '@layouts/SideBar': 'export default ()=>null',
              './UserMenu':
                'export default ()=> <button style={{width:40,flexShrink:0}}>Я</button>',
              'next/link':
                'export default ({children,...props})=><a {...props}>{children}</a>',
              '@helpers/CRUD':
                'export const putData=()=>{};export const deleteData=()=>{};',
              '@components/Tooltip': 'export default ({children})=>children',
            }
            build.onResolve({ filter: /.*/ }, (args) =>
              mocks[args.path]
                ? { path: args.path, namespace: 'mock' }
                : undefined
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
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`
    const server = http.createServer((req, res) => {
      res.end(html)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const browser = await chromium.launch({ headless: true })
    try {
      for (const width of [320, 390, 414, 1365])
        for (const dark of [false, true]) {
          const page = await browser.newPage({
            viewport: { width, height: 850 },
          })
          const errors = []
          page.on('pageerror', (e) => errors.push(e.message))
          await page.goto(`http://127.0.0.1:${server.address().port}`)
          await page.locator('article').nth(1).waitFor()
          await page.evaluate(
            (d) => document.body.classList.toggle('theme-dark', d),
            dark
          )
          const dimensions = await page.evaluate(() => ({
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
            header: document
              .querySelector('.cabinet-header')
              .getBoundingClientRect().width,
            canvas: document
              .querySelector('.cabinet-canvas')
              .getBoundingClientRect().width,
            cards: [...document.querySelectorAll('article')].map((el) => ({
              right: el.getBoundingClientRect().right,
              width: el.clientWidth,
              scroll: el.scrollWidth,
            })),
          }))
          assert.ok(dimensions.header <= width, JSON.stringify(dimensions))
          assert.ok(dimensions.document <= width, JSON.stringify(dimensions))
          for (const card of dimensions.cards) {
            assert.ok(card.right <= width, JSON.stringify(dimensions))
            assert.ok(card.scroll <= card.width, JSON.stringify(dimensions))
          }
          assert.deepEqual(errors, [])
          console.log(
            `${width} px, ${dark ? 'тёмная' : 'светлая'}: ${JSON.stringify(dimensions)}`
          )
          await page.close()
        }
    } finally {
      await browser.close()
      await new Promise((resolve) => server.close(resolve))
    }
  }
)
