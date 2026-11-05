const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { startHarness } = require('./periodPickerHarness.cjs')

const artifactDir =
  process.env.UI_IMPROVEMENTS_QA_DIR ||
  path.join(os.tmpdir(), 'vedelo-ui-20261105')
let harness

test.before(async () => {
  const users = [
    {
      _id: 'old',
      firstName: 'Алексей',
      createdAt: '2026-10-01',
      registrationSource: 'web',
      tariffId: 't1',
    },
    {
      _id: 'new',
      firstName: 'Яна',
      createdAt: '2026-11-04',
      registrationSource: 'tilda',
    },
    {
      _id: 'middle',
      firstName: 'Борис',
      createdAt: '2026-10-20',
      registrationSource: 'web',
      tariffId: 't1',
    },
  ]
  const reviews = [
    {
      _id: 'received',
      status: 'received',
      rating: 3,
      submittedAt: '2026-10-08',
      expiresAt: '2026-10-01',
      comment: 'Спасибо за работу',
      clientName: 'Тестовый клиент',
      note: '',
    },
    {
      _id: 'expired',
      status: 'expired',
      note: '',
      clientName: 'Клиент без ответа',
    },
    {
      _id: 'noted',
      status: 'received',
      rating: 5,
      submittedAt: '2026-10-08',
      note: 'Связаться позже',
      clientName: 'Клиент с заметкой',
    },
  ].map((row) => ({
    createdAt: '2026-09-01',
    eventId: 'event',
    clientId: 'client',
    ...row,
  }))
  const mocks = {
    'next/link': `export default function Link({children,href,...props}){return <a href={href} {...props}>{children}</a>}`,
    '@state/atoms': `import {atom} from 'jotai';export const modalsFuncAtom=atom({event:{view(){},additionalEvents(){}},client:{view(){}},user:{add(){}}});`,
    '@helpers/useSnackbar': `export default ()=>({success(){},error(message){window.qaError=message}});`,
    '@helpers/useEntityQueries': `const users=${JSON.stringify(users)};const tariffs=[{_id:'t1',title:'Базовый'}];export const useUsersQuery=()=>({data:users});export const useTariffsQuery=()=>({data:tariffs});`,
    '@layouts/lists/UsersList': `export default function UsersList({users}){return <ol aria-label="Список пользователей">{users.map(u=><li key={u._id}>{u.firstName}</li>)}</ol>}`,
    '@helpers/useClientReviews': `import {useState} from 'react';export function useClientReviews(filters){const [rows,setRows]=useState(${JSON.stringify(reviews)});window.qaFilters=filters;window.qaUpdate=body=>setRows(old=>old.map(r=>r._id===body.id?{...r,...(body.action==='note'?{note:body.note}:{readAt:'2026-11-05'})}:r));const items=rows.filter(r=>!filters.status||r.status===filters.status);return {data:{total:items.length,allowClientReviews:true,items},isPending:false,isError:false}};export const useReviewAction=()=>({mutateAsync:async body=>{window.qaSaved=body;window.qaUpdate(body)},isPending:false});`,
    'next/navigation': `const router={refresh(){}};export const useRouter=()=>router;`,
    '@components/Tooltip': `export default ({children})=>children;`,
  }
  harness = await startHarness(
    `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {Provider,createStore} from 'jotai';import {modalsFuncAtom} from '@state/atoms';
    import modalsAtom from './state/atoms/modalsAtom';import ModalsPortal from './layouts/modals/ModalsPortal';
    import Users from './layouts/content/UsersContent';import Reviews from './layouts/content/ClientReviewsContent';
    import Address from './components/AddressSuggestField';import AddressPicker from './components/AddressPicker';
    import TaskActions from './components/TaskPostponeActions';import openDateModal from './layouts/modals/modalsFunc/attentionTaskDateFunc';
    import {moveDateToDayOffset} from './helpers/upcomingEventsOverview';
    const store=createStore();const modals={add(props){store.set(modalsAtom,old=>[...old,{id:Date.now(),props}])}};store.set(modalsFuncAtom,modals);
    function AttentionFlow(){const [date,setDate]=useState(new Date(2026,10,5,18,45).toISOString());window.qaDate=date;return <section className="p-3"><h1>Важное</h1><TaskActions onPostpone={offset=>setDate(moveDateToDayOffset(date,offset,new Date(2026,10,5)).toISOString())} onSelectDate={()=>openDateModal({modalsFunc:modals,date,onConfirm:async next=>{window.qaAttempts=(window.qaAttempts||0)+1;if(window.qaFail)throw new Error('test');if(window.qaSlow)await new Promise(resolve=>{window.qaResolve=resolve});setDate(next.toISOString())}})}/></section>}
    function AddressFlow(){const [address,setAddress]=useState({town:'Красноярск'});const [manual,setManual]=useState(false);return <section aria-label="Адрес работы">{manual?<AddressPicker address={address} onChange={setAddress}/>:<Address address={address} onChange={setAddress} poolAddresses={[{town:'Красноярск',street:'Мира',house:'1'}]} onManualInput={()=>setManual(true)}/>}</section>}
    const kind=new URLSearchParams(location.search).get('kind');createRoot(document.getElementById('root')).render(<Provider store={store}>{kind==='attention'?<><AttentionFlow/><ModalsPortal/></>:kind==='users'?<Users/>:kind==='address'?<div className="p-3"><AddressFlow/></div>:<Reviews/>}</Provider>);
  `,
    mocks
  )
  await fs.mkdir(artifactDir, { recursive: true })
})

