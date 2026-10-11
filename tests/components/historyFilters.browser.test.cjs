const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { startHarness, enterRange } = require('./periodPickerHarness.cjs')
const artifactDir =
  process.env.HISTORY_QA_DIR ||
  '/home/aleksei/.hermes/cache/scratch/vedelo-history-filters'
let browser, origin, harness

test.before(async () => {
  const mocks = {
    '@state/atoms': `import {atom} from 'jotai';export const modalsFuncAtom=atom({event:{view(){}},client:{view(){}},transaction:{edit(){}}});`,
    '@helpers/useEntityQueries': `export const useUsersQuery=()=>({data:[{_id:'user-1',firstName:'Алексей',secondName:'Белинский'}]});`,
    '@helpers/useWorkItemTerminology': `export default ()=>({mode:'events',label:'мероприятие',labelCapitalized:'Мероприятие'});`,
    '@helpers/useHistoriesQuery': `export function useHistoriesQuery(filters){window.qaFilters=filters;return {data:{pages:[{data:Array.from({length:24},(_,i)=>({id:'item-'+i,entityType:'event',entityId:'event-'+i,entityLabel:'Заявка: Корпоратив '+i,summary:'Создано мероприятие',operation:'create',source:'web',actorLabel:'Алексей Белинский',occurredAt:'2026-10-08T12:11:00Z',entityExists:true,changes:[]}))}]},isPending:false,isError:false,hasNextPage:false}}`,
  }
  harness = await startHarness(
    `import React from 'react';import {createRoot} from 'react-dom/client';import History from './layouts/content/HistoryContent';document.body.classList.toggle('theme-dark',new URLSearchParams(location.search).get('scheme')==='dark');createRoot(document.getElementById('root')).render(<History/>);`,
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
async function metrics(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root').firstElementChild
    const list = root.lastElementChild,
      toolbar = root.firstElementChild
    return {
      toolbar: toolbar.getBoundingClientRect().height,
      list: list.getBoundingClientRect().height,
      container: root.getBoundingClientRect().height,
      overflow: document.documentElement.scrollWidth > innerWidth,
      scrolls: list.scrollHeight > list.clientHeight,
    }
  })
}

test(
  'Фильтры свёрнуты; список получает основную высоту, раскрытие не перекрывает его',
  { timeout: 1800000 },
  async () => {
    const results = []
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
    for (const [width, height] of [
      [280, 740],
      [390, 844],
      [390, 640],
      [1365, 900],
    ])
      for (const scheme of ['light', 'dark']) {
        await page.setViewportSize({ width, height })
        await page.evaluate(
          (theme) =>
            document.body.classList.toggle('theme-dark', theme === 'dark'),
          scheme
        )
        await page.getByPlaceholder('Карточка или пользователь').waitFor()
        if (process.env.HISTORY_BASELINE) {
          results.push({ width, height, scheme, ...(await metrics(page)) })
          await capture(page, `before-${width}-${height}-${scheme}`)
          continue
        }
        assert.equal(
          await page.getByLabel('Карточки', { exact: true }).count(),
          0,
          'Поля скрыты по умолчанию'
        )
        const toggle = page.getByRole('button', { name: /Фильтры/ })
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
        const closed = await metrics(page)
        assert.ok(
          closed.list > closed.container * 0.6,
          'Основная высота отдана списку'
        )
        assert.equal(closed.overflow, false)
        assert.equal(closed.scrolls, true)
        await capture(page, `closed-${width}-${height}-${scheme}`)
        await toggle.click()
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
        await page.getByLabel('Карточки', { exact: true }).waitFor()
        const opened = await metrics(page)
        assert.ok(
          closed.list - opened.list >= (width < 768 ? 100 : 48),
          'При сворачивании список получает дополнительную высоту'
        )
        assert.ok(
          opened.list >= 140,
          'Даже раскрытые фильтры оставляют список видимым'
        )
        assert.equal(opened.overflow, false)
        const fields = await page.locator('select,input').evaluateAll((nodes) =>
          nodes.map((n) => ({
            width: n.getBoundingClientRect().width,
            height: n.getBoundingClientRect().height,
            overflow: n.getBoundingClientRect().right > innerWidth,
          }))
        )
        assert.ok(
          fields.every((f) => f.height >= 40 && !f.overflow),
          'Поля удобны для касания и помещаются в экран'
        )
        await capture(page, `open-${width}-${height}-${scheme}`)
        await toggle.click()
        assert.equal(
          await page.getByLabel('Карточки', { exact: true }).count(),
          0
        )
        assert.equal((await metrics(page)).list, closed.list)
        await page
          .locator('#root > div > div')
          .last()
          .evaluate((n) => (n.scrollTop = 180))
        assert.ok(
          (await page
            .locator('#root > div > div')
            .last()
            .evaluate((n) => n.scrollTop)) > 0
        )
        assert.deepEqual(errors, [])
        results.push({ width, height, scheme, closed, opened })
      }
    await page.close()
    await fs.writeFile(
      path.join(
        artifactDir,
        process.env.HISTORY_BASELINE ? 'baseline.json' : 'metrics.json'
      ),
      JSON.stringify(results, null, 2)
    )
  }
)

test(
  'Выбранные условия продолжают фильтровать после сворачивания; сброс и клавиатура работают',
  { timeout: 180000 },
  async () => {
    if (process.env.HISTORY_BASELINE) return
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    })
    page.setDefaultTimeout(90000)
    page.setDefaultNavigationTimeout(90000)
    await page.goto(origin)
    const toggle = page.getByRole('button', { name: /Фильтры/ })
    await toggle.focus()
    await page.keyboard.press('Enter')
    await page.getByLabel('Карточки', { exact: true }).waitFor()
    await page.getByLabel('Карточки', { exact: true }).selectOption('event')
    await page.getByLabel('Действия', { exact: true }).selectOption('create')
    await page.getByLabel('Источник', { exact: true }).selectOption('web')
    await page.getByLabel('Автор', { exact: true }).selectOption('user-1')
    await enterRange(page, '01.10.2026', '08.10.2026')
    await page.getByRole('button', { name: 'Применить', exact: true }).click()
    await page.getByPlaceholder('Карточка или пользователь').fill('Корпоратив')
    await page.waitForFunction(() => window.qaFilters.search === 'Корпоратив')
    assert.match(await toggle.textContent(), /6/)
    const filtered = await page.evaluate(() => window.qaFilters)
    assert.deepEqual(filtered, {
      entityType: 'event',
      operation: 'create',
      source: 'web',
      actorId: 'user-1',
      search: 'Корпоратив',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-08T23:59:59.999',
      limit: 30,
    })
    await toggle.focus()
    await page.keyboard.press('Space')
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    assert.deepEqual(await page.evaluate(() => window.qaFilters), filtered)
    await capture(page, 'selected-390-light')
    await page.setViewportSize({ width: 390, height: 640 })
    await toggle.click()
    assert.ok(
      (await metrics(page)).list >= 140,
      'Выбранные фильтры не вытесняют список на коротком экране'
    )
    await capture(page, 'selected-open-short-light')
    await toggle.click()
    await toggle.click()
    assert.equal(
      await page.getByLabel('Источник', { exact: true }).inputValue(),
      'web'
    )
    await toggle.click()
    await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
    await page.waitForFunction(() => window.qaFilters.search === '')
    assert.deepEqual(await page.evaluate(() => window.qaFilters), {
      entityType: '',
      operation: '',
      source: '',
      actorId: '',
      search: '',
      dateFrom: '',
      dateTo: '',
      limit: 30,
    })
    assert.equal(await toggle.textContent().then((t) => t.includes('6')), false)
    await page.close()
  }
)
