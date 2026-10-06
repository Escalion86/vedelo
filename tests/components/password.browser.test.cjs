const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

test('реальная форма PWA: установка и смена, обе темы, узкий и широкий экран', { timeout: 120000 }, async () => {
 const esbuild = require(process.env.ESBUILD_MODULE)
 const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
 const result = await esbuild.build({
  stdin: { contents: `import React, {useState,useRef} from 'react'; import {createRoot} from 'react-dom/client'; import factory from './layouts/modals/modalsFunc/changePasswordFunc'; import AppButton from './components/AppButton'; const Modal=factory().Children; function App(){const [title,setTitle]=useState('Пароль'),[name,setName]=useState('Сохранить'),[disabled,setDisabled]=useState(true);const confirm=useRef();return <main className="cabinet-canvas" style={{maxWidth:520,margin:'auto',padding:16}}><h1>{title}</h1><Modal setTitle={setTitle} setConfirmButtonName={setName} setDisableConfirm={setDisabled} setOnConfirmFunc={fn=>confirm.current=fn} closeModal={()=>window.closedCount=(window.closedCount||0)+1}/><AppButton disabled={disabled} onClick={()=>confirm.current?.()}>{name}</AppButton></main>}createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.js':'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'aliases', setup(build) {
    build.onResolve({filter:/^@helpers\/useSnackbar$/},()=>({path:'snackbar',namespace:'mock'}))
    build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'const snackbar={success:m=>window.successMessage=m,error:m=>window.errorMessage=m}; export default ()=>snackbar;'}))
    build.onResolve({filter:/^@(helpers|components)\//},args=>({path:path.resolve(args.path.slice(1)+(path.extname(args.path)?'':'.js'))}))
  }}]
 })
 const css=(await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('app/globals.css','utf8'),{from:path.resolve('app/globals.css')})).css
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`
 const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html)})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=await chromium.launch({headless:true})
 try {
  for(const width of [390,1365]) for(const dark of [false,true]){
   const page=await browser.newPage({viewport:{width,height:900}})
   const errors=[];page.on('pageerror',error=>errors.push(error.message))
   let hasPassword=false, posts=[]
   await page.route('**/api/auth/change-password',async route=>{
    const request=route.request()
    if(request.method()==='GET') return route.fulfill({json:{success:true,hasPassword}})
    const body=request.postDataJSON();posts.push(body)
    if(hasPassword && body.currentPassword!=='first-pass-123') return route.fulfill({status:400,json:{success:false,error:'Текущий пароль указан неверно'}})
    hasPassword=true;return route.fulfill({json:{success:true,mode:'set',hasPassword:true}})
   })
   await page.goto(`http://127.0.0.1:${server.address().port}`)
   if(dark) await page.evaluate(()=>document.body.classList.add('theme-dark'))
   await page.getByRole('button',{name:'Установить пароль',exact:true}).waitFor()
   assert.equal(await page.locator('input[type=password]').count(),2)
   await page.locator('input[type=password]').nth(0).fill('first-pass-123')
   await page.locator('input[type=password]').nth(1).fill('other-pass-123')
   await page.getByText('Пароли не совпадают',{exact:true}).waitFor()
   assert.equal(await page.getByRole('button',{name:'Установить пароль',exact:true}).isDisabled(),true)
   await page.locator('input[type=password]').nth(1).fill('first-pass-123')
   await page.getByRole('button',{name:'Установить пароль',exact:true}).click()
   await page.getByRole('button',{name:'Сменить пароль',exact:true}).waitFor()
   assert.equal(await page.locator('input[type=password]').count(),3)
   assert.equal(posts.length,1);assert.equal(posts[0].currentPassword,'')
   assert.equal(await page.evaluate(()=>window.successMessage),'Пароль установлен')
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
   await page.locator('input[type=password]').nth(0).fill('wrong-pass-123')
   await page.locator('input[type=password]').nth(1).fill('next-pass-123')
   await page.locator('input[type=password]').nth(2).fill('next-pass-123')
   await page.getByRole('button',{name:'Сменить пароль',exact:true}).click()
   await page.waitForFunction(()=>window.errorMessage==='Текущий пароль указан неверно')
   await page.locator('input[type=password]').nth(0).fill('first-pass-123')
   await page.locator('input[type=password]').nth(1).fill('next-pass-123')
   await page.locator('input[type=password]').nth(2).fill('next-pass-123')
   await page.getByRole('button',{name:'Сменить пароль',exact:true}).click()
   await page.waitForFunction(()=>window.successMessage==='Пароль изменён')
   assert.equal(posts.length,3);assert.deepEqual(errors,[])
   console.log(`Проверено: ширина ${width}, тема ${dark?'тёмная':'светлая'}`)
   const filename=path.join(process.env.TMPDIR,'vedelo-password-form.html')
   if(width===390&&!dark) await fs.writeFile(filename,await page.content())
   await page.close()
  }
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
})
