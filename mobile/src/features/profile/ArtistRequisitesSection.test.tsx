import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { ArtistRequisitesSection } from './ArtistRequisitesSection'
import { api } from '../../shared/api/client'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:()=>null}))
jest.mock('../../shared/api/client',()=>({api:{get:jest.fn(),patch:jest.fn()}}))
jest.mock('expo-router',()=>({useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}))
const data={artistStatus:'individual_entrepreneur', artistFullName:'Иван Иванов',artistName:'ИП',artistOgrnip:'123456789012345',artistInn:'123456789012',artistBankName:'Банк',artistBik:'123456789',artistCheckingAccount:'1234',artistCorrespondentAccount:'5678',artistLegalAddress:'Адрес'}
beforeEach(()=>{jest.resetAllMocks();(api.get as jest.Mock).mockResolvedValue({success:true,data})})
it.each(['light','dark'] as const)('%s: сохраняет скрытый ОГРНИП при смене статуса, подтверждает GET и не сбрасывает после ошибки',async(mode)=>{
 const screen=render(<ThemeProvider storage={null} forcedMode={mode}><ArtistRequisitesSection /></ThemeProvider>)
 await screen.findByDisplayValue(data.artistFullName)
 fireEvent.press(screen.getByText('Самозанятый')); expect(screen.queryByLabelText('ОГРНИП')).toBeNull()
 fireEvent.press(screen.getByText('ИП')); expect(screen.getByLabelText('ОГРНИП').props.value).toBe(data.artistOgrnip)
 ;(api.patch as jest.Mock).mockRejectedValue(new Error('network'))
 fireEvent.changeText(screen.getByLabelText('Банк'),'Другой банк'); fireEvent.press(screen.getByText('Сохранить реквизиты'))
 await screen.findByText(/Сохранение не подтверждено/); expect(screen.getByLabelText('Банк').props.value).toBe('Другой банк')
 const saved={...data,artistBankName:'Другой банк'}
 ;(api.patch as jest.Mock).mockResolvedValue({success:true,data:saved}); (api.get as jest.Mock).mockResolvedValue({success:true,data:saved})
 fireEvent.press(screen.getByText('Сохранить реквизиты')); await screen.findByText(/Реквизиты сохранены/)
 expect(api.patch).toHaveBeenLastCalledWith('/mobile/v1/profile/requisites',saved,{skipRefresh:true}); expect(api.get).toHaveBeenCalledTimes(2)
})
it('не показывает пустые редактируемые реквизиты при failed loading и игнорирует unmount',async()=>{
 ;(api.get as jest.Mock).mockRejectedValueOnce(new Error('network'))
 const screen=render(<ArtistRequisitesSection />); await screen.findByText('Не удалось загрузить реквизиты')
 expect(screen.queryByLabelText('ИНН')).toBeNull()
 let finish:(value:unknown)=>void=()=>undefined
 ;(api.get as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>finish=resolve))
 fireEvent.press(screen.getByText('Повторить загрузку реквизитов')); screen.unmount()
 await act(async()=>finish({success:true,data}))
 expect(api.patch).not.toHaveBeenCalled()
})
it('mismatch read-back не является успехом',async()=>{
 ;(api.patch as jest.Mock).mockResolvedValue({success:true,data:{...data,artistInn:'999'}})
 const screen=render(<ArtistRequisitesSection />); await screen.findByDisplayValue(data.artistFullName)
 fireEvent.press(screen.getByText('Сохранить реквизиты')); await screen.findByText(/Сохранение не подтверждено/)
 expect(screen.queryByText(/Реквизиты сохранены/)).toBeNull()
})
