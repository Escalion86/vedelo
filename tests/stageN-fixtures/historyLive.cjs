const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
// Additional live probe, separate from unchanged E16 assertions and raw vendor gates.
async function captureHistory(browser, origin, output, sourceHashes) {
  const records = []
  await fs.mkdir(output, { recursive: true })
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 360, height: 900 } })
    try {
      await page.goto(origin + '/?surface=history&theme=' + theme)
      await page.getByText('Изменение 1', { exact: true }).waitFor()
      await page.getByTestId('history-filter-toggle').click()
      const probe = () => {
        const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
        const visible = el => {
          const r = rect(el)
          for (let p = el.parentElement; p; p = p.parentElement) {
            const c = getComputedStyle(p), a = rect(p)
            if (/hidden|clip|auto|scroll/.test(c.overflowX)) { r.left = Math.max(r.left, a.left); r.right = Math.min(r.right, a.right) }
            if (/hidden|clip|auto|scroll/.test(c.overflowY)) { r.top = Math.max(r.top, a.top); r.bottom = Math.min(r.bottom, a.bottom) }
          }
          r.left = Math.max(0, r.left); r.right = Math.min(innerWidth, r.right); r.top = Math.max(0, r.top); r.bottom = Math.min(innerHeight, r.bottom)
          r.width = Math.max(0, r.right - r.left); r.height = Math.max(0, r.bottom - r.top); return r
        }
        const filter = document.querySelector('[data-testid="history-filter-scroll"]'), list = document.querySelector('[data-testid="history-list-scroll"]')
        const controls = [...filter.querySelectorAll('button,[role=button],input')].map(el => ({ label: el.getAttribute('aria-label') || el.textContent, raw: rect(el), visible: visible(el) }))
        const listVisible = visible(list)
        const overlaps = controls.filter(c => c.visible.width && c.visible.height && Math.min(c.visible.right, listVisible.right) > Math.max(c.visible.left, listVisible.left) && Math.min(c.visible.bottom, listVisible.bottom) > Math.max(c.visible.top, listVisible.top))
        return { viewport: { width: innerWidth, height: innerHeight }, filter: { ...rect(filter), scrollHeight: filter.scrollHeight, clientHeight: filter.clientHeight }, list: rect(list), controls, overlaps, documentWidth: document.documentElement.scrollWidth }
      }
      const initial = await page.evaluate(probe)
      assert.deepEqual(initial.viewport, { width: 360, height: 900 })
      assert.equal(initial.overlaps.length, 0)
      await page.screenshot({ path: path.join(output, '360-' + theme + '-initial.png'), fullPage: true })
      const html = await page.evaluate(() => {
        const clone = document.documentElement.cloneNode(true), original = [...document.querySelectorAll('style')]
        clone.querySelectorAll('script').forEach(el => el.remove())
        clone.querySelectorAll('style').forEach((el, i) => { el.textContent = [...(original[i].sheet?.cssRules || [])].map(r => r.cssText).join('\n') })
        return '<!doctype html>' + clone.outerHTML
      })
      // Exact current DOM/CSSOM at the vendor's real viewport. No nodes removed except scripts.
      await fs.writeFile(path.join(output, '360-' + theme + '-history.html'), html, { flag: 'wx' })
      const reachable = []
      const controls = page.getByTestId('history-filter-scroll').locator('button,[role=button],input')
      for (let i = 0; i < await controls.count(); i++) {
        const control = controls.nth(i)
        await control.scrollIntoViewIfNeeded()
        const state = await page.evaluate(probe)
        const c = state.controls[i]
        reachable.push({ label: c.label, visible: c.visible, overlaps: state.overlaps })
        assert.ok(c.visible.width > 0 && c.visible.height > 0, c.label)
        assert.equal(state.overlaps.length, 0)
      }
      const scroll = await page.evaluate(probe)
      await page.screenshot({ path: path.join(output, '360-' + theme + '-scrolled.png'), fullPage: true })
      records.push({ theme, initial, reachable, scroll })
    } finally { await page.close() }
  }
  await fs.writeFile(path.join(output, 'measurements.json'), JSON.stringify({ records, sourceHashes }, null, 2) + '\n', { flag: 'wx' })
  return records
}
module.exports = { captureHistory }
