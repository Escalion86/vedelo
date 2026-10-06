import { api } from '../../shared/api/client'
import { getPaymentPage, readPaymentPage, safeHttps, paymentDate, mergePayments } from './history'
jest.mock('../../shared/api/client', () => ({ api: { get: jest.fn() } }))
const row = { id:'p1', amount:123.45, direction:'in', type:'topup', kind:'referral_bonus', status:'pending', title:'Реферальный бонус', details:'Бонус 10% за пополнение приглашённого пользователя.', sourceTitle:'Ведело', methodTitle:'', receiptUrl:'https://receipt.test/view', occurredAt:null, management:{canDelete:true}, userId:'foreign', referralReward:{percent:10} }
const page = (item: unknown = row) => ({ success:true, data:{items:[item], account:{userId:'foreign'}}, meta:{hasMore:false,nextCursor:null} })
beforeEach(() => jest.clearAllMocks())
it('читает собственный DTO без management, userId и внутренней referral metadata', async () => {
  ;(api.get as jest.Mock).mockResolvedValue(page())
  const result = await getPaymentPage('bonus','cursor+/=')
  expect(api.get).toHaveBeenCalledWith('/billing/history?category=bonus&limit=30&cursor=cursor%2B%2F%3D')
  expect(result.items[0]).toMatchObject({kind:'referral_bonus',details:row.details,status:'pending',occurredAt:null})
  expect(result.items[0]).not.toHaveProperty('management'); expect(result.items[0]).not.toHaveProperty('userId'); expect(result.items[0]).not.toHaveProperty('referralReward')
})
it.each(['http://receipt.test','javascript:alert(1)','https://user:secret@receipt.test','https://receipt.test/\npath','file:///receipt',null,'https://'+ 'x'.repeat(2050)])('отвергает небезопасный чек %s',(value) => expect(safeHttps(value)).toBe(''))
it('не выдумывает дату и чек; убирает дубли страниц', () => {
  const a=readPaymentPage(page({...row,receiptUrl:''})).items
  expect(a[0].receiptUrl).toBe(''); expect(paymentDate(null)).toBe('Дата не указана'); expect(paymentDate('broken')).toBe('Дата не указана')
  expect(mergePayments(a,a)).toHaveLength(1)
})
it.each([{status:undefined},{amount:NaN},{amount:-2},{direction:'weird'},{id:''},{details:null}])('не заменяет повреждённую операцию проведённой: %j', (patch) => expect(() => readPaymentPage(page({...row,...patch}))).toThrow())
it('отвергает незавершённый cursor envelope', () => expect(() => readPaymentPage({...page(),meta:{hasMore:true,nextCursor:null}})).toThrow())
