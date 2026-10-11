const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const artifactDir =
  process.env.REVIEW_QA_DIR ||
  '/home/aleksei/.hermes/cache/scratch/vedelo-reviews-layout'
let browser, server, origin

test.before(async () => {
  const esbuild = require(process.env.ESBUILD_MODULE)
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
  const mocks = {
    'next/navigation': `export const usePathname=()=>window.qaPath||'/cabinet/client-reviews';export const useRouter=()=>({prefetch(){},push:url=>window.qa.routes.push(url)});`,
    'next/link': `import React from 'react';export default function Link({children,href,onClick,...props}){return <a href={href} {...props} onClick={event=>{event.preventDefault();onClick?.(event);window.qa.routes.push(href)}}>{children}</a>}`,
    '@state/atoms/menuOpen': `import {atom} from 'jotai';export default atom(true);`,
    '@state/atoms/loggedUserAtom': `import {atom} from 'jotai';export default atom({role:new URLSearchParams(location.search).get('role')||'user'});`,
    '@state/selectors/windowDimensionsTailwindSelector': `import {atom} from 'jotai';export default atom(innerWidth<768?'phoneV':'desktop');`,
    '@state/selectors/additionalEventsOverdueCountAtom': `import {atom} from 'jotai';export const additionalEventsOverdueCountAtom=atom(0);`,
    '@helpers/useSupportTickets': `export const useSupportSummaryQuery=()=>({data:null});`,
    '@helpers/usePaymentOperationsQuery': `export const useMissingPaymentReceiptsCountQuery=()=>({data:null});`,
    '@helpers/useEventCreateMenu': `export default ()=>({items:[],draftModals:null});`,
    '@helpers/useWorkItemTerminology': `export default ()=>({pluralCapitalized:'Заказы',accusative:'заказ'});`,
    '@components/ImpersonationReturnButton': `export default ()=>null;`,
  }
  const bundle = await esbuild.build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'jsx',
      contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';import {Provider} from 'jotai';
      import View from './components/ReviewPageView';import Content from './layouts/wrappers/ContentWrapper';import Nav from './components/MobileBottomNav';
      const params=new URLSearchParams(location.search);window.qa={routes:[],submits:[]};
      window.qaPath='/cabinet/'+(params.get('page')||'client-reviews');
      function App(){const [rating,setRating]=React.useState(0),[comment,setComment]=React.useState(''),[state,setState]=React.useState('form');
      window.qa.setState=setState;const kind=params.get('kind')||'review';const dark=params.get('scheme')==='dark';
      document.body.classList.toggle('theme-dark',dark);
      if(kind==='sidebar')return <Provider><div style={{height:'100dvh'}}><Content page={params.get('page')||'client-reviews'}/></div></Provider>;
      if(kind==='mobile')return <Provider><div style={{height:'100dvh'}}><div style={{position:'fixed',bottom:0,width:'100%'}}><Nav/></div></div></Provider>;
      const view=<View appearance={{publicName:'Алексей Белинский',specialization:'Иллюзионист',cover:params.get('cover')||'deep',accent:'sand'}} scheme={params.get('scheme')||'light'}
        preview={kind==='preview'} performerName='Белинский Алексей Алексеевич' eventDate='2026-09-28T00:00:00Z' rating={rating} comment={comment} state={state} onRatingChange={setRating} onCommentChange={setComment}
        onSubmit={event=>{event.preventDefault();window.qa.submits.push({rating,comment});setState('thanks')}}/>;
      return kind==='preview'?<div data-qa-preview style={{width:'min(520px, calc(100% - 48px))',margin:'30px auto',maxHeight:640,overflowY:'auto',border:'1px solid',borderRadius:12}}>{view}</div>:view;}
      createRoot(document.getElementById('root')).render(<App/>);
    `,
    },
    bundle: true,
    write: false,
    outdir: 'qa',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [
      {
        name: 'seams',
        setup(build) {
          build.onResolve({ filter: /^(next\/|@)/ }, (args) =>
            args.path in mocks
              ? { path: args.path, namespace: 'mock' }
              : undefined
          )
          build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
            contents: mocks[args.path],
            resolveDir: process.cwd(),
            loader: 'jsx',
          }))
          build.onResolve(
            { filter: /^@(helpers|components|layouts|state)\// },
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
  const globalCss = (
    await require('postcss')([require('@tailwindcss/postcss')()]).process(
      await fs.readFile('app/globals.css', 'utf8'),
      { from: path.resolve('app/globals.css') }
    )
  ).css
  const css =
    globalCss +
    '\n' +
    bundle.outputFiles
      .filter((file) => file.path.endsWith('.css'))
      .map((file) => file.text)
      .join('\n')
  const js = bundle.outputFiles.find((file) => file.path.endsWith('.js')).text
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox'],
  })
  await fs.mkdir(artifactDir, { recursive: true })
})
test.after(async () => {
  if (browser) await browser.close()
  if (server) await new Promise((resolve) => server.close(resolve))
})
async function capture(page, name) {
  const html = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true)
    clone.querySelectorAll('script').forEach((node) => node.remove())
    const style = document.createElement('style')
    style.textContent = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules).map((rule) => rule.cssText)
        } catch {
          return []
        }
      })
      .join('\n')
    clone.querySelector('head').append(style)
    return '<!doctype html>' + clone.outerHTML
  })
  await fs.writeFile(path.join(artifactDir, `${name}.html`), html)
  await page.screenshot({
    path: path.join(artifactDir, `${name}.png`),
    fullPage: true,
  })
}

test(
  'Обложка во всю ширину, без нижних скруглений; положение текста и формы прежнее',
  { timeout: 180000 },
  async () => {
    const results = []
    const violations = []
    for (const width of [280, 390, 1365])
      for (const scheme of ['light', 'dark'])
        for (const cover of ['plain', 'warm', 'deep'])
          for (const kind of ['review', 'preview']) {
            const page = await browser.newPage({
              viewport: { width, height: 900 },
            })
            const errors = []
            page.on('pageerror', (error) => errors.push(error.message))
            await page.goto(
              `${origin}/?kind=${kind}&scheme=${scheme}&cover=${cover}`
            )
            await page
              .getByRole('heading', { name: 'Алексей Белинский', exact: true })
              .waitFor()
            const metrics = await page.evaluate(() => {
              const root = document.querySelector('[data-cover]'),
                header = root.querySelector('header'),
                name = header.querySelector('h1'),
                card = root.querySelector('main').firstElementChild
              const rect = (node) => {
                const { x, y, width, height } = node.getBoundingClientRect()
                return { x, y, width, height }
              }
              const bounds = rect(root),
                h = rect(header),
                n = rect(name),
                c = rect(card),
                s = getComputedStyle(header)
              return {
                bounds,
                header: h,
                name: n,
                card: c,
                radius: [s.borderBottomLeftRadius, s.borderBottomRightRadius],
                overflow: document.documentElement.scrollWidth > innerWidth,
              }
            })
            const key = `${kind}-${width}-${scheme}-${cover}`
            results.push({ key, ...metrics })
            const shellWidth = Math.min(metrics.bounds.width - 32, 432),
              shellX =
                metrics.bounds.x + (metrics.bounds.width - shellWidth) / 2
            assert.ok(
              Math.abs(metrics.name.x - (shellX + 4)) < 1,
              `${key}: текст не сдвинут`
            )
            assert.ok(
              Math.abs(metrics.card.x - shellX) < 1,
              `${key}: положение формы сохранено`
            )
            assert.equal(metrics.header.y, metrics.bounds.y)
            assert.equal(
              metrics.name.y - metrics.header.y,
              50,
              `${key}: прежний вертикальный отступ текста`
            )
            assert.equal(metrics.overflow, false, `${key}: переполнение`)
            assert.deepEqual(errors, [])
            if (
              Math.abs(metrics.header.x - metrics.bounds.x) > 1 ||
              Math.abs(metrics.header.width - metrics.bounds.width) > 1 ||
              metrics.radius.some((value) => value !== '0px')
            )
              violations.push(key)
            if (width === 390 && cover === 'deep')
              await capture(page, `${kind}-${scheme}`)
            await page.close()
          }
    await fs.writeFile(
      path.join(artifactDir, 'metrics.json'),
      JSON.stringify(results, null, 2)
    )
    assert.deepEqual(
      violations,
      [],
      'Фон должен занимать всю ширину страницы/предпросмотра и не иметь нижних скруглений'
    )
  }
)

test(
  'Мобильное Меню сохраняет заданный порядок разделов и ограничения ролей',
  { timeout: 120000 },
  async () => {
    const order = [
      'Статистика',
      'Транзакции',
      'Звонки',
      'Отзывы',
      'История действий',
      'Поддержка',
      'Настройки',
      'Администрирование',
    ]
    for (const role of ['user', 'admin', 'dev'])
      for (const scheme of ['light', 'dark']) {
        const page = await browser.newPage({
          viewport: { width: 390, height: 900 },
        })
        try {
          await page.goto(
            `${origin}/?kind=mobile&role=${role}&scheme=${scheme}`
          )
          await page
            .getByRole('button', { name: 'Все разделы', exact: true })
            .click()
          const actual = await page
            .getByRole('menu', { name: 'Все разделы', exact: true })
            .evaluate((menu) =>
              Array.from(menu.children).map(
                (group) => group.querySelector('button > span')?.textContent
              )
            )
          const expected = order.filter(
            (name) => name !== 'Администрирование' || role !== 'user'
          )
          if (role === 'dev') expected.push('Разработчик')
          assert.deepEqual(actual, expected, `${role}/${scheme}`)
          await capture(page, `menu-order-${role}-${scheme}`)
          await page
            .getByRole('button', { name: 'Отзывы', exact: true })
            .click()
          assert.ok(
            await page
              .getByRole('menuitem', { name: 'Отзывы клиентов', exact: true })
              .isVisible()
          )
          await page.keyboard.press('Escape')
          await page
            .getByRole('menu', { name: 'Все разделы', exact: true })
            .waitFor({ state: 'detached' })
          assert.equal(
            await page
              .getByRole('menu', { name: 'Все разделы', exact: true })
              .count(),
            0
          )
        } finally {
          await page.close()
        }
      }
  }
)

test(
  'Администрирование содержит Пользователей в сайдбаре и мобильном Меню; доступы сохранены',
  { timeout: 180000 },
  async () => {
    for (const kind of ['sidebar', 'mobile'])
      for (const role of ['user', 'admin', 'dev'])
        for (const scheme of ['light', 'dark']) {
          const page = await browser.newPage({
            viewport: { width: kind === 'mobile' ? 390 : 1365, height: 900 },
          })
          const errors = []
          page.on('pageerror', (error) => errors.push(error.message))
          try {
            await page.goto(
              `${origin}/?kind=${kind}&role=${role}&scheme=${scheme}`
            )
            if (kind === 'mobile')
              await page
                .getByRole('button', { name: 'Все разделы', exact: true })
                .click()
            const group = page.getByRole('button', {
              name: 'Администрирование',
              exact: true,
            })
            const users = page.getByRole(
              kind === 'mobile' ? 'menuitem' : 'link',
              { name: 'Пользователи', exact: true }
            )
            assert.equal(
              await page
                .getByRole('button', { name: 'Пользователи', exact: true })
                .count(),
              0,
              'Нет отдельной группы Пользователи'
            )
            assert.equal(
              await page
                .getByRole('button', { name: 'Настройки сайта', exact: true })
                .count(),
              0
            )
            if (role === 'user') {
              assert.equal(await group.count(), 0)
              assert.equal(await users.count(), 0)
            } else {
              await group.waitFor()
              await group.click()
              await users.waitFor()
              assert.ok(await users.isVisible())
              assert.ok(
                await page
                  .getByRole(kind === 'mobile' ? 'menuitem' : 'link', {
                    name: 'Пробный тариф',
                    exact: true,
                  })
                  .isVisible()
              )
              const routes = await (
                kind === 'mobile'
                  ? page.getByRole('menu', { name: 'Все разделы', exact: true })
                  : page.locator('nav')
              ).evaluate((root) => {
                const label = Array.from(root.querySelectorAll('button')).find(
                  (node) => node.textContent.trim() === 'Администрирование'
                )
                return Array.from(
                  label.parentElement.querySelectorAll('[role="menuitem"],a')
                ).map((node) => node.textContent.trim())
              })
              assert.ok(
                routes.includes('Пользователи'),
                'Пользователи действительно вложены в Администрирование'
              )
              if (kind === 'sidebar')
                assert.equal(await users.getAttribute('href'), '/cabinet/users')
              await capture(page, `administration-${kind}-${role}-${scheme}`)
              await users.click()
              assert.ok(
                (await page.evaluate(() => window.qa.routes)).includes(
                  '/cabinet/users'
                )
              )
            }
            assert.deepEqual(errors, [])
          } finally {
            await page.close()
          }
        }
  }
)

test(
  'Публичная форма сохраняет выбор звёзд, ввод, отправку и благодарность',
  { timeout: 60000 },
  async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 900 },
    })
    try {
      await page.goto(`${origin}/?scheme=dark&cover=deep`)
      await page.getByRole('radio', { name: '5 из 5', exact: true }).check()
      await page
        .getByRole('textbox', { name: 'Комментарий', exact: true })
        .fill('Спасибо за выступление')
      await page
        .getByRole('button', { name: 'Отправить отзыв', exact: true })
        .click()
      await page
        .getByRole('heading', { name: 'Спасибо за отзыв!', exact: true })
        .waitFor()
      assert.deepEqual(await page.evaluate(() => window.qa.submits), [
        { rating: 5, comment: 'Спасибо за выступление' },
      ])
    } finally {
      await page.close()
    }
  }
)

test(
  'Сайдбар и мобильное Меню: Отзывы раскрываются, оба пункта ведут на прежние страницы',
  { timeout: 120000 },
  async () => {
    for (const kind of ['sidebar', 'mobile'])
      for (const scheme of ['light', 'dark']) {
        const page = await browser.newPage({
          viewport: { width: kind === 'mobile' ? 390 : 1365, height: 900 },
        })
        try {
          await page.goto(`${origin}/?kind=${kind}&scheme=${scheme}`)
          if (kind === 'mobile')
            await page
              .getByRole('button', { name: 'Все разделы', exact: true })
              .click()
          const group = page.getByRole('button', {
            name: 'Отзывы',
            exact: true,
          })
          await group.waitFor()
          await group.click()
          await page
            .getByRole(kind === 'mobile' ? 'menuitem' : 'link', {
              name: 'Настройка страницы отзывов',
              exact: true,
            })
            .waitFor()
          await capture(page, `${kind}-${scheme}`)
          for (const [label, route] of [
            ['Отзывы клиентов', '/cabinet/client-reviews'],
            ['Настройка страницы отзывов', '/cabinet/review-page'],
          ]) {
            const link = page.getByRole(
              kind === 'mobile' ? 'menuitem' : 'link',
              { name: label, exact: true }
            )
            await link.waitFor()
            assert.ok(await link.isVisible())
            if (kind === 'sidebar')
              assert.equal(await link.getAttribute('href'), route)
            await link.click()
            assert.ok(
              (await page.evaluate(() => window.qa.routes)).includes(route)
            )
            if (kind === 'mobile') {
              await page
                .getByRole('button', { name: 'Все разделы', exact: true })
                .click()
            } else {
              await group.click({ position: { x: 24, y: 24 } })
            }
          }
        } catch (error) {
          await capture(page, `failure-${kind}-${scheme}`)
          throw error
        } finally {
          await page.close()
        }
      }
  }
)
