const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const crypto = require('node:crypto')
const mongoose = require('mongoose')
const sharp = require('sharp')
const { readFileSync } = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const FIXTURE_ENV = { NEXTAUTH_SECRET: 'isolated-review-fixture-secret', DOMAIN: 'http://127.0.0.1' }
function load(file, mocks) {
  const {code} = transformSync(readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'ecmascript'},target:'es2022'},module:{type:'commonjs'}})
  const module={exports:{}}
  new Function('require','module','exports','process',code)((name)=>{if(!(name in mocks))throw new Error(`Не задана зависимость: ${name}`);return mocks[name]},module,module.exports,{env:FIXTURE_ENV})
  return module.exports
}
const same = (a,b) => a == null && b == null || String(a)===String(b)
function matches(row,query) {
  return Object.entries(query).every(([key,value])=>{
    if(key==='$or')return value.some(q=>matches(row,q))
    const actual=row[key]
    if(value && typeof value==='object' && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId))return Object.entries(value).every(([op,want])=>{
      if(op==='$ne')return !same(actual,want)
      if(op==='$in')return want.some(v=>same(actual,v))
      if(op==='$gt')return actual>want
      if(op==='$gte')return actual>=want
      if(op==='$lt')return actual<want
      return false
    })
    return same(actual,value)
  })
}
function model(rows,queries,label) {
  function query(filter,one=false) {
    queries.push({label,filter});let order=null,skip=0,limit=Infinity
    return { select(){return this},sort(value){order=value;return this},skip(value){skip=value;return this},limit(value){limit=value;return this},async lean(){
      let result=rows.filter(row=>matches(row,filter))
      if(order)result.sort((a,b)=>{for(const [key,dir]of Object.entries(order)){if(a[key]>b[key])return dir;if(a[key]<b[key])return -dir}return 0})
      result=result.slice(skip,skip+limit)
      return structuredClone(one?result[0] || null:result)
    } }
  }
  return {find:filter=>query(filter),findOne:filter=>query(filter,true),findById:id=>query({_id:id},true),exists:async filter=>rows.some(row=>matches(row,filter)),countDocuments:async filter=>rows.filter(row=>matches(row,filter)).length,init:async()=>{},create:async row=>{
    const existing=rows.find(r=>same(r.tenantId,row.tenantId)&&same(r.eventId,row.eventId));if(existing){const error=new Error('Дубль');error.code=11000;throw error}
    const normalized={...row,_id:String(row._id),eventId:String(row.eventId),createdAt:new Date(),submittedAt:null,readAt:null,revokedAt:null,sentAt:null,note:'',comment:''};rows.push(normalized);return normalized
  },findOneAndUpdate(filter,update,options={}) {
    queries.push({label,filter});let row=rows.find(row=>matches(row,filter))
    if(!row && options.upsert){row={...filter};rows.push(row)}
    if(row)Object.assign(row,update.$set)
    return {select(){return this},lean:async()=>structuredClone(row || null)}
  }}
}

