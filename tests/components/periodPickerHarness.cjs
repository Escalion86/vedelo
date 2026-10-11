const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const artifactDir = '/home/aleksei/.hermes/cache/scratch/vedelo-period-web'
async function startHarness(contents, mocks = {}, extraCss = '') {
  const esbuild = require(process.env.ESBUILD_MODULE)
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
  const bundle = await esbuild.build({
    stdin: { resolveDir: process.cwd(), loader: 'jsx', contents },
    bundle: true,
    minify: true,
    write: false,
    outdir: 'qa',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [
      {
        name: 'external-seams',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) =>
            args.path in mocks
              ? { path: args.path, namespace: 'mock' }
              : undefined
          )
          build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
            contents: mocks[args.path],
            resolveDir: process.cwd(),
            loader: 'jsx',
          }))
          build.onResolve(
            { filter: /^@(helpers|components|layouts|state)\// },
            (args) => ({
              path: path.resolve(
                args.path.slice(1) + (path.extname(args.path) ? '' : '.js')
              ),
            })
          )
        },
      },
    ],
  })
  const globalCss = process.env.PERIOD_GLOBAL_CSS
    ? await fs.readFile(process.env.PERIOD_GLOBAL_CSS, 'utf8')
    : (
        await require('postcss')([require('@tailwindcss/postcss')()]).process(
          await fs.readFile('app/globals.css', 'utf8'),
          { from: path.resolve('app/globals.css') }
        )
      ).css
  const css =
    globalCss +
    '\n' +
    bundle.outputFiles
      .filter((f) => f.path.endsWith('.css'))
      .map((f) => f.text)
      .join('\n')
  const js = bundle.outputFiles.find((f) => f.path.endsWith('.js')).text
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nhtml,body{margin:0;min-height:100%;}#root{min-width:0;height:calc(100dvh - 64px);margin-top:32px}${extraCss}</style></head><body><div id="root"></div><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox'],
    })
  } catch (e) {
    await new Promise((resolve) => server.close(resolve))
    throw e
  }
  await fs.mkdir(artifactDir, { recursive: true })
  return {
    browser,
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await browser.close()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
async function capture(page, name) {
  const html = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true)
    clone.querySelectorAll('script').forEach((n) => n.remove())
    // Captured native dialogs need their top-layer/inert state restored when
    // opened as a standalone HTML artifact; no React logic is substituted.
    clone
      .querySelectorAll('dialog[open]')
      .forEach((n) => n.removeAttribute('open'))
    const script = document.createElement('script')
    script.textContent =
      'document.querySelectorAll("dialog").forEach(d=>d.showModal())'
    if (document.querySelector('dialog[open]'))
      clone.querySelector('body').append(script)
    return '<!doctype html>' + clone.outerHTML
  })
  await fs.writeFile(path.join(artifactDir, name + '.html'), html)
  await page.screenshot({
    path: path.join(artifactDir, name + '.png'),
    fullPage: true,
  })
}
async function enterRange(page, from, to, label = 'Период') {
  await page
    .getByRole('button', {
      name: new RegExp(
        '^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':'
      ),
    })
    .click()
  await page.getByRole('button', { name: 'Выбрать даты', exact: true }).click()
  await page.getByRole('button', { name: 'Ввести даты вручную' }).click()
  await page.getByLabel('Начало периода', { exact: true }).fill(from)
  await page.getByLabel('Конец периода', { exact: true }).fill(to)
}
module.exports = { startHarness, capture, enterRange, artifactDir }
