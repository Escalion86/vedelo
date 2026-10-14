const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const root = path.resolve(__dirname,'../..')
const output = '/home/aleksei/reports/vedelo/2026-10-11/update/B/browser'
const deps='/home/aleksei/.hermes/cache/scratch/vedelo-audit-browser-deps-20261011/node_modules'
// Все реальные React Native UI-компоненты и QueryClient остаются в сборке.
// Заменены только auth/network/platform seams; production вызовы запрещены.
function fixtures() {
  const mocks={
    // RN Web намеренно бросает ошибку для нативного числового view handle.
    'native-focus':`export default ()=>null;`,
    'expo-router':`import React from 'react';export const router={push:x=>window.qa.routes.push(x)};export const useFocusEffect=fn=>React.useEffect(fn,[fn]);`,
    '@react-navigation/native':`import React from 'react';export const NavigationContext=React.createContext(null);export const useNavigation=()=>({dispatch:()=>{}});export const usePreventRemove=()=>{};`,
    'expo-secure-store':`export const getItemAsync=()=>{throw Error('Чтение реального storage запрещено')};export const setItemAsync=getItemAsync;`,
    'expo-clipboard':`export const setStringAsync=async value=>window.qa.clipboard.push(value);`,
    'expo-document-picker':`export const getDocumentAsync=async()=>({canceled:false,assets:[{uri:'file:///fixture.png',name:'fixture.png',mimeType:'image/png',size:100,file:new File(['fixture'],'fixture.png',{type:'image/png'})}]});`,
    '@expo/vector-icons':`import React from 'react';import {Text} from 'react-native';export const MaterialCommunityIcons=()=>React.createElement(Text,{'aria-hidden':true},'•');`,
    'react-native-safe-area-context':`import {View} from 'react-native';export const SafeAreaView=View;export const useSafeAreaInsets=()=>({top:24,bottom:24,left:0,right:0});`,
    'AuthProvider':`export const useAuth=()=>({user:{_id:'fixture-user',tenantId:'fixture-tenant'}});`,
    'nativeImage':`export const copyImage=()=>{throw Error('Нативный filesystem не применяется в RN Web')};`,
    'uploadOnce':`export const uploadOnce=async(path,form)=>{window.qa.uploads.push({path,fields:[...form.keys()]});return {success:true,data:{url:location.origin+'/logo.webp'}}};`,
    'client':`export const api={get:async(path)=>{window.qa.calls.push({method:'GET',path});if(window.qa.failGet){window.qa.failGet=false;throw Error('Сбой фикстуры')}if(path.startsWith('/site/'))return {success:true,data:window.qa.page};const q=new URLSearchParams(path.split('?')[1]);const e=q.get('eventId');if(e){const row=e===window.qa.row.eventId?window.qa.row:e===window.qa.review?.eventId?window.qa.review:null;return {success:true,data:{items:row?[row]:[],total:row?1:0,allowClientReviews:true}}};return {success:true,data:{items:[window.qa.row],total:61,allowClientReviews:true}}},post:async(path,body)=>{window.qa.calls.push({method:'POST',path,body});if(window.qa.failPost){window.qa.failPost=false;throw Error('Сбой фикстуры')}if(path.startsWith('/site/')){window.qa.page.reviewPage={...body};return {success:true,data:window.qa.page}};window.qa.review={...window.qa.row,_id:'request',eventId:'event',status:'created',submittedAt:null,rating:null,comment:'',note:''};return {success:true,data:{...window.qa.review,url:location.origin+'/review/request#fixture-capability'}}},patch:async(path,body)=>{window.qa.calls.push({method:'PATCH',path,body});if(window.qa.failPatch){window.qa.failPatch=false;throw Error('Сбой фикстуры')};const row=path.endsWith('/request')?window.qa.review:window.qa.row;if(body.action==='note')row.note=body.note;if(body.action==='read')row.readAt='2026-10-11';if(body.action==='revoke')row.status='revoked';if(body.action==='sent')row.status='sent';if(body.action==='renew')row.status='created';return {success:true,data:{...row,...(['link','renew'].includes(body.action)?{url:location.origin+'/review/request#fixture-capability'}:{})}}}};`,
  }
  const local=new Set(['AuthProvider','nativeImage','uploadOnce','client'])
  return {name:'review-fixtures',setup(build){
    build.onResolve({filter:/.*/},args=>{
      if(args.importer.startsWith(deps+'/react-native-web/') && /\/exports\/findNodeHandle(?:\/index\.js)?$/.test(args.path))return {path:'native-focus',namespace:'fixture'}
      const key=local.has(path.basename(args.path)) && args.importer.includes('/mobile/')?path.basename(args.path):args.path
      if(mocks[key])return {path:key,namespace:'fixture'}
      if(args.path==='react-native')return {path:require.resolve(deps+'/react-native-web')}
      if(/^react(?:\/|$)|^react-dom(?:\/|$)/.test(args.path))return {path:require.resolve(args.path,{paths:[path.join(root,'mobile')]})}
      if(args.path==='@tanstack/react-query')return {path:require.resolve(args.path,{paths:[path.join(root,'mobile')]})}
    })
    build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'jsx',resolveDir:path.join(root,'mobile')}))
  }}
}

