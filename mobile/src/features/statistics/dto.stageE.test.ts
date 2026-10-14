import { readStatistics, calculateStatistics } from './statistics'
const filters = { year: 2026, town: '', status: 'all' as const }
const event = { _id: 'e', clientId: null, eventType: '', description: '', eventDate: '2026-01-10T12:00:00Z', dateEnd: null, status: 'active', contractSum: 500, address: {town:'',street:'',house:''} }
it('consumes transferred DTO in separate monthly counts, without counting personal earnings', () => {
 const data = readStatistics({success:true,data:{events:[{...event,isTransferred:true}],clients:[],transactions:[],filters}},filters)
 expect((data.events[0] as typeof event & {isTransferred?:boolean}).isTransferred).toBe(true)
 const month = calculateStatistics(data,new Date('2026-10-01')).months[0]
 expect(month.transferredEventCounts.finished).toBe(1)
 expect(month.eventCounts.finished).toBe(0)
})
it('accepts an older server without the new flag', () => {
 expect(readStatistics({success:true,data:{events:[event],clients:[],transactions:[],filters}},filters).events).toHaveLength(1)
})
