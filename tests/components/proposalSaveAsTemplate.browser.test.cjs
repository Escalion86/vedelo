const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')

test('готовое КП → редактор нового шаблона → отмена, ошибка/повтор, сохранение и выбор шаблона', { timeout: 120000 }, async () => {
  // Browser plugin not available; используем локальный Playwright-стенд.
  process.env.ESBUILD_MODULE ||= path.resolve('mobile/node_modules/esbuild')
  const artifacts = process.env.QA_SCREENSHOT_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'vedelo-template-from-proposal-'))
  await fs.mkdir(artifacts, { recursive: true })
  const { js, css } = await require('./proposalEditorHarness.cjs').buildFixture(artifacts)
  const proposal = {
    _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', eventId: 'event', clientId: 'old-client', title: 'Предложение с интерактивом',
    version: 3, status: 'published', validUntil: '2020-01-01', selectedPackageId: 'main',
    appliedPackageId: 'main', appliedAt: '2026-10-25', publicUrl: 'https://vedelo.ru/old-secret',
    blocksSnapshot: [
      {id:'header',type:'header',enabled:true,contentHtml:'<p>Здравствуйте, {{client.firstName}}!</p>'},
      {id:'packages',type:'packages',title:'Программа',enabled:true},
      {id:'packagesIntro',type:'packagesIntro',enabled:false,contentHtml:'<p>Скрытое вступление</p>'},
      {id:'closing',type:'closing',enabled:true,contentHtml:'<p>Дата: {{event.date}}</p>'},
    ],
    packages: [{id:'main',title:'Интерактив',description:'Индивидуальный вариант',lines:[{serviceId:'dddddddddddddddddddddddd',title:'Выступление',description:'Особая цена',price:5000}],total:4000,manualTotal:true,recommended:true}],
    appearance: {theme:'blue',logoUrl:'https://cloud.escalion.ru/uploads/vedelo/aaaaaaaaaaaaaaaaaaaaaaaa/proposals/bbbbbbbbbbbbbbbbbbbbbbbb/logos/cccccccc-cccc-cccc-cccc-cccccccccccc/logo.webp'},
    mediaSnapshot:[{id:'image',kind:'image',url:'https://cloud.escalion.ru/test-photo.jpg',title:'Программа'}],
    messageText:'{{client.firstName}}, предложение: {{proposal.url}}',
    clientSnapshot:{firstName:'Старый клиент'},eventSnapshot:{date:'25.10.2026'},artistSnapshot:{firstName:'Иван'},
  }
  const sourceSnapshot = JSON.stringify(proposal)
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>КП в шаблон — проверка</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script>window.fixtureProposal=${JSON.stringify(proposal)};</script><script src="/bundle.js"></script></body></html>`
  const server = http.createServer((req,res) => {
    res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript; charset=utf-8':req.url==='/styles.css'?'text/css; charset=utf-8':'text/html; charset=utf-8')
    res.end(req.url==='/bundle.js'?js:req.url==='/styles.css'?css:html)
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const browser = await require('playwright').chromium.launch({headless:true,channel:'msedge'}).catch(error=>{server.close();throw error})
  try {
    for (const width of [390,1365]) for (const dark of [false,true]) {
      const page = await browser.newPage({viewport:{width,height:900}})
      const errors=[],writes=[]
      let templates=[], failSave=true
      page.on('pageerror',error=>errors.push(error.message))
      page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('503'))errors.push(message.text())})
      await page.route('https://cloud.escalion.ru/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}))
      await page.route('**/api/**',async route=>{
        const req=route.request(),url=new URL(req.url()).pathname
        if(req.method()!=='GET') {
          const body=req.postDataJSON();writes.push({url,body,method:req.method()})
          assert.equal(url,'/api/proposal-templates')
          assert.equal(req.method(),'POST')
          if(failSave) {failSave=false;return route.fulfill({status:503,json:{success:false,error:{message:'Не удалось сохранить тестовый шаблон'}}})}
          templates=[{...body,_id:'eeeeeeeeeeeeeeeeeeeeeeee'}]
          return route.fulfill({status:201,json:{success:true,data:templates[0]}})
        }
        const data=url==='/api/proposal-templates'?templates:url==='/api/events/event/proposals'?[proposal]:url===`/api/proposals/${proposal._id}`?proposal:[]
        return route.fulfill({json:{success:true,data}})
      })
      const origin=`http://127.0.0.1:${server.address().port}`
      await page.goto(`${origin}/?kind=list`)
      assert.equal(await page.title(),'КП в шаблон — проверка')
      await page.evaluate(dark=>document.body.classList.toggle('theme-dark',dark),dark)
      await page.locator('summary').filter({hasText:'Коммерческие предложения'}).click()
      const saveAs=page.getByRole('button',{name:'Сохранить как шаблон',exact:true})
      await saveAs.click()
      const name=page.getByRole('textbox',{name:'Название шаблона',exact:true})
      await name.waitFor()
      assert.equal(await name.inputValue(),proposal.title)
      await page.getByText('Шаблон подготовлен из КП.',{exact:false}).waitFor()
      assert.equal(writes.length,0)
      await page.getByRole('button',{name:'Отмена',exact:true}).last().click()
      await name.waitFor({state:'detached'})
      assert.equal(writes.length,0)
      await saveAs.click()
      await name.fill('Шаблон интерактива')
      await page.getByRole('button',{name:'Редактировать вариант 1',exact:true}).click()
      assert.equal(await page.getByRole('textbox',{name:'Название варианта',exact:true}).inputValue(),'Интерактив')
      assert.equal(await page.getByRole('textbox',{name:'Итого',exact:true}).inputValue(),'4000')
      await page.getByRole('button',{name:'Отмена',exact:true}).last().click()
      await page.getByRole('textbox',{name:'Название варианта',exact:true}).waitFor({state:'detached'})
      if(width===390) await page.screenshot({path:path.join(artifacts,`template-from-proposal-${dark?'dark':'light'}.png`)})
      const save=page.getByRole('button',{name:'Сохранить',exact:true})
      await save.click()
      await page.getByText('Не удалось сохранить тестовый шаблон',{exact:true}).waitFor()
      assert.equal(await name.inputValue(),'Шаблон интерактива')
      await save.click()
      await name.waitFor({state:'detached'})
      assert.equal(writes.length,2)
      const saved=writes[1].body
      assert.equal(saved.name,'Шаблон интерактива')
      assert.equal(saved.status,'active')
      assert.deepEqual(saved.defaults.packages,proposal.packages)
      assert.deepEqual(saved.appearance,proposal.appearance)
      assert.equal(saved.media[0].url,proposal.mediaSnapshot[0].url)
      assert.equal(saved.messageTemplate,proposal.messageText)
      assert.equal(saved.blocks.find(block=>block.type==='packagesIntro').enabled,false)
      assert.match(saved.blocks.find(block=>block.type==='header').contentHtml,/{{client.firstName}}/)
      for(const key of ['_id','eventId','clientId','clientSnapshot','eventSnapshot','publicUrl','selectedPackageId','appliedAt','validUntil'])assert.equal(saved[key],undefined,key)
      assert.equal(JSON.stringify(proposal),sourceSnapshot)
      await page.getByRole('button',{name:'Создать предложение',exact:true}).click()
      await page.getByText('Выбор шаблона предложения',{exact:true}).waitFor()
      assert.match(await page.locator('body').innerText(),/Шаблон интерактива/)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      assert.deepEqual(errors,[])
      await page.close()
    }
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
})