test.after(async () => {
  await harness?.close()
})

async function withViews(kind, check) {
  for (const width of [390, 1365])
    for (const dark of [false, true]) {
      const page = await harness.browser.newPage({
        viewport: { width, height: 900 },
        timezoneId: 'Asia/Krasnoyarsk',
      })
      page.setDefaultTimeout(10000)
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      try {
        await page.goto(`${harness.origin}/?kind=${kind}`)
        if (dark)
          await page.evaluate(() => document.body.classList.add('theme-dark'))
        await check(page, `${kind}-${width}-${dark ? 'dark' : 'light'}`)
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth
          ),
          false
        )
        assert.deepEqual(errors, [])
      } finally {
        await page.close()
      }
    }
}

test(
  'Адрес: ручной ввод без предварительного фокуса, клавиатура и прежний список',
  { timeout: 120000 },
  async () => {
    await withViews('address', async (page, name) => {
      const manual = page.getByRole('button', {
        name: 'Ввести вручную',
        exact: true,
      })
      await manual.waitFor()
      assert.equal(await manual.count(), 1)
      assert.equal(
        await page
          .getByRole('textbox')
          .evaluate((input) => input === document.activeElement),
        false
      )
      await page.screenshot({ path: path.join(artifactDir, `${name}.png`) })
      await manual.click()
      await page.getByPlaceholder('Улица', { exact: true }).fill('Ленина')
      await page.getByPlaceholder('Дом', { exact: true }).fill('12')
      assert.equal(
        await page.getByPlaceholder('Дом', { exact: true }).inputValue(),
        '12'
      )
      await page.reload()
      await manual.focus()
      await page.keyboard.press('Enter')
      await page.getByPlaceholder('Улица', { exact: true }).waitFor()
      await page.reload()
      await page.getByRole('textbox').click()
      await page
        .getByRole('button', { name: 'Красноярск, Мира, д. 1', exact: true })
        .click()
      await page.getByRole('button', { name: 'Дополнить адрес' }).waitFor()
    })
  }
)

test(
  'Отзывы: 5 звёзд, истёкший статус и фильтр, заметка создаётся и удаляется',
  { timeout: 120000 },
  async () => {
    await withViews('reviews', async (page, name) => {
      const rating = page.getByRole('img', {
        name: 'Оценка: 3 из 5',
        exact: true,
      })
      await rating.waitFor()
      const colors = await rating
        .locator('svg')
        .evaluateAll((stars) =>
          stars.map((star) => getComputedStyle(star).color)
        )
      assert.equal(colors.length, 5)
      assert.equal(new Set(colors.slice(0, 3)).size, 1)
      assert.equal(new Set(colors.slice(3)).size, 1)
      assert.notEqual(colors[0], colors[3])
      assert.equal(await page.locator('details').count(), 1)
      assert.equal(
        await page.locator('.status-chip--overdue').textContent(),
        'Ссылка истекла'
      )
      const card = page.locator('.surface-card').filter({ has: rating })
      await card.getByRole('button', { name: 'Добавить заметку' }).click()
      await card
        .getByRole('textbox', { name: 'Внутренняя заметка' })
        .fill('Перезвонить')
      await card.getByRole('button', { name: 'Сохранить заметку' }).click()
      await card.locator('summary').click()
      await card.getByRole('textbox', { name: 'Внутренняя заметка' }).fill('')
      await card.getByRole('button', { name: 'Сохранить заметку' }).click()
      assert.equal(await card.locator('details').count(), 0)
      await page.screenshot({ path: path.join(artifactDir, `${name}.png`) })
      const toggle = page.getByRole('button', { name: /^Фильтры/ })
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
      await toggle.click()
      await page
        .getByLabel('Статус отзыва', { exact: true })
        .selectOption('expired')
      await page.waitForFunction(() => window.qaFilters.status === 'expired')
      assert.equal(await page.locator('.surface-card').count(), 1)
      assert.match(
        await toggle.getAttribute('class'),
        /filter-control--primary/
      )
      await toggle.click()
      assert.equal(await page.locator('select').count(), 0)
      assert.match(
        await toggle.getAttribute('class'),
        /filter-control--primary/
      )
      await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
      assert.equal(await page.locator('.surface-card').count(), 3)
      assert.match(
        await toggle.getAttribute('class'),
        /filter-control--outline/
      )
    })
  }
)

