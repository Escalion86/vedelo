import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render } from '@testing-library/react-native'
import BillingScreen from '../../../app/billing'
import { api } from '../../shared/api/client'
import * as WebBrowser from 'expo-web-browser'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
let mockUser={_id:'u1',tenantId:'t1',role:'dev'}
jest.mock('../../shared/auth/AuthProvider',()=>({useAuth:()=>({user:mockUser})}))
jest.mock('../../shared/hooks/useWorkItemTerminology',()=>({useWorkItemTerminology:()=>({pluralGenitive:'заказов',pluralDative:'заказам'})}))
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:()=>null}))
jest.mock('../../shared/api/client',()=>({api:{get:jest.fn(),post:jest.fn()}}))
jest.mock('expo-web-browser',()=>({openBrowserAsync:jest.fn()}))
jest.mock('./PaymentHistory',()=>({PaymentHistory:()=>null}))
jest.mock('expo-router',()=>({useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}))
const tariff={_id:'dev-tariff',title:'DEV',price:0,eventsPerMonth:0,allowDocuments:true}
const next={...tariff,_id:'next',title:'Платный',price:500,eventsPerMonth:20,change:{current:false,creditAmount:100,chargeAmount:500,missingAmount:0,balanceAfter:400,blockedReason:''}}
const billing={account:{balance:800,unlimited:true,fundedUntil:null,tariffActiveUntil:null},currentTariff:tariff,tariffs:[next]}
beforeEach(()=>{jest.resetAllMocks();mockUser={_id:'u1',tenantId:'t1',role:'dev'};(api.get as jest.Mock).mockResolvedValue({success:true,data:billing})})
it.each(['light','dark'] as const)('%s: DEV — пользовательский тариф, resolver в лимитах и компенсация без новой формулы',async(mode)=>{
 const screen=render(<ThemeProvider forcedMode={mode} storage={null}><BillingScreen /></ThemeProvider>)
 await screen.findByText('DEV');expect(screen.getByText('До 20 заказов в месяц')).toBeTruthy();expect(screen.getByText(/тариф бесплатный/)).toBeTruthy();expect(screen.getByText('Компенсация за текущий тариф: 100 ₽')).toBeTruthy()
 expect(api.post).not.toHaveBeenCalled();expect(screen.queryByText('Списать с баланса')).toBeNull()
})
it('потеря ответа topup блокирует повтор, без автоматического refresh replay или нового платежа',async()=>{
 ;(api.post as jest.Mock).mockRejectedValue(new Error('lost'))
 const screen=render(<BillingScreen />);await screen.findByText('DEV')
 fireEvent.press(screen.getByText('Перейти к оплате'));fireEvent.press(screen.getByText('Перейти к оплате'))
 await screen.findByText(/Результат не подтверждён/);fireEvent.press(screen.getByText('Перейти к оплате'))
 expect(api.post).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledWith('/mobile/v1/billing/topup',{amount:1000},{skipRefresh:true});expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled()
})
it('возврат из браузера не объявляет оплату завершённой и проверяется адресно',async()=>{
 ;(api.post as jest.Mock).mockResolvedValueOnce({success:true,data:{paymentId:'p1',confirmationUrl:'https://pay.test/confirm'}}).mockResolvedValueOnce({success:true,data:{paymentStatus:'pending'}})
 const screen=render(<BillingScreen />);await screen.findByText('DEV');fireEvent.press(screen.getByText('Перейти к оплате'))
 await screen.findByText('Проверьте статус платежа после оплаты');expect(api.post).toHaveBeenCalledTimes(1)
 fireEvent.press(screen.getByText('Проверить последний платёж'));await screen.findByText('Платёж не подтверждён. Проверьте его немного позже.')
 expect(api.post).toHaveBeenLastCalledWith('/mobile/v1/billing/topup/p1/sync',undefined,{skipRefresh:true});expect(screen.queryByText('Баланс пополнен')).toBeNull()
})
it('смена тарифа подтверждается GET после потерянного POST без повторного списания',async()=>{
 const alert=jest.spyOn(Alert,'alert');(api.post as jest.Mock).mockRejectedValue(new Error('lost'))
 const screen=render(<BillingScreen />);await screen.findByText('DEV');fireEvent.press(screen.getByText('Выбрать тариф'))
 expect(alert.mock.calls[0][1]).toContain('Компенсация за текущий тариф: 100 ₽')
 ;(api.get as jest.Mock).mockResolvedValue({success:true,data:{...billing,currentTariff:next}})
 await act(async()=>{await alert.mock.calls.at(-1)?.[2]?.[1]?.onPress?.()});await screen.findByText(/подтверждено повторным чтением/)
 expect(api.post).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledWith('/mobile/v1/billing',{tariffId:'next'},{skipRefresh:true});alert.mockRestore()
})
it('смена пользователя игнорирует поздний billing GET',async()=>{
 let finish:(value:unknown)=>void=()=>undefined;(api.get as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>finish=resolve))
 const screen=render(<BillingScreen />);mockUser={_id:'u2',tenantId:'t2',role:'dev'};screen.rerender(<BillingScreen />);await screen.findByText('DEV')
 await act(async()=>finish({success:true,data:{...billing,currentTariff:{...tariff,title:'OLD'}}}));expect(screen.queryByText('OLD')).toBeNull()
})
