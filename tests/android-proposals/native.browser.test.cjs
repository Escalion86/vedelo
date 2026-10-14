const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path')
const root = path.resolve(__dirname, '../..'),
  out = process.env.STAGE_C_OUT,
  scratch = process.env.STAGE_M_SCRATCH
if (!out || !scratch) throw Error('STAGE_C_OUT и STAGE_M_SCRATCH обязательны для уникальных артефактов')
const esbuild = require(root + '/mobile/node_modules/esbuild'),
  playwright = require('/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright')
const {attachEvidence,sha256}=require('../browserEvidenceK.cjs')
const sourceHashes={
  'tests/android-proposals/native.browser.test.cjs':sha256(require('node:fs').readFileSync(__filename)),
  'tests/browserEvidenceK.cjs':sha256(require('node:fs').readFileSync(path.join(root,'tests/browserEvidenceK.cjs'))),
}
let browser, script, fontCss
async function chromePath() {
  for (const dir of (await fs.readdir('/home/aleksei/.cache/ms-playwright'))
    .sort()
    .reverse())
    for (const suffix of [
      'chrome-linux-arm64/chrome',
      'chrome-linux64/chrome',
      'chrome-linux/chrome',
    ]) {
      const p = `/home/aleksei/.cache/ms-playwright/${dir}/${suffix}`
      try {
        await fs.access(p)
        return p
      } catch {}
    }
  throw Error('Chromium отсутствует')
}
test.before(async () => {
  await fs.mkdir(out, { recursive: true })
  await fs.mkdir(path.join(scratch,'tmp'), { recursive: true })
  const shim = {
    name: 'stand-boundaries',
    setup(build) {
      build.onLoad({ filter: /\.(?:tsx?|jsx?|mjs|cjs)$/, namespace:'file' }, async args => {
        if (!args.path.startsWith(root+'/') || args.path.includes('/node_modules/')) return
        const contents=await fs.readFile(args.path,'utf8')
        sourceHashes[path.relative(root,args.path)]=sha256(contents)
        return {contents,loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':'jsx'}
      })
      // Общая синтетическая identity только на границах auth/storage.
      // Настоящие identity.ts, guards и экраны остаются в графе сборки.
      build.onResolve({ filter: /(?:^|\/)(AuthProvider|tokenStore|env)(?:\.tsx?)?$/ }, (args) =>
        args.importer.startsWith(root+'/mobile/') && !args.importer.includes('/node_modules/')
          ? { path: path.basename(args.path).replace(/\.tsx?$/, ''), namespace: 'identity-fixture' }
          : null
      )
      build.onLoad({ filter: /.*/, namespace: 'identity-fixture' }, (args) => ({
        contents: args.path === 'env'
          ? 'export const env={apiBaseUrl:"https://synthetic.invalid/api",appScheme:"vedelo"};'
          : args.path === 'AuthProvider'
          ? 'export const useAuth=()=>({user:window.__fixtureUser});'
          : 'const listeners=new Set();export const getStoredUser=async()=>window.__fixtureUser;export const getAccessToken=async()=>"synthetic-only";export const subscribeAuthSession=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};window.__notifyFixtureAuth=user=>{window.__fixtureUser=user;listeners.forEach(fn=>fn(user))};',
        loader: 'js',
      }))
      build.onResolve({ filter: /(?:^|\/)client(?:\.ts)?$/ }, (args) =>
        path.resolve(path.dirname(args.importer),args.path).replace(/\.ts$/,'') === root+'/mobile/src/shared/api/client'
          ? { path: root + '/tests/android-proposals/native.stageM-client.ts' }
          : null
      )
      build.onResolve(
        {
          filter:
            /^(expo-router|expo-crypto|expo-document-picker|expo-secure-store|expo-clipboard|react-native-webview|@react-navigation\/native|@expo\/vector-icons|react-native-safe-area-context)$/,
        },
        (args) => ({ path: args.path, namespace: 'fixture' })
      )
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
        const text = {
          'expo-router':
            'import React from "react";export const router={push:path=>{window.__fixtureState.route=path}};export const useNavigation=()=>({dispatch:()=>{}});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);',
          'expo-crypto':
            'let index=0;export const randomUUID=()=>crypto.randomUUID?.()||`00000000-0000-4000-8000-${String(++index).padStart(12,"0")}`;',
          'expo-document-picker':
            'export const getDocumentAsync=async()=>({canceled:true});',
          'expo-secure-store':
            'export const getItemAsync=async()=>null;export const setItemAsync=async()=>{};',
          'expo-clipboard': 'export const setStringAsync=async()=>{};',
          'react-native-webview':
            'export default function WebView(){return null}',
          '@react-navigation/native':
            'import React from "react";export const NavigationContext=React.createContext();export const usePreventRemove=(blocked,fn)=>{window.__fixtureBlocked=blocked};',
          '@expo/vector-icons': 'export const MaterialCommunityIcons=()=>null;',
          'react-native-safe-area-context':
            'export {View as SafeAreaView} from "react-native";export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});',
        }[args.path]
        return { contents: text, loader: 'jsx', resolveDir: root + '/mobile' }
      })
    },
  }
  const result = await esbuild.build({
    entryPoints: [root + '/tests/android-proposals/native.fixture.tsx'],
    bundle: true,
    write: false,
    metafile: true,
    format: 'iife',
    platform: 'browser',
    minify: true,
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    plugins: [shim],
    resolveExtensions: [
      '.web.tsx',
      '.tsx',
      '.web.ts',
      '.ts',
      '.web.js',
      '.js',
      '.json',
    ],
    alias: {
      'react-native': root + '/mobile/node_modules/react-native-web',
      react: root + '/mobile/node_modules/react',
      'react-dom/client': root + '/mobile/node_modules/react-dom/client',
      'isomorphic-dompurify': require.resolve('dompurify'),
      '@helpers': root + '/helpers',
    },
    define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },
  })
  script = result.outputFiles[0].text
  const asset = await esbuild.build({
    entryPoints: [
      root + '/mobile/src/features/proposals/localAssets.generated.ts',
    ],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
  })
  const m = { exports: {} }
  new Function('module', 'exports', asset.outputFiles[0].text)(m, m.exports)
  fontCss = m.exports.fontCss.replaceAll('Inter Tight', 'InterTight')
  await fs.writeFile(path.join(out,'source-bindings.json'),JSON.stringify({sourceHashes,metafile:result.metafile},null,2))
  process.chdir(scratch)
  browser = await playwright.chromium.launch({
    executablePath: await chromePath(),
    headless: true,
    args: ['--no-sandbox','--disable-crash-reporter','--disable-breakpad'],
    env: {...process.env,TMPDIR:path.join(scratch,'tmp'),XDG_CONFIG_HOME:path.join(scratch,'chrome-config'),XDG_CACHE_HOME:path.join(scratch,'chrome-cache')},
  })
  attachEvidence(browser,path.join(out,'evidence'),sourceHashes)
})
test.after(async () => browser?.close())
async function page(width, mode, screen = 'editor') {
  const p = await browser.newPage({ viewport: { width, height: 580 } }),
    errors = []
  p.on('pageerror', async (e) => {
    errors.push(e.message)
    await p.evaluate(
      (message) => window.__fixtureErrors.push(message),
      e.message
    )
  })
  p.on('console', (e) => {
    if (
      e.type() === 'error' &&
      !/net::ERR_FAILED|Failed to load resource/.test(e.text())
    )
      errors.push(e.text())
  })
  await p.route('**/*', (r) => r.abort())
  await p.setContent(
    `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fontCss}html,body,#root{margin:0;height:100%;font-family:'Inter Tight',sans-serif}*{box-sizing:border-box}</style></head><body><div id="root"></div></body></html>`
  )
  await p.evaluate(
    (config) => {
      window.__fixture = config
      window.__fixtureUser = { _id: 'synthetic-user', tenantId: 'synthetic-tenant' }
      window.__fixtureState = { calls: [], failSave: false }
      window.__fixtureErrors = []
    },
    { mode, screen }
  )
  await p.addScriptTag({ content: script })
  await p.waitForFunction(
    () =>
      document.querySelector(
        '[data-testid="proposal-save"],[data-testid="event-proposals-section"],[data-testid="proposal-template-create"]'
      ) || window.__fixtureErrors.length
  )
  assert.deepEqual(errors, [])
  return { p, errors }
}
for (const width of [360, 390, 420])
  for (const mode of ['light', 'dark'])
    test(`actual RN Web editor ${width}/${mode}: snapshot, error retention, catalogue and local preview`, async () => {
      const { p, errors } = await page(width, mode)
      await p.getByLabel('Название шаблона', { exact: true }).waitFor()
      await p.screenshot({ path: `${out}/native-top-${width}-${mode}.png` })
      await p
        .getByLabel('Название шаблона', { exact: true })
        .fill('Несохранённое название')
      await p.evaluate(() => (window.__fixtureState.failSave = true))
      await p.getByTestId('proposal-save').click()
      await p
        .getByText(
          'Не удалось сохранить. Введённые данные сохранены на экране.',
          { exact: true }
        )
        .waitFor()
      assert.equal(
        await p.getByLabel('Название шаблона', { exact: true }).inputValue(),
        'Несохранённое название'
      )
      const call = await p.evaluate(() => window.__fixtureState.calls[0])
      assert.match(call.body.blocks[0].contentHtml, /a\.png/)
      assert.match(call.body.blocks[0].contentHtml, /a\.mp4/)
      await p.getByTestId('proposal-catalog-main').click()
      await p.getByLabel('Услуга Новая услуга', { exact: true }).click()
      await p.getByText('Применить выбор услуг', { exact: true }).click()
      await p
        .getByText('Итого: 130 ₽ · сумма позиций', { exact: true })
        .waitFor()
      await p.getByTestId('proposal-preview').click()
      try {
        await p
          .getByText('Клиентский вид текущего черновика.', { exact: false })
          .waitFor()
      } catch (failure) {
        await p.screenshot({
          path: `${out}/preview-failure-${width}-${mode}.png`,
        })
        await fs.writeFile(
          `${out}/preview-failure-${width}-${mode}.json`,
          JSON.stringify(
            await p.evaluate(() => ({
              state: window.__fixtureState,
              errors: window.__fixtureErrors,
              text: document.body.innerText,
              previewButton: document.querySelector(
                '[data-testid="proposal-preview"]'
              )?.outerHTML,
            })),
            null,
            2
          )
        )
        throw failure
      }
      const frame = p.frameLocator('iframe').last()
      await frame.getByText('Основной', { exact: true }).waitFor()
      assert.equal(
        await frame
          .getByRole('button', { name: 'Выбрать вариант' })
          .isDisabled(),
        true
      )
      await p.getByText('Закрыть предпросмотр', { exact: true }).click()
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true
      )
      assert.deepEqual(errors, [])
      await p.screenshot({ path: `${out}/native-${width}-${mode}.png` })
      await p.close()
    })
test('actual RN Web list: accepted/applied, selected revoke disabled and separate template route', async () => {
  const { p, errors } = await page(360, 'dark', 'section')
  await p.getByText('Принято клиентом · применено', { exact: true }).waitFor()
  assert.equal(
    await p.getByTestId('proposal-revoke-p').getAttribute('aria-disabled'),
    'true'
  )
  await p.getByTestId('proposal-create').click()
  await p.getByText('Шаблон клиента', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  await p.screenshot({ path: `${out}/native-section-dark.png` })
  await p.close()
  const next = await page(420, 'light', 'library')
  await next.p.getByTestId('proposal-template-t').click()
  assert.equal(
    await next.p.evaluate(() => window.__fixtureState.route),
    '/more/proposal-templates/t'
  )
  assert.deepEqual(next.errors, [])
  await next.p.close()
})
