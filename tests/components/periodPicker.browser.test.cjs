const test = require('node:test')
const assert = require('node:assert/strict')
const {
  startHarness,
  capture,
  enterRange,
} = require('./periodPickerHarness.cjs')
let harness
const entry = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import PeriodPicker from './components/PeriodPicker';import TransactionPicker from './components/TransactionDateRangeFilter';import AppButton from './components/AppButton';
const params=new URLSearchParams(location.search);document.body.classList.toggle('theme-dark',params.get('scheme')==='dark');
function App(){const [value,setValue]=useState({from:'2026-10-01',to:'2026-10-09'});const [disabled,setDisabled]=useState(false);const required=params.has('required');const Picker=params.has('transaction')?TransactionPicker:PeriodPicker;window.qaValue=value;window.qaExternal=setValue;return <div style={{padding:12,maxWidth:700,margin:'auto',overflow:'hidden'}}><Picker value={value} onChange={v=>{window.qaChanges=(window.qaChanges||[]).concat(v);setValue(v)}} disabled={disabled} requiredRange={required} resetValue={required?{from:'2026-09-10',to:'2026-10-09'}:undefined} maxDate={required?'2026-10-09':undefined} maxDays={params.has('limited')?1:required?366:undefined} minDate={params.has('limited')?'2026-10-09':undefined} timeZone={required?'UTC':'local'} activeDateKeys={new Set(['2026-10-09','2026-10-10'])}/><AppButton variant="secondary" onClick={()=>setDisabled(!disabled)}>Блокировка</AppButton><AppButton variant="secondary">Внешняя кнопка</AppButton></div>};createRoot(document.getElementById('root')).render(<App/>);`
test.before(async () => {
  harness = await startHarness(entry)
})
test.after(async () => {
  await harness?.close()
})
async function pageFor(query = '', width = 390, height = 844) {
  const page = await harness.browser.newPage({
    viewport: { width, height },
    timezoneId: 'Asia/Krasnoyarsk',
  })
  page.setDefaultTimeout(90000)
  page.setDefaultNavigationTimeout(90000)
  await page.clock.setFixedTime(new Date('2026-10-09T01:00:00Z'))
  await page.goto(harness.origin + '/?' + query)
  await page.locator('[data-period-picker]').waitFor()
  await page.addStyleTag({
    content: '*{transition:none!important;animation:none!important}',
  })
  return page
}
const trigger = (page) => page.getByRole('button', { name: /^Период:/ })
const applied = (page) => page.evaluate(() => window.qaValue)

test(
  'Обе темы, 280/390/1365 и короткий экран: три отдельных экрана, геометрия сброса, CSS, фокус',
  { timeout: 600000 },
  async () => {
    const page = await pageFor()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
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
        const reset = page.getByRole('button', { name: 'Сбросить период' })
        const geo = await reset.evaluate((el) => {
          const r = el.getBoundingClientRect()
          return {
            w: r.width,
            h: r.height,
            radius: getComputedStyle(el).borderRadius,
          }
        })
        assert.equal(geo.h, 44)
        assert.ok(width > 600 ? geo.w > 70 : geo.w === 44)
        assert.ok(parseFloat(geo.radius) >= 22)
        await capture(page, `field-${width}-${height}-${scheme}`)
        await trigger(page).click()
        assert.equal(
          await page.locator('dialog input,dialog [data-date]').count(),
          0
        )
        assert.equal(
          await page
            .getByRole('button', { name: 'Применить', exact: true })
            .count(),
          0
        )
        assert.ok(
          await page
            .locator('dialog')
            .evaluate((el) => el.contains(document.activeElement))
        )
        await page.locator('dialog button').last().focus()
        await page.keyboard.press('Tab')
        assert.equal(
          await page
            .locator('dialog button')
            .first()
            .evaluate((el) => el === document.activeElement),
          true
        )
        await page.keyboard.press('Shift+Tab')
        assert.ok(
          await page
            .locator('dialog')
            .evaluate((el) => el.contains(document.activeElement))
        )
        await capture(page, `presets-${width}-${height}-${scheme}`)
        await page
          .getByRole('button', { name: 'Выбрать даты', exact: true })
          .click()
        assert.equal(await page.locator('dialog input').count(), 0)
        assert.equal(
          await page.getByRole('button', { name: /^Сегодня:/ }).count(),
          0
        )
        assert.equal(
          await page
            .locator('[data-date="2026-10-09"][data-active="true"]')
            .count(),
          1
        )
        await page.locator('[data-date="2026-10-09"]').click()
        await page.locator('[data-date="2026-10-10"]').click()
        assert.equal(
          await page
            .locator('[data-date="2026-10-09"]')
            .getAttribute('aria-pressed'),
          'true'
        )
        await capture(page, `calendar-${width}-${height}-${scheme}`)
        const dialogGeometry = await page.locator('dialog').evaluate((el) => {
          const r = el.getBoundingClientRect()
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            overflow: el.scrollWidth > el.clientWidth,
          }
        })
        assert.ok(
          dialogGeometry.left >= 0 &&
            dialogGeometry.right <= width &&
            dialogGeometry.top >= 0 &&
            dialogGeometry.bottom <= height &&
            !dialogGeometry.overflow
        )
        await page.getByRole('button', { name: 'Ввести даты вручную' }).click()
        assert.equal(await page.locator('dialog [data-date]').count(), 0)
        assert.equal(await page.locator('dialog input').count(), 2)
        assert.equal(
          await page
            .getByLabel('Начало периода', { exact: true })
            .evaluate((el) => el === document.activeElement),
          true
        )
        await capture(page, `manual-${width}-${height}-${scheme}`)
        await page.keyboard.press('Escape')
        assert.equal(await page.locator('dialog').count(), 0)
        assert.equal(
          await trigger(page).evaluate((el) => el === document.activeElement),
          true
        )
        assert.deepEqual(await applied(page), {
          from: '2026-10-01',
          to: '2026-10-09',
        })
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth
          ),
          false
        )
        assert.deepEqual(errors, [])
      }
    await page.close()
  }
)
test('Draft/Cancel/outside/Escape и актуальное внешнее controlled значение', async () => {
  const page = await pageFor()
  await enterRange(page, '02.10.2026', '03.10.2026')
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  assert.deepEqual(await applied(page), {
    from: '2026-10-01',
    to: '2026-10-09',
  })
  await page.evaluate(() =>
    window.qaExternal({ from: '2024-02-29', to: '2024-02-29' })
  )
  await enterRange(page, '01.03.2024', '02.03.2024')
  await page.keyboard.press('Escape')
  await trigger(page).click()
  await page.getByRole('button', { name: 'Выбрать даты', exact: true }).click()
  assert.equal(
    await page.locator('[data-date="2024-02-29"]').getAttribute('aria-pressed'),
    'true'
  )
  await page.mouse.click(1, 1)
  assert.equal(await page.locator('dialog').count(), 0)
  await trigger(page).click()
  await page.evaluate(() =>
    window.qaExternal({ from: '2026-09-01', to: '2026-09-02' })
  )
  await page.keyboard.press('Escape')
  assert.match(await trigger(page).getAttribute('title'), /1 сентября 2026/)
  await enterRange(page, '', '')
  assert.equal(
    await page.getByLabel('Начало периода', { exact: true }).inputValue(),
    ''
  )
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  assert.deepEqual(await applied(page), { from: '', to: '' })
  await page.close()
})
test('Manual: invalid, reversed, високосный день, open boundaries, Apply и reset', async () => {
  const page = await pageFor()
  await enterRange(page, '29.02.2026', '01.03.2026')
  const apply = page.getByRole('button', { name: 'Применить', exact: true })
  assert.equal(await apply.isDisabled(), true)
  for (const from of ['31.04.2026', '01.13.2026', '01.10.20']) {
    await page.getByLabel('Начало периода', { exact: true }).fill(from)
    assert.equal(await apply.isDisabled(), true)
  }
  await page.getByLabel('Начало периода', { exact: true }).fill('02.03.2026')
  assert.equal(await apply.isDisabled(), true)
  await page.getByLabel('Начало периода', { exact: true }).fill('29.02.2024')
  await page.getByLabel('Конец периода', { exact: true }).fill('29.02.2024')
  await apply.click()
  assert.deepEqual(await applied(page), {
    from: '2024-02-29',
    to: '2024-02-29',
  })
  await enterRange(page, '', '09.10.2026')
  await apply.click()
  assert.deepEqual(await applied(page), { from: '', to: '2026-10-09' })
  await enterRange(page, '09.10.2026', '')
  await apply.click()
  assert.deepEqual(await applied(page), { from: '2026-10-09', to: '' })
  await page.getByRole('button', { name: 'Сбросить период' }).click()
  assert.deepEqual(await applied(page), { from: '', to: '' })
  await page.close()
})
test('Required/maxDate/maxDays, 366/367, 1 день, UTC и resetValue', async () => {
  const page = await pageFor('required')
  await enterRange(page, '', '09.10.2026')
  const apply = page.getByRole('button', { name: 'Применить', exact: true })
  assert.equal(await apply.isDisabled(), true)
  await page.getByLabel('Начало периода', { exact: true }).fill('09.10.2026')
  await page.getByLabel('Конец периода', { exact: true }).fill('10.10.2026')
  assert.equal(await apply.isDisabled(), true)
  await page.getByLabel('Начало периода', { exact: true }).fill('08.10.2025')
  await page.getByLabel('Конец периода', { exact: true }).fill('09.10.2026')
  assert.equal(await apply.isDisabled(), true)
  await capture(page, 'invalid-390-light')
  await page.getByLabel('Начало периода', { exact: true }).fill('09.10.2025')
  assert.equal(await apply.isDisabled(), false)
  await apply.click()
  await page.getByRole('button', { name: 'Сбросить период' }).click()
  assert.deepEqual(await applied(page), {
    from: '2026-09-10',
    to: '2026-10-09',
  })
  await trigger(page).click()
  assert.equal(
    await page.getByRole('button', { name: /^За всё время:/ }).count(),
    0
  )
  await page.getByRole('button', { name: /^Текущий месяц:/ }).click()
  assert.deepEqual(await applied(page), {
    from: '2026-10-01',
    to: '2026-10-09',
  })
  await enterRange(page, '09.10.2026', '09.10.2026')
  await apply.click()
  assert.deepEqual(await applied(page), {
    from: '2026-10-09',
    to: '2026-10-09',
  })
  await page.close()
})
test('Disabled блокирует триггер/сброс; готовые периоды сразу, marks и будущие транзакции', async () => {
  const page = await pageFor('transaction')
  await page.getByRole('button', { name: 'Блокировка' }).click()
  assert.equal(await trigger(page).isDisabled(), true)
  assert.equal(
    await page.getByRole('button', { name: 'Сбросить период' }).isDisabled(),
    true
  )
  await capture(page, 'disabled-390-light')
  await page.evaluate(() => document.body.classList.add('theme-dark'))
  assert.equal(await trigger(page).isDisabled(), true)
  assert.equal(
    await page.getByRole('button', { name: 'Сбросить период' }).isDisabled(),
    true
  )
  await capture(page, 'disabled-390-dark')
  await page.getByRole('button', { name: 'Блокировка' }).click()
  await trigger(page).click()
  await page.getByRole('button', { name: /^Завтра:/ }).click()
  const tomorrow = await page.evaluate(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-')
  })
  assert.deepEqual(await applied(page), { from: tomorrow, to: tomorrow })
  assert.equal(await page.locator('dialog').count(), 0)
  await trigger(page).click()
  await page.getByRole('button', { name: /^На выходных:/ }).click()
  assert.ok((await applied(page)).to)
  assert.equal(await page.evaluate(() => window.qaChanges.length), 2)
  await page.close()
})

test('Недопустимые пресеты и дни заблокированы до применения minDate/maxDate/maxDays', async () => {
  const page = await pageFor('required&limited')
  await trigger(page).click()
  for (const label of ['Последние 7 дней', 'Текущий месяц', 'Прошлый месяц']) {
    assert.equal(
      await page
        .getByRole('button', { name: new RegExp('^' + label + ':') })
        .isDisabled(),
      true
    )
  }
  assert.equal(
    await page.getByRole('button', { name: /^Сегодня:/ }).isDisabled(),
    false
  )
  await page.getByRole('button', { name: 'Выбрать даты', exact: true }).click()
  assert.equal(
    await page.locator('[data-date="2026-10-08"]').isDisabled(),
    true
  )
  assert.equal(
    await page.locator('[data-date="2026-10-10"]').isDisabled(),
    true
  )
  await page.locator('[data-date="2026-10-09"]').click()
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  assert.deepEqual(await applied(page), {
    from: '2026-10-09',
    to: '2026-10-09',
  })
  assert.equal(await page.evaluate(() => window.qaChanges.length), 1)
  await page.close()
})
