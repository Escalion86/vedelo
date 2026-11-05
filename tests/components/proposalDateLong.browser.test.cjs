const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { startHarness } = require('./periodPickerHarness.cjs')

test(
  'шапка КП: вставка двух форматов даты и реальный предпросмотр, 390/1365 px, обе темы',
  { timeout: 120000 },
  async () => {
    const artifactDir =
      process.env.PROPOSAL_DATE_QA_DIR ||
      path.join(os.tmpdir(), 'vedelo-proposal-date-long')
    const harness = await startHarness(
      `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import Editor from './components/ProposalRichTextEditor';import View from './components/ProposalRichTextView';
    import {renderProposalRichTextVariables} from './helpers/proposalRichText';
    function App(){const [value,setValue]=useState('<p>Дата: </p>');window.qaValue=value;
      const rendered=renderProposalRichTextVariables(value,{event:{date:'26.12.2026'}});
      return <main className="mx-auto max-w-3xl space-y-4 p-3"><section aria-label="Шапка"><h1>Шапка</h1>
        <Editor value={value} onChange={setValue} placeholder="Шапка"/>
      </section><section aria-label="Предпросмотр предложения"><h2>Предпросмотр</h2><View html={rendered.html}/></section></main>
    }createRoot(document.getElementById('root')).render(<App/>);
  `,
      { '@helpers/cloudinary': 'export const sendFile=async()=>null;' }
    )
    await fs.mkdir(artifactDir, { recursive: true })
    try {
      for (const width of [390, 1365])
        for (const dark of [false, true]) {
          const page = await harness.browser.newPage({
            viewport: { width, height: 900 },
            timezoneId: 'Asia/Krasnoyarsk',
          })
          const errors = []
          page.on('pageerror', (error) => errors.push(error.message))
          page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text())
          })
          try {
            await page.goto(harness.origin)
            if (dark)
              await page.evaluate(() =>
                document.body.classList.add('theme-dark')
              )
            const header = page.getByRole('region', {
              name: 'Шапка',
              exact: true,
            })
            const editor = header.locator('[contenteditable="true"]')
            await editor.waitFor()
            await editor.fill('Дата: ')
            await editor.press('End')
            const menu = header.getByLabel('Вставить переменную', {
              exact: true,
            })
            assert.equal(
              await menu
                .locator('option[value="event.dateLong"]')
                .textContent(),
              'Дата мероприятия словами'
            )
            assert.equal(
              await menu.locator('option[value="event.date"]').textContent(),
              'Дата мероприятия'
            )
            await menu.selectOption('event.date')
            await editor.press('End')
            await editor.press('Enter')
            await menu.selectOption('event.dateLong')
            assert.equal(
              await editor
                .locator('[data-proposal-variable="event.dateLong"]')
                .count(),
              1
            )
            const preview = page.getByRole('region', {
              name: 'Предпросмотр предложения',
            })
            await preview
              .getByText('26 декабря 2026г.', { exact: true })
              .waitFor()
            assert.match(await preview.innerText(), /26\.12\.2026/)
            const storedHtml = await page.evaluate(() => window.qaValue)
            assert.match(storedHtml, /{{event\.date}}/)
            assert.match(storedHtml, /{{event\.dateLong}}/)
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth
              ),
              false
            )
            assert.deepEqual(errors, [])
            await page.screenshot({
              path: path.join(
                artifactDir,
                `date-long-${width}-${dark ? 'dark' : 'light'}.png`
              ),
              fullPage: true,
            })
          } finally {
            await page.close()
          }
        }
    } finally {
      await harness.close()
    }
  }
)
