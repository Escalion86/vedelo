import fieldHelp from '@helpers/fieldHelp.json'
import FieldHelp from '@components/FieldHelp'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSetAtom } from 'jotai'
import formatDateTime from '@helpers/formatDateTime'
import getPersonFullName from '@helpers/getPersonFullName'
import useSnackbar from '@helpers/useSnackbar'
import { useClientQuery, useClientsQuery } from '@helpers/useClientsQuery'
import clientsAtom from '@state/atoms/clientsAtom'
import SurfaceCard from '@components/SurfaceCard'
import Notice from '@components/Notice'

const loadCandidates = async (clientId) => {
  const response = await fetch(`/api/clients/${clientId}/messenger/candidates`)
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error?.message || 'Не удалось загрузить переписки')
  }
  return Array.isArray(result?.data?.conversations)
    ? result.data.conversations
    : []
}

const patchCandidate = async ({ clientId, provider, conversationId, linked }) => {
  const response = await fetch(`/api/clients/${clientId}/messenger/candidates`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, conversationId, linked }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error?.message || 'Не удалось обновить связь')
  }
  return Array.isArray(result?.data?.conversations)
    ? result.data.conversations
    : []
}

const linkVkById = async ({ clientId, vk }) => {
  const response = await fetch(`/api/clients/${clientId}/messenger/vk-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vk }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error?.message || 'Не удалось привязать VK')
  }
  return result?.data?.conversation ?? null
}

const loadMergePreview = async ({ clientId, duplicateClientId }) => {
  const params = new URLSearchParams({ duplicateClientId })
  const response = await fetch(`/api/clients/${clientId}/merge?${params}`)
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error?.message || 'Не удалось подготовить слияние')
  }
  return result?.data ?? null
}

const mergeDuplicateClient = async ({ clientId, duplicateClientId }) => {
  const response = await fetch(`/api/clients/${clientId}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duplicateClientId }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error?.message || 'Не удалось объединить клиентов')
  }
  return result?.data ?? null
}

const FILTER_PROVIDERS = [
  { value: 'all', label: 'Все' },
  { value: 'avito', label: 'Avito' },
  { value: 'vk', label: 'VK' },
  { value: 'telegram', label: 'Telegram' },
]

const FILTER_STATUSES = [
  { value: 'all', label: 'Все' },
  { value: 'linked', label: 'Связанные' },
  { value: 'available', label: 'Непривязанные' },
]

