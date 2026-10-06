import { uploadOnce } from './uploadOnce'
import { getAccessToken } from '../../shared/auth/tokenStore'
jest.mock('../../shared/auth/tokenStore',()=>({getAccessToken:jest.fn()}))
jest.mock('../../shared/config/env',()=>({env:{apiBaseUrl:'https://api.test/api'}}))
beforeEach(()=>{jest.resetAllMocks();(getAccessToken as jest.Mock).mockResolvedValue('test-token')})
it('401 не вызывает повтор POST/refresh и не кэширует payload',async()=>{
 const old=global.fetch;const request=jest.fn().mockResolvedValue({ok:false,status:401,headers:{get:()=> 'application/json'},json:async()=>({error:{message:'Не авторизован'}})});global.fetch=request
 try{await expect(uploadOnce('/support-tickets',new FormData())).rejects.toThrow('Не авторизован');expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0][0]).toBe('https://api.test/api/support-tickets')}finally{global.fetch=old}
})
it('потеря ответа не повторяет POST',async()=>{
 const old=global.fetch;const request=jest.fn().mockRejectedValue(new Error('lost'));global.fetch=request
 try{await expect(uploadOnce('/mobile/v1/profile/avatar',new FormData())).rejects.toThrow('lost');expect(request).toHaveBeenCalledTimes(1)}finally{global.fetch=old}
})
