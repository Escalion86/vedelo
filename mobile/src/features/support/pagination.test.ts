import { supportCursor } from './pagination'
it('не теряет серверную пагинацию при повреждённом cursor',()=>{
 expect(supportCursor({hasMore:false,nextCursor:null})).toBeNull();expect(supportCursor({hasMore:true,nextCursor:'next'})).toBe('next')
 expect(()=>supportCursor({hasMore:true,nextCursor:null})).toThrow('страницу')
})