const clientContactMergeFunc = (clientId) => {
  const ClientContactMergeModal = ({ closeModal }) => {
    const snackbar = useSnackbar()
    const queryClient = useQueryClient()
    const setClients = useSetAtom(clientsAtom)
    const { data: clients = [] } = useClientsQuery()
    const initialClient = useMemo(
      () => clients.find((item) => item._id === clientId) ?? null,
      [clients]
    )
    const { data: client = initialClient } = useClientQuery(
      clientId,
      initialClient
    )
    const [conversations, setConversations] = useState([])
    const [loading, setLoading] = useState(false)
    const [updatingKey, setUpdatingKey] = useState('')
    const [search, setSearch] = useState('')
    const [vkInput, setVkInput] = useState(client?.vk || '')
    const [vkLinking, setVkLinking] = useState(false)
    const [providerFilter, setProviderFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [vkInputInitialized, setVkInputInitialized] = useState(false)
    const [duplicateSearch, setDuplicateSearch] = useState('')
    const [duplicateClientId, setDuplicateClientId] = useState('')
    const [mergeTargetClientId, setMergeTargetClientId] = useState(clientId)
    const [mergePreview, setMergePreview] = useState(null)
    const [mergeLoading, setMergeLoading] = useState(false)
    const [merging, setMerging] = useState(false)

    const load = useCallback(
      async ({ showSuccess = false } = {}) => {
        if (!clientId) return
        setLoading(true)
        try {
          setConversations(await loadCandidates(clientId))
          if (showSuccess) snackbar.success('Переписки обновлены')
        } catch (error) {
          snackbar.error(error?.message || 'Не удалось загрузить переписки')
        } finally {
          setLoading(false)
        }
      },
      [snackbar]
    )

    useEffect(() => {
      load()
    }, [load])

    useEffect(() => {
      if (vkInputInitialized || !client?.vk) return
      setVkInput(client.vk)
      setVkInputInitialized(true)
    }, [client?.vk, vkInputInitialized])

    const filteredConversations = useMemo(() => {
      const query = search.trim().toLowerCase()
      return conversations.filter((item) => {
        if (providerFilter !== 'all' && item.provider !== providerFilter) {
          return false
        }
        if (
          statusFilter === 'linked' &&
          !item.linkedToCurrentClient
        ) {
          return false
        }
        if (
          statusFilter === 'available' &&
          item.linkedToCurrentClient
        ) {
          return false
        }
        if (!query) return true

        return [
          item.providerLabel,
          item.title,
          item.subtitle,
          item.externalId,
          item.lastMessageText,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
    }, [conversations, providerFilter, search, statusFilter])

    const linkedConversations = filteredConversations.filter(
      (item) => item.linkedToCurrentClient
    )
    const availableConversations = filteredConversations.filter(
      (item) => !item.linkedToCurrentClient
    )
    const linkedCount = conversations.filter(
      (item) => item.linkedToCurrentClient
    ).length
    const availableCount = conversations.length - linkedCount
    const duplicateClient = useMemo(
      () =>
        clients.find((item) => String(item._id) === String(duplicateClientId)) ??
        null,
      [clients, duplicateClientId]
    )
    const duplicateCandidates = useMemo(() => {
      const query = duplicateSearch.trim().toLowerCase()
      return clients
        .filter((item) => String(item?._id) !== String(clientId))
        .filter((item) => {
          if (!query) return true
          return [
            getPersonFullName(item, { fallback: '' }),
            item.phone,
            item.whatsapp,
            item.telegram,
            item.vk,
            item.email,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(query)
        })
        .slice(0, 8)
    }, [clients, duplicateSearch])

    const toggleConversation = async (conversation, linked) => {
      const key = `${conversation.provider}:${conversation._id}`
      setUpdatingKey(key)
      try {
        const next = await patchCandidate({
          clientId,
          provider: conversation.provider,
          conversationId: conversation._id,
          linked,
        })
        setConversations(next)
        snackbar.success(linked ? 'Переписка привязана' : 'Переписка отвязана')
      } catch (error) {
        snackbar.error(error?.message || 'Не удалось обновить связь')
      } finally {
        setUpdatingKey('')
      }
    }

    const handleVkLink = async () => {
      const value = vkInput.trim()
      if (!value) {
        snackbar.error('Укажите VK ID, короткое имя или ссылку')
        return
      }

      setVkLinking(true)
      try {
        const linkedConversation = await linkVkById({ clientId, vk: value })
        const nextConversations = await loadCandidates(clientId)
        setConversations(nextConversations)
        setProviderFilter('vk')
        setStatusFilter('linked')
        if (linkedConversation?.externalId) {
          setSearch(linkedConversation.externalId)
        }
        snackbar.success('VK-диалог привязан')
      } catch (error) {
        snackbar.error(error?.message || 'Не удалось привязать VK')
      } finally {
        setVkLinking(false)
      }
    }

    const handlePreviewMerge = async () => {
      if (!duplicateClientId) {
        snackbar.error('Выберите клиента-дубль')
        return
      }

      setMergeLoading(true)
      try {
        const data = await loadMergePreview({ clientId, duplicateClientId })
        setMergePreview(data)
        setMergeTargetClientId(data?.recommendedTargetClientId || clientId)
        snackbar.success('Проверка слияния готова')
      } catch (error) {
        setMergePreview(null)
        snackbar.error(error?.message || 'Не удалось подготовить слияние')
      } finally {
        setMergeLoading(false)
      }
    }

    const handleMergeClients = async () => {
      if (!duplicateClientId) {
        snackbar.error('Выберите клиента-дубль')
        return
      }

      setMerging(true)
      try {
        const sourceClientId =
          String(mergeTargetClientId) === String(clientId)
            ? duplicateClientId
            : clientId
        const data = await mergeDuplicateClient({
          clientId: mergeTargetClientId,
          duplicateClientId: sourceClientId,
        })
        const updatedClient = data?.client
        const deletedClientId = data?.deletedClientId || sourceClientId
        setClients((prev = []) =>
          prev
            .filter((item) => String(item?._id) !== String(deletedClientId))
            .map((item) =>
              updatedClient && String(item?._id) === String(updatedClient._id)
                ? updatedClient
                : item
            )
        )
        await queryClient.invalidateQueries()
        setDuplicateClientId('')
        setMergeTargetClientId(clientId)
        setDuplicateSearch('')
        setMergePreview(null)
        snackbar.success('Клиенты объединены')
        closeModal?.()
      } catch (error) {
        snackbar.error(error?.message || 'Не удалось объединить клиентов')
      } finally {
        setMerging(false)
      }
    }

    const renderConversation = (conversation, linked) => {
      const key = `${conversation.provider}:${conversation._id}`
      return (
        <SurfaceCard
          key={key}
          className="flex flex-col gap-2 tablet:flex-row tablet:items-center tablet:justify-between"
          paddingClassName="p-3"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                {conversation.providerLabel}
              </span>
              <span className="truncate font-semibold text-gray-900">
                {conversation.title}
              </span>
            </div>
            {conversation.subtitle && (
              <div className="mt-1 line-clamp-2 text-sm text-gray-600">
                {conversation.subtitle}
              </div>
            )}
            <div className="mt-1 text-xs text-gray-500">
              {[conversation.externalId, formatDateTime(conversation.lastMessageAt)]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <button
            type="button"
            className={`h-10 shrink-0 cursor-pointer rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
              linked
                ? 'ui-btn ui-btn-secondary'
                : 'action-icon-button action-icon-button--success'
            }`}
            onClick={() => toggleConversation(conversation, !linked)}
            disabled={updatingKey === key}
          >
            {updatingKey === key
              ? 'Сохранение...'
              : linked
                ? 'Отвязать'
                : 'Привязать'}
          </button>
        </SurfaceCard>
      )
    }

    const clientName = getPersonFullName(client, { fallback: 'Клиент' })
    const selectedClientIsTarget =
      String(mergeTargetClientId) === String(duplicateClientId)
    const mergeTargetClient = selectedClientIsTarget ? duplicateClient : client
    const mergeSourceClient = selectedClientIsTarget ? client : duplicateClient
    const preview = selectedClientIsTarget
      ? mergePreview?.targetPreview
      : mergePreview?.duplicatePreview || mergePreview?.preview
    const targetEvents = selectedClientIsTarget
      ? mergePreview?.duplicatePreview?.events
      : mergePreview?.targetPreview?.events
    const sourceEvents = selectedClientIsTarget
      ? mergePreview?.targetPreview?.events
      : mergePreview?.duplicatePreview?.events
    const currentEventsCount = Number(mergePreview?.targetPreview?.events || 0)
    const selectedEventsCount = Number(
      mergePreview?.duplicatePreview?.events || 0
    )
    const previewItems = preview
      ? [
          ['Мероприятия', preview.events],
          ['Доп. контакты в мероприятиях', preview.eventsOtherContacts],
          ['Коллега в мероприятиях', preview.eventsColleague],
          ['Транзакции', preview.transactions],
          ['Avito-диалоги', preview.avitoConversations],
          ['Avito-сообщения', preview.avitoMessages],
          ['VK-диалоги', preview.vkConversations],
          ['VK-сообщения', preview.vkMessages],
          ['Telegram-диалоги', preview.telegramConversations],
          ['Telegram-сообщения', preview.telegramMessages],
          ['Звонки', preview.calls],
        ].filter((item) => Number(item[1]) > 0)
      : []

    return (
      <div className="flex flex-col gap-3 text-sm text-gray-800">
        <SurfaceCard paddingClassName="px-3 py-2">
          <div className="font-semibold text-gray-900">{clientName}</div>
          <div className="flex items-center gap-1 text-xs font-semibold text-gray-500">
            Привязка переписки
            <FieldHelp text={fieldHelp['client.conversationLink']} label="Привязка переписки" />
          </div>
          <div className="mt-1 text-xs text-gray-600">
            Привяжите внешние диалоги к этому клиенту. После привязки они
            попадут в общий чат клиента.
          </div>
        </SurfaceCard>

        <SurfaceCard paddingClassName="p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Объединить с другим контактом
            <FieldHelp text={fieldHelp['client.merge']} label="Объединить с другим контактом" />          </div>
          <div className="mt-1 text-xs text-gray-600">
            Выберите второй контакт, проверьте связи и укажите направление
            объединения. Карточка-получатель останется, вторая будет удалена.
          </div>
          <input
            type="search"
            className="mt-3 min-h-10 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-general"
            value={duplicateSearch}
            onChange={(event) => {
              setDuplicateSearch(event.target.value)
              setMergePreview(null)
            }}
            placeholder="Найти контакт по имени, телефону, Telegram, VK"
            disabled={merging}
          />
          <div className="mt-2 flex max-h-44 flex-col gap-2 overflow-y-auto">
            {duplicateCandidates.map((item) => {
              const name = getPersonFullName(item, { fallback: 'Без имени' })
              const selected = String(item._id) === String(duplicateClientId)
              return (
                <button
                  key={item._id}
                  type="button"
                  className={`cursor-pointer rounded border px-3 py-2 text-left text-sm transition ${
                    selected
                      ? 'border-general bg-gray-100 text-gray-900'
                      : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setDuplicateClientId(item._id)
                    setMergeTargetClientId(clientId)
                    setMergePreview(null)
                  }}
                  disabled={merging}
                >
                  <div className="font-semibold">{name}</div>
                  <div className="mt-0.5 truncate text-xs text-gray-500">
                    {[item.phone, item.telegram, item.vk, item.email]
                      .filter(Boolean)
                      .join(' · ') || item._id}
                  </div>
                </button>
              )
            })}
          </div>
          {duplicateClient && (
            <div className="mt-2 rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
              Второй контакт выбран:{' '}
              <span className="font-semibold">
                {getPersonFullName(duplicateClient, { fallback: 'Без имени' })}
              </span>
            </div>
          )}
          {mergePreview && mergeTargetClient && mergeSourceClient && (
            <Notice tone="info" className="mt-2 rounded px-3 py-3 text-xs">
              <div className="font-semibold">Направление объединения</div>
              <div className="mt-2 grid grid-cols-1 gap-2 tablet:grid-cols-[1fr_auto_1fr] tablet:items-center">
                <div className="rounded border border-gray-200 bg-white px-3 py-2">
                  <div className="text-[10px] font-semibold tracking-wide text-gray-700 uppercase">
                    Останется
                  </div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {getPersonFullName(mergeTargetClient, {
                      fallback: 'Без имени',
                    })}
                  </div>
                  <div className="text-gray-500">
                    Мероприятий: {Number(targetEvents || 0)}
                  </div>
                </div>
                <div className="text-center text-lg font-semibold text-[var(--ui-primary)]">
                  <span className="tablet:hidden">↑</span>
                  <span className="hidden tablet:inline">←</span>
                </div>
                <div className="rounded border border-gray-200 bg-white px-3 py-2">
                  <div className="text-[10px] font-semibold tracking-wide text-gray-700 uppercase">
                    Данные перенесутся, карточка удалится
                  </div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {getPersonFullName(mergeSourceClient, {
                      fallback: 'Без имени',
                    })}
                  </div>
                  <div className="text-gray-500">
                    Мероприятий: {Number(sourceEvents || 0)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="ui-btn ui-btn-secondary mt-2 min-h-10 w-full cursor-pointer px-3 text-xs tablet:w-auto"
                onClick={() =>
                  setMergeTargetClientId((current) =>
                    String(current) === String(clientId)
                      ? duplicateClientId
                      : clientId
                  )
                }
                disabled={merging}
              >
                Поменять направление ↔
              </button>
              {String(mergeTargetClientId) ===
              String(mergePreview?.recommendedTargetClientId) ? (
                <div className="mt-2 text-gray-700">
                  {currentEventsCount === selectedEventsCount
                    ? 'Количество мероприятий одинаковое — по умолчанию сохраняем текущую карточку.'
                    : 'Рекомендуем сохранить карточку с большим числом связанных мероприятий.'}
                </div>
              ) : null}
            </Notice>
          )}
          {preview && (
            <div className="mt-2 rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
              <div className="font-semibold text-gray-900">
                Будет перенесено записей: {preview.total}
              </div>
              {previewItems.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {previewItems.map(([label, count]) => (
                    <span
                      key={label}
                      className="rounded bg-gray-100 px-2 py-1 text-gray-700"
                    >
                      {label}: {count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2 tablet:flex-row">
            <button
              type="button"
              className="ui-btn ui-btn-secondary h-10 cursor-pointer px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handlePreviewMerge}
              disabled={!duplicateClientId || mergeLoading || merging}
            >
              {mergeLoading ? 'Проверка...' : 'Проверить связи'}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary h-10 cursor-pointer px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleMergeClients}
              disabled={!duplicateClientId || !mergePreview || merging}
            >
              {merging ? 'Объединение...' : 'Объединить в указанном направлении'}
            </button>
          </div>
        </SurfaceCard>

        <div className="flex justify-end">
          <button
            type="button"
            className="ui-btn ui-btn-secondary cursor-pointer px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => load({ showSuccess: true })}
            disabled={loading}
          >
            {loading ? 'Обновление...' : 'Обновить'}
          </button>
        </div>

        <SurfaceCard paddingClassName="p-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Привязать VK по ID
          </label>
          <div className="mt-2 flex flex-col gap-2 tablet:flex-row">
            <input
              type="text"
              className="min-h-10 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-general"
              value={vkInput}
              onChange={(event) => setVkInput(event.target.value)}
              placeholder="id123456, 123456, vk.com/id123456 или screen_name"
              disabled={vkLinking}
            />
            <button
              type="button"
              className="ui-btn ui-btn-primary h-10 shrink-0 cursor-pointer px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleVkLink}
              disabled={vkLinking}
            >
              {vkLinking ? 'Привязка...' : 'Привязать VK'}
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Для отправки ответа VK должен разрешать сообщения от группы.
          </div>
        </SurfaceCard>

        <SurfaceCard paddingClassName="p-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Поиск диалога
          </label>
          <input
            type="search"
            className="mt-2 min-h-10 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-general"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Имя, текст сообщения, ID чата"
          />
          <div className="mt-3 flex flex-col gap-2 tablet:flex-row tablet:items-center tablet:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTER_PROVIDERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`cursor-pointer rounded border px-3 py-2 text-xs font-semibold transition ${
                    providerFilter === item.value
                      ? 'border-general bg-gray-100 text-gray-900'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setProviderFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTER_STATUSES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`cursor-pointer rounded border px-3 py-2 text-xs font-semibold transition ${
                    statusFilter === item.value
                      ? 'border-general bg-gray-100 text-gray-900'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setStatusFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            Найдено: {filteredConversations.length} · Связаны: {linkedCount} ·
            Непривязаны: {availableCount}
          </div>
        </SurfaceCard>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Уже связаны
          </div>
          <div className="flex flex-col gap-2">
            {linkedConversations.length > 0 ? (
              linkedConversations.map((item) => renderConversation(item, true))
            ) : (
              <div className="rounded border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-500">
                Связанных диалогов пока нет.
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Можно привязать
          </div>
          <div className="flex flex-col gap-2">
            {availableConversations.length > 0 ? (
              availableConversations.map((item) => renderConversation(item, false))
            ) : (
              <div className="rounded border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-500">
                Непривязанных диалогов Avito/VK не найдено.
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return {
    title: 'Объединение контактов',
    confirmButtonName: 'Закрыть',
    showDecline: false,
    onConfirm: true,
    Children: ClientContactMergeModal,
  }
}

export default clientContactMergeFunc
