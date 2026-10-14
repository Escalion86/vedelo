import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from 'expo-router'
import EventDetailScreen from '../../../app/events/[id]'
import ClientDetailScreen from '../../../app/clients/[id]/index'
import BillingScreen from '../../../app/billing'
import AttentionScreen from '../attention/AttentionScreen'
import { MobileEventCard } from './MobileEventCard'
import { MenuCatalogue } from '../navigation/MenuSheet'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import type { Event } from '../../shared/domain/types'
import { expectBoundRead } from '../../../__tests__/stageO/boundRead'
const mockRequest=jest.fn(),mockGet=jest.fn(),mockUpsert=jest.fn(),mockRefetch=jest.fn(async()=>{}),mockScope=jest.fn()
let mockEvent:Event, mockUser={_id:'u',tenantId:'t'},mockOnline=true,mockAllowed=true
let mockProposal:any,mockReviews:any[]
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn()},useLocalSearchParams:()=>({id:mockEvent._id}),useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn])}))
jest.mock('../../shared/config/env',()=>({env:{apiBaseUrl:'https://synthetic.invalid/api',appScheme:'vedelo'}}))
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:'Icon',FontAwesome5:'Icon'}))
jest.mock('expo-clipboard',()=>({setStringAsync:jest.fn(async()=>true)}))
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:0,bottom:0})}))
jest.mock('@react-native-community/netinfo',()=>({useNetInfo:()=>({isConnected:mockOnline,isInternetReachable:mockOnline})}))
// Synthetic auth transport boundary; real proposal identity/API/schema/operations remain loaded.
jest.mock('../../shared/auth/tokenStore',()=>require('../../../__tests__/stageN/sessionBoundary.cjs').createSessionBoundary(()=>mockUser))
jest.mock('../../shared/auth/AuthProvider',()=>({useAuth:()=>{require('react').useEffect(()=>require('../../shared/auth/tokenStore').notify(),[mockUser]);return {user:mockUser,refreshUser:async()=>{}}}}))
jest.mock('../../shared/api/client',()=>({api:{get:(...a:any[])=>mockGet(...a),request:(...a:any[])=>mockRequest(...a)}}))
jest.mock('../../shared/hooks/useCachedEntities',()=>({useCachedEntities:(kind:string)=>jest.requireActual('@tanstack/react-query').useQuery({queryKey:['cached-entities',kind],queryFn:async()=>kind==='events'?[mockEvent]:[]})}))
// Synthetic storage boundary for component rendering; real SQL readback is tested separately.
jest.mock('../../shared/storage/cache',()=>{
 const read=async(kind:string,id:string)=>kind==='events'?(mockEvent._id===id?mockEvent:null):{_id:id,firstName:'Клиент'}
 const write=(...a:any[])=>mockUpsert(...a)
 return {getCachedEntity:read,listCachedEntities:async()=>[],upsertEntities:write,publishEntityReadback:(kind:string,fresh:any,active:any,publish:any)=>require('../../../../tests/stageN-fixtures/componentStorage.cjs').publishStorageBoundary(kind,fresh,active,publish,read,write)}
})
jest.mock('../../shared/storage/mutations',()=>({saveLocalEntity:jest.fn()}))
jest.mock('../../shared/hooks/useWorkItemTerminology',()=>({useWorkItemTerminology:()=>({labelCapitalized:'Заказ',pluralCapitalized:'Заказы',accusative:'заказ',pluralGenitive:'заказов'})}))
jest.mock('../../shared/hooks/useSyncRunState',()=>({useSyncRunState:()=>({status:'success'})}))
jest.mock('../../shared/sync/syncState',()=>({getSyncQueueCounts:async()=>({pendingCount:0,issueCount:0})}))
jest.mock('../../shared/storage/outbox',()=>({getOutboxSummary:async()=>({failed:0})}))
jest.mock('../../shared/sync/syncEngine',()=>({runSync:async()=>{}}))
jest.mock('../navigation/EventsScope',()=>({useEventsScope:()=>({selectScope:mockScope})}))
const readEvent=()=>({_id:mockEvent._id,status:mockEvent.status,contractSum:900,servicesIds:['s'],agreedProposal:{title:'Согласованный состав'},syncVersion:3})
let cache:QueryClient
function setup(Component:React.ComponentType,theme:'light'|'dark'='light'){
 cache=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:60000}}})
 cache.setQueryData(['cached-entities','events'],[mockEvent])
 return render(<QueryClientProvider client={cache}><ThemeProvider forcedMode={theme} storage={null}><Component/></ThemeProvider></QueryClientProvider>)
}
beforeEach(()=>{
 jest.requireActual('../proposals/operations').proposalOperations.clear(JSON.stringify(['u','t']),'apply','p');
 jest.clearAllMocks();mockUser={_id:'u',tenantId:'t'};require('../../shared/auth/tokenStore').notify();mockOnline=true;mockAllowed=true
 mockEvent={_id:'e',status:'active',clientId:'c',eventType:'Заказ',eventDate:'2020-01-01',description:'Сохранённое описание',additionalEvents:[{title:'Контакт'}],documents:[{name:'Договор'}] as any,syncStatus:'synced'}
 mockProposal={_id:'p',eventId:'e',title:'Принятое КП',version:1,status:'published',packages:[],blocksSnapshot:[],mediaSnapshot:[],selectedPackageId:'main',selectedAt:'2026-10-01',messageText:''}
 mockReviews=[{_id:'r',eventId:'e',clientId:'c',status:'received',createdAt:'2026-10-01',expiresAt:'2026-11-01',submittedAt:'2026-10-02',rating:2,comment:'Связаться со мной',note:''}]
 mockGet.mockImplementation(async(path:string)=>({success:true,data:path==='/mobile/v1/billing'?{currentTariff:{allowProposals:mockAllowed,allowDocuments:true}}:path.includes('/statuses')?{e:{status:'received',rating:2}}:{items:mockReviews,total:mockReviews.length,allowClientReviews:true}}))
 mockUpsert.mockImplementation(async (_kind:string,items:Event[])=>{mockEvent=items[0]})
 mockRequest.mockImplementation(async(path:string,options:any)=>{
  if(path==='/proposal-templates')return {success:true,data:[]}
  if(path==='/events/e/proposals')return {success:true,data:[mockProposal]}
  if(path==='/mobile/v1/events/e')return {success:true,data:readEvent()}
  if(path==='/proposals/p') {if(options?.body?.action==='apply')mockProposal={...mockProposal,appliedPackageId:'main',appliedAt:'2026-10-03',appliedSelectionAt:'2026-10-01'};return {success:true,data:mockProposal}}
  throw Error('Unexpected '+path)
 })
})
afterEach(()=>{cache?.clear();jest.restoreAllMocks()})
it.each(['light','dark'] as const)('real event sections coexist with tasks, contacts and documents: %s',async theme=>{
 const screen=setup(EventDetailScreen,theme)
 await screen.findByTestId('event-client-review-section');await screen.findByText('Принятое КП')
 expect(screen.getByTestId('event-tasks')).toBeTruthy();expect(screen.getByTestId('event-contacts')).toBeTruthy();expect(screen.getByText('Документы')).toBeTruthy()
 fireEvent.press(screen.getByText('Запланировать контакт'))
 expect(router.push).toHaveBeenCalledWith({pathname:'/events/edit/[id]',params:{id:'e',section:'contacts'}})
})
it('apply uses real API exact read, persists merged cache and invalidates all event consumers',async()=>{
 const capturedToken=await require('../../shared/auth/tokenStore').getAccessToken()
 const invalidate=jest.spyOn(QueryClient.prototype,'invalidateQueries'),alert=jest.spyOn(Alert,'alert')
 const screen=setup(EventDetailScreen)
 await screen.findByTestId('proposal-apply-p');await waitFor(()=>expect(screen.getByTestId('proposal-apply-p').props.accessibilityState.disabled).toBe(false))
 fireEvent.press(screen.getByTestId('proposal-apply-p'));act(()=>alert.mock.calls[0][2]?.find(b=>b.text==='Применить')?.onPress?.())
 await waitFor(()=>expect(mockUpsert).toHaveBeenCalled())
 const applyCall=mockRequest.mock.calls.find(([path,options])=>path==='/proposals/p'&&options?.body?.action==='apply')
 expect(applyCall).toBeDefined()
 expectBoundRead(mockRequest.mock.calls,capturedToken,applyCall![1].signal,applyCall)
 expect(mockUpsert.mock.calls[0]).toEqual(['events',[expect.objectContaining({contractSum:900,servicesIds:['s'],description:'Сохранённое описание',documents:mockEvent.documents,additionalEvents:mockEvent.additionalEvents,agreedProposal:{title:'Согласованный состав'}})]])
 await waitFor(()=>expect(cache.getQueryData<any[]>(['cached-entities','events'])?.[0].contractSum).toBe(900))
 expect(invalidate).toHaveBeenCalledWith({queryKey:['cached-entities','events']});alert.mockRestore();invalidate.mockRestore()
})
it.each(['local','demo','offline','pending'] as const)('does not mutate saved server entity in %s state',async state=>{
 if(state==='local')mockEvent._id='local-e';if(state==='demo')(mockEvent as any).isDemo=true;if(state==='offline')mockOnline=false;if(state==='pending')mockEvent.syncStatus='pending'
 const screen=setup(EventDetailScreen);await act(async()=>{})
 expect(screen.queryByTestId('proposal-create')).toBeNull();expect(mockRequest).not.toHaveBeenCalled()
})
it('tariff denial keeps historical reviews available and hides proposal mutations',async()=>{
 mockAllowed=false;const screen=setup(EventDetailScreen);await screen.findByTestId('event-client-review-section')
 await screen.findByText(/Коммерческие предложения доступны на тарифе/)
 expect(screen.queryByTestId('proposal-create')).toBeNull()
})
it('client card includes actual reviews and navigation',async()=>{
 const screen=setup(ClientDetailScreen);await screen.findByTestId('client-reviews-section')
 expect(mockGet.mock.calls.some(([p])=>String(p).includes('clientId=e'))).toBe(true)
 fireEvent.press(await screen.findByText('Открыть работу'));expect(router.push).toHaveBeenCalledWith('/events/e')
})
it('attention includes actual unread reviews',async()=>{
 const screen=setup(AttentionScreen);await screen.findByTestId('unread-client-reviews')
 expect(mockGet.mock.calls.some(([p])=>String(p).includes('unread=true'))).toBe(true)
 fireEvent.press(await screen.findByText('Клиент и контакты'));expect(router.push).toHaveBeenCalledWith('/clients/c')
})
it('list cards share one status query (no per-event N+1)',async()=>{
 const Cards=()=> <><MobileEventCard event={mockEvent} services={[]} transactions={[]} testID="one" onPress={()=>{}}/><MobileEventCard event={{...mockEvent,_id:'second'}} services={[]} transactions={[]} testID="two" onPress={()=>{}}/></>
 const screen=setup(Cards);await screen.findByText('★ 2 из 5')
 expect(mockGet.mock.calls.filter(([p])=>p==='/client-reviews/statuses')).toHaveLength(1)
})
it('real menu reaches exact reviews, appearance and proposal library routes',()=>{
 const navigate=jest.fn(),Menu=()=> <MenuCatalogue onNavigate={navigate}/>
 const screen=setup(Menu)
 fireEvent.press(screen.getByText('Отзывы'));fireEvent.press(screen.getByText('Отзывы клиентов'));expect(navigate).toHaveBeenLastCalledWith('/more/client-reviews')
 fireEvent.press(screen.getByText('Настройка страницы отзывов'));expect(navigate).toHaveBeenLastCalledWith('/more/review-page')
 fireEvent.press(screen.getByText('Настройки'));fireEvent.press(screen.getByText('Шаблоны КП'));expect(navigate).toHaveBeenLastCalledWith('/more/proposal-templates')
 expect(require('../../../app/more/client-reviews').default).toBe(require('../reviews/ClientReviewsScreen').ClientReviewsScreen)
 expect(require('../../../app/more/review-page').default).toBe(require('../reviews/ReviewPageScreen').ReviewPageScreen)
 expect(require('../../../app/more/proposal-templates/index').default).toBe(require('../proposals/ProposalTemplatesScreen').ProposalTemplatesScreen)
})
it('identity change discards a delayed proposal read before local cache writes',async()=>{
 let finish!:(value:any)=>void
 const original=mockRequest.getMockImplementation()!
 mockRequest.mockImplementation((path:string,options:any)=>path==='/mobile/v1/events/e' && mockProposal.appliedAt ? new Promise(resolve=>{finish=resolve}) : original(path,options))
 const alert=jest.spyOn(Alert,'alert'),screen=setup(EventDetailScreen)
 await screen.findByTestId('proposal-apply-p');await waitFor(()=>expect(screen.getByTestId('proposal-apply-p').props.accessibilityState.disabled).toBe(false))
 fireEvent.press(screen.getByTestId('proposal-apply-p'));act(()=>alert.mock.calls[0][2]?.find(b=>b.text==='Применить')?.onPress?.())
 await waitFor(()=>expect(finish).toBeDefined())
 const capturedToken=await require('../../shared/auth/tokenStore').getAccessToken()
 const applyCall=mockRequest.mock.calls.find(([path,options])=>path==='/proposals/p'&&options?.body?.action==='apply')
 expect(applyCall).toBeDefined()
 const lifecycleSignal=expectBoundRead(mockRequest.mock.calls,capturedToken,applyCall![1].signal,applyCall)
 const cachedEvents=cache.getQueryData(['cached-entities','events'])
 const publish=jest.spyOn(cache,'setQueryData')
 mockUser={_id:'other',tenantId:'other'}
 screen.rerender(<QueryClientProvider client={cache}><ThemeProvider forcedMode="light" storage={null}><EventDetailScreen/></ThemeProvider></QueryClientProvider>)
 await act(async()=>finish({success:true,data:readEvent()}))
 expect(lifecycleSignal.aborted).toBe(true)
 expect(publish.mock.calls.filter(([key])=>JSON.stringify(key)===JSON.stringify(['cached-entities','events']))).toHaveLength(0)
 expect(cache.getQueryData(['cached-entities','events'])).toEqual(cachedEvents)
 expect(mockUpsert).not.toHaveBeenCalled();alert.mockRestore()
})

