const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

test('Подсказки настоящих форм и вложенных модалок: мышь, клавиатура, темы и ширина', { timeout: 600000 }, async () => {
  const esbuild = require(process.env.ESBUILD_MODULE)
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
  const bundle = await esbuild.build({
    stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {Provider,createStore} from 'jotai';
      import modalsAtom from './state/atoms/modalsAtom';
      import itemsFuncAtom from './state/atoms/itemsFuncAtom';
      import tariffFunc from './layouts/modals/modalsFunc/tariffFunc';
      import ModalsPortal from './layouts/modals/ModalsPortal';
      import Compact from './components/CompactEventForm';
      import Section from './components/CompactEventSection';
      import Input from './components/Input';
      import Textarea from './components/Textarea';
      import IconCheckBox from './components/IconCheckBox';
      import Contacts from './components/OtherContactsPicker';
      import FieldHelp from './components/FieldHelp';
      import help from './helpers/fieldHelp.json';
      const store=createStore(); window.actions=0;
      store.set(itemsFuncAtom,{tariff:{set:()=>{window.actions++}}});
      window.openTariff=()=>store.set(modalsAtom,[{id:'tariff',props:tariffFunc()}]);
      function Classic(){return <form onSubmit={e=>{e.preventDefault();window.actions++}}>
        <Textarea label="Описание" help={help['event.description']} value="" onChange={()=>window.actions++}/>
        <Contacts onAddContact={()=>window.actions++}/>
        <IconCheckBox label="Импорт из файла проверен" help={help['event.importChecked']} onClick={()=>window.actions++}/>
        <Section title="Дата и время" help={help['event.dates']}><p>Содержание раздела</p></Section>
      </form>}
      function Main(){const [value,setValue]=React.useState('Несохранённая заявка');return <div><Input label="Название заявки" value={value} onChange={setValue}/>
        <button onClick={()=>window.openNested()}>Открыть вложенное окно</button><Classic/></div>}
      function Nested(){const [value,setValue]=React.useState('Не сохранено');return <div><Input label="Имя клиента" value={value} onChange={setValue} help={help['event.client']}/><Classic/></div>}
      const main={id:'main',props:{title:'Создание заявки',Children:Main}};
      window.openMain=()=>store.set(modalsAtom,[main]);
      window.openNested=()=>store.set(modalsAtom,[main,{id:'nested',props:{title:'Выбор клиента',Children:Nested}}]);
      window.closeTop=()=>store.set(modalsAtom,current=>current.slice(0,-1));
      function App(){return <Provider store={store}><main className="cabinet-canvas" style={{maxWidth:900,margin:'auto',padding:16}}>
        <h1>Проверка подсказок</h1><Classic/>
        <Compact fields={{description:<Textarea label="Запрос клиента" help={help['event.description']}/>,otherContacts:<Contacts/>}} errors={{}} additionalEvents={[]} otherContacts={[]} documents={[]} services={[]} servicesIds={[]} status="draft" statusLabel="Заявка" isNew onSelectClient={()=>window.actions++}/>
      </main><section aria-label="Каталог подсказок" style={{padding:16}}>{Object.entries(help).map(([key,text])=><div key={key}><span>{key}</span><FieldHelp label={key} text={text}/></div>)}</section><ModalsPortal/></Provider>}
      createRoot(document.getElementById('root')).render(<App/>);
    ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [{ name: 'aliases', setup(build) {
      build.onResolve({filter:/^(@state\/atoms$|next\/navigation$)/}, a=>({path:a.path,namespace:'context'}))
      build.onLoad({filter:/.*/,namespace:'context'}, a=>({contents:a.path==='next/navigation' ? 'export const useRouter=()=>({refresh(){}})' : 'import {atom} from "jotai"; export const modalsFuncAtom=atom({confirm(){}})',resolveDir:process.cwd(),loader:'jsx'}))
      build.onResolve({filter:/^@(state|layouts|components|helpers)\//},a=>({path:path.resolve(a.path.slice(1)+(path.extname(a.path)?'':'.js'))}))
    }}],
  })
  const css=(await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('app/globals.css','utf8'),{from:path.resolve('app/globals.css')})).css
  const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`
  const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html)})
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined})
  try {
    for(const width of [390,1365]) for(const dark of [false,true]) {
      const page=await browser.newPage({viewport:{width,height:900}})
      const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
      await page.goto(`http://127.0.0.1:${server.address().port}`)
      await page.evaluate(dark=>document.body.classList.toggle('theme-dark',dark),dark)
      const description=page.getByRole('button',{name:'Подсказка: Описание',exact:true}).first()
      await description.click();await page.getByRole('tooltip').waitFor()
      assert.equal(await description.getAttribute('aria-expanded'),'true')
      assert.equal(await page.evaluate(()=>window.actions),0)
      const bounds=await page.getByRole('tooltip').boundingBox()
      assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width)
      await description.press('Escape');await page.getByRole('tooltip').waitFor({state:'hidden'})
      await description.press('Enter');await page.getByRole('tooltip').waitFor()
      await page.getByRole('heading',{name:'Проверка подсказок'}).click();await page.getByRole('tooltip').waitFor({state:'hidden'})
      await description.focus();await description.press('Space');await page.getByRole('tooltip').waitFor()
      await description.press('Escape');await page.getByRole('tooltip').waitFor({state:'hidden'})
      const section=page.locator('main > form .compact-event-section').first()
      assert.equal(await section.getAttribute('open'),null)
      const sectionHelp=page.getByRole('button',{name:'Подсказка: Дата и время',exact:true}).first()
      const arrow=section.locator('.compact-event-chevron')
      const helpBox=await sectionHelp.boundingBox()
      const arrowBox=await arrow.boundingBox()
      const summaryBox=await section.locator('summary').boundingBox()
      assert.ok(helpBox.x+helpBox.width<=arrowBox.x,'Подсказка должна находиться слева от стрелки')
      assert.ok(Math.abs(arrowBox.x+arrowBox.width-summaryBox.x-summaryBox.width)<1,'Стрелка должна оставаться у правого края')
      await sectionHelp.click()
      await page.getByRole('tooltip').waitFor();assert.equal(await section.getAttribute('open'),null)
      await page.getByRole('button',{name:'Подсказка: Дата и время',exact:true}).first().press('Escape')
      await section.locator('summary').click()
      assert.notEqual(await section.getAttribute('open'),null)
      const openedHelp=await sectionHelp.boundingBox()
      const openedArrow=await arrow.boundingBox()
      assert.ok(openedHelp.x+openedHelp.width<=openedArrow.x,'В раскрытом разделе подсказка остаётся слева')
      await section.locator('summary').click()
      for(const trigger of await page.locator('.compact-event-form').getByRole('button',{name:/^Подсказка:/}).all()){
        const wrapper=trigger.locator('xpath=ancestor::div[details][1]')
        if(await wrapper.count()){
          const helpRect=await trigger.boundingBox()
          const arrowRect=await wrapper.locator('.compact-event-chevron').boundingBox()
          assert.ok(helpRect.x+helpRect.width<=arrowRect.x,'Порядок значков во всех разделах формы')
        }
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      assert.equal(await page.locator('button button, label button').count(),0)
      const catalog=JSON.parse(await fs.readFile('helpers/fieldHelp.json','utf8'))
      for(const [key,text] of (process.env.FIELD_HELP_SKIP_CATALOG ? [] : Object.entries(catalog))){
        const trigger=page.getByRole('button',{name:`Подсказка: ${key}`,exact:true})
        await trigger.click();const tip=page.getByRole('tooltip');await tip.waitFor()
        assert.equal(await tip.textContent(),text,key)
        const box=await tip.boundingBox();assert.ok(box.x>=0 && box.x+box.width<=width,key)
        await trigger.press('Escape');await tip.waitFor({state:'hidden'})
      }
      await page.evaluate(()=>window.openMain())
      const field=page.getByRole('textbox',{name:'Название заявки'})
      await field.fill('Сохранность черновика')
      await page.getByRole('button',{name:'Открыть вложенное окно'}).click()
      await page.getByRole('textbox',{name:'Имя клиента'}).fill('Черновик клиента')
      const nestedHelp=page.getByRole('button',{name:'Подсказка: Имя клиента',exact:true})
      await nestedHelp.click();await page.getByRole('tooltip').waitFor()
      await nestedHelp.press('Escape');await page.getByRole('tooltip').waitFor({state:'hidden'})
      assert.equal(await page.getByRole('textbox',{name:'Имя клиента'}).inputValue(),'Черновик клиента')
      assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden')
      await page.evaluate(()=>window.closeTop())
      await page.getByRole('textbox',{name:'Имя клиента'}).waitFor({state:'detached'})
      assert.equal(await field.inputValue(),'Сохранность черновика')
      assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden')
      await page.evaluate(()=>window.closeTop());await field.waitFor({state:'detached'})
      await page.evaluate(()=>window.openTariff())
      const reviews=page.getByRole('checkbox',{name:'Отзывы клиентов'})
      await reviews.waitFor();const checked=await reviews.getAttribute('aria-checked')
      assert.equal(await page.locator('button button').count(),0)
      const reviewsHelp=page.getByRole('button',{name:'Подсказка: Отзывы клиентов'})
      await reviewsHelp.click();await page.getByRole('tooltip').waitFor()
      assert.equal(await reviews.getAttribute('aria-checked'),checked)
      await reviewsHelp.press('Escape');await page.getByRole('tooltip').waitFor({state:'hidden'})
      await page.evaluate(()=>window.closeTop());await reviews.waitFor({state:'detached'})
      assert.equal(await page.evaluate(()=>window.actions),0)
      assert.deepEqual(errors,[])
      if(process.env.QA_OUTPUT_DIR){
        await fs.mkdir(process.env.QA_OUTPUT_DIR,{recursive:true})
        await page.screenshot({path:path.join(process.env.QA_OUTPUT_DIR,`fields-${width}-${dark?'dark':'light'}.png`),fullPage:true})
        const snapshot=await page.evaluate(()=>{const clone=document.documentElement.cloneNode(true);clone.querySelector('[aria-label="Каталог подсказок"]')?.remove();clone.querySelectorAll('script').forEach(x=>x.remove());const originals=document.querySelectorAll('style');clone.querySelectorAll('style').forEach((x,i)=>x.textContent=[...(originals[i].sheet?.cssRules||[])].map(r=>r.cssText).join('\n'));return '<!doctype html>'+clone.outerHTML})
        await fs.writeFile(path.join(process.env.QA_OUTPUT_DIR,`fields-${width}-${dark?'dark':'light'}.html`),snapshot)
      }
      console.log(`Проверено: ${width}px, ${dark?'тёмная':'светлая'} тема; настоящие компоненты, клавиатура, вложенные окна, черновики, консоль`)
      await page.close()
    }
  }finally{await browser.close();await new Promise(r=>server.close(r))}
})
