const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { startHarness, capture, artifactDir } = require('./periodPickerHarness.cjs')
let harness
const entry = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {Provider,createStore} from 'jotai';import modalsAtom from './state/atoms/modalsAtom';import ModalsPortal from './layouts/modals/ModalsPortal';import PeriodPicker from './components/PeriodPicker';import InputWrapper from './components/InputWrapper';
const store=createStore();window.qaStore=store;window.qaClearParent=()=>store.set(modalsAtom,[]);history.back=()=>{};
function Picker(){const [value,setValue]=useState({from:'2026-10-01',to:'2026-10-09'});window.qaExternal=setValue;return <PeriodPicker value={value} onChange={v=>{window.qaValue=v;setValue(v)}}/>}
window.qaOpenParent=()=>store.set(modalsAtom,[{id:'parent',props:{title:'Родительское окно',Children:Picker,onlyCloseButtonShow:true,onClose:()=>store.set(modalsAtom,[])}}]);
function App(){return <Provider store={store}><div style={{padding:12,maxWidth:700,margin:'auto'}}><Picker/><InputWrapper label="Эталон поля" noMargin data-reference><input aria-label="Эталон"/></InputWrapper></div><ModalsPortal/></Provider>};createRoot(document.getElementById('root')).render(<App/>);`
const mocks = {
  '@state/atoms': `import {atom} from 'jotai';export const modalsFuncAtom=atom({confirm(){}})`,
  'next/navigation': `export const useRouter=()=>({refresh(){}})`,
  '@state/atoms/windowDimensionsAtom': `import {atom} from 'jotai';export default atom({width:390,height:844})`,
  '@state/selectors/windowDimensionsTailwindSelector': `import {atom} from 'jotai';export default atom('mobile')`,
}
test.before(async () => { harness = await startHarness(entry, mocks) })
test.after(async () => { await harness?.close() })
async function pageFor() {
  const page = await harness.browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Krasnoyarsk' })
  page.setDefaultTimeout(30000)
  await page.clock.setFixedTime(new Date('2026-10-09T01:00:00Z'))
  await page.goto(harness.origin)
  await page.locator('[data-period-picker]').waitFor()
  return page
}
const trigger = page => page.getByRole('button', { name: /^Период:/ })
test('Одобренное поле совпадает с InputWrapper по рамке и фону в обеих темах', async () => {
  const page = await pageFor()
  const metrics = []
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => document.body.classList.toggle('theme-dark', t === 'dark'), theme)
    const geometry = await page.evaluate(() => {
      const props = el => { const s = getComputedStyle(el); return { border: s.borderTopWidth, color: s.borderTopColor, radius: s.borderRadius, background: s.backgroundColor } }
      return { field: props(document.querySelector('[aria-haspopup="dialog"]')), reference: props(document.querySelector('[data-reference] > div:last-child')) }
    })
    assert.deepEqual(geometry.field, geometry.reference)
    assert.equal(geometry.field.border, '2px')
    metrics.push({ theme, ...geometry })
  }
  await fs.writeFile(path.join(artifactDir, 'review-computed-styles.json'), JSON.stringify(metrics, null, 2))
  await page.close()
})
test('Произвольные даты полностью видны на 280/390px: месяц, разные месяцы и годы', { timeout: 300000 }, async () => {
  const page = await pageFor()
  for (const width of [280, 390]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 740 })
    await page.evaluate(t => document.body.classList.toggle('theme-dark', t === 'dark'), theme)
    for (const [from, to, caption, name] of [
      ['2026-10-01', '2026-10-09', '1–9 окт. 2026', 'month'],
      ['2026-09-29', '2026-10-02', '29 сент. – 2 окт. 2026', 'months'],
      ['2025-12-31', '2026-01-02', '31.12.2025 – 02.01.2026', 'years'],
    ]) {
      await page.evaluate(range => window.qaExternal(range), { from, to })
      await page.getByText(caption, { exact: true }).waitFor()
      const text = trigger(page).locator('span').first()
      assert.equal(await text.innerText(), caption)
      const dimensions = await text.evaluate(el => ({ w: el.clientWidth, sw: el.scrollWidth, h: el.clientHeight, sh: el.scrollHeight, ellipsis: getComputedStyle(el).textOverflow, whiteSpace: getComputedStyle(el).whiteSpace }))
      assert.ok(dimensions.sw <= dimensions.w + 1 && dimensions.sh <= dimensions.h + 1, JSON.stringify(dimensions))
      assert.notEqual(dimensions.ellipsis, 'ellipsis')
      assert.notEqual(dimensions.whiteSpace, 'nowrap')
      assert.match(await trigger(page).getAttribute('aria-label'), new RegExp(to.slice(0, 4)))
      assert.match(await trigger(page).getAttribute('title'), new RegExp(to.slice(0, 4)))
      await capture(page, `review-${name}-${width}-${theme}`)
    }
  }
  await page.close()
})
test('Обратный второй клик сортирует границы и применяет их одним действием', async () => {
  const page = await pageFor()
  await trigger(page).click()
  await page.getByRole('button', { name: 'Выбрать даты', exact: true }).click()
  await page.locator('[data-date="2026-10-09"]').click()
  await page.locator('[data-date="2026-10-01"]').click()
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  assert.deepEqual(await page.evaluate(() => window.qaValue), { from: '2026-10-01', to: '2026-10-09' })
  await page.close()
})
test('Ошибка ручного диапазона читается с контрастом AA в обеих темах', async () => {
  const page = await pageFor()
  await trigger(page).click()
  await page.getByRole('button', { name: 'Выбрать даты', exact: true }).click()
  await page.getByRole('button', { name: 'Ввести даты вручную' }).click()
  await page.getByLabel('Начало периода', { exact: true }).fill('10.10.2026')
  await page.getByLabel('Конец периода', { exact: true }).fill('01.10.2026')
  const alert = page.getByRole('alert')
  await alert.waitFor()
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => document.body.classList.toggle('theme-dark', t === 'dark'), theme)
    const colors = await alert.evaluate(el => {
      const rgba = s => s.match(/[\d.]+/g).map(Number)
      const style = getComputedStyle(el)
      const foreground = rgba(style.color).slice(0, 3)
      const chain = []
      for (let node = el; node; node = node.parentElement) chain.push(rgba(getComputedStyle(node).backgroundColor))
      let background = [255, 255, 255]
      for (const [r, g, b, alpha = 1] of chain.reverse()) background = [r, g, b].map((v, i) => v * alpha + background[i] * (1 - alpha))
      return { foreground, background }
    })
    const luminance = rgb => rgb.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const [lo, hi] = [luminance(colors.foreground), luminance(colors.background)].sort((a, b) => a - b)
    const ratio = (hi + 0.05) / (lo + 0.05)
    assert.ok(ratio >= 4.5, `${theme}: контраст ${ratio.toFixed(2)}:1; ${JSON.stringify(colors)}`)
    await capture(page, `review-error-${theme}`)
  }
  assert.equal(await page.getByRole('button', { name: 'Применить', exact: true }).isDisabled(), true)
  await page.close()
})
test('Настоящий стек: Escape оставляет блокировку родителя; удаление родителя не оставляет stale lock', async () => {
  const page = await pageFor()
  await page.evaluate(() => {
    document.documentElement.style.setProperty('overflow', 'auto', 'important')
    document.body.style.setProperty('overflow', 'clip', 'important')
    window.qaOpenParent()
  })
  const parent = page.getByRole('button', { name: /^Период:/ }).last()
  await parent.click()
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('dialog').count(), 0)
  assert.equal(await page.getByText('Родительское окно', { exact: true }).count(), 1)
  assert.deepEqual(await page.evaluate(() => [document.documentElement.style.overflow, document.body.style.overflow]), ['hidden', 'hidden'])
  await parent.click()
  await page.evaluate(() => window.qaClearParent())
  await page.getByText('Родительское окно', { exact: true }).waitFor({ state: 'detached' })
  assert.equal(await page.locator('dialog').count(), 0)
  assert.deepEqual(await page.evaluate(() => [document.documentElement, document.body].map(el => [el.style.getPropertyValue('overflow'), el.style.getPropertyPriority('overflow')])), [['auto', 'important'], ['clip', 'important']])
  await page.close()
})