test('Изолированный HTTP: реальные review handlers, подпись mobile, все методы, фильтры, capability и upload',async(t)=>{
  await loadBindings()
  const A='aaaaaaaaaaaaaaaaaaaaaaaa',B='bbbbbbbbbbbbbbbbbbbbbbbb',C='cccccccccccccccccccccccc',E='eeeeeeeeeeeeeeeeeeeeeeee',S='111111111111111111111111'
  const queries=[],rows=[],events=[{_id:E,tenantId:A,clientId:C,status:'closed',eventDate:new Date('2026-01-01'),eventType:'Работа'}],clients=[{_id:C,tenantId:A,firstName:'Клиент'}]
  const users=[{_id:A,tenantId:A,firstName:'Исполнитель',role:'user'},{_id:B,tenantId:B,role:'user'}],sessions=[{_id:S,userId:A,expiresAt:new Date(Date.now()+3600000),revokedAt:null}]
  const settings=[],state={allowed:true,cookieCalls:0,uploads:0,pushes:0}
  const models={'@models/ClientReviews':model(rows,queries,'reviews'),'@models/Events':model(events,queries,'events'),'@models/Clients':model(clients,queries,'clients'),'@models/Users':model(users,queries,'users'),'@models/MobileSessions':model(sessions,queries,'sessions'),'@models/SiteSettings':model(settings,queries,'settings')}
  const secret=()=>FIXTURE_ENV.NEXTAUTH_SECRET
  const tokens=load('server/mobile/tokens.js',{crypto,'../getAuthSecret.js':secret})
  const sessionStore=load('server/mobile/sessionStore.js',{})
  const dbConnect=async()=>{}
  const auth=load('server/mobile/auth.js',{crypto,...models,'@server/dbConnect':dbConnect,'@server/getAuthSecret':secret,'./tokens':tokens,'./sessionStore.js':sessionStore})
  const cookie=async()=>{state.cookieCalls++;return {user:users[1],tenantId:B}}
  const requestContext=load('server/getRequestContext.js',{'@server/getTenantContext':cookie,'@server/mobile/auth':auth}).default
  const helpers=await import('../../helpers/clientReviews.mjs'),appearanceHelpers=await import('../../helpers/reviewAppearance.mjs')
  const base={...models,crypto,mongoose,'node:crypto':crypto,'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},'@server/dbConnect':dbConnect,'@server/getTenantContext':cookie,'@server/getRequestContext':requestContext,'@server/getUserTariffAccess':async()=>({allowClientReviews:state.allowed}),'@helpers/clientReviews.mjs':helpers,'@helpers/reviewAppearance.mjs':appearanceHelpers,'@helpers/getPersonFullName':user=>user.firstName || '',sharp,'@server/escalionCloud':{uploadFilesToEscalionCloud:async({directory,files})=>{state.uploads++;assert.ok(directory.startsWith(`vedelo/${A}/review-page/logo/`));assert.equal(files[0].type,'image/webp');return [{url:`https://cloud.escalion.ru/uploads/${directory}/logo.webp`}]}}}
  const reviews=load('server/clientReviews.js',base);base['@server/clientReviews']=reviews
  const appearances=load('server/reviewAppearance.js',base);base['@server/reviewAppearance']=appearances
  const list=load('app/api/client-reviews/route.js',base),detail=load('app/api/client-reviews/[id]/route.js',base),statuses=load('app/api/client-reviews/statuses/route.js',base),page=load('app/api/site/review-page/route.js',base),logo=load('app/api/site/review-page/logo/route.js',base)
  const publicRoute=load('app/api/public/client-reviews/[id]/route.js',{...base,'@server/rateLimit':{checkRateLimit:async()=>({ok:true})},'@server/pushNotifications':{sendPushToTenant:async()=>{state.pushes++}}})
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,`http://127.0.0.1:${server.address().port}`)
      const body=[];for await(const chunk of req)body.push(chunk)
      const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body:Buffer.concat(body)}:{})})
      let route,params={}
      if(url.pathname==='/api/client-reviews')route=list
      else if(url.pathname==='/api/client-reviews/statuses')route=statuses
      else if(url.pathname==='/api/site/review-page')route=page
      else if(url.pathname==='/api/site/review-page/logo')route=logo
      else if(url.pathname.startsWith('/api/public/client-reviews/')){route=publicRoute;params.id=url.pathname.split('/').pop()}
      else {route=detail;params.id=url.pathname.split('/').pop()}
      const response=await route[req.method](request,{params:Promise.resolve(params)})
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())
    }catch{res.writeHead(500);res.end('Ошибка изолированного стенда')}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin=`http://127.0.0.1:${server.address().port}`
  const token=tokens.createMobileAccessToken({user:users[0],tenantId:A,sessionId:S}).token
  const send=async(path,method='GET',body,credential=token)=>{
    const response=await fetch(origin+path,{method,headers:{...(credential?{Authorization:`Bearer ${credential}`}:{cookie:'fixture-web'}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})})
    return {status:response.status,body:await response.json(),headers:response.headers}
  }
  try{
    let created
    await t.test('Создание: серверный tenant, read-back, список без секрета и web совместимость',async()=>{
      created=await send('/api/client-reviews','POST',{eventId:E,tenantId:B,confirmedCompleted:false})
      assert.equal(created.status,200);assert.ok(created.body.data.url.includes('#'))
      assert.equal(rows[0].tenantId,A)
      const listResponse=await send(`/api/client-reviews?eventId=${E}`)
      assert.equal(listResponse.body.data.items[0]._id,created.body.data._id)
      assert.equal(listResponse.body.data.items[0].url,undefined);assert.equal(listResponse.body.data.items[0].nonce,undefined);assert.equal(listResponse.body.data.items[0].tokenHash,undefined)
      assert.equal(listResponse.headers.get('cache-control'),'private, no-store')
      assert.equal((await send('/api/client-reviews','GET',null,null)).body.data.total,0)
    })
    const id=created.body.data._id,cap=created.body.data.url.split('#')[1]
    await t.test('Все приватные методы: invalid Bearer с web-cookie, чужой tenant, выключенный тариф',async()=>{
      const foreignEvent='ffffffffffffffffffffffff'
      events.push({_id:foreignEvent,tenantId:B,clientId:C,status:'closed'})
      const foreignId='222222222222222222222222'
      rows.push({_id:foreignId,tenantId:B,eventId:foreignEvent,clientId:C,createdAt:new Date(),expiresAt:new Date(Date.now()+3600000)})
      const matrix=[['/api/client-reviews','GET',undefined,false],['/api/client-reviews','POST',{eventId:foreignEvent,confirmedCompleted:true},true],['/api/client-reviews/statuses','GET',undefined,false],...['link','renew','sent','revoke','read','note'].map(action=>[`/api/client-reviews/${foreignId}`,'PATCH',{action,note:'Заметка',tenantId:B},['link','renew','sent'].includes(action)]),['/api/site/review-page','GET',undefined,false],['/api/site/review-page','POST',{publicName:'Имя',tenantId:B},true],['/api/site/review-page/logo','POST',new FormData(),true]]
      for(const [path,method,body,gated] of matrix){
        for(const header of ['Bearer invalid','Bearer','bearer invalid','BEARER invalid']) {
          const response=await fetch(origin+path,{method,headers:{authorization:header,cookie:'fixture-web','Content-Type':'application/json'},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})})
          assert.equal(response.status,401,`${method} ${path} ${body?.action || ''}`)
        }
        state.allowed=false
        const off=await send(path,method,body)
        assert.equal(off.status,gated?403:method==='PATCH'?404:200)
        state.allowed=true
        if(method==='PATCH' || path==='/api/client-reviews' && method==='POST')assert.equal((await send(path,method,body)).status,404)
      }
      assert.equal(state.cookieCalls,1)
      const forged=tokens.createMobileAccessToken({user:users[0],tenantId:B,sessionId:S}).token
      assert.equal((await send('/api/client-reviews','GET',undefined,forged)).status,401)
      sessions[0].revokedAt=new Date();assert.equal((await send('/api/client-reviews')).status,401);sessions[0].revokedAt=null
      users[0].archive=true;assert.equal((await send('/api/site/review-page')).status,401);users[0].archive=false
    })
    await t.test('Публичная capability: mobile Bearer не заменяет секрет; тариф не ломает старую ссылку, один ответ',async()=>{
      const path=`/api/public/client-reviews/${id}`
      assert.equal((await send(path)).status,404)
      assert.equal((await send(path,'GET',undefined,'invalid')).status,404)
      state.allowed=false
      const response=await send(path,'GET',undefined,cap)
      assert.equal(response.status,200);assert.deepEqual(Object.keys(response.body.data).sort(),['appearance','eventDate','performerName','submitted'])
      const first=await send(path,'POST',{rating:2,comment:'Текст клиента',tenantId:B},cap)
      assert.equal(first.status,200)
      assert.equal((await send(path,'POST',{rating:5,comment:'Подмена'},cap)).status,200)
      assert.equal(rows[0].rating,2);assert.equal(state.pushes,1)
      for(const action of ['note','read'])assert.equal((await send(`/api/client-reviews/${id}`,'PATCH',{action,note:'  Внутренняя заметка  '})).status,200)
      const reread=await send(`/api/client-reviews?eventId=${E}`)
      assert.equal(reread.body.data.items[0].note,'Внутренняя заметка');assert.ok(reread.body.data.items[0].readAt)
      state.allowed=true
    })
    await t.test('Период создания запроса и пагинация: 30 + 5, конечный день включён, чужой tenant исключён',async()=>{
      for(let i=0;i<35;i++)rows.push({_id:i.toString(16).padStart(24,'0'),tenantId:A,eventId:E,clientId:C,createdAt:new Date('2026-10-05T23:59:59Z'),expiresAt:new Date('2026-11-05'),rating:5,submittedAt:new Date('2026-10-06'),readAt:null,comment:'Отзыв',note:''})
      rows.push({_id:'333333333333333333333333',tenantId:B,eventId:E,clientId:C,createdAt:new Date('2026-10-05'),rating:5})
      const filter='/api/client-reviews?from=2026-10-05&to=2026-10-05&rating=5&unread=true'
      const first=await send(filter+'&page=0'),second=await send(filter+'&page=1')
      assert.equal(first.body.data.total,35);assert.equal(first.body.data.items.length,30);assert.equal(second.body.data.items.length,5)
      assert.equal(new Set([...first.body.data.items,...second.body.data.items].map(r=>r._id)).size,35)
      assert.equal((await send('/api/client-reviews?rating=6')).status,400)
      assert.equal((await send('/api/client-reviews?from=bad')).status,400)
      // Несуществующая дата не должна незаметно превратиться в март.
      assert.equal((await send('/api/client-reviews?from=2026-02-30')).status,400)
    })
    await t.test('Отправка/отзыв/перевыпуск: без опции только revoke, старый capability не восстанавливается',async()=>{
      const event2='444444444444444444444444'
      events.push({_id:event2,tenantId:A,clientId:C,status:'active',eventDate:new Date('2020-01-01')})
      assert.equal((await send('/api/client-reviews','POST',{eventId:event2,confirmedCompleted:false})).status,409)
      const next=await send('/api/client-reviews','POST',{eventId:event2,confirmedCompleted:true})
      assert.equal(next.status,200)
      const nextId=next.body.data._id,oldCap=next.body.data.url.split('#')[1],privatePath=`/api/client-reviews/${nextId}`,publicPath=`/api/public/client-reviews/${nextId}`
      assert.equal((await send(privatePath,'PATCH',{action:'sent'})).status,200)
      state.allowed=false
      for(const action of ['link','renew','sent'])assert.equal((await send(privatePath,'PATCH',{action})).status,403)
      assert.equal((await send(privatePath,'PATCH',{action:'revoke'})).status,200)
      assert.equal((await send(publicPath,'GET',undefined,oldCap)).status,410)
      state.allowed=true
      const renewed=await send(privatePath,'PATCH',{action:'renew'})
      assert.equal(renewed.status,200);assert.notEqual(renewed.body.data.url.split('#')[1],oldCap)
      assert.equal((await send(publicPath,'GET',undefined,oldCap)).status,404)
      const newCap=renewed.body.data.url.split('#')[1]
      assert.equal((await send(publicPath,'GET',undefined,newCap)).status,200)
      const row=rows.find(r=>r._id===nextId);row.expiresAt=new Date('2020-01-01')
      assert.equal((await send(publicPath,'GET',undefined,newCap)).status,410)
      assert.equal((await send(privatePath,'PATCH',{action:'renew'})).status,200)
      events.find(e=>e._id===event2).clientId='555555555555555555555555'
      assert.equal((await send(privatePath,'PATCH',{action:'link'})).status,410)
    })
    await t.test('Шесть публичных полей: save/read-back, чужие и внешние logo URL запрещены, defaults безопасны',async()=>{
      const input={publicName:'Студия',specialization:'Фотография',greeting:'Оцените работу',accent:'violet',cover:'deep',logoUrl:'',tenantId:B,phone:'Не публиковать',note:'Не публиковать'}
      assert.equal((await send('/api/site/review-page','POST',input)).status,200)
      const response=await send('/api/site/review-page');assert.deepEqual(Object.keys(response.body.data.reviewPage).sort(),['accent','cover','greeting','logoUrl','publicName','specialization'])
      assert.equal(settings[0].tenantId,A);assert.equal(response.body.data.reviewPage.publicName,'Студия')
      const publicResponse=await send(`/api/public/client-reviews/${id}`,'GET',undefined,cap)
      assert.equal(publicResponse.status,200)
      assert.deepEqual(Object.keys(publicResponse.body.data.appearance).sort(),['accent','cover','greeting','logoUrl','publicName','specialization'])
      assert.equal(JSON.stringify(publicResponse.body).includes('Внутренняя заметка'),false)
      assert.equal(JSON.stringify(publicResponse.body).includes('Текст клиента'),false)
      for(const url of ['https://outside.test/a.webp',`https://cloud.escalion.ru/uploads/vedelo/${B}/review-page/logo/00000000-0000-0000-0000-000000000000/logo.webp`])assert.equal((await send('/api/site/review-page','POST',{...input,logoUrl:url})).status,400)
      assert.equal((await send('/api/site/review-page','POST',{...input,publicName:'я'.repeat(81)})).status,400)
    })
    await t.test('Upload: multipart file → sharp → mock cloud, безопасный tenant путь и MIME/размер',async()=>{
      const png=await sharp({create:{width:16,height:16,channels:4,background:'#fff'}}).png().toBuffer()
      const form=new FormData();form.append('file',new File([png],'logo.png',{type:'image/png'}))
      const uploaded=await send('/api/site/review-page/logo','POST',form)
      assert.equal(uploaded.status,200);assert.ok(uploaded.body.data.url.includes(`/vedelo/${A}/`));assert.equal(state.uploads,1)
      const huge=new FormData();huge.append('file',new File([new Uint8Array(5*1024*1024+1)],'large.png',{type:'image/png'}))
      assert.equal((await send('/api/site/review-page/logo','POST',huge)).status,413)
      const bad=new FormData();bad.append('file',new File(['text'],'bad.png',{type:'image/png'}))
      assert.equal((await send('/api/site/review-page/logo','POST',bad)).status,400)
      state.allowed=false;assert.equal((await send('/api/site/review-page/logo','POST',form)).status,403);assert.equal(state.uploads,1);state.allowed=true
    })
  } finally {await new Promise(resolve=>server.close(resolve))}
})
