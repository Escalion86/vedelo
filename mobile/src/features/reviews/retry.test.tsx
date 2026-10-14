import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { EventClientReviewSection } from './EventClientReviewSection'
import { ClientReviewsSection } from './ClientReviewsSection'
import { api } from '../../shared/api/client'
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
// Холодная загрузка RN не входит в ожидание проверяемого сетевого поведения.
void [ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View]
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:'Icon'}))
jest.mock('@react-navigation/native',()=>({NavigationContext:require('react').createContext(null)}))
let mockFocusHooks: {setup:()=>void|(()=>void);cleanup?:()=>void}[]=[]
jest.mock('expo-router',()=>({router:{push:jest.fn()},useFocusEffect:(setup:()=>void|(()=>void))=>{const React=require('react');React.useEffect(()=>{const record={setup,cleanup:setup() || undefined};mockFocusHooks.push(record);return()=>record.cleanup?.()},[setup])}}))
jest.mock('../profile/uploadOnce',()=>({uploadOnce:jest.fn()}))
jest.mock('expo-clipboard',()=>({setStringAsync:jest.fn()}))
jest.mock('../../shared/auth/AuthProvider',()=>({useAuth:()=>({user:{_id:'fixture',tenantId:'tenant'}})}))
jest.mock('../../shared/api/client',()=>({api:{get:jest.fn(),post:jest.fn(),patch:jest.fn()}}))
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}))

beforeEach(()=>{jest.clearAllMocks();mockFocusHooks=[]})
beforeAll(()=>notifyManager.setNotifyFunction(callback=>act(callback)))
afterAll(()=>notifyManager.setNotifyFunction(callback=>callback()))

it.each(['список','работа'] as const)('Фоновый сбой GET не уничтожает открытую несохранённую заметку: %s',async(surface)=>{
  const row={_id:'r',eventId:'e',clientId:'c',status:'received',rating:3,comment:'Комментарий',note:'',createdAt:'2026-10-05',submittedAt:'2026-10-06',readAt:null,expiresAt:'2026-11-05'}
  ;(api.get as jest.Mock).mockResolvedValue({success:true,data:{items:[row],total:1,allowClientReviews:true}})
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})
  const screen=render(<QueryClientProvider client={client}><ThemeProvider storage={null}>{surface==='список'?<ClientReviewsSection/>:<EventClientReviewSection event={{_id:'e',clientId:'c',status:'closed'}}/>}</ThemeProvider></QueryClientProvider>)
  await screen.findByText('Комментарий')
  fireEvent.press(screen.getByText('Внутренняя заметка'))
  fireEvent.changeText(screen.getByLabelText('Заметка для себя'),'Важная несохранённая заметка')
  ;(api.get as jest.Mock).mockRejectedValueOnce(new Error('Сбой обновления'))
  await act(async()=>{await client.invalidateQueries({queryKey:['nativeReviews']})})
  await screen.findByText(surface==='список'?'Не удалось загрузить отзывы':'Не удалось загрузить отзыв')
  expect(screen.getByLabelText('Заметка для себя').props.value).toBe('Важная несохранённая заметка')
  expect(screen.getByText('Повторить загрузку')).toBeTruthy()
})

it('Возврат после сетевого запроса на фоне снимает busy и не открывает старый секрет',async()=>{
  const row={_id:'r',eventId:'e',clientId:'c',status:'created',rating:null,comment:'',note:'',createdAt:'2026-10-05',submittedAt:null,readAt:null,expiresAt:'2026-11-05'}
  ;(api.get as jest.Mock).mockResolvedValue({success:true,data:{items:[],total:0,allowClientReviews:true}})
  let resolvePost:(value:any)=>void=()=>{}
  ;(api.post as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>{resolvePost=resolve}))
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})
  const screen=render(<QueryClientProvider client={client}><ThemeProvider storage={null}><EventClientReviewSection event={{_id:'e',clientId:'c',status:'closed'}}/></ThemeProvider></QueryClientProvider>)
  await screen.findByText('Запросить отзыв')
  fireEvent.press(screen.getByText('Запросить отзыв'))
  act(()=>{for(const record of mockFocusHooks)record.cleanup?.()})
  ;(api.get as jest.Mock).mockResolvedValue({success:true,data:{items:[row],total:1,allowClientReviews:true}})
  await act(async()=>{resolvePost({success:true,data:{...row,url:'http://127.0.0.1/review/r#fixture'}})})
  await waitFor(()=>expect(api.get).toHaveBeenCalledTimes(3))
  await screen.findByText('Ссылка создана')
  act(()=>{for(const record of mockFocusHooks)record.cleanup=record.setup() || undefined})
  expect(screen.queryByLabelText('Сообщение клиенту')).toBeNull()
  expect(screen.getByRole('button',{name:'Отправить ссылку'}).props.accessibilityState.disabled).toBe(false)
})
