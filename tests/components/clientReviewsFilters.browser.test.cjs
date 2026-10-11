const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { startHarness, enterRange } = require('./periodPickerHarness.cjs')
const artifactDir =
  process.env.CLIENT_REVIEWS_QA_DIR ||
  '/home/aleksei/.hermes/cache/scratch/vedelo-client-reviews-filters'
let browser, origin, harness

test.before(async () => {
  const mocks = {
    'next/link': `import React from 'react';export default function Link({children,href,...props}){return <a href={href} {...props}>{children}</a>}`,
    '@helpers/useClientReviews': `export function useClientReviews(filters){window.qaFilters=filters;return {data:{total:60,allowClientReviews:true,items:Array.from({length:3},(_,i)=>({_id:'review-'+filters.page+'-'+i,note:'',status:'submitted',rating:5,createdAt:'2026-10-08T12:00:00Z',comment:'Тестовый отзыв'}))},isPending:false,isError:false}};export const useReviewAction=()=>({mutateAsync:async()=>{},isPending:false});`,
    '@state/atoms': `import {atom} from 'jotai';export const modalsFuncAtom=atom({event:{view(){}},client:{view(){}}});`,
    '@helpers/useSnackbar': `export default ()=>({success(){},error(){}});`,
  }
  harness = await startHarness(
    `import React from 'react';import {createRoot} from 'react-dom/client';import Reviews from './layouts/content/ClientReviewsContent';document.body.classList.toggle('theme-dark',new URLSearchParams(location.search).get('scheme')==='dark');createRoot(document.getElementById('root')).render(<Reviews/>);`,
    mocks,
    'html,body{height:100%;overflow:hidden}#root{height:calc(100dvh - 136px);margin-top:64px}'
  )
  browser = harness.browser
  origin = harness.origin
  await fs.mkdir(artifactDir, { recursive: true })
})
test.after(async () => {
  await harness?.close()
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
  await fs.writeFile(path.join(artifactDir, name + '.html'), html)
  await page.screenshot({
    path: path.join(artifactDir, name + '.png'),
    fullPage: true,
  })
}
async function query(page) {
  return page.evaluate(() => {
    const { rating, unread, from, to, page } = window.qaFilters
    return { rating, unread, from, to, page }
  })
}

test(
  'Фильтры отзывов сворачиваются, поле периода остаётся доступным на телефоне и компьютере',
  { timeout: 1800000 },
  async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      locale: 'ru-RU',
    })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(origin)
    await page.addStyleTag({
      content: '*{transition:none!important;animation:none!important}',
    })
    for (const width of [280, 320, 390, 1365])
      for (const scheme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: 844 })
        await page.evaluate(
          (theme) =>
            document.body.classList.toggle('theme-dark', theme === 'dark'),
          scheme
        )
        if (
          await page
            .getByRole('button', { name: 'Сбросить фильтры', exact: true })
            .count()
        )
          await page
            .getByRole('button', { name: 'Сбросить фильтры', exact: true })
            .click()
        await page
          .getByRole('heading', { name: 'Отзывы клиентов', exact: true })
          .waitFor({ state: 'attached' })
        const toggle = page.getByRole('button', { name: /^Фильтры/ })
        await toggle.waitFor()
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
        assert.equal(await page.locator('select,input[type="date"]').count(), 0)
        await toggle.click()
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
        const period = page.getByRole('button', { name: /^Период запросов:/ })
        assert.equal(await period.count(), 1)
        await enterRange(page, '01.10.2026', '08.10.2026', 'Период запросов')
        await page
          .getByRole('button', { name: 'Применить', exact: true })
          .click()
        const geometry = await period.evaluate((node) => {
          const r = node.getBoundingClientRect()
          return { x: r.x, right: r.right, width: r.width, height: r.height }
        })
        assert.ok(
          geometry.width > 50 &&
            geometry.height >= 44 &&
            geometry.x >= 0 &&
            geometry.right <= width
        )
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth
          ),
          false
        )
        await capture(page, `expanded-${width}-${scheme}`)
        await toggle.click()
        assert.equal(await period.count(), 0)
        assert.deepEqual(await query(page), {
          rating: '',
          unread: '',
          from: '2026-10-01',
          to: '2026-10-08',
          page: 0,
        })
        await capture(page, `collapsed-${width}-${scheme}`)
        assert.deepEqual(errors, [])
      }
    await page.close()
  }
)

test(
  'Выбранные фильтры сохраняются при сворачивании; пагинация и сброс работают',
  { timeout: 180000 },
  async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      locale: 'ru-RU',
    })
    page.setDefaultTimeout(90000)
    page.setDefaultNavigationTimeout(90000)
    await page.goto(origin)
    const toggle = page.getByRole('button', { name: /^Фильтры/ })
    await toggle.focus()
    await page.keyboard.press('Enter')
    await page.getByLabel('Оценка', { exact: true }).selectOption('5')
    await page.getByLabel('Прочтение', { exact: true }).selectOption('true')
    await enterRange(page, '01.10.2026', '08.10.2026', 'Период запросов')
    await page.getByRole('button', { name: 'Применить', exact: true }).click()
    assert.match(await toggle.textContent(), /4/)
    await page.getByRole('button', { name: 'Далее', exact: true }).click()
    assert.deepEqual(await query(page), {
      rating: '5',
      unread: 'true',
      from: '2026-10-01',
      to: '2026-10-08',
      page: 1,
    })
    await toggle.focus()
    await page.keyboard.press('Space')
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    assert.deepEqual(await query(page), {
      rating: '5',
      unread: 'true',
      from: '2026-10-01',
      to: '2026-10-08',
      page: 1,
    })
    await toggle.click()
    assert.equal(
      await page.getByLabel('Оценка', { exact: true }).inputValue(),
      '5'
    )
    assert.equal(
      await page.getByLabel('Прочтение', { exact: true }).inputValue(),
      'true'
    )
    await enterRange(page, '02.10.2026', '09.10.2026', 'Период запросов')
    await page.getByRole('button', { name: 'Применить', exact: true }).click()
    assert.deepEqual(await query(page), {
      rating: '5',
      unread: 'true',
      from: '2026-10-02',
      to: '2026-10-09',
      page: 0,
    })
    await toggle.click()
    await page
      .getByRole('button', { name: 'Сбросить фильтры', exact: true })
      .click()
    assert.deepEqual(await query(page), {
      rating: '',
      unread: '',
      from: '',
      to: '',
      page: 0,
    })
    assert.equal(
      await page
        .getByRole('button', { name: 'Сбросить фильтры', exact: true })
        .count(),
      0
    )
    assert.equal(
      await page
        .getByRole('button', { name: 'Назад', exact: true })
        .isDisabled(),
      true
    )
    await page.close()
  }
)
