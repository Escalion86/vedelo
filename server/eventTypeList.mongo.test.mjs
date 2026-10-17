import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import mongoose from 'mongoose'
import schema from '../schemas/siteSettingsSchema.js'
import { createEventTypeListHandlers } from './eventTypeList.js'
import { prepareEventTypeEdit } from '../helpers/eventTypeList.mjs'
import { countTypeUsage } from './typeUsage.js'

test('validation rejects duplicate names, source replacement and merge', () => {
  assert.throws(() => prepareEventTypeEdit(['A','B'], [{original:'A',name:'B'}]))
  assert.throws(() => prepareEventTypeEdit(['A'], [{original:'X',name:'Y'}]))
  assert.throws(() => prepareEventTypeEdit([], [{original:null,name:'Name'},{original:null,name:'name'}]))
  assert.deepEqual(prepareEventTypeEdit(['A','B'], [{original:'B',name:'X'},{original:'A',name:'Y'}]).renames, [{from:'A',to:'Y'},{from:'B',to:'X'}])
})

test('real Mongo: counts, rename isolation, stable references, retry and recovery', {skip: !process.env.CLIENT_TYPES_TEST_MONGOD, timeout:60000}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vedelo-event-types-'))
  const probe = net.createServer()
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve))
  const port=probe.address().port
  await new Promise(resolve=>probe.close(resolve))
  const child=spawn(process.env.CLIENT_TYPES_TEST_MONGOD,['--dbpath',directory,'--bind_ip','127.0.0.1','--port',String(port),'--quiet'],{stdio:'ignore',windowsHide:true})
  const exited=once(child,'exit')
  let connection
  try {
    connection=await mongoose.createConnection(`mongodb://127.0.0.1:${port}/event_types_test`,{serverSelectionTimeoutMS:30000}).asPromise()
    const settingsSchema=new mongoose.Schema(schema,{timestamps:true})
    settingsSchema.index({tenantId:1},{unique:true})
    const Settings=connection.model('SettingsTest',settingsSchema)
    const Events=connection.model('EventsTest',new mongoose.Schema({tenantId:mongoose.Schema.Types.ObjectId,eventType:String,clientId:String,syncVersion:Number,status:String},{timestamps:true}))
    const Clients=connection.model('ClientsTest',new mongoose.Schema({tenantId:mongoose.Schema.Types.ObjectId,clientType:String,archived:Boolean}))
    await Settings.init()
    const a=new mongoose.Types.ObjectId(),b=new mongoose.Types.ObjectId()
    await Settings.create([{tenantId:a,custom:{eventTypes:['A','B'],keep:true}},{tenantId:b,custom:{eventTypes:['A']}}])
    const saved=await Events.create([{tenantId:a,eventType:'A',clientId:'linked',syncVersion:7,status:'closed'},{tenantId:a,eventType:'A',clientId:'second',status:'active'},{tenantId:b,eventType:'A',clientId:'other'}])
    await Clients.create([{tenantId:a,clientType:'partner',archived:true},{tenantId:a},{tenantId:b,clientType:'partner'}])
    assert.deepEqual(await countTypeUsage(Clients,a,'clientType','none'),{partner:1,none:1})
    const context=async req=>({tenantId:req.headers.get('x-tenant')})
    const handlers=createEventTypeListHandlers({Settings,Events,getContext:context,connect:async()=>{}})
    const req=(tenant,body)=>new Request('http://test/api/event-types',{method:body?'PUT':'GET',headers:tenant?{'x-tenant':String(tenant)}:{},...(body?{body:JSON.stringify(body)}:{})})
    assert.equal((await handlers.GET(req(null))).status,401)
    assert.equal((await handlers.PUT(req(null,{}))).status,401)
    assert.deepEqual((await (await handlers.GET(req(a))).json()).usage,{A:2})
    const body={tenantId:String(b),base:['A','B'],rows:[{original:'A',name:'New'},{original:'B',name:'B'}]}
    const result=await handlers.PUT(req(a,body))
    assert.equal(result.status,200,JSON.stringify(await result.json()))
    const after=await Events.findById(saved[0]._id).lean()
    assert.equal(after.eventType,'New');assert.equal(after.clientId,'linked');assert.equal(after.syncVersion,8)
    assert.equal((await Events.findById(saved[1]._id)).syncVersion,1)
    assert.equal((await Events.findById(saved[2]._id)).eventType,'A')
    assert.deepEqual((await Settings.findOne({tenantId:b}).lean()).custom.eventTypes,['A'])
    assert.equal((await handlers.PUT(req(a,body))).status,200)
    assert.equal((await Events.findById(saved[0]._id)).syncVersion,8)
    assert.equal((await handlers.PUT(req(a,{base:['A'],rows:[]}))).status,409)
    // Failure after reserving the operation is resumable, including after reopening the editor.
    const failing=createEventTypeListHandlers({Settings,Events:{updateMany:async(...args)=>{await Events.updateMany(...args);throw new Error('temporary failure')}},getContext:context,connect:async()=>{}})
    const next={base:['B','New'],rows:[{original:'B',name:'Z'},{original:'New',name:'Done'}]}
    assert.equal((await failing.PUT(req(a,next))).status,503)
    const pending=(await (await handlers.GET(req(a))).json()).pending
    assert.ok(pending)
    assert.equal((await handlers.PUT(req(a,{base:['B','New'],rows:[]}))).status,409)
    const resumed={base:pending.plan.base,rows:pending.plan.next.map(name=>({name,original:pending.plan.renames.find(x=>x.to===name)?.from||null}))}
    assert.equal((await handlers.PUT(req(a,resumed))).status,200)
    assert.equal((await Events.findById(saved[0]._id)).eventType,'Done')
    assert.equal((await Events.findById(saved[0]._id)).syncVersion,9)
    assert.equal((await Settings.findOne({tenantId:a}).lean()).custom.keep,true)
    assert.equal((await Settings.findOne({tenantId:a})).eventTypesEdit,undefined)
  } finally {
    if(connection)await connection.close()
    child.kill();await exited
    const target=path.resolve(directory)
    assert.equal(path.dirname(target),path.resolve(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('vedelo-event-types-'))
    await rm(target,{recursive:true,force:true})
  }
})

