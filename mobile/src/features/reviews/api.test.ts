import { actOnReview, listReviews, saveReviewPage, uploadReviewLogo } from './api'
import { emptyAppearance, publicAppearance, validateLogo } from './domain'
import { api } from '../../shared/api/client'
import { uploadOnce } from '../profile/uploadOnce'
jest.mock('../../shared/api/client',()=>({api:{get:jest.fn(),post:jest.fn(),patch:jest.fn()}}))
jest.mock('../profile/uploadOnce',()=>({uploadOnce:jest.fn()}))
beforeEach(()=>jest.clearAllMocks())
it('Фильтры соответствуют API: createdAt период, нулевая страница, без q',async()=>{
  ;(api.get as jest.Mock).mockResolvedValue({success:true,data:{items:[],total:0,allowClientReviews:false}})
  await listReviews({from:'2026-10-01',to:'2026-10-11',rating:'5',unread:'true',page:0})
  expect(api.get).toHaveBeenCalledWith('/client-reviews?from=2026-10-01&to=2026-10-11&rating=5&unread=true&page=0',{signal:undefined})
})
it('Чтение точного объекта после сохранения обязательно; ошибка read-back не превращается в успех',async()=>{
  ;(api.post as jest.Mock).mockResolvedValue({success:true,data:{reviewPage:emptyAppearance}})
  ;(api.get as jest.Mock).mockRejectedValue(new Error('Сбой повторного чтения'))
  await expect(saveReviewPage({...emptyAppearance,publicName:'Имя'})).rejects.toThrow('Сбой повторного чтения')
  expect(api.post).toHaveBeenCalledTimes(1)
})
it('Только шесть публичных полей, служебные поля не передаются',()=>{
  expect(Object.keys(publicAppearance({...emptyAppearance,tenantId:'чужой',phone:'скрыт'} as any)).sort()).toEqual(['accent','cover','greeting','logoUrl','publicName','specialization'])
})
it('Заметка передаёт только action/note; read без note',async()=>{
  ;(api.patch as jest.Mock).mockResolvedValue({success:true,data:{_id:'r'}})
  await actOnReview('r','note','Заметка');expect(api.patch).toHaveBeenLastCalledWith('/client-reviews/r',{action:'note',note:'Заметка'})
  await actOnReview('r','read');expect(api.patch).toHaveBeenLastCalledWith('/client-reviews/r',{action:'read'})
})
it('Фото: лимит 5 МБ и MIME до сети; uploadOnce без автоматического повтора',async()=>{
  expect(validateLogo({mimeType:'image/svg+xml',size:100})).toContain('PNG')
  expect(validateLogo({mimeType:'image/png',size:5242881})).toContain('5 МБ')
  await expect(uploadReviewLogo({uri:'file:///a',name:'a',mimeType:'image/png',size:0})).rejects.toThrow()
  expect(uploadOnce).not.toHaveBeenCalled()
})
