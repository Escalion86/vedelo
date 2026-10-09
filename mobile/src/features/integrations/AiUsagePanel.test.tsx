import React from 'react'
import { TextInput } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { api } from '../../shared/api/client'
import { AiUsagePanel } from './AiUsagePanel'
import { ManagedIntegrationsSection } from './ManagedIntegrationsSection'

let mockRole = 'user'
jest.mock('expo-router', () => ({ useFocusEffect: (fn: any) => require('react').useEffect(fn, [fn]) }))
jest.mock('../../shared/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { _id: 'own-user', tenantId: 'own-tenant', role: mockRole } }),
}))
jest.mock('../../shared/api/client', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }))

const getMock = api.get as jest.Mock
const postMock = api.post as jest.Mock
const patchMock = api.patch as jest.Mock
const deleteMock = api.delete as jest.Mock
const onChanged = jest.fn(async () => undefined)
const usage = {
  balance: 100, requiredBalance: 1, available: true, platformConfigured: true,
  quotes: [{ feature: 'voice_transcription', requiredBalance: 0.5, available: true }],
  summary: { operations: 3, charged: 1.25 },
  recent: [
    { id: '1', feature: 'event_draft', status: 'succeeded', charged: 1.25, createdAt: '2026-10-01' },
    { id: '2', feature: 'call_analysis', status: 'failed', charged: 0, createdAt: '2026-10-01' },
    { id: '3', feature: 'call_transcription', status: 'pending', charged: 0, createdAt: '2026-10-01' },
  ],
}
let status: Record<string, unknown>

beforeEach(() => {
  jest.resetAllMocks()
  mockRole = 'user'
  status = { provider: 'ai', available: true, configured: true, enabled: true, analysisProvider: 'artistcrm', transcriptionModel: 'whisper-1', analysisModel: 'gpt-4o-mini', hasTranscriptionKey: false, platformConfigured: true }
  getMock.mockImplementation(async (path: string) => {
    if (path === '/ai/usage') return { success: true, data: usage }
    if (path === '/mobile/v1/integrations/ai') return { success: true, data: status }
    throw new Error(`Unexpected GET: ${path}`)
  })
  postMock.mockImplementation(async (_path, body) => {
    status = { ...status, ...body, provider: 'ai', analysisProvider: body.provider, configured: true, enabled: true, hasTranscriptionKey: body.provider === 'aitunnel' }
    return { success: true, data: status }
  })
  patchMock.mockImplementation(async (_path, body) => {
    status = { ...status, ...body, provider: 'ai', analysisProvider: body.provider }
    return { success: true, data: status }
  })
  deleteMock.mockImplementation(async () => {
    status = { ...status, analysisProvider: 'artistcrm', hasTranscriptionKey: false, enabled: false }
    return { success: true, data: status }
  })
})

const openEditor = async () => {
  const screen = render(<ManagedIntegrationsSection overview={{ ai: { available: true } }} onChanged={onChanged} />)
  fireEvent.press(screen.getByLabelText('Настроить ИИ-провайдер'))
  await screen.findByText('Последние операции')
  return screen
}

const expectOnlyPersonalRequests = () => {
  expect(getMock.mock.calls.every(([path]) => ['/ai/usage', '/mobile/v1/integrations/ai'].includes(path))).toBe(true)
  expect(postMock.mock.calls.some(([path]) => path === '/ai/settings')).toBe(false)
}

