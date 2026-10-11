const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const {
  startHarness,
  capture,
  artifactDir,
} = require('./periodPickerHarness.cjs')
let harness
const clients = [
  {
    _id: 'qa-main',
    firstName: 'Основной',
    secondName: 'Клиент',
    phone: '79990000001',
    telegram: 'qa_main',
  },
  {
    _id: 'qa-extra',
    firstName: 'Тестовый',
    secondName: 'Контакт',
    phone: '79990000002',
    telegram: 'qa_extra',
  },
]
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import EventCard from './layouts/cards/EventCard';import DropDown from './components/DropDown';
window.qaOpens=0;window.qaLinks=[];window.open=url=>{window.qaLinks.push(url);return null};
const event={_id:'qa-event',status:'active',title:'Проверочный заказ',clientId:'qa-main',eventDate:'2099-10-17T15:00:00+07:00',calendarImportChecked:true,contractSum:35000,otherContacts:[{clientId:'qa-extra',comment:'Ведущий'}]};
createRoot(document.getElementById('root')).render(<div className="cabinet-canvas" style={{padding:8,maxWidth:700,margin:'auto'}}><EventCard eventId={event._id} event={event} transactions={[]}/><DropDown openOnHover={false} turnOffAutoClose="inside" trigger={<button type="button">Другое меню</button>} renderInPortal placement="right"><span>Обычное меню</span></DropDown><button type="button" style={{position:'fixed',bottom:16,left:16}}>За пределами</button></div>);`
const empty = 'export default ()=>null'
const mocks = {
  jotai: 'export const useAtomValue=value=>value',
  '@state/atoms':
    'export const modalsFuncAtom={event:{view(){window.qaOpens++},edit(){},delete(){}},custom(){}}',
  '@state/atoms/itemsFuncAtom':
    'export default {client:{set(){throw new Error("Запись не разрешена")}}}',
  '@state/atoms/siteSettingsAtom': 'export default {defaultTown:"Красноярск"}',
  '@state/atoms/servicesAtom': 'export default []',
  '@state/atoms/loadingAtom': 'export default ()=>false',
  '@state/atoms/errorAtom': 'export default ()=>false',
  '@state/atoms/loggedUserAtom': 'export default null',
  '@state/atoms/tariffsAtom': 'export default []',
  '@helpers/useClientsQuery': `export const useClientsQuery=()=>({data:${JSON.stringify(clients)}})`,
  '@helpers/useEventsQuery': 'export const useEventQuery=()=>({})',
  '@helpers/useTransactionsQuery':
    'export const useTransactionsQuery=()=>({data:[]})',
  '@helpers/useSnackbar': 'export default ()=>({success(){},warning(){}})',
  '@components/ClientChatButton': empty,
  '@components/CardButtons': empty,
  '@components/CardActions': empty,
  '@components/CardOverlay': empty,
  '@components/EventProposalStatus': empty,
  '@components/EventClientReviewStatus': empty,
  'next/image': empty,
}
test.before(async () => {
  harness = await startHarness(entry, mocks)
})
test.after(async () => {
  await harness?.close()
})
async function openPage(width, system, dark) {
  const page = await harness.browser.newPage({
    viewport: { width, height: 900 },
    colorScheme: system,
    locale: 'ru-RU',
    timezoneId: 'Asia/Krasnoyarsk',
  })
  page.setDefaultTimeout(15000)
  await page.goto(harness.origin)
  await page.evaluate(
    (dark) => document.body.classList.toggle('theme-dark', dark),
    dark
  )
  await page
    .getByRole('button', {
      name: 'Показать дополнительные контакты: 1',
      exact: true,
    })
    .click()
  await page.getByRole('menu').waitFor({ state: 'visible' })
  return page
}
async function metrics(page) {
  return page.getByRole('menu').evaluate((el) => {
    const color = (css) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
    }
    const title = Array.from(el.querySelectorAll('div')).find(
      (e) => e.textContent === 'Дополнительные контакты'
    )
    const style = getComputedStyle(el)
    return {
      background: style.backgroundColor,
      rgb: color(style.backgroundColor),
      border: style.borderTopColor,
      title: color(getComputedStyle(title).color),
      rect: el.getBoundingClientRect().toJSON(),
      portal: el.parentElement === document.body,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }
  })
}
function contrast(a, b) {
  const lum = (rgb) =>
    rgb
      .map((v) => {
        v /= 255
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
  const [lo, hi] = [lum(a), lum(b)].sort((a, b) => a - b)
  return (hi + 0.05) / (lo + 0.05)
}
test(
  'Светлая тема: настоящие дополнительные контакты имеют светлый фон независимо от системной темы',
  { timeout: 180000 },
  async () => {
    const results = []
    for (const width of [390, 1365])
      for (const system of ['dark', 'light']) {
        const page = await openPage(width, system, false)
        try {
          const result = await metrics(page)
          results.push({ width, system, ...result })
          await fs.writeFile(
            path.join(artifactDir, 'contacts-light-metrics.json'),
            JSON.stringify(results, null, 2)
          )
          assert.deepEqual(result.rgb, [255, 255, 255], JSON.stringify(result))
          assert.ok(contrast(result.title, result.rgb) >= 4.5)
          assert.equal(result.portal, true)
          assert.equal(result.overflow, false)
          assert.ok(result.rect.left >= 0 && result.rect.right <= width)
          assert.equal(
            await page
              .getByRole('menu')
              .getByText('Тестовый Контакт', { exact: true })
              .count(),
            1
          )
          assert.equal(
            await page
              .getByRole('menu')
              .getByText('Ведущий', { exact: true })
              .count(),
            1
          )
          await capture(page, `contacts-${width}-light-system-${system}`)
          await page
            .getByRole('menu')
            .getByRole('button', { name: '@qa_extra', exact: true })
            .click()
          assert.deepEqual(await page.evaluate(() => window.qaLinks), [
            'tg://resolve?domain=qa_extra',
          ])
          assert.equal(await page.evaluate(() => window.qaOpens), 0)
          await page.getByRole('menu').waitFor({ state: 'visible' })
          await page.keyboard.press('Escape')
          assert.equal(await page.getByRole('menu').count(), 0)
          await page
            .getByRole('button', {
              name: 'Показать дополнительные контакты: 1',
              exact: true,
            })
            .click()
          await page
            .getByRole('button', { name: 'За пределами', exact: true })
            .click()
          assert.equal(await page.getByRole('menu').count(), 0)
        } finally {
          await page.close()
        }
      }
  }
)
test(
  'Тёмная тема: оформление остаётся равным прежнему DropDown при обеих системных темах',
  { timeout: 180000 },
  async () => {
    const results = []
    for (const width of [390, 1365])
      for (const system of ['dark', 'light']) {
        const page = await openPage(width, system, true)
        try {
          const result = await metrics(page)
          await capture(page, `contacts-${width}-dark-system-${system}`)
          await page.keyboard.press('Escape')
          await page
            .getByRole('button', { name: 'Другое меню', exact: true })
            .click()
          const original = await page.getByRole('menu').evaluate((el) => {
            const s = getComputedStyle(el)
            return { background: s.backgroundColor, border: s.borderTopColor }
          })
          assert.equal(result.background, original.background)
          assert.equal(result.border, original.border)
          assert.equal(result.portal, true)
          assert.equal(result.overflow, false)
          results.push({ width, system, result, original })
        } finally {
          await page.close()
        }
      }
    await fs.writeFile(
      path.join(artifactDir, 'contacts-dark-metrics.json'),
      JSON.stringify(results, null, 2)
    )
  }
)
