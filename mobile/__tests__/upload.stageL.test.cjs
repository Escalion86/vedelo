'use strict'
const f=require('./proposals.stageL.fixture.cjs')
const {test,assert,React,act,RichTextEditor,ProposalEditorScreen,template,data,reads,bounded,settle,finish,button,press,mount,unmount,session}=f
const file=()=>({uri:'file:stageL',name:'probe.png',mimeType:'image/png',size:8,file:new Blob(['stage-L!'],{type:'image/png'})})
const picked=()=>({canceled:false,assets:[file()]})
const parent=()=>React.createElement(ProposalEditorScreen,{kind:'template',id:'new'})
const child=()=>React.createElement(RichTextEditor,{kind:'template',id:'nested',value:'<p>текст</p>',onChange:()=>{}})
function configure() {
 const uploaded=[]
 f.setPicker(async()=>picked())
 f.setRequest(async(p,c)=>{
  if(p==='/proposal-templates/defaults')return data({...template,blocks:[{id:'intro',type:'intro',contentHtml:'<p>текст</p>'}]})
  if(p==='/escalioncloud'){
   assert(c.body instanceof FormData)
   const directory=c.body.get('directory'),bodyFile=c.body.get('files')
   assert(bodyFile instanceof Blob);assert.equal(bodyFile.size,8)
   uploaded.push({directory,bodyFile})
   return data({url:'https://cloud.escalion.ru/uploads/'+directory+'/probe.png'})
  }
  return reads(p)
 })
 return uploaded
}
function delayRead(key,nth) {
 const gate=f.gate();let count=0
 f.setRead(async k=>{if(k===key&&++count===nth){gate.entered.resolve();await gate.release.promise}})
 return gate
}
for(const window of ['pre-capture','token','pre-fetch'])test('HIJ-NESTED-UPLOAD-UNMOUNT: actual parent/nested consumer '+window,{timeout:15000},async()=>{
 const uploads=configure(),s=await mount(parent())
 // capture: первый getStoredUser; token: первый access lookup;
 // pre-fetch: второй access lookup в check.upload, последняя await перед POST.
 const gate=delayRead(window==='pre-capture'?'artistcrm_mobile_user':'artistcrm_access_token',window==='pre-fetch'?2:1)
 try {
  await press(s,'Вставить фото');await bounded(gate.entered.promise)
  await unmount(s);gate.release.resolve();await finish()
  assert.equal(uploads.length,0,'POST после unmount запрещён при той же identity')
  console.log('НАБЛЮДЕНИЕ '+JSON.stringify({scenario:window,identityUnchanged:true,actualMultipartPosts:uploads.length}))
 }finally{gate.release.resolve();f.setRead(null)}
})
test('nested child unmount при живом родителе также отменяет capture',{timeout:15000},async()=>{
 const uploads=configure(),s=await mount(child()),gate=delayRead('artistcrm_mobile_user',1)
 try {
  await press(s,'Вставить фото');await bounded(gate.entered.promise)
  await act(async()=>s.update(React.createElement('View')))
  gate.release.resolve();await finish();assert.equal(uploads.length,0)
 }finally{gate.release.resolve();f.setRead(null);await unmount(s)}
})
for(const change of ['user','tenant'])test('same-component identity change во время capture / '+change,{timeout:15000},async()=>{
 const uploads=configure(),s=await mount(child()),gate=delayRead('artistcrm_mobile_user',1)
 const old=f.user()
 try {
  await press(s,'Вставить фото');await bounded(gate.entered.promise)
  await act(async()=>{await session(change==='user'?{...old,_id:old._id+'новый'}:{...old,tenantId:old.tenantId+'новый'});await settle()})
  gate.release.resolve();await finish();assert.equal(uploads.length,0)
  await press(s,'Вставить фото');await finish();assert.equal(uploads.length,1,'Новый upload новой identity разрешён')
 }finally{gate.release.resolve();f.setRead(null);await unmount(s)}
})
test('happy upload живого actual editor публикует insertMedia и освобождает busy',{timeout:15000},async()=>{
 const uploads=configure(),s=await mount(parent())
 try {
  await press(s,'Вставить фото');await finish();assert.equal(uploads.length,1)
  const view=s.root.findByType('LocalWebView')
  assert.equal(view.props.command.type,'insertMedia')
  assert.equal(view.props.command.kind,'image')
  assert.match(view.props.command.url,/\/probe\.png$/)
  assert.equal(button(s,'Вставить фото').props.disabled,false)
 }finally{await unmount(s)}
})
test('picker cancel и delayed picker unmount не отправляют multipart',{timeout:15000},async()=>{
 const uploads=configure(),s=await mount(parent())
 f.setPicker(async()=>({canceled:true}))
 await press(s,'Вставить фото');await finish();assert.equal(uploads.length,0)
 assert.equal(button(s,'Вставить фото').props.disabled,false)
 const gate=f.gate();f.setPicker(async()=>{gate.entered.resolve();await gate.release.promise;return picked()})
 try{
  await press(s,'Вставить фото');await bounded(gate.entered.promise);await unmount(s)
  gate.release.resolve();await finish();assert.equal(uploads.length,0)
 }finally{gate.release.resolve()}
})
test('upload error + явный retry сохраняет текст и не повторяется сам',{timeout:15000},async()=>{
 configure();let attempts=0
 f.setRequest(async(p,c)=>{
  if(p==='/proposal-templates/defaults')return data({...template,blocks:[{id:'intro',type:'intro',contentHtml:'<p>текст</p>'}]})
  if(p==='/escalioncloud'){
   if(++attempts===1)return {httpStatus:500,payload:data({})}
   return data({url:'https://cloud.escalion.ru/uploads/'+c.body.get('directory')+'/probe.png'})
  }
  return reads(p)
 })
 const s=await mount(parent())
 try{
  await press(s,'Вставить фото');await finish();assert.equal(attempts,1)
  assert(s.root.findAllByType('Notice').some(n=>n.props.message==='Не удалось загрузить медиа. Текст сохранён; повторите загрузку.'))
  assert.equal(s.root.findByType('LocalWebView').props.command,null)
  await press(s,'Вставить фото');await finish();assert.equal(attempts,2)
  assert.equal(s.root.findByType('LocalWebView').props.command.type,'insertMedia')
 }finally{await unmount(s)}
})
test('double press синхронно заблокирован до picker и capture',{timeout:15000},async()=>{
 const uploads=configure(),s=await mount(parent()),gate=f.gate();let pickers=0
 f.setPicker(async()=>{pickers++;gate.entered.resolve();await gate.release.promise;return picked()})
 try{
  const action=button(s,'Вставить фото').props.onPress
  await act(async()=>{action();action();await settle()})
  await bounded(gate.entered.promise);assert.equal(pickers,1)
  gate.release.resolve();await finish();assert.equal(uploads.length,1)
 }finally{gate.release.resolve();await unmount(s)}
})