describe('Личный ИИ', () => {
  it('показывает баланс, пороги, личные списания и обновляет историю', async () => {
    const screen = render(<AiUsagePanel activeProvider="artistcrm" />)
    expect(screen.getByText('Загрузка баланса и расходов...')).toBeTruthy()
    await screen.findByText('Общий ИИ доступен.')
    for (const text of ['Баланс', 'Макс. текущий порог', 'Всего списано', 'Голосовой ввод', 'Последние операции', 'Без списания', 'Обрабатывается']) {
      expect(screen.getByText(text)).toBeTruthy()
    }
    expect(screen.queryByText('Администрирование')).toBeNull()
    fireEvent.press(screen.getByText('Обновить'))
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2))
    await screen.findByText('Обновить')
    expectOnlyPersonalRequests()
    expect(postMock).not.toHaveBeenCalled()
  })

  it('сохраняет ошибку и повтор загрузки без фиктивного нулевого баланса', async () => {
    getMock.mockRejectedValueOnce(new Error('Нет сети'))
    const screen = render(<AiUsagePanel activeProvider="aitunnel" />)
    await screen.findByText('Не удалось загрузить баланс и расходы ИИ.')
    expect(screen.queryByText('Нет сети')).toBeNull()
    expect(screen.queryByText('Баланс')).toBeNull()
    fireEvent.press(screen.getByText('Обновить'))
    await screen.findByText(/Сейчас используется собственный провайдер/)
    expect(screen.queryByText('Нет сети')).toBeNull()
  })

  it.each(['user', 'dev'])('не включает привилегии для %s с прежним canUseDeepseek', async (role) => {
    // Legacy capability comes from the role-aware server response, not a UI prop.
    mockRole = role
    status = { ...status, canUseDeepseek: true }
    const screen = await openEditor()
    for (const text of ['DeepSeek', 'Администрирование', 'Себестоимость', 'Маржа', 'Основные пользователи', 'Сохранить коэффициент']) {
      expect(screen.queryByText(text)).toBeNull()
    }
    expect(screen.queryByTestId('ai-markup-coefficient')).toBeNull()
    expectOnlyPersonalRequests()
    expect(postMock).not.toHaveBeenCalled()
    expect(patchMock).not.toHaveBeenCalled()
  })

  it.each(['deepseek', 'future-provider', '', undefined])('не перезаписывает несовместимого провайдера %s без выбора и подключения', async (analysisProvider) => {
    status = { ...status, analysisProvider, canUseDeepseek: true }
    const screen = await openEditor()
    expect(screen.getByText(/Сохранённый ИИ-провайдер не поддерживается/)).toBeTruthy()
    expect(screen.queryByText('✓ ИИ Ведело')).toBeNull()
    expect(screen.queryByText('✓ Свой AITunnel')).toBeNull()
    expect(screen.queryByText('Сохранить модель')).toBeNull()
    expect(screen.queryByText('Приостановить ИИ')).toBeNull()
    expect(postMock).not.toHaveBeenCalled()
    expect(patchMock).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('ИИ Ведело'))
    expect(postMock).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Подключить ИИ Ведело'))
    await screen.findByText('ИИ Ведело подключён')
    expect(postMock).toHaveBeenCalledWith('/mobile/v1/integrations/ai', {
      provider: 'artistcrm', transcriptionModel: 'whisper-1', analysisModel: 'gpt-4o-mini',
    }, { skipRefresh: true })
    expectOnlyPersonalRequests()
  })

  it('подключает собственный ключ, сохраняет модели, приостанавливает и отключает AITunnel', async () => {
    const screen = await openEditor()
    fireEvent.press(screen.getByText('Свой AITunnel'))
    fireEvent.press(screen.getByText('Подключить AITunnel'))
    expect(screen.getByText('Укажите ключ AITunnel')).toBeTruthy()
    expect(postMock).not.toHaveBeenCalled()
    const inputs = screen.UNSAFE_getAllByType(TextInput)
    fireEvent.changeText(inputs[0], 'test-key')
    fireEvent.press(screen.getByText('Подключить AITunnel'))
    await screen.findByText('AITunnel подключён')
    expect(postMock).toHaveBeenCalledWith('/mobile/v1/integrations/ai', expect.objectContaining({ provider: 'aitunnel', key: 'test-key' }), { skipRefresh: true })
    expect(screen.UNSAFE_getAllByType(TextInput)[0].props.value).toBe('')
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[2], 'custom-model')
    fireEvent.press(screen.getByText('Сохранить модель'))
    await screen.findByText('Модель AITunnel сохранена')
    expect(patchMock).toHaveBeenCalledWith('/mobile/v1/integrations/ai', { provider: 'aitunnel', transcriptionModel: 'whisper-1', analysisModel: 'custom-model' }, { skipRefresh: true })
    fireEvent.press(screen.getByText('Приостановить ИИ'))
    await screen.findByText('Возобновить ИИ')
    expect(patchMock).toHaveBeenCalledWith('/mobile/v1/integrations/ai', { provider: 'aitunnel', enabled: false }, { skipRefresh: true })
    fireEvent.press(screen.getByText('Возобновить ИИ'))
    await screen.findByText('Приостановить ИИ')
    expect(patchMock).toHaveBeenCalledWith('/mobile/v1/integrations/ai', { provider: 'aitunnel', enabled: true }, { skipRefresh: true })
    fireEvent.press(screen.getByText('Отключить интеграцию'))
    expect(deleteMock).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Подтвердить отключение и удаление ключей'))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('/mobile/v1/integrations/ai', undefined, { skipRefresh: true }))
    await screen.findByText(/отключён, серверные ключи удалены/)
    expectOnlyPersonalRequests()
  })
})

