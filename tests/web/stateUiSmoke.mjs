import assert from 'node:assert/strict'

export const runStateUiSmoke = async ({ page, viewport }) => {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => localStorage.setItem('theme', value), theme)
    await page.goto('/cabinet/profile')
    const name = page.locator('input[autocomplete="name"]')
    await name.waitFor()
    await name.fill(`Проверка формы ${theme}`)
    await page.locator('input[type="tel"]').first().focus()
    assert.equal(await name.inputValue(), `Проверка формы ${theme}`)

    await page.goto('/cabinet/settings')
    await page.getByText('Открыть мастер настройки', { exact: true }).waitFor()
    assert.equal(await page.locator('body').evaluate(
      body => body.classList.contains('theme-dark')
    ), theme === 'dark')
    const hours = page.locator('input[type="number"]').first()
    const value = (Number(await hours.inputValue()) + 1) % 12 || 1
    const saved = page.waitForResponse(response => response.url().endsWith('/api/site') && response.request().method() === 'POST')
    await hours.fill(String(value))
    assert.equal((await saved).status(), 200)
    await page.reload()
    await hours.waitFor()
    assert.equal(await hours.inputValue(), String(value))

    for (const path of ['/cabinet/eventsPast', '/cabinet/statistics']) {
      await page.goto(path)
      await page.getByText('Важное', { exact: true }).first().waitFor()
      assert.doesNotMatch(await page.locator('body').innerText(), /Application error|Unhandled Runtime Error/)
    }
  }
  console.log(`State UI ${viewport.width}: профиль, сохранение настроек, прошедшие и статистика; light/dark`)
}
