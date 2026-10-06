const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http')
test('MAX профиля: реальное поле, сохранение/очистка, кнопка ссылки и телефона, обе темы и ширины',{timeout:120000},async()=>{
 const esbuild=require(process.env.ESBUILD_MODULE),{chromium}=require(process.env.PLAYWRIGHT_MODULE)
 const user={_id:'u1',firstName:'Тестовый профиль',email:'',phone:null,whatsapp:null,telegram:'',vk:'',instagram:'',images:[],max:''}
 const result=await esbuild.build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {useAtomValue} from 'jotai';import logged from '@state/atoms/loggedUserAtom';import Profile from './layouts/content/ProfileContent';import Contacts from './components/ContactsIconsButtons';function App(){const u=useAtomValue(logged);return <main className="cabinet-canvas" style={{maxWidth:900,margin:'auto',padding:12}}><Profile/><section aria-label="Контакты пользователя"><Contacts user={u} withTitle forceMax={false}/></section></main>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',loader:{'.js':'jsx'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'aliases',setup(b){
 b.onResolve({filter:/^@state\//},a=>({path:a.path,namespace:'mock'}))
 b.onResolve({filter:/^@components\/(InputImages|PhoneInput|ClientChatButton|NovofonCallButton)$/},a=>({path:a.path,namespace:'mock'}))
 b.onResolve({filter:/^@helpers\/(useErrors|useSnackbar)$/},a=>({path:a.path,namespace:'mock'}))
 b.onLoad({filter:/.*/,namespace:'mock'},a=>{
 let contents='export default ()=>null;'
 if(a.path.includes('loggedUserAtom'))contents=`import {atom} from 'jotai';export default atom(${JSON.stringify(user)});`
 else if(a.path.includes('usersAtom'))contents=`import {atom} from 'jotai';export default atom([]);`
 else if(a.path.includes('itemsFuncAtom'))contents=`import {atom} from 'jotai';export default atom({user:{set:async u=>{window.saved=u;return u;}}});`
 else if(a.path.includes('modalsFuncAtom'))contents=`import {atom} from 'jotai';export default atom({});`
 else if(a.path==='@state/atoms')contents=`export {default as modalsFuncAtom} from '@state/atoms/modalsFuncAtom';`
 else if(a.path.includes('useErrors'))contents=`import {useState} from 'react';export default ()=>{const [e,s]=useState({});return [e,()=>false,x=>s(p=>({...p,...x})),k=>s(p=>{const n={...p};delete n[k];return n}),()=>s({})];}`
 else if(a.path.includes('useSnackbar'))contents='export default ()=>({success(){},warning(){},error(){}});'
 return {contents,loader:'js',resolveDir:process.cwd()}
 })
 b.onResolve({filter:/^@(helpers|components)\//},a=>({path:path.resolve(a.path.slice(1)+(path.extname(a.path)?'':'.js'))}))
 }}]})
 const css=(await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('app/globals.css','utf8'),{from:path.resolve('app/globals.css')})).css
 const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>window.open=u=>window.opened=u;window.copied='';navigator.clipboard.writeText=async t=>window.copied=t;</script><script>${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`
 const server=http.createServer((q,r)=>r.end(html));await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true})
 try{for(const width of [390,1365])for(const dark of [false,true]){
 const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);if(dark)await page.evaluate(()=>document.body.classList.add('theme-dark'))
 const input=page.getByPlaceholder('Ссылка или номер телефона'),save=page.getByRole('button',{name:'Сохранить',exact:true});await input.waitFor();await input.fill('https://evil.example');await save.click();await page.getByText('Введите ссылку MAX или номер телефона',{exact:true}).first().waitFor();assert.equal(await page.evaluate(()=>window.saved),undefined)
 await input.fill('max.ru/u/test');await save.click();const link=page.getByRole('button',{name:'Открыть контакт в MAX',exact:true});await link.waitFor();assert.equal(await page.evaluate(()=>window.saved.max),'https://max.ru/u/test');await link.click();assert.equal(await page.evaluate(()=>window.opened),'https://max.ru/u/test')
 await input.fill('8 (999) 123-45-67');await save.click();const phone=page.getByRole('button',{name:'Скопировать +79991234567 и открыть MAX',exact:true});await phone.waitFor();await phone.click();await page.waitForFunction(()=>window.copied==='+79991234567');assert.equal(await page.evaluate(()=>window.copied),'+79991234567');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await input.fill('');await save.click();await page.waitForFunction(()=>window.saved.max==='');assert.equal(await page.getByRole('button',{name:/открыть MAX|контакт в MAX/}).count(),0);assert.deepEqual(errors,[]);console.log(`MAX: ${width}, ${dark?'тёмная':'светлая'}`);await page.close()
 }}finally{await browser.close();await new Promise(r=>server.close(r))}
})
