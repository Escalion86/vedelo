const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const { NextResponse } = require('next/server')
const load = (file, mocks={}) => {
 const {code}=transformSync(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'ecmascript',jsx:true}},module:{type:'commonjs'}})
 const m={exports:{}};new Function('require','module','exports',code)(id=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports
}
test.before(async()=>{await loadBindings()})
test('схема пользователя хранит MAX и отклоняет посторонние ссылки',async()=>{
 const mongoose=require('mongoose')
 const schema=load('schemas/usersSchema.js',{'@helpers/constants':{DEFAULT_GOOGLE_CALENDAR_REMINDERS:{overrides:[]},DEFAULT_USERS_NOTIFICATIONS:{}},'@helpers/maxContact':load('helpers/maxContact.js')}).default
 const M=mongoose.models.MaxProfileTest||mongoose.model('MaxProfileTest',new mongoose.Schema(schema))
 assert.ok(M.schema.path('max'))
 assert.equal(new M({max:'https://max.ru/u/test'}).max,'https://max.ru/u/test')
 await new M({max:'+79991234567'}).validate()
 await assert.rejects(new M({max:'https://evil.example/test'}).validate(),error=>Boolean(error.errors.max))
})
test('API: MAX сохраняется/очищается, нормализуется, защищён от чужого пользователя и невалидного ввода',async()=>{
 let ctx={user:{_id:'own',role:'user'},tenantId:'own'},saved
 const existing={_id:'own',tenantId:'own'}
 const route=load('app/api/users/[id]/route.js',{
 'next/server':{NextResponse},'@models/Users':{findOne:async()=>existing,findOneAndUpdate:async(q,u)=>{saved={q,u};return {...existing,...u}}},
 '@models/Histories':{},'@models/Tariffs':{},'@models/Payments':{},'@models/Events':{aggregate:async()=>[]},'@server/dbConnect':async()=>{},'@server/getTenantContext':async()=>ctx,
 '@helpers/userEventStats':{applyUserEventStats:u=>u},'@helpers/tariffAccess':{isRegistrationOfferTariff:()=>false},'@helpers/maxContact':load('helpers/maxContact.js'),
 })
 const put=(max,id='own')=>route.PUT(new Request('http://localhost',{method:'PUT',body:JSON.stringify({max})}),{params:Promise.resolve({id})})
 for(const [input,want] of [['8 (999) 123-45-67','+79991234567'],['max.ru/u/test','https://max.ru/u/test'],['','']]){
 const r=await put(input);assert.equal(r.status,200);assert.equal(saved.u.max,want);assert.equal((await r.json()).data.max,want)
 }
 saved=null;assert.equal((await put('https://evil.example')).status,400);assert.equal(saved,null)
 assert.equal((await put({url:'https://max.ru/test'})).status,400);assert.equal(saved,null)
 assert.equal((await put('+79991234567','foreign')).status,403);assert.equal(saved,null)
 ctx={user:null,tenantId:null};assert.equal((await put('+79991234567')).status,401)
})
