// Только синтетические данные. Компоненты и их состояние — из рабочего дерева.
import React from 'react'
import {createRoot} from 'react-dom/client'
import {View, Share} from 'react-native'
import {ThemeProvider} from '../../mobile/src/shared/ui/ThemeProvider'
import {PageHeader, Button} from '../../mobile/src/shared/ui/components'
import {PeriodPicker} from '../../mobile/src/shared/ui/PeriodPicker'
import {MenuCatalogue, MenuSheet} from '../../mobile/src/features/navigation/MenuSheet'
import {StatisticsSection} from '../../mobile/src/features/statistics/StatisticsSection'
import {IntegrationsSection} from '../../mobile/src/features/integrations/IntegrationsSection'
import {ReferralsSection} from '../../mobile/src/features/referrals/ReferralsSection'
import {SettingsSection} from '../../mobile/src/features/settings/SettingsSection'
import HistoryScreen from '../../mobile/app/history'
import BillingScreen from '../../mobile/app/billing'
import AttentionScreen from '../../mobile/src/features/attention/AttentionScreen'
import WebHistory from '../../layouts/content/HistoryContent'
import WebPeriod from '../../components/PeriodPicker'
import TariffFeatureLabel from '../../components/TariffFeatureLabel'
import {buildStatisticsChartData} from '../../helpers/buildStatisticsChartData'
import {calculateStatistics} from '../../mobile/src/features/statistics/statistics'
import CabinetHeader from '../../layouts/CabinetHeader'
const params=new URLSearchParams(location.search), theme=params.get('theme')||'light', surface=params.get('surface')||'menu'
const user={_id:'a'.repeat(24),tenantId:'синтетический',firstName:'Анна',role:'user'}
const date=(days)=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(12,0,0,0);return d.toISOString()}
const events=[{_id:'b'.repeat(24),clientId:null,eventType:'Работа',description:'Синтетический заказ с длинным названием',status:'active',eventDate:date(1),dateEnd:null,contractSum:1000,address:{town:'Тестовый город',street:'',house:''},additionalEvents:[{_id:'late',date:date(-1),title:'Связаться'},{_id:'today',date:date(0),title:'Связаться'},{_id:'tomorrow',date:date(1),title:'Связаться'}]}, {_id:'c'.repeat(24),clientId:null,eventType:'Заявка',description:'Заявка',status:'draft',eventDate:date(-2),dateEnd:null,contractSum:500,address:{town:'',street:'',house:''},additionalEvents:[]},{_id:'d'.repeat(24),clientId:null,status:'draft',eventDate:null,additionalEvents:[],contractSum:0}, {_id:'e'.repeat(24),clientId:null,status:'active',eventDate:date(-2),additionalEvents:[],contractSum:0}]
const transactions=[{_id:'tx',eventId:events[0]._id,clientId:null,type:'income',amount:300,category:'deposit',date:date(0),comment:''}]
const tariff={_id:'профи',title:'Профи с длинной подписью тарифа',price:500,eventsPerMonth:30,allowAi:true,aiIncludedRubPerMonth:300,allowCalendarSync:true,allowStatistics:true,allowDocuments:true,allowProposals:true,allowClientReviews:true,allowTelephony:true,allowAvitoIntegration:true,allowVkIntegration:true,allowTelegramIntegration:true,allowPublicLeadApi:true,change:{current:true,blockedReason:'',missingAmount:0}}
const history=Array.from({length:30},(_,i)=>({id:String(i),entityType:'event',entityId:events[0]._id,operation:'update',entityLabel:'Заказ: Тестовая работа',summary:`Изменение ${i+1}`,changes:[],actorId:'автор',actorLabel:'Анна',source:'android',occurredAt:date(0),entityExists:true}))
window.qa={user,routes:[],clipboard:[],shares:[],requests:[],invalidations:[],scopes:[],mutations:[],settings:{_id:'настройки',custom:{primaryEntityTerminology:'auto'}}, failSave:false, history,tariff}
window.qaData={events,transactions,services:[],clients:[]}
Share.share=async p=>{window.qa.shares.push(p);return {action:Share.sharedAction}}
window.qaApi=async(method,path,body)=>{
 window.qa.requests.push({method,path,body})
 if(path.startsWith('/mobile/v1/statistics')){const q=new URLSearchParams(path.split('?')[1]);return {success:true,data:{events:events.slice(0,2),transactions,clients:[],filters:{year:q.has('year')?Number(q.get('year')):null,town:q.get('town')||'',status:q.get('status')||'all'}}}}
 if(path.startsWith('/billing/history'))return {success:true,data:{items:[{id:'платёж',amount:500,direction:'out',type:'charge',kind:'tariff',status:'succeeded',title:'Оплата тарифа',details:'Синтетическая операция',sourceTitle:'Ведело',methodTitle:'Баланс',receiptUrl:'',occurredAt:date(0)}]},meta:{hasMore:false,nextCursor:null}}
 if(path==='/mobile/v1/billing')return {success:true,data:{account:{balance:800,unlimited:false},currentTariff:tariff,tariffs:[tariff]}}
 if(path.includes('/referrals'))return {success:true,data:{referrals:[],referralsCount:0,rewardsTotal:0,rewardsCount:0}}
 if(path.includes('/settings/terminology')){if(method==='put'){if(window.qa.failSave)throw Error('Сеть недоступна');window.qa.settings={...window.qa.settings,custom:{...window.qa.settings.custom,...body}}}return {success:true,data:window.qa.settings}}
 if(path.startsWith('/histories')){const q=new URLSearchParams(path.split('?')[1]);const start=q.has('cursor')?10:0;return {success:true,data:history.slice(start,start+10),meta:{hasMore:start===0,nextCursor:start===0?'next':null}}}
 const states={googleCalendar:{available:true,connected:true,enabled:true,calendarId:'primary',calendarName:'Рабочий календарь с длинной подписью',reminders:{useDefault:true,overrides:[]},deleteCanceledFromCalendar:false,skipTransferredFromCalendar:false},avito:{available:true,configured:true,enabled:true,clientId:'синтетический',accountId:'123'},vk:{available:true,configured:true,enabled:true,accountId:'456'},telephony:{available:true,configured:true,enabled:true,hasApiKey:true},publicLeadApi:{available:true,configured:true,enabled:true,keys:[],endpoint:'https://synthetic.invalid/api/public/lead'},telegram:{available:true,configured:true,enabled:true,status:'bot_ready',botUsername:'synthetic_bot'}}
 if(path==='/mobile/v1/integrations/status')return {success:true,data:states}
 if(path==='/mobile/v1/integrations/google-calendar/calendars')return {success:true,data:{calendars:[{id:'primary',summary:'Рабочий календарь с длинной подписью',primary:true}],selectedId:'primary'}}
 const key=path.split('/').pop();if(states[key]||key==='google-calendar'||key==='public-leads')return {success:true,data:states[key==='google-calendar'?'googleCalendar':key==='public-leads'?'publicLeadApi':key]} 
 if(path.startsWith('/mobile/v1/integrations/'))return {success:true,data:{provider:path.split('/').pop(),available:true,configured:true,enabled:true,status:'connected',analysisProvider:'artistcrm',transcriptionProvider:'artistcrm',platformConfigured:true,transcriptionModel:'whisper-1',analysisModel:'gpt-4o-mini',endpoint:'https://synthetic.invalid/api/public/lead',keys:[]}}
 if(path==='/ai/usage')return {success:true,data:{balance:800,requiredBalance:1,available:true,platformConfigured:true,tariffIncluded:{enabled:true,includedRub:300,usedRub:10,remainingRub:290,coveredByTariff:true},summary:{operations:0,charged:0},quotes:[],recent:[]}}
 throw Error(`Неожиданный запрос стенда: ${method} ${path}`)
}
document.body.classList.toggle('theme-dark',theme==='dark')
function PeriodPair(){const [value,set]=React.useState({from:'',to:''});return <><PeriodPicker value={value} onChange={set} testID="stage-period"/><div data-testid="web-period" style={{fontFamily:"Inter Tight"}}><WebPeriod value={value} onChange={set}/></div></>}
function App(){return <ThemeProvider forcedMode={theme} storage={null}><main data-qa-surface={surface} style={{height:'100dvh',display:'flex',flexDirection:'column',fontFamily:['web-history','tariff-pair'].includes(surface)?undefined:'Arial',background:theme==='dark'?'#15100b':'#f4f1ea'}}>
 {surface==='history'?<HistoryScreen/>:surface==='attention'?<AttentionScreen/>:surface==='billing'?<BillingScreen/>:surface==='web-history'?<WebHistory/>:<View style={{padding:12,gap:12,...(surface==='tariff-pair'?{flex:1,minHeight:0}:{})}}>
 {surface==='menu'?<MenuSheet onNavigate={href=>window.qa.routes.push(href)}/>:null}
 {surface==='statistics'?<StatisticsSection/>:null}
 {surface==='integrations'?<IntegrationsSection/>:null}
 {surface==='referrals'?<ReferralsSection/>:null}
 {surface==='settings'?<SettingsSection/>:null}
 {surface==='period'?<PeriodPair/>:null}
 {surface==='header'?<><PageHeader title="История действий" count={30}/><div style={{fontFamily:"Inter Tight"}}><CabinetHeader title="История действий" count={30}/></div><View testID="stage-header-action"><PageHeader title="История действий с очень длинным названием" count={3000} help="Пояснение шапки" action={<Button title="Обновить" onPress={()=>{}}/>}/></View></>:null}
 {surface==='tariff-pair'?<><div data-testid="web-tariff-label"><TariffFeatureLabel helpKey="allowAi" tariff={tariff} label="ИИ-возможности"/></div><BillingScreen/></>:null}
 </View>}
 </main></ThemeProvider>}
createRoot(document.getElementById('root')).render(<App/>);window.qaReady=true;window.qaChartParity=()=>{const year=new Date().getFullYear();const data={events:events.slice(0,2),transactions,clients:[],filters:{year,town:'',status:'all'}};const native=calculateStatistics(data);return {native:native.months,web:buildStatisticsChartData({selectedYear:year,filteredEvents:data.events,filteredTransactions:data.transactions,eventsMap:new Map(data.events.map(e=>[e._id,e])),eventFinanceMap:native.eventFinance})}}
