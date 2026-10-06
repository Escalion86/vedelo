import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { NotificationsSection, validReminderTime } from './NotificationsSection'
import { api } from '../../shared/api/client'
import * as push from '../../shared/notifications/useExpoPushNotifications'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
let mockUser={_id:'u1',tenantId:'t1',role:'user'}
jest.mock('../../shared/auth/AuthProvider',()=>({useAuth:()=>({user:mockUser})}))
jest.mock('../../shared/hooks/useWorkItemTerminology',()=>({useWorkItemTerminology:()=>({plural:'Заказы'})}))
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:()=>null}))
jest.mock('../../shared/api/client',()=>({api:{get:jest.fn(),patch:jest.fn(),post:jest.fn()}}))
jest.mock('../../shared/notifications/useExpoPushNotifications',()=>({getExpoPushDeviceState:jest.fn(),enableExpoPushNotifications:jest.fn(),disableExpoPushNotifications:jest.fn()}))
jest.mock('expo-router',()=>({useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}))
const settings={remindersEnabled:true,reminderTime:'10:00',pushConfigured:true,deviceSubscribed:true,activeDeviceCount:2,timeZone:'Europe/Moscow'}
beforeEach(()=>{
 jest.resetAllMocks();mockUser={_id:'u1',tenantId:'t1',role:'user'}
 ;(api.get as jest.Mock).mockResolvedValue({success:true,data:settings})
 ;(push.getExpoPushDeviceState as jest.Mock).mockResolvedValue({permission:'granted',enabled:true,subscribed:true})
})
it.each(['light','dark'] as const)('%s: разрешения и timeZone из реального DTO, регистрация только после явного действия',async(mode)=>{
 ;(push.getExpoPushDeviceState as jest.Mock).mockResolvedValue({permission:'denied',enabled:false,subscribed:false})
 ;(push.enableExpoPushNotifications as jest.Mock).mockResolvedValue({ok:false,error:'Разрешение на уведомления не выдано',permission:'denied'})
 const screen=render(<ThemeProvider forcedMode={mode} storage={null}><NotificationsSection /></ThemeProvider>)
 await screen.findByText('Часовой пояс: Europe/Moscow'); expect(push.enableExpoPushNotifications).not.toHaveBeenCalled()
 expect(screen.getByText('Открыть настройки Android')).toBeTruthy()
 fireEvent.press(screen.getByText('Включить push')); await screen.findByText('Разрешение на уведомления не выдано')
 expect(api.patch).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled()
})
it('failed server loading не выдумывает ноль устройств/часовой пояс и позволяет offline unsubscribe',async()=>{
 ;(api.get as jest.Mock).mockRejectedValue(new Error('offline'))
 ;(push.disableExpoPushNotifications as jest.Mock).mockResolvedValue({ok:true,pending:true})
 const screen=render(<NotificationsSection />);await screen.findByText('Не удалось загрузить настройки уведомлений')
 expect(screen.queryByText(/Активных Android/)).toBeNull();expect(screen.queryByText(/Часовой пояс/)).toBeNull()
 fireEvent.press(screen.getByText('Отключить на этом устройстве'));await screen.findByText(/Серверная отписка завершится/)
 expect(push.disableExpoPushNotifications).toHaveBeenCalledTimes(1)
})
it('время валидируется и подтверждается отдельным GET, POST теста не повторяется',async()=>{
 const screen=render(<NotificationsSection />);await screen.findByText('Часовой пояс: Europe/Moscow')
 fireEvent.changeText(screen.getByLabelText('Время, шаг 15 минут'),'24:00');fireEvent.press(screen.getByText('Сохранить время'))
 await screen.findByText(/Укажите время/);expect(api.patch).not.toHaveBeenCalled()
 fireEvent.changeText(screen.getByLabelText('Время, шаг 15 минут'),'12:15')
 ;(api.patch as jest.Mock).mockResolvedValue({success:true,data:settings});(api.get as jest.Mock).mockResolvedValue({success:true,data:{...settings,reminderTime:'12:15'}})
 fireEvent.press(screen.getByText('Сохранить время'));await screen.findByText('Настройки напоминаний сохранены')
 expect(api.patch).toHaveBeenCalledWith('/mobile/v1/notifications',{reminderTime:'12:15'},{skipRefresh:true})
 ;(api.post as jest.Mock).mockResolvedValue({success:true,data:{sent:2}})
 fireEvent.press(screen.getByText('Отправить тест'));await screen.findByText(/Доставка не подтверждена/)
 expect(api.post).toHaveBeenCalledWith('/mobile/v1/notifications/test',undefined,{skipRefresh:true})
})
it('поздний ответ старого пользователя не меняет настройки нового',async()=>{
 let finish:(value:unknown)=>void=()=>undefined
 ;(api.get as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>finish=resolve))
 const screen=render(<NotificationsSection />);mockUser={_id:'u2',tenantId:'t2',role:'user'};screen.rerender(<NotificationsSection />)
 await screen.findByText('Часовой пояс: Europe/Moscow')
 await act(async()=>finish({success:true,data:{...settings,timeZone:'OLD'}}))
 expect(screen.queryByText('Часовой пояс: OLD')).toBeNull()
})
it.each(['00:00','23:45','12:15'])('принимает %s',time=>expect(validReminderTime(time)).toBe(true))
it.each(['','24:00','9:00','10:01','12:60'])('отвергает %s',time=>expect(validReminderTime(time)).toBe(false))
