import React from 'react'
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { Share, StyleSheet } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import HistoryScreen from '../../../app/history'
import { MenuCatalogue } from '../navigation/MenuSheet'
import { menuGroups } from '../navigation/menu'
import BillingScreen from '../../../app/billing'
import { calculateStatistics } from './statistics'
import { PeriodPicker } from '../../shared/ui/PeriodPicker'
import { PageHeader } from '../../shared/ui/components'
import { MenuRow } from '../navigation/MenuRow'
import { IntegrationRow } from '../integrations/IntegrationRow'
import { AiUsagePanel } from '../integrations/AiUsagePanel'
import { StatisticsSection } from './StatisticsSection'
import { ReferralsSection } from '../referrals/ReferralsSection'
import { shareStatisticsCsv } from './exportCsv'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
const mockFetch = jest.fn(); const mockGet = jest.fn(); const mockPush = jest.fn()
let mockFocus = true; let mockUser = { _id: 'a'.repeat(24), tenantId: 'tenant-a', role: 'dev' }
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { push: (...args: any[]) => mockPush(...args) }, useFocusEffect: (fn: any) => require('react').useEffect(() => mockFocus ? fn() : undefined, [fn, mockFocus]) }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args) } }))
jest.mock('../../shared/config/env', () => ({ env: { apiBaseUrl: 'https://current.example/api' } }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ mode: 'orders', label: 'заказ', labelCapitalized: 'Заказ', plural: 'заказы', pluralCapitalized: 'Заказы' }) }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }))
jest.mock('./exportCsv', () => ({ shareStatisticsCsv: jest.fn() }))
const draw = (kind: 'statistics' | 'referrals' = 'statistics', mode: 'light' | 'dark' = 'light') => <ThemeProvider forcedMode={mode} storage={null}>{kind === 'statistics' ? <StatisticsSection /> : <ReferralsSection />}</ThemeProvider>
function deferred() { let resolve!: (value: any) => void; let reject!: (value: any) => void; const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const statistics = (path: string, amount = 123) => { const query = new URL(`https://local.example${path}`).searchParams; return { success: true, data: { events: [], clients: [], transactions: amount ? [{ _id: 'tx-1', clientId: null, eventId: null, amount, type: 'income', category: '', date: null, comment: 'Кириллица; "внутри"\nновая строка' }] : [], filters: { year: query.has('year') ? Number(query.get('year')) : null, town: query.get('town') || '', status: query.get('status') || 'all' } } } }
const referralData = (name = 'Анна') => ({ success: true, data: { referralsCount: 1, rewardsCount: 2, rewardsTotal: 50, referrals: [{ user: { _id: 'c'.repeat(24), firstName: name, secondName: 'Фамилия '.repeat(15), thirdName: '', registrationType: '', createdAt: '2026-10-01T00:00:00Z' }, rewardsCount: 2, rewardsTotal: 50, lastRewardAt: '2026-10-02T00:00:00Z' }] } })
beforeEach(() => { jest.resetAllMocks(); global.fetch=mockFetch; mockFetch.mockResolvedValue({ok:true,headers:{get:()=> 'image/png'},arrayBuffer:async()=>new Uint8Array([137,80,78,71,13,10,26,10]).buffer}); mockFocus = true; mockUser = { _id: 'a'.repeat(24), tenantId: 'tenant-a', role: 'dev' }; mockGet.mockImplementation(async (path: string) => path.includes('/referrals') ? referralData() : statistics(path)); (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(true); (shareStatisticsCsv as jest.Mock).mockResolvedValue(undefined) })

jest.mock('../history/useHistory', () => ({ useHistory: () => ({items: [], loading: false, reload: jest.fn(), loadMore: jest.fn()}) }))
jest.mock('../../shared/storage/cache', () => ({}))
jest.mock('../../shared/auth/tokenStore', () => ({}))
jest.mock('../profile/useScreenLifetime', () => { const live=()=>()=>true; return {useScreenLifetime:()=>live} })
jest.mock('../billing/PaymentHistory', () => ({ PaymentHistory: () => null }))
jest.mock('../support/api', () => ({}))
jest.mock('expo-web-browser', () => ({}))
jest.mock('react-native-safe-area-context', () => ({SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({top:24,bottom:16,left:0,right:0})}))

it('меню содержит группу отзывов с двумя точными маршрутами в пользовательском порядке', () => {
 expect(menuGroups.map(g => g.title)).toEqual(['Статистика','Транзакции','Звонки','Отзывы','История действий','Поддержка','Настройки'])
 const navigate = jest.fn(); const screen = render(<MenuCatalogue onNavigate={navigate} />)
 fireEvent.press(screen.getByRole('button', {name:'Отзывы'})); fireEvent.press(screen.getByText('Настройка страницы отзывов')); fireEvent.press(screen.getByRole('button',{name:'Настройки'}));expect(screen.getByText('Настройка страницы отзывов')).toBeTruthy()
 expect(navigate).toHaveBeenCalledWith('/more/review-page')
 expect(menuGroups.find(g=>g.title==='Отзывы')!.items.map(i=>i.href)).toEqual(['/more/client-reviews','/more/review-page'])
 expect(menuGroups.find(g=>g.title==='Отзывы')!.items.every(i=>!i.pendingDescription)).toBe(true)
})
it('история: сводка и сброс доступны после сворачивания без изменения поиска', () => {
 const screen=render(<HistoryScreen />); fireEvent.changeText(screen.getByLabelText('Поиск'),'Анна')
 expect(screen.getByTestId('history-filter-count')).toHaveTextContent('1')
 expect(screen.getByTestId('history-filter-summary')).toHaveTextContent('Поиск: Анна')
 fireEvent.press(screen.getByText('Фильтры')); expect(screen.getByTestId('history-filter-scroll')).toBeTruthy()
 fireEvent.press(screen.getByText('Фильтры')); expect(screen.getByLabelText('Поиск').props.value).toBe('Анна')
 fireEvent.press(screen.getByTestId('history-reset')); expect(screen.getByLabelText('Поиск').props.value).toBe('')
})
it.each(['light','dark'] as const)('статистика %s содержит месячный график и обе действующие подсказки',async mode=>{
 const screen=render(draw('statistics',mode)); await screen.findByTestId('statistics-net')
 expect(screen.getByText('Прибыль по месяцам')).toBeTruthy()
 expect(screen.getByText('Ожидаемая прибыль — текущая прибыль + недооплачено.')).toBeTruthy()
 fireEvent.press(screen.getByLabelText('Подсказка: Прибыль по месяцам')); expect(screen.getByTestId('field-help-panel')).toBeTruthy()
 fireEvent.press(screen.getByLabelText('Закрыть подсказку')); fireEvent.press(screen.getByLabelText('Подсказка: Ожидаемая прибыль'))
 expect(screen.getByTestId('field-help-panel')).toBeTruthy()
})
it('реферальный QR кодирует ровно показанный, скопированный и отправленный адрес', async()=>{
 const screen=render(draw('referrals')); await screen.findByText('Ваша реферальная ссылка')
 const link=`https://current.example/register?ref=${mockUser._id}`
 expect(await screen.findByTestId('referral-qr-image')).toBeTruthy(); expect(mockFetch).toHaveBeenCalledWith('https://qr.escalion.ru/api/v1/qr/generate',expect.objectContaining({credentials:'omit',headers:{'Content-Type':'application/json'}})); expect(JSON.parse(mockFetch.mock.calls[0][1].body).data.url).toBe(link)
 expect(screen.getByTestId('referral-link')).toHaveTextContent(link)
 fireEvent.press(screen.getByText('Скопировать ссылку')); await waitFor(()=>expect(Clipboard.setStringAsync).toHaveBeenCalledWith(link)); await screen.findByText('Реферальная ссылка скопирована'); await waitFor(()=>expect(screen.getByRole('button',{name:'Поделиться ссылкой'})).toBeEnabled())
 const share=jest.spyOn(Share,'share').mockResolvedValue({action:Share.dismissedAction});fireEvent.press(screen.getByText('Поделиться ссылкой'))
 await waitFor(()=>expect(share).toHaveBeenCalledWith({message:link}));share.mockRestore()
})
it.each([0,150,300])('тариф %s ₽ ИИ: отдельные строки, i и сумма-зависимая оценка',async sum=>{
 const tariff={_id:'t',title:'Профи',price:100,eventsPerMonth:20,allowAi:sum>0,aiIncludedRubPerMonth:sum,allowCalendarSync:true,allowStatistics:true,allowDocuments:true,allowProposals:true,allowClientReviews:true,allowTelephony:true,allowAvitoIntegration:true,allowVkIntegration:true,allowTelegramIntegration:true,allowPublicLeadApi:true}
 mockGet.mockResolvedValue({success:true,data:{account:{balance:800},currentTariff:null,tariffs:[tariff]}})
 const screen=render(<BillingScreen/>);await screen.findByText('Профи'); await act(async()=>{})
 expect(within(screen.getByTestId('tariff-features-t')).getAllByRole('button')).toHaveLength(12)
 fireEvent.press(screen.getByLabelText(/Подсказка: ИИ-возможности/))
 if(!sum){ expect(screen.getByTestId('field-help-panel')).toHaveTextContent(/В этом тарифе ИИ-возможности не подключены\./);expect(screen.getByTestId('field-help-panel')).not.toHaveTextContent(/оплачиваются с баланса/) }
 else {expect(screen.getByTestId('field-help-panel')).toHaveTextContent(new RegExp(`В этом тарифе на ИИ включено ${sum} ₽ в месяц`))}
 fireEvent.press(screen.getByLabelText('Закрыть подсказку'))
 if(sum) expect(screen.getByTestId('ai-estimate-t')).toHaveTextContent(sum===300?/4 ч 10 мин/:/2 ч 5 мин/)
 else expect(screen.queryByTestId('ai-estimate-t')).toBeNull()
})

it('общая шапка и реальные текстовые роли меню используют InterTight и 64 dp',()=>{
 const screen=render(<><PageHeader title="История" count={0}/><MenuRow title="Длинная подпись меню" icon="cog-outline" onPress={()=>{}}/><IntegrationRow title="ИИ" description="Описание" icon="creation-outline" onPress={()=>{}}/></>)
 expect(screen.getByTestId('page-header')).toHaveStyle({minHeight:64})
 expect(screen.getByText('История')).toHaveStyle({fontFamily:'InterTight',fontSize:16})
 for(const text of ['Длинная подпись меню','ИИ','Описание'])expect(screen.getByText(text)).toHaveStyle({fontFamily:'InterTight'})
})
it('месячные суммы группируют связанные деньги по работе, свободные по дате; будущая прибыль и отрицательные оплаты как в вебе',()=>{
 const year=2026
 const base={clientId:null,eventType:'Заказ',description:'',dateEnd:null,status:'active' as const,address:{town:'',street:'',house:''}}
 const data={filters:{year,town:'',status:'all' as const},clients:[],events:[{...base,_id:'jan',eventDate:'2026-01-20T12:00:00Z',contractSum:1000},{...base,_id:'dec',eventDate:'2026-12-20T12:00:00Z',contractSum:600}],transactions:[{_id:'1',eventId:'jan',clientId:null,amount:-100,type:'income' as const,category:'',date:'2026-10-01T12:00:00Z',comment:''},{_id:'2',eventId:'dec',clientId:null,amount:200,type:'income' as const,category:'deposit',date:'2026-09-01T12:00:00Z',comment:''},{_id:'3',eventId:'dec',clientId:null,amount:50,type:'expense' as const,category:'other',date:'2026-09-01T12:00:00Z',comment:''},{_id:'4',eventId:null,clientId:null,amount:40,type:'expense' as const,category:'other',date:'2026-02-01T12:00:00Z',comment:''}]}
 const stats=calculateStatistics(data,new Date('2026-10-11T12:00:00Z')) as any
 expect(stats.paymentLeft).toBe(1400)
 expect(stats.months).toHaveLength(12)
 expect(stats.months[0]).toMatchObject({monthKey:'2026-01',profit:-100,paymentLeft:1000})
 expect(stats.months[1]).toMatchObject({profit:-40})
 expect(stats.months[11]).toMatchObject({monthKey:'2026-12',profit:150,paymentLeft:400,isFuture:true})
 expect(stats.depositPaid).toBe(200)
})

it('период на узком экране открывается безопасной нижней панелью с веб-радиусом и 44 dp',()=>{
 const spy=jest.spyOn(require('react-native'),'useWindowDimensions').mockReturnValue({width:360,height:480,scale:1,fontScale:1})
 const screen=render(<PeriodPicker value={{from:'',to:''}} onChange={()=>{}} testID="stage-period"/>);fireEvent.press(screen.getByTestId('stage-period-trigger'))
 expect(screen.getByTestId('stage-period')).toHaveStyle({width:360,borderTopLeftRadius:18,borderTopRightRadius:18})
 expect(screen.getByTestId('stage-period-trigger')).toHaveStyle({minHeight:44})
 spy.mockRestore()
})

it('включённый ИИ сохраняет месячный остаток и понятную оценку без платных запросов',async()=>{
 mockGet.mockResolvedValue({success:true,data:{balance:0,requiredBalance:0,available:true,platformConfigured:true,summary:{operations:0,charged:0},quotes:[],recent:[],tariffIncluded:{enabled:true,includedRub:300,usedRub:10,remainingRub:290,coveredByTariff:true}}})
 const screen=render(<AiUsagePanel activeProvider="artistcrm"/>);await screen.findByText('ИИ включён в тариф')
 expect(screen.getByTestId('ai-usage-estimate')).toHaveTextContent(/4 ч 10 мин/)
 expect(screen.getByText(/осталось/)).toHaveTextContent(/290/)
 expect(mockGet.mock.calls.every(([path])=>path==='/ai/usage')).toBe(true)
})
it('сбой QR сохраняет ссылку и копирование, повтор перечитывает QR без платных API',async()=>{
 mockFetch.mockRejectedValueOnce(Error('Сеть недоступна'))
 const screen=render(draw('referrals'));await screen.findByText(/Не удалось загрузить QR-код/)
 expect(screen.getByTestId('referral-link')).toHaveTextContent(`https://current.example/register?ref=${mockUser._id}`)
 fireEvent.press(screen.getByText('Скопировать ссылку'));await waitFor(()=>expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1))
 fireEvent.press(screen.getByText('Повторить загрузку QR-кода'));await screen.findByTestId('referral-qr-image');expect(mockFetch).toHaveBeenCalledTimes(2)
})
it('смена профиля не оставляет QR предыдущей реферальной ссылки',async()=>{
 const screen=render(draw('referrals'));await screen.findByTestId('referral-qr-image')
 mockUser={_id:'b'.repeat(24),tenantId:'tenant-b',role:'user'};screen.rerender(draw('referrals'));await screen.findByTestId('referral-qr-image')
 await waitFor(()=>expect(mockFetch).toHaveBeenCalledTimes(2));expect(JSON.parse(mockFetch.mock.calls[1][1].body).data.url).toBe(`https://current.example/register?ref=${mockUser._id}`)
 expect(mockFetch.mock.calls[0][1].signal.aborted).toBe(true)
})
