import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Alert, Linking } from 'react-native'
import { focusManager, isServer, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { ThemeProvider } from '../../mobile/src/shared/ui/ThemeProvider'
import { MobileEventCard } from '../../mobile/src/features/events/MobileEventCard'
import EventDetailScreen from '../../mobile/app/events/[id]'
import ClientDetailScreen from '../../mobile/app/clients/[id]/index'
import AttentionScreen from '../../mobile/src/features/attention/AttentionScreen'
import { MenuCatalogue } from '../../mobile/src/features/navigation/MenuSheet'
import BillingScreen from '../../mobile/app/billing'
import HistoryScreen from '../../mobile/app/history'
const params=new URLSearchParams(location.search),theme=params.get('theme')||'light',surface=params.get('surface')||'map'
window.qa = { opens:0, links:[], routes:[], requests:[], writes:[],user:{_id:'qa',tenantId:'qa-tenant',role:'user'},surface }
Linking.openURL=async url=>{window.qa.links.push(url)}
Alert.alert=(title,message,buttons)=>buttons?.find(b=>b.text==='Применить')?.onPress?.()
const query=new QueryClient({defaultOptions:{queries:{retry:false}}})
window.qa.queryRuntime={isServer}
window.qa.refreshReviews=()=>query.invalidateQueries({queryKey:['nativeReviews',window.qa.user._id,window.qa.user.tenantId]})
window.qa.setQueryFocus=focused=>focusManager.setFocused(focused)
window.qa.statusFetchState=()=>query.getQueryState(['nativeReviews',window.qa.user._id,window.qa.user.tenantId,'statuses'])?.fetchStatus
window.qa.statusObserverCount=()=>query.getQueryCache().find({queryKey:['nativeReviews',window.qa.user._id,window.qa.user.tenantId,'statuses'],exact:true})?.getObserversCount()
const event={_id:'event',status:'active',syncStatus:'synced',clientId:'client',eventType:'Очень длинное название работы '.repeat(3),description:'Описание сохранённой работы',additionalEvents:[{title:'Связаться',done:false}],calendarImportChecked:true,contractSum:10000,address:{town:'Красноярск',street:'Очень длинная улица с названием',house:'10'},eventDate:'2020-01-12T12:00:00Z'}
const client={_id:'client',firstName:'Клиент',comment:'Заметка клиента'}
window.qaData={events:[event],clients:[client],services:[],transactions:[]}
const rates={transcriptionRubPerSecond:0.1,voiceNoteRub:2,eventDraftRub:4,fileRecordRub:0}
const tariff={_id:'pro',title:'Профи',price:100,eventsPerMonth:0,allowAi:true,aiIncludedRubPerMonth:100,allowProposals:true,allowDocuments:true,allowClientReviews:true}
let proposal={_id:'proposal',eventId:'event',title:'Принятое КП',version:1,status:'published',packages:[],blocksSnapshot:[],mediaSnapshot:[],selectedPackageId:'main',selectedAt:'2026-10-01',messageText:''}
const review={_id:'review',eventId:'event',clientId:'client',status:'received',rating:2,createdAt:'2026-10-01',expiresAt:'2026-11-01',submittedAt:'2026-10-02',comment:'Связаться со мной',note:''}
const history=Array.from({length:20},(_,i)=>({id:String(i),entityType:'event',entityId:'event',operation:'update',entityLabel:'Заказ: Тестовая работа',summary:`Изменение ${i+1}`,changes:[],actorId:'author',actorLabel:'Автор',source:'android',occurredAt:'2026-10-01T00:00:00Z',entityExists:true}))
window.qaApi=async(method,path,body)=>{
 window.qa.requests.push({method,path,at:Date.now()})
 if(path==='/mobile/v1/billing')return {success:true,data:{account:{balance:800,unlimited:false},currentTariff:tariff,tariffs:[tariff],aiIncludedRates:rates}}
 if(path.startsWith('/billing/history'))return {success:true,data:{items:[]},meta:{hasMore:false,nextCursor:null}}
 if(path.startsWith('/histories'))return {success:true,data:history,meta:{hasMore:false,nextCursor:null}}
 if(path==='/mobile/v1/settings/terminology')return {success:true,data:{custom:{primaryEntityTerminology:'orders'}}}
 if(path==='/client-reviews/statuses')return {success:true,data:Object.fromEntries(['event','second','third'].map(id=>[id,{status:'received',rating:window.qa.statusRating||2}]))}
 if(path.startsWith('/client-reviews?'))return {success:true,data:{items:[review],total:1,allowClientReviews:true}}
 if(path==='/events/event/proposals')return {success:true,data:[proposal]}
 if(path==='/proposal-templates')return {success:true,data:[]}
 if(path==='/mobile/v1/events/event')return {success:true,data:{_id:'event',status:'active',contractSum:900,servicesIds:[],agreedProposal:{title:'Согласованный состав'},syncVersion:3}}
 if(path==='/proposals/proposal'){if(body?.action==='apply')proposal={...proposal,appliedPackageId:'main',appliedAt:'2026-10-03',appliedSelectionAt:'2026-10-01'};return {success:true,data:proposal}}
 throw Error('Неожиданный запрос '+method+' '+path)
}
function StaggeredStatusCards(){
 const [count,setCount]=useState(1)
 useEffect(()=>{window.qa.mountStatusCards=setCount;return()=>{delete window.qa.mountStatusCards}},[])
 // A separate real QueryObserver proves that the browser clock executes polling.
 // It never supplies or replaces the product status map.
 useQuery({queryKey:['qa-polling-runtime-probe'],queryFn:async()=>{(window.qa.probeTicks||=[]).push(Date.now());return true},refetchInterval:30000})
 return ['event','second','third'].slice(0,count).map(id=><MobileEventCard key={id} event={{...event,_id:id}} client={client} services={[]} transactions={[]} testID={'polling-card-'+id} onPress={()=>window.qa.opens++}/>)
}
function App(){return <QueryClientProvider client={query}><ThemeProvider forcedMode={theme} storage={null}><main style={{height:'100dvh',display:'flex',flexDirection:'column'}}>
 {surface==='status-polling'?<StaggeredStatusCards/>:surface==='event'?<EventDetailScreen/>:surface==='client'?<ClientDetailScreen/>:surface==='attention'?<AttentionScreen/>:surface==='menu'?<MenuCatalogue onNavigate={p=>window.qa.routes.push(p)}/>:surface==='billing'?<BillingScreen/>:surface==='history'?<HistoryScreen/>:<MobileEventCard event={event} client={client} services={[]} transactions={[]} testID="geometry-card" onPress={()=>window.qa.opens++}/>}
 </main></ThemeProvider></QueryClientProvider>}
createRoot(document.getElementById('root')).render(<App/> )
