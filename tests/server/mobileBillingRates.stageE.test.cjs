const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {loadBindings,transformSync}=require('next/dist/build/swc')
const rates={transcriptionRubPerSecond:0.1,voiceNoteRub:2,eventDraftRub:4,fileRecordRub:0}
function harness(){
 const calls=[],state={context:{user:{_id:'u'},tenantId:'t'},fail:false}
 const mocks={
  mongoose:{isValidObjectId:()=>true},'@models/Tariffs':{findOne:()=>({lean:async()=>({_id:'new',price:10})})},'@models/Users':{findOne:async()=>({_id:'u'})},
  '@server/billing':{applyTariffPurchase:async()=>({ok:true})},'@server/dbConnect':async()=>{},'@server/getRequestContext':async()=>state.context,
  '@server/mobile/billingStore':{getMobileBillingUserFilter:scope=>scope,loadMobileBilling:async scope=>{calls.push(scope);if(scope.userId!=='u'||scope.tenantId!=='t')return null;return {account:{balance:100},currentTariff:null,tariffs:[]}}},
  '@server/mobile/routeHelpers':{mobileError:(code,message,status)=>({status,code}),mobileSuccess:data=>({status:200,data})},
  '@server/aiIncludedEstimate':{getAiIncludedExampleRates:async()=>{calls.push('rates');if(state.fail)throw Error('aggregation unavailable');return {...rates,tenantId:'secret'}}},
  '@server/mobile/billing':{serializeMobileAiIncludedRates:source=>Object.fromEntries(Object.keys(rates).map(key=>[key,source[key]]))},
 }
 const filename='app/api/mobile/v1/billing/route.js',code=transformSync(fs.readFileSync(filename,'utf8'),{filename,jsc:{parser:{syntax:'ecmascript'},target:'es2022'},module:{type:'commonjs'}}).code
 const loaded={exports:{}};new Function('require','module','exports',code)(name=>{if(!(name in mocks))throw Error('Unmocked '+name);return mocks[name]},loaded,loaded.exports)
 return {...loaded.exports,calls,state}
}
test.before(async()=>loadBindings())
for(const method of ['GET','POST'])test(`billing ${method} returns safe dynamic rates with server scope`,async()=>{
 const h=harness(),result=await h[method]({json:async()=>({tariffId:'new',tenantId:'foreign'})})
 assert.equal(result.status,200);assert.deepEqual(result.data.aiIncludedRates,rates)
 assert.ok(h.calls.filter(c=>c!=='rates').every(c=>c.userId==='u'&&c.tenantId==='t'))
})
test('unauthorized tenant cannot read aggregated billing data',async()=>{
 const h=harness();h.state.context={user:null,tenantId:null};assert.equal((await h.GET({})).status,401);assert.deepEqual(h.calls,[])
})
test('rates aggregation failure keeps existing billing usable',async()=>{
 const h=harness();h.state.fail=true;const result=await h.GET({});assert.equal(result.status,200);assert.equal(result.data.aiIncludedRates,undefined)
})

test('foreign tenant cannot receive the fixture account or trigger rates after missing owner',async()=>{
 const h=harness();h.state.context={user:{_id:'u'},tenantId:'foreign'}
 const result=await h.GET({});assert.equal(result.status,404);assert.equal(result.data,undefined);assert.ok(!h.calls.includes('rates'))
})
