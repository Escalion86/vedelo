const path = require('node:path')
const fs = require('node:fs/promises')
const http = require('node:http')
const esbuild = require(process.env.ESBUILD_MODULE || 'esbuild')
;(async () => {
  const bundle = await esbuild.build({
    stdin: {
      contents: `
 import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
 import {Provider, createStore} from 'jotai';
 import PersonalTariffSettings from './components/PersonalTariffSettings';
 import TariffSelect from './layouts/content/TariffSelectContent';
 import loggedUser from './state/atoms/loggedUserAtom'; import tariffs from './state/atoms/tariffsAtom';
 import modals from './state/atoms/modalsFuncAtom';
 const store=createStore(); store.set(loggedUser,{_id:'user',tariffId:'business',balance:1000,tariffActiveUntil:'2026-10-20T12:00:00Z'}); store.set(tariffs,[]);
 function App(){const [dialog,setDialog]=useState(null); const [dark,setDark]=useState(false);
 store.set(modals,{add:setDialog});
 return <Provider store={store}><main style={{maxWidth:1000,margin:'auto',padding:16}}>
 <h1>Проверка персональных тарифов</h1><button onClick={()=>{document.body.classList.toggle('theme-dark');setDark(!dark)}}>{dark?'Светлая тема':'Тёмная тема'}</button>
 <p><a href='/admin'>Администратор</a> · <a href='/user'>Пользователь</a></p>
 {location.pathname==='/admin'?<PersonalTariffSettings userId='user'/>:<TariffSelect/>}
 {dialog?<section role='dialog' style={{padding:16,border:'1px solid',background:'var(--color-white)'}}><h2>{dialog.title}</h2><p>{dialog.text}</p><button onClick={async()=>{await dialog.onConfirm();setDialog(null)}}>{dialog.confirmButtonName}</button></section>:null}
 </main></Provider>};createRoot(document.getElementById('root')).render(<App/>);
 `,
      resolveDir: process.cwd(),
      loader: 'jsx',
    },
    bundle: true,
    write: false,
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [
      {
        name: 'qa',
        setup(build) {
          const mocks = {
            'next/navigation': `export const useRouter=()=>({push(){}});`,
            '@helpers/useSnackbar': `export default ()=>({error(){},success(){}});`,
            '@helpers/useWorkItemTerminology': `export default ()=>({pluralDative:'заказам',pluralGenitive:'заказов'});`,
            '@helpers/metrikaGoals': `export const reachGoal=()=>{};`,
            '@state/selectors/loggedUserActiveRoleSelector': `import {atom} from 'jotai'; export default atom({});`,
          }
          build.onResolve(
            {
              filter:
                /^(next\/navigation|@helpers\/useSnackbar|@helpers\/useWorkItemTerminology|@helpers\/metrikaGoals|@state\/selectors\/loggedUserActiveRoleSelector)$/,
            },
            (args) => ({ path: args.path, namespace: 'qa' })
          )
          build.onLoad({ filter: /.*/, namespace: 'qa' }, (args) => ({
            contents: mocks[args.path],
            loader: 'jsx',
            resolveDir: process.cwd(),
          }))
        },
      },
    ],
  })
  const css = (
    await require('postcss')([require('@tailwindcss/postcss')()]).process(
      await fs.readFile('app/globals.css', 'utf8'),
      { from: path.resolve('app/globals.css') }
    )
  ).css
  const tariffs = [
    { _id: 'free', title: 'Бесплатный', price: 0 },
    { _id: 'bro', title: 'BRO', price: 200, hidden: true },
    { _id: 'secret', title: 'SECRET', price: 100, hidden: true },
    { _id: 'business', title: 'БИЗНЕС', price: 1000 },
  ]
  const data = {
    allowedTariffIds: [],
    tariffId: 'business',
    tariffActiveUntil: '2026-10-20T12:00:00Z',
    pendingTariffChange: null,
  }
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/billing/preferences')) {
      if (req.method === 'POST') {
        let raw = ''
        for await (const chunk of req) raw += chunk
        const body = JSON.parse(raw)
        if (body.action === 'grant') {
          data.allowedTariffIds = data.allowedTariffIds.filter(
            (id) => id !== body.tariffId
          )
          if (body.enabled) data.allowedTariffIds.push(body.tariffId)
          if (
            !body.enabled &&
            data.pendingTariffChange?.tariffId === body.tariffId
          )
            data.pendingTariffChange = null
        }
        if (body.action === 'schedule') {
          const tariff = tariffs.find((t) => t._id === body.tariffId)
          data.pendingTariffChange = {
            tariffId: tariff._id,
            startsAt: data.tariffActiveUntil,
            title: tariff.title,
            price: tariff.price,
          }
        }
        if (body.action === 'cancel') data.pendingTariffChange = null
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          success: true,
          data: {
            ...data,
            tariffs: tariffs.filter(
              (t) =>
                req.url.includes('userId=') ||
                !t.hidden ||
                data.allowedTariffIds.includes(t._id)
            ),
          },
        })
      )
      return
    }
    if (req.url === '/favicon.ico') {
      res.writeHead(204)
      res.end()
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(
      `<!doctype html><html lang='ru'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Персональные тарифы — QA</title><style>${css}</style></head><body><div id='root'></div><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`
    )
  })
  server.listen(4317, '127.0.0.1', () =>
    console.log('Tariff QA http://127.0.0.1:4317/admin')
  )
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