it('billing screen passes dynamic rates to current and available tariff estimates',async()=>{
 const tariff={_id:'pro',title:'Профи',price:100,eventsPerMonth:0,allowAi:true,aiIncludedRubPerMonth:100}
 mockGet.mockImplementation(async()=>({success:true,data:{account:{balance:800},currentTariff:tariff,tariffs:[tariff],aiIncludedRates:{transcriptionRubPerSecond:0.1,voiceNoteRub:2,eventDraftRub:4,fileRecordRub:0}}}))
 const screen=setup(BillingScreen)
 await screen.findByTestId('current-ai-estimate-pro')
 expect(screen.getByTestId('current-ai-estimate-pro')).toHaveTextContent(/17 мин расшифровки звонков/)
 expect(screen.getByTestId('ai-estimate-pro')).toHaveTextContent(/25 черновиков по заметке/)
})
it('virtualized card mounts reuse the status map after the first response settles',async()=>{
 const card=(id:string)=><MobileEventCard event={{...mockEvent,_id:id,clientId:null}} client={{_id:'c'}} services={[]} transactions={[]} testID={id} onPress={()=>{}}/>
 const screen=setup(()=>card('e'));await screen.findByText('★ 2 из 5')
 screen.rerender(<QueryClientProvider client={cache}><ThemeProvider storage={null} forcedMode="light">{card('e')}{card('later')}</ThemeProvider></QueryClientProvider>)
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100))})
 expect(mockGet.mock.calls.filter(([p])=>p==='/client-reviews/statuses')).toHaveLength(1)
})
