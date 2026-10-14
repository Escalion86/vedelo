// Настоящие Query provider, hydration, useClientsQuery, apiJson, EventCard и CSS.
// Подменены только не относящиеся к загрузке виджеты/атомы; сеть контролирует тест.
const fs = require('node:fs/promises')
const path = require('node:path')
exports.buildClientLoadingHarness = async () => {
  const esbuild = require(process.env.ESBUILD_MODULE)
  const result = await esbuild.build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'jsx',
      contents: `
      import React, {useEffect,useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {Provider,useAtomValue} from 'jotai';
      import isSiteLoadingAtom from '@state/atoms/isSiteLoadingAtom';
      import {useQueryClient} from '@tanstack/react-query';
      import AppQueryProvider from './components/AppQueryProvider';
      import hydrate from './helpers/useCabinetStateHydration';
      import EventCard from './layouts/cards/EventCard';
      import {useClientActions} from './helpers/useClientsQuery';
      const events=['client','client',null,'missing'].map((clientId,i)=>({_id:'event-'+i,clientId,status:'draft',calendarImportChecked:true,description:'Праздник',contractSum:15000}));
      const fixture=window.fixture||{};
      const initialProps={page:'eventsUpcoming',events,clients:fixture.clients,services:[],transactions:[],tariffs:[],users:[],news:[],siteSettings:{}};
      function App(){const q=useQueryClient();const actions=useClientActions();const [props,setProps]=useState(initialProps);hydrate(props);const loading=useAtomValue(isSiteLoadingAtom);
        useEffect(()=>{window.q=q;window.actions=actions;window.rehydrate=clients=>setProps({...initialProps,clients});if(!loading&&!window.card)window.card=document.querySelector('.event-card-shell')},[q,loading,actions]);
        return <main className="cabinet-canvas" style={{maxWidth:900,margin:'auto',padding:12}}><h1>Мероприятия</h1>{!loading&&events.map(event=><section key={event._id} data-event={event._id}><EventCard eventId={event._id} event={event} transactions={[]} style={{height:194,padding:'6px 8px'}}/></section>)}</main>}
      createRoot(document.getElementById('root')).render(<AppQueryProvider><Provider><App/></Provider></AppQueryProvider>);
    `,
    },
    bundle: true,
    write: false,
    outfile: "harness.js",
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'fixture-only',
        setup(build) {
          const stubs = {
            '@helpers/useEventsQuery': 'export const useEventQuery=()=>({});',
            '@helpers/useTransactionsQuery':
              'export const useTransactionsQuery=()=>({data:[]});',
            '@helpers/useEntityQueries':
              'const data=[];export const useServiceGroupsQuery=()=>({data});',
            '@state/atoms':
              "import {atom} from 'jotai';export const modalsFuncAtom=atom({event:{view:()=>window.cardOpened=true}});",
            'next/image':
              "import React from 'react';export default ({src,alt,width,height})=><img src={src} alt={alt} width={width} height={height}/>;",
          }
          for (const name of [
            'CardButtons',
            'ContactsIconsButtons',
            'DropDown',
            'EventProposalStatus',
            'EventClientReviewStatus',
          ])
            stubs['@components/' + name] = 'export default ()=>null;'
          build.onResolve({ filter: /^(next\/image|@)/ }, (args) => {
            if (stubs[args.path])
              return { path: args.path, namespace: 'fixture' }
            if (args.path.startsWith('@state/atoms/'))
              return { path: args.path, namespace: 'atom' }
            if (/^@(helpers|components)\//.test(args.path))
              return {
                path: path.resolve(
                  args.path.slice(1) + (path.extname(args.path) ? '' : '.js')
                ),
              }
          })
          build.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents: stubs[args.path],
            loader: 'jsx',
            resolveDir: process.cwd(),
          }))
          build.onLoad({ filter: /.*/, namespace: 'atom' }, (args) => ({
            contents:
              args.path.endsWith('loadingAtom') ||
              args.path.endsWith('errorAtom')
                ? "import {atom} from 'jotai';const a=atom(false);export default ()=>a;"
                : "import {atom} from 'jotai';export default atom(" +
                  (args.path.endsWith('siteSettingsAtom') ? '{}' : '[]') +
                  ');',
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
  const moduleCss = result.outputFiles.filter(f => f.path.endsWith(".css")).map(f => f.text).join("\n")
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Загрузка клиента</title><style>${css}\n${moduleCss}</style></head><body><div id="root"></div><script>${result.outputFiles.find(f => f.path.endsWith(".js")).text.replaceAll('</script', '<\\/script')}</script></body></html>`
}
