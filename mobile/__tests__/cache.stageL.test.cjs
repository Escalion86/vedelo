'use strict'
const f = require('./proposals.stageL.fixture.cjs')
const {test,assert,React,act,database,cacheStore,storage,mutations,outbox,coordination,QueryClient,QueryClientProvider,EventOnlineSections,accepted,applied,data,reads,bounded,settle,finish,button,press,mount,unmount,session,writes}=f
const tasks=[{title:'task',done:true}]
async function setup() {
 await storage.clearLocalData()
 const saved={_id:'event',status:'active',syncStatus:'synced',description:'старые приватные данные',documents:[{name:'документ'}],contractSum:100,additionalEvents:[{title:'task',done:false}]}
 await cacheStore.upsertEntities('events',[saved])
 const query=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}})
 query.setQueryData(['cached-entities','events'],[saved])
 let patched=false
 f.setRequest(async(p,c)=>{
  if(c.method==='PATCH'){patched=true;return data(applied)}
  if(p==='/mobile/v1/billing')return data({currentTariff:{allowProposals:true}})
  if(p.startsWith('/client-reviews'))return data({items:[],total:0,allowClientReviews:false})
  if(p==='/events/event/proposals')return data([patched?applied:accepted])
  if(p==='/proposals/created')return data(applied)
  if(p==='/mobile/v1/events/event')return data({_id:'event',status:'active',contractSum:patched?900:100,servicesIds:['service'],syncVersion:7})
  return reads(p)
 })
 const s=await mount(React.createElement(QueryClientProvider,{client:query},React.createElement(EventOnlineSections,{event:saved})))
 await finish(); assert(button(s,'Применить выбранный вариант'))
 return {saved,query,s,close:async()=>{await unmount(s);query.clear()}}
}
const save=()=>mutations.saveLocalEntity({entityType:'events',entityId:'event',values:{additionalEvents:tasks}})
async function checkSaved() {
 const current=await cacheStore.getCachedEntity('events','event'), queue=await outbox.listPendingOperations(20)
 assert.deepEqual(current.additionalEvents,tasks,'Свежая задача сохраняется')
 assert.equal(current.syncStatus,'pending','Outbox и cache согласованы')
 assert.deepEqual(queue.find(o=>o.entityId==='event').payload.additionalEvents,tasks)
 assert.equal(writes().length,1,'Подтверждённый PATCH не повторяется')
 return current
}
for(const order of ['apply-first','save-first']) test('HIJ-APPLY-SAVE: оба порядка SQL/очереди '+order,{timeout:15000},async()=>{
 const x=await setup(), gate=f.delayTransaction()
 let saving
 try {
  if(order==='apply-first') {
   await press(x.s,'Применить выбранный вариант');await bounded(gate.entered.promise)
   saving=save(); await settle()
   assert.equal(database.prepare("SELECT count(*) n FROM outbox").get().n,0,'Локальное сохранение ждёт apply')
  } else {
   saving=save();await bounded(gate.entered.promise)
   await press(x.s,'Применить выбранный вариант')
  }
  gate.release.resolve();await bounded(saving);await finish()
  const current=await checkSaved()
  assert.deepEqual(current.documents,x.saved.documents)
  if(order==='apply-first')assert.equal(current.contractSum,900)
  console.log('НАБЛЮДЕНИЕ '+JSON.stringify({scenario:order,tasks:current.additionalEvents,syncStatus:current.syncStatus,contractSum:current.contractSum}))
 }finally{gate.release.resolve();await saving?.catch(()=>{});await x.close()}
})
for(const order of ['apply-first','clear-first'])test('HIJ-APPLY-CLEAR: оба порядка drain/clear '+order,{timeout:15000},async()=>{
 const x=await setup(),gate=f.delayTransaction();let clearing
 try {
  if(order==='apply-first') {
   await press(x.s,'Применить выбранный вариант');await bounded(gate.entered.promise)
   await act(async()=>{await session({_id:'новый-'+order,tenantId:'новый-tenant'});await settle()})
   clearing=storage.clearLocalData();await settle()
   assert.equal(database.prepare('SELECT count(*) n FROM entity_cache').get().n,1,'clear ждёт старую SQL')
  } else {
   clearing=storage.clearLocalData();await bounded(gate.entered.promise)
   await press(x.s,'Применить выбранный вариант')
   await act(async()=>{await session({_id:'новый-'+order,tenantId:'новый-tenant'});await settle()})
  }
  gate.release.resolve();await bounded(clearing)
  assert.equal(database.prepare('SELECT count(*) n FROM entity_cache').get().n,0)
  const fresh=await bounded(mutations.saveLocalEntity({entityType:'events',values:{title:'данные новой сессии'}}))
  await finish()
  assert.equal(await cacheStore.getCachedEntity('events','event'),null,'Старый tenant не воскресает')
  assert.equal((await cacheStore.getCachedEntity('events',fresh._id)).title,'данные новой сессии')
  assert.equal(database.prepare("SELECT count(*) n FROM entity_cache WHERE entity_type LIKE '__local_id_map:%'").get().n,0)
  assert.equal((await outbox.listPendingOperations(20)).length,1)
  assert.equal(writes().length,1)
 }finally{gate.release.resolve();await clearing?.catch(()=>{});await x.close()}
})
test('HIJ-APPLY-SAVE: SELECT-order без transaction gate',{timeout:15000},async()=>{
 const x=await setup(),gate=f.delaySelect();let saving
 try {
  await press(x.s,'Применить выбранный вариант');const row=await bounded(gate.entered.promise)
  assert.equal(JSON.parse(row.payload).additionalEvents[0].done,false,'Реальная SQL уже прочитала прежнюю задачу')
  saving=save();await settle()
  assert.equal(database.prepare('SELECT count(*) n FROM outbox').get().n,0,'Save остаётся в очереди до возврата SELECT')
  gate.release.resolve();await bounded(saving);await finish()
  await checkSaved()
  console.log('НАБЛЮДЕНИЕ '+JSON.stringify({scenario:'SELECT-order',transactionGateUsed:false,actualOldTasks:JSON.parse(row.payload).additionalEvents,currentTasks:(await cacheStore.getCachedEntity('events','event')).additionalEvents}))
 }finally{gate.release.resolve();await saving?.catch(()=>{});await x.close()}
})
for(const action of ['save','clear'])test('readback: первая identity await до очереди / '+action,{timeout:15000},async()=>{
 const x=await setup(),gate=f.gate();let once=true
 // После PATCH/readback feature capture завершён; задерживаем именно первый
 // storage getStoredUser по выполненному GET работы, не подменяя identity.
 const prior=reads
 let armed=false
 f.setRequest(async(p,c)=>{
  if(c.method==='PATCH')return data(applied)
  if(p==='/proposals/created')return data(applied)
  if(p==='/mobile/v1/events/event'){
   // Feature API ещё проверит identity несколько раз. Storage capture определяется
   // стеком platform seam, сами реализации остаются реальными.
   armed=true;return data({_id:'event',status:'active',contractSum:900})
  }
  if(p==='/events/event/proposals')return data([accepted])
  return prior(p)
 })
 f.setRead(async key=>{if(armed&&once&&key==='artistcrm_mobile_user'&&new Error().stack.includes('localEntityIdentity')){once=false;gate.entered.resolve();await gate.release.promise}})
 try {
  await press(x.s,'Применить выбранный вариант');await bounded(gate.entered.promise)
  if(action==='save')await bounded(save())
  else await bounded(storage.clearLocalData())
  gate.release.resolve();await finish()
  if(action==='save')await checkSaved()
  else assert.equal(await cacheStore.getCachedEntity('events','event'),null)
 }finally{gate.release.resolve();f.setRead(null);await x.close()}
})
for(const order of ['delete-first','apply-first'])test('readback не восстанавливает удалённую работу / '+order,{timeout:15000},async()=>{
 const x=await setup(),gate=f.delayTransaction();let deleting
 try {
  if(order==='apply-first'){
   await press(x.s,'Применить выбранный вариант');await bounded(gate.entered.promise)
   deleting=mutations.deleteLocalEntity('events','event')
  }else{
   // Очередь занята delete до cache DELETE, без подмены delete helper.
   const barrier=f.gate()
   const owning=coordination.withLocalEntityWrite(async()=>{barrier.entered.resolve();await barrier.release.promise})
   // Этот порядок не использует transaction pause: снимем неиспользованный gate.
   gate.release.resolve()
   deleting=mutations.deleteLocalEntity('events','event');await bounded(barrier.entered.promise)
   await press(x.s,'Применить выбранный вариант');barrier.release.resolve();await bounded(owning)
  }
  gate.release.resolve();await bounded(deleting);await finish()
  assert.equal(await cacheStore.getCachedEntity('events','event'),null)
  assert.equal((await outbox.listPendingOperations(20)).find(o=>o.entityId==='event').method,'delete')
  assert.equal(writes().length,1)
 }finally{gate.release.resolve();await deleting?.catch(()=>{});await x.close()}
})
test('readback отклоняет несинхронизированный outbox даже при synced cache',{timeout:15000},async()=>{
 const x=await setup()
 try {
  await outbox.enqueueOperation({entityType:'events',entityId:'event',method:'update',payload:{additionalEvents:tasks},attachments:[]})
  await press(x.s,'Применить выбранный вариант');await finish()
  assert.equal((await cacheStore.getCachedEntity('events','event')).contractSum,100)
  assert.deepEqual((await outbox.listPendingOperations(20))[0].payload.additionalEvents,tasks)
  assert.equal(writes().length,1)
 }finally{await x.close()}
})
test('readback recovery после pending: повторное чтение без нового PATCH',{timeout:15000},async()=>{
 const x=await setup()
 try {
  await save();await press(x.s,'Применить выбранный вариант');await finish()
  assert(button(x.s,'Повторить чтение применённой работы'))
  // Моделируем только входящий подтверждённый серверный снимок после sync;
  // публикация recovery снова проходит настоящий helper/cache/queue.
  for (const op of await outbox.listPendingOperations(20)) await outbox.updateOperationStatus(op.operationId, 'synced')
  await cacheStore.upsertEntities('events',[{...await cacheStore.getCachedEntity('events','event'),syncStatus:'synced'}])
  await press(x.s,'Повторить чтение применённой работы');await finish()
  const current=await cacheStore.getCachedEntity('events','event')
  assert.equal(current.contractSum,900);assert.deepEqual(current.additionalEvents,tasks)
  assert.equal(writes().length,1)
  assert.equal(x.query.getQueryData(['cached-entities','events'])[0].contractSum,900)
 }finally{await x.close()}
})
