import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import ProfileScreen from '../../../app/(tabs)/profile'
import { api } from '../../shared/api/client'
import { getAuthSession } from '../../shared/auth/tokenStore'
import { uploadOnce } from './uploadOnce'
import { copyImage } from './nativeImage'
import * as Picker from 'expo-document-picker'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
const initial={_id:'u1',tenantId:'t1',role:'user',firstName:'Иван',secondName:'Иванов',thirdName:'Иванович',email:'a@test.ru',phone:'79990000000',whatsapp:'79000000000',viber:'79000000001',telegram:'name',vk:'vkname',instagram:'insta',images:[],tariffId:null}
let mockUser=initial
const mockSignIn=jest.fn(),mockSignOut=jest.fn(),mockReplace=jest.fn(),mockDispose=jest.fn()
jest.mock('../../shared/auth/AuthProvider',()=>({useAuth:()=>({user:mockUser,completeSignIn:mockSignIn,signOut:mockSignOut})}))
jest.mock('../../shared/auth/tokenStore',()=>({getAuthSession:jest.fn(),getRefreshToken:jest.fn()}))
jest.mock('../../shared/api/client',()=>({api:{get:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()}}))
jest.mock('./uploadOnce',()=>({uploadOnce:jest.fn()}))
jest.mock('./nativeImage',()=>({copyImage:jest.fn()}))
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}))
jest.mock('./ArtistRequisitesSection',()=>({ArtistRequisitesSection:()=>null}))
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:()=>null}))
jest.mock('expo-router',()=>({router:{replace:(path:string)=>mockReplace(path)},useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}))
const device={_id:'session',deviceName:'Телефон',current:false,lastUsedAt:'2026-10-01',expiresAt:'invalid'}
beforeEach(()=>{
 jest.resetAllMocks();mockUser=initial
 ;(api.get as jest.Mock).mockImplementation((path:string)=>Promise.resolve({success:true,data:path.endsWith('sessions')?[device]:path.endsWith('change-password')?{hasPassword:true}:mockUser}))
 ;(getAuthSession as jest.Mock).mockResolvedValue({accessToken:'test-access',refreshToken:'test-refresh',user:initial})
 ;(copyImage as jest.Mock).mockReturnValue({uri:'file:///owned.jpg',dispose:mockDispose})
})
it.each(['light','dark'] as const)('%s: контакты/ФИО сохраняются с read-back и черновик остаётся после ошибки',async(mode)=>{
 const screen=render(<ThemeProvider forcedMode={mode} storage={null}><ProfileScreen /></ThemeProvider>)
 await screen.findByText('Телефон')
 for(const label of ['Имя','Фамилия','Отчество','Email','WhatsApp','Viber','Telegram','VK','Instagram']) expect(screen.getByLabelText(label)).toBeTruthy()
 fireEvent.changeText(screen.getByLabelText('Имя'),'Пётр');(api.patch as jest.Mock).mockRejectedValueOnce(new Error('lost'))
 fireEvent.press(screen.getByText('Сохранить'));await screen.findByText(/Результат не подтверждён/)
 expect(screen.getByLabelText('Имя').props.value).toBe('Пётр');expect(mockSignIn).not.toHaveBeenCalled()
 const saved={...initial,firstName:'Пётр'};(api.patch as jest.Mock).mockResolvedValue({success:true,data:saved});(api.get as jest.Mock).mockResolvedValue({success:true,data:saved})
 fireEvent.press(screen.getByText('Сохранить'));await screen.findByText('Профиль сохранён')
 expect(mockSignIn).toHaveBeenCalledWith(expect.objectContaining({user:saved}))
 expect(api.patch).toHaveBeenLastCalledWith('/mobile/v1/auth/me',expect.objectContaining({firstName:'Пётр',viber:initial.viber}),{skipRefresh:true})
})
it('аватар: собственная копия очищается после ошибки и cancel не удаляет источник',async()=>{
 const screen=render(<ProfileScreen />);await screen.findByText('Телефон')
 ;(Picker.getDocumentAsync as jest.Mock).mockResolvedValue({canceled:false,assets:[{uri:'content://original',name:'photo.jpg',mimeType:'image/jpeg',size:200}]})
 ;(uploadOnce as jest.Mock).mockRejectedValue(new Error('lost'))
 fireEvent.press(screen.getByText('Выбрать фото'));await screen.findByText(/Результат не подтверждён/)
 expect(copyImage).toHaveBeenCalledWith('content://original','photo.jpg');expect(mockDispose).toHaveBeenCalledTimes(1)
 ;(Picker.getDocumentAsync as jest.Mock).mockResolvedValue({canceled:true});fireEvent.press(screen.getByText('Выбрать фото'))
 await waitFor(()=>expect(Picker.getDocumentAsync).toHaveBeenCalledTimes(2));expect(mockDispose).toHaveBeenCalledTimes(1)
})
it('успешный avatar read-back и отзыв сессии подтверждаются GET',async()=>{
 const alert=jest.spyOn(Alert,'alert')
 const screen=render(<ProfileScreen />);await screen.findByText('Телефон')
 ;(Picker.getDocumentAsync as jest.Mock).mockResolvedValue({canceled:false,assets:[{uri:'content://original',name:'photo.jpg',mimeType:'image/jpeg',size:200}]})
 const saved={...initial,images:['https://cloud.test/avatar']};(uploadOnce as jest.Mock).mockResolvedValue({success:true,data:saved});(api.get as jest.Mock).mockResolvedValue({success:true,data:saved})
 fireEvent.press(screen.getByText('Выбрать фото'));await screen.findByText('Аватар обновлён');expect(mockDispose).toHaveBeenCalledTimes(1)
 ;(api.get as jest.Mock).mockResolvedValue({success:true,data:[]});(api.delete as jest.Mock).mockResolvedValue({success:true,data:{revoked:true}})
 fireEvent.press(screen.getByLabelText('Отключить Телефон'))
 await act(async()=>{await alert.mock.calls.at(-1)?.[2]?.[1]?.onPress?.()})
 await screen.findByText('Устройство отключено');expect(screen.queryByText('Телефон')).toBeNull();alert.mockRestore()
})
it('старый пользователь и двойное нажатие не публикуют поздний save',async()=>{
 let finish:(value:unknown)=>void=()=>undefined;(api.patch as jest.Mock).mockImplementation(()=>new Promise(resolve=>finish=resolve))
 const screen=render(<ProfileScreen />);await screen.findByText('Телефон');fireEvent.press(screen.getByText('Сохранить'));fireEvent.press(screen.getByText('Сохранить'))
 expect(api.patch).toHaveBeenCalledTimes(1)
 mockUser={...initial,_id:'u2',tenantId:'t2',firstName:'Новый'};screen.rerender(<ProfileScreen />)
 await act(async()=>finish({success:true,data:initial}));expect(mockSignIn).not.toHaveBeenCalled();expect(screen.getByLabelText('Имя').props.value).toBe('Новый')
})
it('пароль не сохраняется после ошибки, POST не повторяется через refresh',async()=>{
 ;(api.post as jest.Mock).mockRejectedValue(new Error('lost'))
 const screen=render(<ProfileScreen />);await screen.findByText('Телефон')
 fireEvent.changeText(screen.getByLabelText('Текущий пароль'),'old');fireEvent.changeText(screen.getByLabelText('Новый пароль'),'new-pass-123');fireEvent.changeText(screen.getByLabelText('Повторите пароль'),'new-pass-123');fireEvent.press(screen.getByText('Сменить пароль'))
 await screen.findByText(/Результат не подтверждён/);expect(screen.getByLabelText('Текущий пароль').props.value).toBe('');expect(screen.getByLabelText('Новый пароль').props.value).toBe('')
 expect(api.post).toHaveBeenCalledWith('/mobile/v1/auth/change-password',{currentPassword:'old',newPassword:'new-pass-123'},{skipRefresh:true})
})
it.each(['light','dark'] as const)('%s: первый пароль, повтор и последующая смена',async(mode)=>{
 let hasPassword=false
 ;(api.get as jest.Mock).mockImplementation((path:string)=>Promise.resolve({success:true,data:path.endsWith('sessions')?[device]:path.endsWith('change-password')?{hasPassword}:mockUser}))
 ;(api.post as jest.Mock).mockImplementation(async()=>{hasPassword=true;return {success:true,data:{accessToken:'next-access',refreshToken:'next-refresh',user:initial}}})
 const screen=render(<ThemeProvider forcedMode={mode} storage={null}><ProfileScreen /></ThemeProvider>)
 await screen.findByText('Установить пароль')
 expect(screen.queryByLabelText('Текущий пароль')).toBeNull()
 fireEvent.changeText(screen.getByLabelText('Новый пароль'),'first-pass-123')
 fireEvent.changeText(screen.getByLabelText('Повторите пароль'),'different-123')
 expect(screen.getByText('Пароли не совпадают')).toBeTruthy()
 fireEvent.press(screen.getByText('Установить пароль'));expect(api.post).not.toHaveBeenCalled()
 fireEvent.changeText(screen.getByLabelText('Повторите пароль'),'first-pass-123')
 fireEvent.press(screen.getByText('Установить пароль'))
 await screen.findByText('Пароль установлен')
 expect(api.post).toHaveBeenCalledWith('/mobile/v1/auth/change-password',{currentPassword:'',newPassword:'first-pass-123'},{skipRefresh:true})
 expect(screen.getByLabelText('Текущий пароль')).toBeTruthy()
 expect(screen.getByText('Сменить пароль')).toBeTruthy()
})
it('неизвестный статус скрывает пароль, повтор восстанавливает форму',async()=>{
 ;(api.get as jest.Mock).mockImplementation((path:string)=>Promise.resolve({success:true,data:path.endsWith('sessions')?[device]:{}}))
 const screen=render(<ProfileScreen />)
 await screen.findByText('Не удалось проверить состояние пароля')
 expect(screen.queryByLabelText('Новый пароль')).toBeNull()
 ;(api.get as jest.Mock).mockResolvedValue({success:true,data:{hasPassword:false}})
 fireEvent.press(screen.getByText('Повторить'))
 await screen.findByText('Установить пароль')
})
