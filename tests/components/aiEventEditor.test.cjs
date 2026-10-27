const test = require('node:test')
const assert = require('node:assert/strict')
const { aiEventEditorOptions, manualAiEventChanges, saveAiEventReview } = require('../../helpers/aiEventEditor.mjs')

test('ИИ открывает существующий ID с исходным клиентом, raw service IDs и подсветкой; исходник не меняется', () => {
  const event = {_id:'event',clientId:'client',contractSum:100,servicesIds:['old'],additionalEvents:[{_id:'task',title:'Старая'}]}
  const before=JSON.stringify(event)
  const plan={planId:'plan',eventId:'event',eventPatch:{contractSum:200,servicesIds:['new']},clientPatch:{_id:'client',firstName:'Анна'}}
  const options=aiEventEditorOptions(plan,event)
  assert.equal(options.initialEvent._id,'event')
  assert.equal(options.initialEvent.clientId,'client')
  assert.equal(options.initialEvent.contractSum,200)
  assert.deepEqual(options.initialEvent.servicesIds,['new'])
  assert.deepEqual(options.aiFilledFields,['contractSum','servicesIds','clientId'])
  assert.equal(JSON.stringify(event),before)
  assert.throws(()=>aiEventEditorOptions(plan,{_id:'different'}))
})

test('сохранение без ручных правок применяет план и перечитывает карточку без повторного PUT старого снимка', async()=>{
  const requests=[],writes=[];let refreshed=0
  const baseline={_id:'event',contractSum:200,additionalEvents:[{title:'ИИ'}]}
  const latest={...baseline,updatedAt:'new',clientId:'client'}
  const saved=await saveAiEventReview({plan:{planId:'plan',eventId:'event'},state:{},baseline,current:{...baseline},
    request:async(url,options)=>{requests.push({url,options});return options.method?{done:true}:{data:latest}},
    setEvent:async(...args)=>writes.push(args),refresh:async()=>{refreshed++},
  })
  assert.equal(saved,latest)
  assert.equal(writes.length,0)
  assert.equal(requests[1].url,'/api/events/event')
  assert.deepEqual(JSON.parse(requests[0].options.body),{mode:'apply',planId:'plan'})
  assert.equal(refreshed,1)
})

test('ручная поправка сохраняется только разницей; потерянный ответ повторяет тот же план и фиксированные правки',async()=>{
  const baseline={_id:'event',contractSum:200,description:'ИИ',additionalEvents:[{title:'Задача'}]}
  assert.deepEqual(manualAiEventChanges(baseline,{...baseline,contractSum:250}),{contractSum:250})
  const state={},writes=[];let tries=0,refreshed=0
  const args={plan:{planId:'same-plan',eventId:'event'},state,baseline,current:{...baseline,contractSum:250},
    request:async(_url,options)=>{assert.equal(JSON.parse(options.body).planId,'same-plan');if(++tries===1)throw new Error('Ответ потерян');return {done:true}},
    setEvent:async(payload)=>{writes.push(payload);return payload},refresh:async()=>{refreshed++},
  }
  await assert.rejects(()=>saveAiEventReview(args),/Ответ потерян/)
  args.current={...baseline,contractSum:999}
  await saveAiEventReview(args)
  assert.deepEqual(writes,[{_id:'event',contractSum:250}])
  assert.equal(refreshed,2)
})

test('tenant/конфликт запрещает последующую запись вручную и обновляет данные для сверки',async()=>{
  for(const result of [new Error('План не найден'),{conflict:true,error:'Карточка изменилась'}]){
    let writes=0,refreshed=0
    await assert.rejects(()=>saveAiEventReview({plan:{planId:'plan',eventId:'event'},state:{},baseline:{contractSum:200},current:{contractSum:250},
      request:async()=>{if(result instanceof Error)throw result;return result},
      setEvent:async()=>{writes++},refresh:async()=>{refreshed++},
    }))
    assert.equal(writes,0)
    assert.equal(refreshed,1)
  }
})