it.each([null, { success: false, data: usage }, { success: true, data: { balance: 0 } }])('расходы: invalid DTO %p не выдаёт нулевой баланс', async (response) => {
  getMock.mockResolvedValueOnce(response)
  const screen = render(<AiUsagePanel activeProvider="artistcrm" />)
  await screen.findByText('Не удалось загрузить баланс и расходы ИИ.')
  expect(screen.queryByText('Баланс')).toBeNull(); expect(screen.queryByText('Общий ИИ доступен.')).toBeNull()
})
it('пауза ИИ не выдаётся за действующее подключение по eligibility баланса', async () => {
  const screen = render(<AiUsagePanel activeProvider="artistcrm" activeEnabled={false} activeConfigured />)
  await screen.findByText('ИИ-интеграция приостановлена. Баланс и история остаются доступными.')
  expect(screen.queryByText('Общий ИИ доступен.')).toBeNull(); expect(screen.getByText('Баланс')).toBeTruthy()
})
it('свой провайдер без ключа не выдаётся за активное использование', async () => {
  const screen = render(<AiUsagePanel activeProvider="aitunnel" activeEnabled activeConfigured={false} />)
  await screen.findByText('Текущий ИИ требует настройки. История относится к общему ИИ Ведело.')
  expect(screen.queryByText(/Сейчас используется собственный провайдер/)).toBeNull()
})

it('тариф с включённым ИИ показывает израсходованную и оставшуюся сумму', async () => {
  getMock.mockImplementation(async (path: string) => {
    if (path === '/ai/usage')
      return {
        success: true,
        data: {
          ...usage,
          balance: 0,
          available: true,
          tariffIncluded: {
            enabled: true,
            includedRub: 500,
            usedRub: 125,
            remainingRub: 375,
            coveredByTariff: true,
            tariffTitle: 'Профи',
          },
        },
      }
    throw new Error(`Unexpected GET: ${path}`)
  })
  const screen = render(<AiUsagePanel activeProvider="artistcrm" activeEnabled activeConfigured />)
  await screen.findByText('ИИ включён в тариф')
  expect(screen.getByText(/125,00 ₽ из 500,00 ₽/)).toBeTruthy()
  expect(screen.getByText(/осталось 375,00 ₽/)).toBeTruthy()
  expect(screen.getByText(/Запросы ИИ пока идут за счёт тарифа/)).toBeTruthy()
})

it('исчерпанный лимит тарифа объясняет списания с баланса', async () => {
  getMock.mockImplementation(async (path: string) => {
    if (path === '/ai/usage')
      return {
        success: true,
        data: {
          ...usage,
          tariffIncluded: {
            enabled: true,
            includedRub: 500,
            usedRub: 500,
            remainingRub: 0,
            coveredByTariff: false,
          },
        },
      }
    throw new Error(`Unexpected GET: ${path}`)
  })
  const screen = render(<AiUsagePanel activeProvider="artistcrm" activeEnabled activeConfigured />)
  await screen.findByText('ИИ включён в тариф')
  expect(screen.getByText(/Включённая в тариф сумма на этот месяц исчерпана/)).toBeTruthy()
})

it('битый тарифный лимит в DTO не показывается как доступный ИИ', async () => {
  getMock.mockResolvedValueOnce({
    success: true,
    data: {
      ...usage,
      tariffIncluded: { enabled: 'yes', includedRub: 500 },
    },
  })
  const screen = render(<AiUsagePanel activeProvider="artistcrm" />)
  await screen.findByText('Не удалось загрузить баланс и расходы ИИ.')
  expect(screen.queryByText('ИИ включён в тариф')).toBeNull()
})
