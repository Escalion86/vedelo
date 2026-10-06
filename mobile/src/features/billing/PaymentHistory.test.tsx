import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { PaymentHistory } from './PaymentHistory'
import { getPaymentPage } from './history'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:()=>null}))
jest.mock('../../shared/api/client',()=>({api:{get:jest.fn()}}))
jest.mock('./history',()=>({...jest.requireActual('./history'), getPaymentPage:jest.fn()}))
jest.mock('expo-router',()=>({useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}))
const item={ id:'p1',amount:800,direction:'in',type:'topup',kind:'topup',status:'pending',title:'Пополнение баланса',details:'Комментарий',sourceTitle:'Точка',methodTitle:'СБП',receiptUrl:'https://receipt.test/view',occurredAt:null } as const
beforeEach(()=>jest.resetAllMocks())
it.each(['light','dark'] as const)('%s: показывает ожидающий платёж без ложного подтверждения, чек только просмотр',async(mode)=>{
  ;(getPaymentPage as jest.Mock).mockResolvedValue({items:[item],cursor:null})
  const open=jest.spyOn(Linking,'openURL').mockResolvedValue(undefined)
  const screen=render(<ThemeProvider storage={null} forcedMode={mode}><PaymentHistory /></ThemeProvider>)
  await screen.findByText('Пополнение баланса')
  expect(screen.getByText('Ожидает подтверждения')).toBeTruthy(); expect(screen.getByText('Дата не указана')).toBeTruthy()
  expect(screen.queryByText('Проведено')).toBeNull(); expect(screen.queryByText('Удалить')).toBeNull()
  fireEvent.press(screen.getByText('Посмотреть чек')); expect(open).toHaveBeenCalledWith(item.receiptUrl)
  open.mockRestore()
})
it('смена фильтра игнорирует позднюю страницу, повтор курсора останавливает пагинацию',async()=>{
  let finish:(value:unknown)=>void=()=>undefined
  ;(getPaymentPage as jest.Mock).mockResolvedValueOnce({items:[item],cursor:'next'})
    .mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
    .mockResolvedValueOnce({items:[{...item,id:'bonus',title:'Бонус'}],cursor:'same'})
    .mockResolvedValueOnce({items:[{...item,id:'bonus',title:'Бонус'}],cursor:'same'})
  const screen=render(<PaymentHistory />); await screen.findByText(item.title)
  fireEvent.press(screen.getByText('Показать более ранние')); fireEvent.press(screen.getByText('Бонусы'))
  await screen.findByText('Бонус')
  await act(async()=>finish({items:[{...item,id:'late',title:'Поздний платёж'}],cursor:null}))
  expect(screen.queryByText('Поздний платёж')).toBeNull()
  fireEvent.press(screen.getByText('Показать более ранние'))
  await screen.findByText('Сервер повторил страницу. Обновите историю перед продолжением.')
  expect(screen.queryByText('Показать более ранние')).toBeNull(); expect(screen.getAllByText('Бонус')).toHaveLength(1)
})
it('ошибка первой страницы не показывается пустой историей',async()=>{
  ;(getPaymentPage as jest.Mock).mockRejectedValue(new Error('network'))
  const screen=render(<PaymentHistory />); await screen.findByText('Не удалось загрузить историю операций')
  expect(screen.queryByText('Операций пока нет')).toBeNull()
})