test('Отзывы RN Web: 360/390/420, обе темы, короткий экран, реальные взаимодействия и console',async()=>{
  await fs.mkdir(output,{recursive:true})
  const esbuild=require(deps+'/esbuild')
  const playwright=require('/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright')
  const build=await esbuild.build({stdin:{contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {ThemeProvider} from '${root}/mobile/src/shared/ui/ThemeProvider';import {Screen} from '${root}/mobile/src/shared/ui/components';
    import {ClientReviewsSection,EventClientReviewSection,ReviewPageScreen} from '${root}/mobile/src/features/reviews/index';
    window.qa={calls:[],routes:[],clipboard:[],uploads:[],row:{_id:'row',eventId:'row-event',clientId:'client',status:'received',rating:2,comment:'Длинный отзыв клиента '.repeat(20),note:'',createdAt:'2026-10-05',submittedAt:'2026-10-06',readAt:null,expiresAt:'2026-11-05',clientName:'Очень длинное имя клиента '.repeat(4)},review:null,page:{reviewPage:{publicName:'',specialization:'',greeting:'',accent:'sand',cover:'plain',logoUrl:''},allowClientReviews:true,origin:location.origin}};
    const query=new URLSearchParams(location.search),surface=query.get('surface')||'list',mode=query.get('mode')||'light';
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><ThemeProvider storage={null} forcedMode={mode}>{surface==='page'?<ReviewPageScreen/>:<Screen>{surface==='event'?<EventClientReviewSection event={{_id:'event',clientId:'client',status:'active',eventDate:'2020-01-01'}}/>:<ClientReviewsSection/>}</Screen>}</ThemeProvider></QueryClientProvider>);
  `,loader:'tsx',resolveDir:path.join(root,'mobile')},bundle:true,write:false,format:'iife',jsx:'automatic',define:{__DEV__:'false','process.env.NODE_ENV':'"production"'},plugins:[fixtures()]})
  const js=build.outputFiles[0].text
  const font=await fs.readFile(path.join(root,'public/fonts/InterTight-Regular.woff2'))
  const server=http.createServer((req,res)=>{if(req.url.startsWith('/app.js')){res.setHeader('Content-Type','application/javascript');res.end(js)}else if(req.url.startsWith('/font.woff2')){res.setHeader('Content-Type','font/woff2');res.end(font)}else if(req.url.startsWith('/logo.webp')){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="gray"/></svg>')}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ru"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:InterTight;src:url(/font.woff2)}html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}*{box-sizing:border-box}</style><div id="root"></div><script src="/app.js"></script></html>')}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin=`http://127.0.0.1:${server.address().port}`
  const browser=await playwright.chromium.launch({executablePath:'/home/aleksei/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',headless:true,args:['--no-sandbox']})
  const results=[]
  let activePage,activeErrors=[]
  try{
    for(const mode of ['light','dark'])for(const width of [360,390,420]){
      const context=await browser.newContext({viewport:{width,height:520},colorScheme:mode})
      const page=await context.newPage(),errors=[]
      activePage=page;activeErrors=errors
      page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
      await page.goto(origin+`/?mode=${mode}`)
      await page.getByTestId('review-card-row').waitFor()
      await page.evaluate(()=>document.fonts.ready)
      assert.equal(await page.getByText('Период запросов',{exact:true}).count(),0)
      await page.getByTestId('reviews-filters-toggle').click()
      await page.getByRole('button',{name:'2 из 5',exact:true}).click()
      await page.getByRole('button',{name:'Только непрочитанные',exact:true}).click()
      await page.getByTestId('reviews-period-trigger').click()
      await page.getByRole('button',{name:'Выбрать даты',exact:true}).click()
      await page.getByRole('button',{name:'Ввести даты вручную',exact:true}).click()
      await page.getByLabel('С даты',{exact:true}).fill('05.10.2026')
      await page.getByLabel('По дату',{exact:true}).fill('11.10.2026')
      await page.getByRole('button',{name:'Применить',exact:true}).click()
      await page.getByTestId('reviews-filters-toggle').click()
      assert.match(await page.getByTestId('reviews-filter-summary').innerText(),/Непрочитанные/)
      await page.waitForFunction(()=>window.qa.calls.some(call=>call.path.includes('from=2026-10-05') && call.path.includes('to=2026-10-11')))
      await page.getByTestId('reviews-filters-reset').click()
      assert.equal(await page.getByTestId('reviews-filter-summary').count(),0)
      await page.waitForFunction(()=>{const last=window.qa.calls.filter(call=>call.method==='GET').at(-1);const q=new URLSearchParams(last.path.split('?')[1]);return q.get('page')==='0' && !['from','to','rating','unread'].some(key=>q.has(key))})
      await page.getByRole('button',{name:'Следующая страница',exact:true}).click()
      await page.waitForFunction(()=>window.qa.calls.some(call=>call.path.includes('page=1')))
      await page.getByRole('button',{name:'Внутренняя заметка',exact:true}).click()
      await page.getByLabel('Заметка для себя',{exact:true}).fill('Обсудить отзыв')
      await page.evaluate(()=>window.qa.failPatch=true)
      await page.getByRole('button',{name:'Сохранить заметку',exact:true}).click()
      await page.getByText('Не удалось сохранить изменения. Повторите попытку',{exact:true}).waitFor()
      assert.equal(await page.getByLabel('Заметка для себя',{exact:true}).inputValue(),'Обсудить отзыв')
      await page.getByRole('button',{name:'Сохранить заметку',exact:true}).click()
      await page.getByText('Изменения сохранены',{exact:true}).waitFor()
      await page.getByTestId('review-read-row').click()
      await page.waitForFunction(()=>Boolean(window.qa.row.readAt))
      await page.getByText('Прочитан',{exact:true}).waitFor()
      assert.equal(await page.getByTestId('review-read-row').count(),0)
      await page.getByRole('button',{name:'Запланировать контакт',exact:true}).click()
      assert.equal(await page.evaluate(()=>window.qa.routes[0].params.section),'contacts')
      await page.getByLabel('Заметка для себя',{exact:true}).scrollIntoViewIfNeeded()
      await page.screenshot({path:path.join(output,`note-${mode}-${width}.png`),fullPage:true})
      await page.getByTestId('client-reviews-section').evaluate(node=>{for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.scrollHeight>parent.clientHeight)parent.scrollTop=0})
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
      assert.equal(overflow,false,`${mode}/${width}: горизонтальное переполнение списка`)
      await page.screenshot({path:path.join(output,`list-${mode}-${width}.png`),fullPage:true})
      await page.goto(origin+`/?mode=${mode}&surface=event`)
      await page.getByTestId('review-request').waitFor()
      assert.ok((await page.getByTestId('review-request').boundingBox()).height>=44,'Зона касания запроса отзыва')
      assert.equal(await page.getByTestId('review-request').isDisabled(),true)
      await page.getByTestId('review-completed-confirm').click()
      await page.getByTestId('review-request').click()
      await page.getByTestId('review-share-panel').waitFor()
      await page.getByTestId('review-copy-link').click()
      await page.waitForFunction(()=>window.qa.clipboard.length===1)
      assert.equal(await page.evaluate(()=>window.qa.calls.filter(call=>call.body?.action==='sent').length),0)
      await page.getByTestId('review-mark-sent').click()
      await page.getByText('Отправка отмечена',{exact:true}).waitFor()
      await page.getByRole('button',{name:'Отключить ссылку',exact:true}).click()
      await page.getByTestId('review-revoke-confirm').click()
      await page.getByText('Ссылка отключена',{exact:true}).waitFor()
      assert.equal(await page.getByTestId('review-share-panel').count(),0)
      await page.getByRole('button',{name:'Создать новую ссылку',exact:true}).click()
      await page.getByTestId('review-share-panel').waitFor()
      await page.waitForFunction(()=>window.qa.calls.some(call=>call.body?.action==='renew'))
      assert.equal(await page.evaluate(()=>window.qa.calls.filter(call=>call.body?.action==='sent').length),1)
      await page.screenshot({path:path.join(output,`event-${mode}-${width}.png`),fullPage:true})
      await page.goto(origin+`/?mode=${mode}&surface=page`)
      await page.getByLabel('Публичное имя',{exact:true}).fill('Студия Полёт — длинное публичное имя')
      await page.getByLabel('Специализация',{exact:true}).fill('Съёмка праздников и семейных мероприятий')
      await page.getByRole('button',{name:'Глубокая',exact:true}).click()
      await page.getByRole('button',{name:'Сиреневый',exact:true}).click()
      assert.match(await page.getByTestId('review-link-preview').innerText(),/Студия Полёт/)
      await page.evaluate(()=>window.qa.failPost=true)
      await page.getByTestId('review-page-save').click()
      await page.getByText('Не удалось сохранить оформление. Повторите попытку',{exact:true}).waitFor()
      assert.match(await page.getByLabel('Публичное имя',{exact:true}).inputValue(),/Студия Полёт/)
      await page.getByTestId('review-logo-upload').click()
      await page.getByText('Изображение загружено. Сохраните оформление',{exact:true}).waitFor()
      await page.getByTestId('review-page-save').click()
      await page.getByText('Оформление сохранено',{exact:true}).waitFor()
      assert.ok((await page.getByTestId('review-page-save').boundingBox()).height>=44,'Зона касания сохранения')
      await page.getByLabel('Публичное имя',{exact:true}).scrollIntoViewIfNeeded()
      await page.screenshot({path:path.join(output,`settings-${mode}-${width}.png`),fullPage:true})
      await page.getByRole('button',{name:'Тёмный предпросмотр',exact:true}).click()
      await page.getByTestId('review-page-preview').scrollIntoViewIfNeeded()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      await page.screenshot({path:path.join(output,`page-${mode}-${width}.png`),fullPage:true})
      assert.deepEqual(errors,[],`${mode}/${width}: ошибки console`)
      results.push({тема:mode,ширина:width,высота:520,сценарии:['список/период/пагинация','заметка/сбой/повтор','создание/copy/sent','оформление/upload/read-back'],горизонтальное_переполнение:false,ошибки:errors})
      await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2))
      await context.close()
    }
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2))
  }catch(error){
    await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({ошибка:error.message,ошибки_консоли:activeErrors},null,2))
    if(activePage && !activePage.isClosed()){
      await fs.writeFile(path.join(output,'failure.txt'),await activePage.locator('body').innerText())
      await activePage.screenshot({path:path.join(output,'failure.png'),fullPage:true})
    }
    console.error('Диагностика браузерного стенда:',activeErrors)
    throw error
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})
