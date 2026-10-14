'use strict'
// Расширение только platform seam старой E-фикстуры: assertions и старые
// файлы не меняются. Новый readback boundary, queue, identity, cache/SQL реальны.
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const legacy = require('../src/features/proposals/__tests__/legacy.stageJ.transform.cjs')
const stamp = createHash('sha256').update(readFileSync(__filename)).digest('hex')
const oldCacheMock = "jest.mock('../../shared/storage/cache',()=>({getCachedEntity:async(kind:string)=>kind==='events'?mockEvent:{_id:mockEvent._id,firstName:'Клиент'},listCachedEntities:async()=>[],upsertEntities:(...a:any[])=>mockUpsert(...a)}))"
const cacheMock = "jest.mock('../../shared/storage/cache',()=>({getCachedEntity:async(kind:string)=>kind==='events'?mockEvent:{_id:mockEvent._id,firstName:'Клиент'},listCachedEntities:async()=>[],upsertEntities:(...a:any[])=>mockUpsert(...a),publishEntityReadback:(...a:any[])=>mockStageLActualCache.publishEntityReadback(...a)}))"
const platform = `
// Node SQLite под native platform seam. Actual database/cache/coordination и
// readback исполняются из L. Старый mockUpsert — только наблюдатель SQL commit.
const mockStageLRaw = new (require('node:sqlite').DatabaseSync)(':memory:')
let mockStageLSeeded = false
const mockStageLDb = {
 execAsync: async (sql:string) => mockStageLRaw.exec(sql),
 runAsync: async (sql:string,...args:any[]) => {
  const result=mockStageLRaw.prepare(sql).run(...args)
  if(sql.startsWith('INSERT INTO entity_cache') && args[0]==='events')
   await mockUpsert('events',[JSON.parse(args[2])])
  return result
 },
 getFirstAsync: async (sql:string,...args:any[]) => {
  if(sql.includes('cipher_version')) return {cipher_version:'native-platform-seam'}
  if(sql.includes('SELECT payload FROM entity_cache') && args[0]==='events' && !mockStageLSeeded){
   mockStageLSeeded=true
   mockStageLRaw.exec('DELETE FROM entity_cache; DELETE FROM outbox;')
   mockStageLRaw.prepare("INSERT INTO entity_cache(entity_type,entity_id,payload,version,updated_at,deleted_at) VALUES(?,?,?,?,?,NULL)").run('events',mockEvent._id,JSON.stringify(mockEvent),'1','2026-10-12')
  }
  return mockStageLRaw.prepare(sql).get(...args)
 },
 getAllAsync: async (sql:string,...args:any[]) => mockStageLRaw.prepare(sql).all(...args),
 withTransactionAsync: async (work:any) => {
  mockStageLRaw.exec('BEGIN')
  try{await work();mockStageLRaw.exec('COMMIT')}catch(error){mockStageLRaw.exec('ROLLBACK');throw error}
 },
}
jest.mock('expo-sqlite',()=>({openDatabaseAsync:async()=>mockStageLDb}))
const mockStageLActualCache=jest.requireActual('../../shared/storage/cache')
beforeAll(async()=>{await jest.requireActual('../../shared/storage/database').getDatabase()})
afterAll(()=>mockStageLRaw.close())
`
module.exports = {
 getCacheKey(source, filename, options) {
  return createHash('sha256').update(legacy.getCacheKey(source, filename, options)).update(stamp).digest('hex')
 },
 process(source, filename, options) {
  if (filename.endsWith('/features/events/integration.stageE.test.tsx')) {
   if(!source.includes(oldCacheMock) || !source.includes('let cache:QueryClient') || !source.includes('beforeEach(()=>{'))
    throw Error('Изменился контракт старой E-фикстуры; assertions не адаптируются')
   source=source.replace(oldCacheMock,cacheMock)
    .replace('let cache:QueryClient',platform+'\nlet cache:QueryClient')
    .replace('beforeEach(()=>{','beforeEach(()=>{\n mockStageLSeeded=false')
  }
  return legacy.process(source, filename, options)
 },
}
