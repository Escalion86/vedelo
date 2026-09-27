import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'

export const runUserActivitySmoke = async ({
  t,
  db,
  tenantA,
  tenantB,
  userA,
  anonymous,
  baseUrl,
  phone,
  password,
}) => {
  await t.test(
    'User mutation activity: author/tenant isolation, deletes, integration and visit exclusion',
    async () => {
      const histories = db.collection('histories')
      const rows = await histories.insertMany([
        {
          tenantId: tenantA,
          actorId: String(tenantA),
          actorType: 'user',
          operation: 'create',
          occurredAt: new Date('2026-01-01'),
        },
        {
          tenantId: tenantA,
          actorId: String(tenantA),
          actorType: 'user',
          operation: 'delete',
          occurredAt: new Date('2026-01-03'),
        },
        {
          tenantId: tenantA,
          actorId: String(tenantB),
          actorType: 'user',
          operation: 'update',
          occurredAt: new Date('2026-02-01'),
        },
        {
          tenantId: tenantB,
          actorId: String(tenantA),
          actorType: 'user',
          operation: 'update',
          occurredAt: new Date('2026-03-01'),
        },
        {
          tenantId: tenantA,
          actorId: String(tenantA),
          actorType: 'integration',
          operation: 'create',
          occurredAt: new Date('2026-04-01'),
        },
        {
          tenantId: tenantA,
          userId: String(tenantA),
          action: 'update',
          createdAt: new Date('2026-01-02'),
          occurredAt: new Date('2026-05-01'),
        },
      ])
      try {
        assert.equal((await anonymous('/api/users')).status, 401)
        const response = await userA('/api/users')
        assert.equal(response.status, 200)
        const { data } = await response.json()
        assert.equal(data.length, 1)
        assert.equal(data[0]._id, String(tenantA))
        assert.equal(data[0].lastMutationAt, '2026-01-03T00:00:00.000Z')
        await db
          .collection('users')
          .updateOne({ _id: tenantA }, { $set: { role: 'dev' } })
        const all = (await (await userA('/api/users')).json()).data
        assert.equal(
          all.find((row) => row._id === String(tenantA)).lastMutationAt,
          '2026-01-03T00:00:00.000Z'
        )
        assert.equal(
          all.find((row) => row._id === String(tenantB)).lastMutationAt,
          null
        )
        const playwrightModule =
          process.env.USER_ACTIVITY_PLAYWRIGHT_MODULE ||
          process.env.PLAYWRIGHT_MODULE
        if (playwrightModule) {
          await db.collection('sitesettings').updateOne(
            { tenantId: tenantA },
            { $set: { 'custom.firstRunWizardCompleted': true } },
            { upsert: true }
          )
          const { chromium } = await import(
            pathToFileURL(playwrightModule).href
          )
          const browser = await chromium.launch({
            channel: 'msedge',
            headless: true,
          })
          try {
            for (const width of [1365, 390]) {
              const context = await browser.newContext({
                viewport: { width, height: 900 },
              })
              try {
                const page = await context.newPage()
                const errors = []
                page.on('pageerror', (error) => errors.push(error.message))
                await page.goto(`${baseUrl}/login`)
                await page.locator('input[type="tel"]').fill(phone)
                await page.locator('input[type="password"]').fill(password)
                await page
                  .getByRole('button', { name: 'Войти', exact: true })
                  .click()
                await page.waitForURL('**/cabinet/**')
                for (const theme of ['light', 'dark']) {
                  await page.evaluate(
                    (value) => localStorage.setItem('theme', value),
                    theme
                  )
                  await page.goto(`${baseUrl}/cabinet/users`)
                  await page
                    .locator('select')
                    .filter({ has: page.locator('option[value="activity"]') })
                    .selectOption('activity')
                  const activity = page.getByText('Последняя активность:', {
                    exact: false,
                  })
                  await activity.first().waitFor()
                  const latest = all.reduce(
                    (max, row) =>
                      Math.max(
                        max,
                        row.lastMutationAt
                          ? new Date(row.lastMutationAt).getTime()
                          : 0
                      ),
                    0
                  )
                  const expected = await page.evaluate(
                    (value) =>
                      new Date(value).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    latest
                  )
                  assert.equal(
                    await activity.first().innerText(),
                    `Последняя активность: ${expected}`
                  )
                  assert.match(await page.title(), /Кабинет Ведело/)
                  assert.equal(
                    await page
                      .locator('body')
                      .evaluate((body) => body.scrollWidth <= innerWidth),
                    true
                  )
                  await page.screenshot({
                    path: path.join(
                      os.tmpdir(),
                      `vedelo-user-activity-${width}-${theme}.png`
                    ),
                  })
                }
                assert.deepEqual(errors, [])
                console.log(
                  `User activity UI: ${width}px, light/dark, sorting passed`
                )
              } finally {
                await context.close()
              }
            }
          } finally {
            await browser.close()
          }
        }
      } finally {
        await db
          .collection('users')
          .updateOne({ _id: tenantA }, { $set: { role: 'user' } })
        await histories.deleteMany({
          _id: { $in: Object.values(rows.insertedIds) },
        })
      }
    }
  )
}
