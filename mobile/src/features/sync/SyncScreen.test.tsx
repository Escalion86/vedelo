import React from 'react'
import { StyleSheet } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import SyncScreen from '../../../app/sync'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
import { listCachedEntities } from '../../shared/storage/cache'
import { getOutboxSummary, listOutboxDisplayItems, retryOutboxOperationNow } from '../../shared/storage/outbox'
import { listFileQueueDisplayItems, retryFileQueueNow } from '../../shared/storage/encryptedFiles'
import { listConflicts, resolveConflict } from '../../shared/storage/conflicts'
import { getLocalDatabaseDiagnostics } from '../../shared/storage/databaseDiagnostics'
import { getBackgroundSyncInfo } from '../../shared/sync/backgroundSync'
import { runSync } from '../../shared/sync/syncEngine'
const mockInvalidate = jest.fn()
let mockRunState: unknown = null
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }))
jest.mock('../../shared/storage/cache', () => ({ listCachedEntities: jest.fn() }))
jest.mock('../../shared/storage/outbox', () => ({ getOutboxSummary: jest.fn(), listOutboxDisplayItems: jest.fn(), retryOutboxOperationNow: jest.fn() }))
jest.mock('../../shared/storage/encryptedFiles', () => ({ listFileQueueDisplayItems: jest.fn(), retryFileQueueNow: jest.fn() }))
jest.mock('../../shared/storage/conflicts', () => ({ listConflicts: jest.fn(), resolveConflict: jest.fn() }))
jest.mock('../../shared/storage/databaseDiagnostics', () => ({ getLocalDatabaseDiagnostics: jest.fn() }))
jest.mock('../../shared/sync/backgroundSync', () => ({ getBackgroundSyncInfo: jest.fn() }))
jest.mock('../../shared/sync/syncEngine', () => ({ runSync: jest.fn() }))
jest.mock('../../shared/hooks/useSyncRunState', () => ({ useSyncRunState: () => mockRunState }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
const diagnostics = { sqlCipherActive: true, schemaVersion: 4, supportedSchemaVersion: 4, cachedEntities: 12, conflicts: 1, outboxByStatus: { pending: 2, failed: 1, conflict: 1 }, filesByStatus: { failed: 1 }, recoveredAtStartup: { outboxOperations: 1, files: 2 } }
const conflict = { id: 'conflict', operationId: 'operation', entityType: 'clients', entityId: 'client', path: 'firstName', base: 'Было', local: 'На телефоне версия', remote: 'На сервере версия', remoteVersion: 'v2', createdAt: '2026-10-04' }
const operation = { operationId: 'operation', entityType: 'clients', entityId: 'client', method: 'update', status: 'failed', attempts: 1, updatedAt: '2026-10-04', lastError: 'SQL raw-private-token' }
const file = { id: 'file', entityType: 'clients', entityId: 'client', name: 'Очень длинное имя файла документа клиента.docx', status: 'failed', attempts: 1, updatedAt: '2026-10-04', lastError: 'private-file-token' }
const setup = (theme: 'light' | 'dark') => render(<ThemeProvider forcedMode={theme} storage={null}><SyncScreen /></ThemeProvider>)
beforeEach(() => {
  jest.clearAllMocks(); mockRunState = null
  ;(listConflicts as jest.Mock).mockResolvedValue([]); (getOutboxSummary as jest.Mock).mockResolvedValue({})
  ;(listCachedEntities as jest.Mock).mockImplementation(async (kind: string) => kind === 'clients' ? [{ _id: 'client', firstName: 'Длинное имя клиента', secondName: 'Фамилия' }] : [])
  ;(getLocalDatabaseDiagnostics as jest.Mock).mockResolvedValue(diagnostics); (getBackgroundSyncInfo as jest.Mock).mockResolvedValue({ registered: true, available: true })
  ;(listOutboxDisplayItems as jest.Mock).mockResolvedValue([]); (listFileQueueDisplayItems as jest.Mock).mockResolvedValue([])
  ;(retryOutboxOperationNow as jest.Mock).mockResolvedValue(undefined); (retryFileQueueNow as jest.Mock).mockResolvedValue(undefined); (resolveConflict as jest.Mock).mockResolvedValue(undefined)
  ;(runSync as jest.Mock).mockResolvedValue(undefined); mockInvalidate.mockResolvedValue(undefined)
})
describe.each(['light', 'dark'] as const)('%s: очередь и конфликты', theme => {
  it('до окончания чтения нет нулей/успеха; пустое состояние только после чтения', async () => {
    let resolve!: (value: unknown) => void
    ;(listConflicts as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    mockRunState = { status: 'success' }
    const screen = setup(theme)
    expect(screen.getByTestId('sync-reading').props.accessibilityState.busy).toBe(true)
    for (const title of ['Всё отправлено', 'Конфликтов нет', 'Всё синхронизировано']) expect(screen.queryByText(title)).toBeNull()
    for (const title of ['Ожидает', 'Ошибки', 'Конфликты']) expect(screen.getByLabelText(`${title}: нет данных`)).toBeTruthy()
    expect(screen.getByTestId('sync-now').props.accessibilityState.disabled).toBe(true)
    await act(async () => resolve([])); await screen.findByText('Всё отправлено'); expect(screen.getByText('Конфликтов нет')).toBeTruthy()
    expect(screen.getByLabelText('Ожидает: 0')).toBeTruthy(); expect(screen.getByText('Всё синхронизировано')).toBeTruthy()
  })
  it('ошибка чтения не выдаёт пустые данные за успех, повтор читает заново', async () => {
    ;(listOutboxDisplayItems as jest.Mock).mockRejectedValueOnce(new Error('SQL private-read-token'))
    const screen = setup(theme); await screen.findByText('Данные очереди недоступны.')
    expect(screen.queryByText('Всё отправлено')).toBeNull(); expect(screen.queryByText('Конфликтов нет')).toBeNull(); expect(screen.getByLabelText('Ошибки: нет данных')).toBeTruthy()
    expect(JSON.stringify(screen.toJSON())).not.toContain('private-read-token')
    fireEvent.press(screen.getByTestId('sync-now')); await screen.findByText('Всё отправлено')
    expect(runSync).toHaveBeenCalledWith({ fullPull: true }); expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['cached-entities'] })
  })
  it('компактные строки всех текущих статусов, безопасные ошибки и тема', async () => {
    ;(getOutboxSummary as jest.Mock).mockResolvedValue({ pending: 2, failed: 1, conflict: 1 })
    ;(listOutboxDisplayItems as jest.Mock).mockResolvedValue(['pending', 'syncing', 'failed', 'conflict'].map((status, index) => ({ ...operation, operationId: `op-${index}`, status })))
    ;(listFileQueueDisplayItems as jest.Mock).mockResolvedValue(['pending', 'uploading', 'failed'].map((status, index) => ({ ...file, id: `file-${index}`, status })))
    const screen = setup(theme); await screen.findByTestId('sync-queue-items')
    const palette = theme === 'dark' ? darkPalette : lightPalette
    expect(StyleSheet.flatten(screen.getByTestId('sync-operation-failed').props.style).borderBottomColor).toBe(palette.border)
    for (const status of ['pending', 'syncing', 'failed', 'conflict']) expect(screen.getByTestId(`sync-operation-${status}`)).toBeTruthy()
    for (const status of ['pending', 'uploading', 'failed']) expect(screen.getByTestId(`sync-file-${status}`)).toBeTruthy()
    expect(screen.getByLabelText('Ожидает: 2')).toBeTruthy(); expect(screen.getAllByText('Длинное имя клиента Фамилия').length).toBe(4)
    expect(screen.getByText('Выберите нужную версию в разделе конфликтов ниже.')).toBeTruthy()
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/private-file-token|raw-private-token/)
  })
  it('retry операции: старый порядок, invalidation, блокировка повторного обмена', async () => {
    ;(listOutboxDisplayItems as jest.Mock).mockResolvedValue([operation])
    let resolve!: () => void; (retryOutboxOperationNow as jest.Mock).mockImplementationOnce(() => new Promise<void>(done => { resolve = done }))
    const screen = setup(theme); await screen.findByTestId('retry-sync-operation'); fireEvent.press(screen.getByTestId('retry-sync-operation'))
    expect(screen.getByTestId('retry-sync-operation').props.accessibilityState.busy).toBe(true); expect(screen.getByTestId('sync-now').props.accessibilityState.disabled).toBe(true)
    fireEvent.press(screen.getByTestId('retry-sync-operation')); expect(retryOutboxOperationNow).toHaveBeenCalledTimes(1)
    await act(async () => resolve()); await waitFor(() => expect(listOutboxDisplayItems).toHaveBeenCalledTimes(2))
    expect(retryOutboxOperationNow).toHaveBeenCalledWith('operation'); expect(runSync).toHaveBeenCalledWith()
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['cached-entities'] })
    expect((runSync as jest.Mock).mock.invocationCallOrder[0]).toBeGreaterThan((retryOutboxOperationNow as jest.Mock).mock.invocationCallOrder[0]); expect(mockInvalidate.mock.invocationCallOrder[0]).toBeGreaterThan((runSync as jest.Mock).mock.invocationCallOrder[0])
  })
  it('retry файла: штатная отправка/повторное чтение, без новой invalidation', async () => {
    ;(listFileQueueDisplayItems as jest.Mock).mockResolvedValue([file])
    const screen = setup(theme); await screen.findByTestId('retry-sync-file'); fireEvent.press(screen.getByTestId('retry-sync-file'))
    await waitFor(() => expect(listFileQueueDisplayItems).toHaveBeenCalledTimes(2))
    expect(retryFileQueueNow).toHaveBeenCalledWith({ id: 'file' }); expect(runSync).toHaveBeenCalledWith(); expect(mockInvalidate).not.toHaveBeenCalled()
  })
  it.each(['local', 'remote'] as const)('решение %s: значения и адресная invalidation', async choice => {
    ;(listConflicts as jest.Mock).mockResolvedValueOnce([conflict]).mockResolvedValue([])
    const screen = setup(theme); await screen.findByTestId('keep-local-conflict')
    for (const value of ['Было: Было', 'На телефоне версия', 'На сервере версия']) expect(screen.getByText(value)).toBeTruthy()
    fireEvent.press(screen.getByTestId(choice === 'local' ? 'keep-local-conflict' : 'accept-server-conflict'))
    await screen.findByText('Конфликтов нет')
    expect(resolveConflict).toHaveBeenCalledWith(conflict, choice); expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['cached-entities', 'clients'] })
    expect(mockInvalidate.mock.invocationCallOrder[0]).toBeGreaterThan((listConflicts as jest.Mock).mock.invocationCallOrder[1])
  })
  it('диагностика базы/восстановления и фон сохранены; нет данных не равно выключено', async () => {
    const screen = setup(theme); await screen.findByText(/После прерывания восстановлено: 1 операций, 2 файлов/)
    expect(screen.getByLabelText('SQLCipher активен')).toBeTruthy(); expect(screen.getByLabelText('Включена')).toBeTruthy(); expect(screen.getByText(/Схема: v4 из v4/)).toBeTruthy()
    ;(getLocalDatabaseDiagnostics as jest.Mock).mockRejectedValueOnce(new Error('private-diagnostic-token')); (getBackgroundSyncInfo as jest.Mock).mockRejectedValueOnce(new Error('private-background-token'))
    fireEvent.press(screen.getByTestId('sync-now')); await screen.findByText('Не удалось прочитать состояние локальной базы.')
    expect(screen.queryByLabelText('Не активна')).toBeNull(); expect(screen.getAllByLabelText('Нет данных').length).toBe(2)
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/private-diagnostic-token|private-background-token/)
  })
  it('ошибка решения конфликта оставляет обе версии и безопасный Notice', async () => {
    ;(listConflicts as jest.Mock).mockResolvedValue([conflict]); (resolveConflict as jest.Mock).mockRejectedValueOnce(new Error('SQL private-conflict-token'))
    const screen = setup(theme); await screen.findByTestId('keep-local-conflict'); fireEvent.press(screen.getByTestId('keep-local-conflict'))
    await screen.findByText('Не удалось синхронизировать изменение. Повторите отправку.')
    expect(screen.getByText('На телефоне версия')).toBeTruthy(); expect(screen.getByText('На сервере версия')).toBeTruthy()
    expect(mockInvalidate).not.toHaveBeenCalled(); expect(JSON.stringify(screen.toJSON())).not.toContain('private-conflict-token')
  })
  it('ошибка повторного чтения скрывает прежний успех', async () => {
    const screen = setup(theme); await screen.findByText('Всё отправлено')
    ;(listOutboxDisplayItems as jest.Mock).mockRejectedValueOnce(new Error('private-query-token'))
    fireEvent.press(screen.getByTestId('sync-now')); await screen.findByText('Данные очереди недоступны.')
    expect(screen.queryByText('Всё отправлено')).toBeNull(); expect(screen.queryByText('Конфликтов нет')).toBeNull(); expect(screen.getByLabelText('Конфликты: нет данных')).toBeTruthy()
  })
  it('ошибка повтора операции/файла сохраняет очередь и безопасное сообщение', async () => {
    ;(listOutboxDisplayItems as jest.Mock).mockResolvedValue([operation]); (listFileQueueDisplayItems as jest.Mock).mockResolvedValue([file])
    const screen = setup(theme); await screen.findByTestId('retry-sync-operation')
    ;(retryOutboxOperationNow as jest.Mock).mockRejectedValueOnce(new Error('network private-retry-token'))
    fireEvent.press(screen.getByTestId('retry-sync-operation')); await screen.findByText('Нет соединения. Приложение повторит отправку после восстановления сети.')
    await waitFor(() => expect(screen.getByTestId('retry-sync-file').props.accessibilityState.disabled).toBe(false))
    ;(retryFileQueueNow as jest.Mock).mockRejectedValueOnce(new Error('Зашифрованный файл не найден private-file-token'))
    fireEvent.press(screen.getByTestId('retry-sync-file')); await screen.findByText('Локальный файл не найден. Добавьте вложение повторно.')
    expect(screen.getByTestId('sync-file-failed')).toBeTruthy(); expect(runSync).not.toHaveBeenCalled(); expect(JSON.stringify(screen.toJSON())).not.toContain('private-retry-token')
  })
})