test(
  'Пользователи: регистрация по убыванию, сворачивание, комбинация фильтров, подсветка и сброс',
  { timeout: 120000 },
  async () => {
    await withViews('users', async (page, name) => {
      const list = page.getByRole('list', { name: 'Список пользователей' })
      const names = () => list.getByRole('listitem').allTextContents()
      await list.waitFor()
      assert.deepEqual(await names(), ['Яна', 'Борис', 'Алексей'])
      const toggle = page.getByRole('button', { name: /^Фильтры/ })
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
      assert.equal(await page.locator('select').count(), 0)
      await toggle.focus()
      await page.keyboard.press('Enter')
      assert.equal(
        await page.getByLabel('Сортировка').inputValue(),
        'registration'
      )
      await page.getByLabel('Источник регистрации').selectOption('web')
      await page.getByLabel('Тариф', { exact: true }).selectOption('t1')
      assert.deepEqual(await names(), ['Борис', 'Алексей'])
      await toggle.click()
      assert.match(
        await toggle.getAttribute('class'),
        /filter-control--primary/
      )
      assert.deepEqual(await names(), ['Борис', 'Алексей'])
      await page.screenshot({ path: path.join(artifactDir, `${name}.png`) })
      await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
      assert.deepEqual(await names(), ['Яна', 'Борис', 'Алексей'])
      assert.match(
        await toggle.getAttribute('class'),
        /filter-control--outline/
      )
      await page
        .getByPlaceholder('Введите имя, телефон или контакт')
        .fill('Яна')
      assert.deepEqual(await names(), ['Яна'])
      assert.match(
        await toggle.getAttribute('class'),
        /filter-control--primary/
      )
      await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
      await toggle.click()
      await page.getByLabel('Сортировка').selectOption('name')
      assert.deepEqual(await names(), ['Алексей', 'Борис', 'Яна'])
      assert.match(
        await toggle.getAttribute('class'),
        /filter-control--outline/
      )
    })
  }
)

test(
  'Важное: три действия переноса, календарь, отмена, сохранение времени, ошибка и защита повтора',
  { timeout: 120000 },
  async () => {
    await withViews('attention', async (page, name) => {
      const group = page.getByRole('group', {
        name: 'Перенести задачу',
        exact: true,
      })
      await group.waitFor()
      assert.deepEqual(await group.getByRole('button').allTextContents(), [
        'Завтра',
        'Послезавтра',
        'Выбрать дату',
      ])
      await group.getByRole('button', { name: 'Завтра', exact: true }).click()
      assert.equal(
        await page.evaluate(() => new Date(window.qaDate).getDate()),
        6
      )
      await group
        .getByRole('button', { name: 'Послезавтра', exact: true })
        .click()
      assert.equal(
        await page.evaluate(() => new Date(window.qaDate).getDate()),
        7
      )
      await group.getByRole('button', { name: 'Выбрать дату' }).click()
      const calendar = page.getByRole('group', {
        name: 'Календарь переноса задачи',
      })
      await calendar.waitFor()
      await page.getByRole('button', { name: 'Следующий месяц' }).click()
      await calendar.locator('[data-date="2026-12-17"]').click()
      assert.equal(await page.evaluate(() => window.qaAttempts || 0), 0)
      await page.getByRole('button', { name: 'Отмена', exact: true }).click()
      await calendar.waitFor({ state: 'detached' })
      assert.equal(
        await page.evaluate(() => new Date(window.qaDate).getDate()),
        7
      )
      await group.getByRole('button', { name: 'Выбрать дату' }).click()
      await page.getByRole('button', { name: 'Следующий месяц' }).click()
      await calendar.locator('[data-date="2026-12-17"]').click()
    await calendar.evaluate(async (node) => {
      while (true) {
        let settled = true
        for (let element = node; element; element = element.parentElement) {
          if (Number(getComputedStyle(element).opacity) < 1) settled = false
        }
        if (settled) break
        await new Promise(requestAnimationFrame)
      }
    })
      await page.screenshot({ path: path.join(artifactDir, `${name}.png`) })
      await page.evaluate(() => {
        window.qaFail = true
      })
      await page.getByRole('button', { name: 'Перенести', exact: true }).click()
      await page
        .getByRole('alert')
        .getByText('Не удалось перенести задачу. Попробуйте ещё раз.')
        .waitFor()
      assert.equal(
        await page.evaluate(() => new Date(window.qaDate).getDate()),
        7
      )
      await page.evaluate(() => {
        window.qaFail = false
        window.qaSlow = true
      })
      await page
        .getByRole('button', { name: 'Перенести', exact: true })
        .evaluate((button) => {
          button.click()
          button.click()
        })
      await page.waitForFunction(() => typeof window.qaResolve === 'function')
      assert.equal(await page.evaluate(() => window.qaAttempts), 2)
      await page.evaluate(() => window.qaResolve())
      await calendar.waitFor({ state: 'detached' })
      assert.deepEqual(
        await page.evaluate(() => {
          const date = new Date(window.qaDate)
          return [
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            date.getHours(),
            date.getMinutes(),
          ]
        }),
        [2026, 11, 17, 18, 45]
      )
    })
  }
)
