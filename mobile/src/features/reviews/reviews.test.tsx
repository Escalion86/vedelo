import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { ClientReviewsSection, UnreadClientReviewsSection, EventClientReviewSection, ReviewPageScreen, EventClientReviewStatus } from './index'
import { api } from '../../shared/api/client'
import { uploadOnce } from '../profile/uploadOnce'
import * as Clipboard from 'expo-clipboard'
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native'

// Холодная загрузка ленивых RN-примитивов вне индивидуального 5-секундного теста.
void [ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View]

jest.mock('@react-navigation/native', () => { const React=require('react');return {NavigationContext:React.createContext(null),useNavigation:()=>({dispatch:jest.fn()}),usePreventRemove:jest.fn()} })
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: { _id: 'u', tenantId: 't' } }) }))
jest.mock('../../shared/api/client', () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }))
jest.mock('../profile/uploadOnce', () => ({ uploadOnce: jest.fn() }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///test.png', name: 'test.png', mimeType: 'image/png', size: 100 }] })) }))
jest.mock('../profile/nativeImage', () => ({ copyImage: () => ({ uri: 'file:///copy.png', dispose: jest.fn() }) }))
const row = { _id: 'r', eventId: 'e', clientId: 'c', status: 'received', rating: 2, comment: 'Комментарий клиента', note: '', createdAt: '2026-10-01T00:00:00Z', submittedAt: '2026-10-02T00:00:00Z', readAt: null, expiresAt: '2026-11-01T00:00:00Z', clientName: 'Клиент' }
const appearance = { publicName: '', specialization: '', greeting: '', accent: 'sand', cover: 'plain', logoUrl: '' }
let list: any, page: any
const draw = (children: React.ReactNode, mode: 'light' | 'dark' = 'light') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })}><ThemeProvider forcedMode={mode} storage={null}>{children}</ThemeProvider></QueryClientProvider>)
beforeAll(()=>notifyManager.setNotifyFunction(callback=>act(callback)))
afterAll(()=>notifyManager.setNotifyFunction(callback=>callback()))
beforeEach(() => {
  jest.clearAllMocks(); list = { items: [row], total: 61, allowClientReviews: true }; page = { reviewPage: appearance, allowClientReviews: true, origin: 'http://127.0.0.1' }
  ;(api.get as jest.Mock).mockImplementation(async (path: string) => ({ success: true, data: path.startsWith('/site/') ? page : path==='/client-reviews/statuses'?{e:{status:'received',rating:5}}:list }))
  ;(api.patch as jest.Mock).mockImplementation(async (_path, body) => ({ success: true, data: { ...row, note: body.note || '', readAt: body.action === 'read' ? '2026-10-03' : null } }))
  ;(api.post as jest.Mock).mockResolvedValue({ success: true, data: { ...row, status: 'created', submittedAt: null, url: 'http://127.0.0.1/review/r#fixture' } })
})
it.each(['light','dark'] as const)('Список %s: фильтры закрыты, сводка/сброс снаружи, период запросов, страницы и поиск только страницы', async (mode) => {
  const screen = draw(<ClientReviewsSection />, mode)
  await screen.findByText('Комментарий клиента')
  expect(screen.queryByText('Период запросов')).toBeNull()
  fireEvent.press(screen.getByText('Фильтры'))
  fireEvent.press(screen.getByRole('button', { name: '2 из 5' }))
  fireEvent.press(screen.getByRole('button', { name: 'Только непрочитанные' }))
  fireEvent.press(screen.getByText('Фильтры (2)'))
  expect(screen.getByText(/2 из 5 · Непрочитанные/)).toBeTruthy()
  expect(screen.queryByText('Период запросов')).toBeNull()
  const nextPage = await screen.findByText('Следующая страница')
  await waitFor(() => expect(screen.getByRole('button',{name:'Следующая страница'}).props.accessibilityState.disabled).toBe(false))
  fireEvent.press(nextPage)
  await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('page=1'),expect.anything()))
  await screen.findByText('Следующая страница')
  await waitFor(() => expect(screen.getByRole('button',{name:'Следующая страница'}).props.accessibilityState.disabled).toBe(false))
  fireEvent.changeText(screen.getByLabelText('Поиск по текущей странице'),'не найдено')
  expect(screen.getByText('Совпадений на этой странице нет')).toBeTruthy()
  fireEvent.press(screen.getByText('Сбросить фильтры'))
  expect(screen.getByLabelText('Поиск по текущей странице').props.value).toBe('')
  expect(screen.queryByTestId('reviews-filter-summary')).toBeNull()
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/client-reviews?page=0',expect.anything()))
  await screen.findByText('Комментарий клиента')
})
it('Заметка: ошибка не стирает текст, повтор перечитывает точный отзыв', async () => {
  const screen = draw(<ClientReviewsSection />)
  await screen.findByText('Комментарий клиента')
  fireEvent.press(screen.getByText('Внутренняя заметка'))
  fireEvent.changeText(screen.getByLabelText('Заметка для себя'),'Обсудить с клиентом')
  ;(api.patch as jest.Mock).mockRejectedValueOnce(new Error('Сбой сети'))
  fireEvent.press(screen.getByText('Сохранить заметку'))
  await screen.findByText('Не удалось сохранить изменения. Повторите попытку')
  expect(screen.getByLabelText('Заметка для себя').props.value).toBe('Обсудить с клиентом')
  list = { ...list, items: [{ ...row, note: 'Обсудить с клиентом' }] }
  fireEvent.press(screen.getByText('Сохранить заметку'))
  await screen.findByText('Изменения сохранены')
  expect(api.get).toHaveBeenCalledWith(expect.stringContaining('eventId=e'),expect.anything())
})
it('Загрузка и ошибка списка: повтор, отсутствие ложного пустого результата', async () => {
  ;(api.get as jest.Mock).mockRejectedValueOnce(new Error('Сбой'))
  const screen = draw(<ClientReviewsSection />)
  await screen.findByText('Не удалось загрузить отзывы')
  expect(screen.queryByText('Отзывов пока нет')).toBeNull()
  fireEvent.press(screen.getByText('Повторить загрузку'))
  await screen.findByText('Комментарий клиента')
})
it('Unread и клиент: реальные фильтры без тарифного запрета чтения', async () => {
  list.allowClientReviews = false
  const screen = draw(<UnreadClientReviewsSection onOpenEvent={jest.fn()} />)
  await screen.findByText('Комментарий клиента')
  expect(api.get).toHaveBeenCalledWith(expect.stringContaining('unread=true'),expect.anything())
  expect(screen.getByText('Отметить прочитанным')).toBeTruthy()
})
it('Приглашение: завершение подтверждается, секрет появляется только по действию, copy/share не отмечают sent', async () => {
  list.items = []; list.total = 0
  const share = jest.spyOn(Share,'share').mockResolvedValue({ action: Share.sharedAction })
  const screen = draw(<EventClientReviewSection event={{ _id: 'e', clientId: 'c', status: 'active', eventDate: '2020-01-01' }} />)
  await screen.findByText('Работа выполнена')
  expect(screen.getByRole('button',{name:'Запросить отзыв'}).props.accessibilityState.disabled).toBe(true)
  fireEvent.press(screen.getByText('Работа выполнена'))
  list.items = [{...row,status:'created',submittedAt:null}];list.total=1
  fireEvent.press(screen.getByText('Запросить отзыв'))
  await screen.findByLabelText('Сообщение клиенту')
  expect(api.post).toHaveBeenCalledWith('/client-reviews',{eventId:'e',confirmedCompleted:true})
  fireEvent.press(screen.getByText('Скопировать ссылку'))
  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('http://127.0.0.1/review/r#fixture'))
  fireEvent.press(screen.getByText('Поделиться сообщением'))
  await waitFor(() => expect(share).toHaveBeenCalled())
  expect(api.patch).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Я отправил сообщение'))
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/client-reviews/r',{action:'sent'}))
  await screen.findByText('Отправка отмечена')
})
it('Оформление: живой preview, ошибка не стирает, POST + read-back, шесть публичных полей', async () => {
  const screen = draw(<ReviewPageScreen />)
  await screen.findByLabelText('Публичное имя')
  fireEvent.changeText(screen.getByLabelText('Публичное имя'),'Студия Полёт')
  expect(screen.getByText('Студия Полёт')).toBeTruthy()
  expect(screen.getByText('Отзыв о работе · Студия Полёт')).toBeTruthy()
  ;(api.post as jest.Mock).mockRejectedValueOnce(new Error('Сбой'))
  fireEvent.press(screen.getByText('Сохранить оформление'))
  await screen.findByText('Не удалось сохранить оформление. Повторите попытку')
  expect(screen.getByLabelText('Публичное имя').props.value).toBe('Студия Полёт')
  page = { ...page, reviewPage: { ...appearance, publicName:'Студия Полёт' } }
  fireEvent.press(screen.getByText('Сохранить оформление'))
  await screen.findByText('Оформление сохранено')
  expect(api.post).toHaveBeenLastCalledWith('/site/review-page',page.reviewPage)
  expect(api.get).toHaveBeenLastCalledWith('/site/review-page',expect.anything())
})
it('Фото: multipart file существующего протокола, ошибка не меняет форму и повтор доступен', async () => {
  const screen = draw(<ReviewPageScreen />)
  await screen.findByLabelText('Публичное имя')
  ;(uploadOnce as jest.Mock).mockRejectedValueOnce(new Error('Сбой')).mockResolvedValueOnce({success:true,data:{url:'https://cloud.escalion.ru/uploads/fixture.webp'}})
  fireEvent.press(screen.getByText('Выбрать фото или логотип'))
  await screen.findByText('Не удалось загрузить изображение. Повторите попытку')
  fireEvent.press(screen.getByText('Выбрать фото или логотип'))
  await screen.findByText('Изображение загружено. Сохраните оформление')
  expect(uploadOnce).toHaveBeenCalledWith('/site/review-page/logo',expect.any(FormData))
  expect(screen.getByTestId('review-logo').props.source.uri).toContain('fixture.webp')
})
it('Тариф выключен: настройки читаются, сохранение и фото заблокированы', async () => {
  page.allowClientReviews = false
  const screen = draw(<ReviewPageScreen />)
  await screen.findByLabelText('Публичное имя')
  expect(screen.getByLabelText('Публичное имя').props.editable).toBe(false)
  expect(screen.getByRole('button',{name:'Сохранить оформление'}).props.accessibilityState.disabled).toBe(true)
})

it('Статусы карточек используют один tenant-кэш, без запроса на каждую работу',async()=>{
  const screen=draw(<><EventClientReviewStatus eventId="e" /><EventClientReviewStatus eventId="other" /></>)
  await screen.findByText('★ 5 из 5')
  expect((api.get as jest.Mock).mock.calls.filter(([path])=>path==='/client-reviews/statuses')).toHaveLength(1)
})
