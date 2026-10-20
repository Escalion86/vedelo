'use client'

import AiBadge from '@components/AiBadge'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import {
  faPhone,
  faPlus,
  faUserPlus,
  faWandMagicSparkles,
  faFileAudio,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import AppButton from '@components/AppButton'
import AudioPlayer from '@components/AudioPlayer'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import Input from '@components/Input'
import NativeSelect from '@components/NativeSelect'
import Notice from '@components/Notice'
import Textarea from '@components/Textarea'
import CardWrapper from '@components/CardWrapper'
import CardActions from '@components/CardActions'
import CardButtons from '@components/CardButtons'
import SurfaceCard from '@components/SurfaceCard'
import { modalsFuncAtom } from '@state/atoms'
import { useCallActions, useCallsQuery } from '@helpers/useCallsQuery'
import {
  useClientActions,
  useClientQuery,
  useClientsQuery,
} from '@helpers/useClientsQuery'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import getPersonFullName from '@helpers/getPersonFullName'
import useSnackbar from '@helpers/useSnackbar'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { getCallActionButtonState } from '@helpers/callActionButtonState.mjs'
import { canOpenCallEventDraft } from '@helpers/callEventDraft.mjs'

const STATUS_LABELS = {
  new: 'Новый',
  processing: 'Обработка',
  ready: 'Готов',
  linked: 'Связан',
  ignored: 'Не клиент',
  failed: 'Ошибка',
}

const DIRECTION_LABELS = {
  incoming: 'Входящий',
  outgoing: 'Исходящий',
  unknown: 'Неизвестно',
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'ready', label: 'Готовые' },
  { value: 'linked', label: 'Связанные' },
  { value: 'ignored', label: 'Не клиенты' },
  { value: 'failed', label: 'Ошибки' },
]

const formatDateTime = (value) => {
  if (!value) return 'Дата не указана'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Дата не указана'
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const toDatetimeLocal = (value) => {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const fromDatetimeLocal = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const splitClientName = (name) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return {
    firstName: parts[0] || '',
    secondName: parts.slice(1).join(' '),
  }
}

const getClientLabel = (client) => {
  if (!client) return ''
  return (
    getPersonFullName(client) ||
    client.phone ||
    client.whatsapp ||
    `Клиент ${client._id}`
  )
}

const normalizeId = (value) => {
  if (!value) return null
  if (typeof value === 'object') {
    if (value._id) return normalizeId(value._id)
    if (value.$oid) return String(value.$oid)
  }
  return String(value)
}

const formatClientContactLines = (client) => {
  if (!client || typeof client !== 'object') return []
  const lines = []
  if (client?.phone) lines.push(`Телефон: ${client.phone}`)
  if (client?.whatsapp) lines.push(`WhatsApp: ${client.whatsapp}`)
  if (client?.viber) lines.push(`Viber: ${client.viber}`)
  if (client?.telegram) lines.push(`Telegram: ${client.telegram}`)
  if (client?.instagram) lines.push(`Instagram: ${client.instagram}`)
  if (client?.vk) lines.push(`VK: ${client.vk}`)
  if (client?.email) lines.push(`Email: ${client.email}`)
  return lines
}

const CallInfoRow = ({ label, children }) => (
  <div>
    <div className="card-muted text-xs">{label}</div>
    <div className="card-title mt-0.5 text-sm">{children || '-'}</div>
  </div>
)

const LinkedClientCard = ({ client, linkedClientId, onOpen }) => {
  const { data: fetchedClient } = useClientQuery(linkedClientId, client)
  const resolvedClient = client ?? fetchedClient

  if (!linkedClientId) {
    return <CallInfoRow label="Клиент">не связан</CallInfoRow>
  }

  if (!resolvedClient) {
    return <CallInfoRow label="Клиент">загрузка...</CallInfoRow>
  }

  return (
    <SurfaceCard className="p-2">
      <div
        role="button"
        tabIndex={0}
        className="hover:border-general focus:ring-general/30 cursor-pointer rounded-lg border border-gray-200 p-2 transition hover:shadow-sm focus:ring-2 focus:outline-none"
        onClick={() => onOpen?.(resolvedClient)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onOpen?.(resolvedClient)
        }}
      >
        <div className="card-title text-sm">
          Клиент:{' '}
          {getPersonFullName(resolvedClient, {
            fallback: 'Не указан',
          })}
        </div>
        {formatClientContactLines(resolvedClient).map((line) => (
          <div key={line} className="card-muted text-xs">
            {line}
          </div>
        ))}
        <div
          className="mt-1"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <ContactsIconsButtons user={resolvedClient} showChat />
        </div>
      </div>
    </SurfaceCard>
  )
}

const CallClientName = ({ client, linkedClientId }) => {
  const { data: fetchedClient } = useClientQuery(linkedClientId, client)
  const resolvedClient = client ?? fetchedClient

  if (resolvedClient) {
    return getClientLabel(resolvedClient)
  }

  if (linkedClientId) return 'загрузка...'
  return 'не связан'
}

const CallActionButtonContent = ({ icon, isLoading, children }) => (
  <>
    <FontAwesomeIcon
      icon={isLoading ? faSpinner : icon}
      className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
    />
    {children}
  </>
)

const CallDetailsModalContent = ({
  call,
  client,
  canUseAi,
  onOpenEditor,
  onAnalyze,
  onProcessRecording,
  onCreateClient,
  onOpenEventDraft,
  onOpenClientView,
}) => {
  const [activeAction, setActiveAction] = useState(null)
  const fields = call?.aiExtractedFields ?? {}
  const callId = normalizeId(call?._id)

  const runCallAction = async (type, action) => {
    setActiveAction({ callId, type })
    try {
      await action()
    } finally {
      setActiveAction((current) =>
        current?.callId === callId && current?.type === type ? null : current
      )
    }
  }

  const analyzeState = getCallActionButtonState({
    activeAction,
    callId,
    type: 'analyze',
    idleLabel: 'Разобрать текст',
    loadingLabel: 'Разбирается...',
    disabled: !canUseAi || call.status === 'processing',
  })
  const processRecordingState = getCallActionButtonState({
    activeAction,
    callId,
    type: 'processRecording',
    idleLabel: 'Распознать запись',
    loadingLabel: 'Распознается...',
    disabled: !canUseAi || call.status === 'processing',
  })
  const createClientState = getCallActionButtonState({
    activeAction,
    callId,
    type: 'createClient',
    idleLabel: 'Создать клиента',
    loadingLabel: 'Создается...',
  })
  const createEventState = getCallActionButtonState({
    activeAction,
    callId,
    type: 'createEvent',
    idleLabel: 'Создать заявку',
    loadingLabel: 'Создается...',
    disabled: !canOpenCallEventDraft(call) || call.status === 'processing',
  })

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="tablet:grid-cols-2 grid grid-cols-1 gap-3">
        <CallInfoRow label="Номер">
          {call.phone || call.normalizedPhone || 'Без номера'}
        </CallInfoRow>
        <CallInfoRow label="Направление">
          {DIRECTION_LABELS[call.direction] || 'Звонок'}
        </CallInfoRow>
        <CallInfoRow label="Время">
          {formatDateTime(call.startedAt)}
        </CallInfoRow>
        <CallInfoRow label="Длительность">
          {Number(call.durationSec || 0)} сек
        </CallInfoRow>
        <CallInfoRow label="Статус">
          {STATUS_LABELS[call.status] || 'Новый'}
        </CallInfoRow>
      </div>

      <LinkedClientCard
        client={client}
        linkedClientId={call.linkedClientId}
        onOpen={onOpenClientView}
      />

      {call.recordingUrl ? (
        <AudioPlayer
          src={call.recordingUrl}
          title="Запись разговора"
          subtitle="Novofon"
        />
      ) : null}

      {call.aiSummary ? (
        <div className="card-meta rounded border border-gray-200 p-3 leading-5">
          <div className="card-muted mb-1 text-xs font-semibold">
            Кратко по разговору
          </div>
          {call.aiSummary}
        </div>
      ) : null}

      {(fields.eventDate || fields.budget || fields.nextContactAt) && (
        <div className="tablet:grid-cols-3 grid grid-cols-1 gap-2">
          <div className="rounded border border-gray-200 p-2">
            <div className="card-muted">Дата</div>
            <div className="card-title">
              {fields.eventDate ? formatDateTime(fields.eventDate) : '-'}
            </div>
          </div>
          <div className="rounded border border-gray-200 p-2">
            <div className="card-muted">Бюджет</div>
            <div className="card-title">
              {fields.budget ? `${fields.budget} ₽` : '-'}
            </div>
          </div>
          <div className="rounded border border-gray-200 p-2">
            <div className="card-muted">Контакт</div>
            <div className="card-title">
              {fields.nextContactAt
                ? formatDateTime(fields.nextContactAt)
                : '-'}
            </div>
          </div>
        </div>
      )}

      {call.transcript ? (
        <div className="card-meta max-h-56 overflow-y-auto rounded border border-gray-200 p-3 leading-5">
          <div className="card-muted mb-1 text-xs font-semibold">
            Текст разговора
          </div>
          <div className="whitespace-pre-wrap">{call.transcript}</div>
        </div>
      ) : null}

      {call.processingError ? (
        <div className="text-sm text-red-600">{call.processingError}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <AppButton size="sm" variant="secondary" onClick={onOpenEditor}>
          Редактировать
        </AppButton>
        {!call.recordingUrl && call.transcript && !call.aiSummary ? (
          <AppButton
            size="sm"
            variant="secondary"
            disabled={analyzeState.disabled}
            aria-busy={analyzeState.isLoading}
            onClick={() => runCallAction('analyze', onAnalyze)}
            className="gap-2"
          >
            <CallActionButtonContent
              icon={faWandMagicSparkles}
              isLoading={analyzeState.isLoading}
            >
              {analyzeState.label}
              <AiBadge />
            </CallActionButtonContent>
          </AppButton>
        ) : null}
        {call.recordingUrl && !call.transcript ? (
          <AppButton
            size="sm"
            variant="secondary"
            disabled={processRecordingState.disabled}
            aria-busy={processRecordingState.isLoading}
            onClick={() =>
              runCallAction('processRecording', onProcessRecording)
            }
            className="gap-2"
          >
            <CallActionButtonContent
              icon={faFileAudio}
              isLoading={processRecordingState.isLoading}
            >
              {processRecordingState.label}
              <AiBadge />
            </CallActionButtonContent>
          </AppButton>
        ) : null}
        {!call.linkedClientId ? (
          <AppButton
            size="sm"
            variant="secondary"
            disabled={createClientState.disabled}
            aria-busy={createClientState.isLoading}
            onClick={() => runCallAction('createClient', onCreateClient)}
            className="gap-2"
          >
            <CallActionButtonContent
              icon={faUserPlus}
              isLoading={createClientState.isLoading}
            >
              {createClientState.label}
            </CallActionButtonContent>
          </AppButton>
        ) : null}
        <AppButton
          size="sm"
          disabled={createEventState.disabled}
          aria-busy={createEventState.isLoading}
          onClick={() => runCallAction('createEvent', onOpenEventDraft)}
          className="gap-2"
        >
          {createEventState.isLoading ? (
            <FontAwesomeIcon
              icon={faSpinner}
              className="h-3.5 w-3.5 animate-spin"
            />
          ) : null}
          {createEventState.label}
        </AppButton>
      </div>
    </div>
  )
}

const CallEditorModal = ({
  closeModal,
  setOnConfirmFunc,
  setConfirmButtonName,
  setDisableConfirm,
  initialCall = null,
  onSave,
}) => {
  const [phone, setPhone] = useState(initialCall?.phone ?? null)
  const [direction, setDirection] = useState(
    initialCall?.direction ?? 'incoming'
  )
  const [startedAt, setStartedAt] = useState(
    toDatetimeLocal(initialCall?.startedAt)
  )
  const [durationSec, setDurationSec] = useState(initialCall?.durationSec ?? 0)
  const [status, setStatus] = useState(initialCall?.status ?? 'new')
  const [transcript, setTranscript] = useState(initialCall?.transcript ?? '')
  const onSaveRef = useRef(onSave)
  const closeModalRef = useRef(closeModal)
  const payloadRef = useRef({})

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    closeModalRef.current = closeModal
  }, [closeModal])

  useEffect(() => {
    payloadRef.current = {
      phone,
      direction,
      startedAt: fromDatetimeLocal(startedAt),
      durationSec: Number(durationSec) || 0,
      status,
      transcript,
    }
  }, [direction, durationSec, phone, startedAt, status, transcript])

  useEffect(() => {
    setConfirmButtonName(initialCall?._id ? 'Сохранить' : 'Добавить звонок')
  }, [initialCall?._id, setConfirmButtonName])

  useEffect(() => {
    setDisableConfirm(!phone && !transcript.trim())
  }, [phone, setDisableConfirm, transcript])

  useEffect(() => {
    setOnConfirmFunc(async () => {
      await onSaveRef.current?.(payloadRef.current)
      closeModalRef.current?.()
    })
  }, [setOnConfirmFunc])

  return (
    <div className="flex flex-col gap-3">
      <div className="tablet:grid-cols-2 grid grid-cols-1 gap-3">
        <Input
          label="Телефон"
          type="phone"
          value={phone}
          onChange={setPhone}
          noMargin
          fullWidth
        />
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Направление
          <NativeSelect
            className="h-10 rounded border border-gray-300 bg-white px-2 text-black"
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
          >
            <option value="incoming">Входящий</option>
            <option value="outgoing">Исходящий</option>
            <option value="unknown">Неизвестно</option>
          </NativeSelect>
        </label>
      </div>
      <div className="tablet:grid-cols-2 grid grid-cols-1 gap-3">
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Время звонка
          <input
            type="datetime-local"
            className="h-10 rounded border border-gray-300 bg-white px-2 text-black"
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
          />
        </label>
        <Input
          label="Длительность, сек"
          type="number"
          min={0}
          value={durationSec}
          onChange={setDurationSec}
          noMargin
          fullWidth
        />
      </div>
      <label className="flex flex-col gap-1 text-sm text-gray-700">
        Статус
        <NativeSelect
          className="h-10 rounded border border-gray-300 bg-white px-2 text-black"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="new">Новый</option>
          <option value="ready">Готов</option>
          <option value="linked">Связан</option>
          <option value="ignored">Не клиент</option>
          <option value="failed">Ошибка</option>
        </NativeSelect>
      </label>
      <Textarea
        label="Transcript / заметки по разговору"
        value={transcript}
        onChange={setTranscript}
        rows={10}
        noMargin
        fullWidth
      />
    </div>
  )
}

const CallsContent = () => {
  const [status, setStatus] = useState('all')
  const loggedUser = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const tariffAccess = useMemo(
    () => getUserTariffAccess(loggedUser, tariffs),
    [loggedUser, tariffs]
  )
  const canUseTelephony = Boolean(tariffAccess?.allowTelephony)
  const canUseAi = Boolean(tariffAccess?.allowAi)
  const {
    data: callsPayload,
    isLoading,
    refetch,
  } = useCallsQuery({
    status,
    enabled: canUseTelephony,
  })
  const calls = callsPayload?.data ?? []
  const { data: clients = [] } = useClientsQuery()
  const callActions = useCallActions()
  const clientActions = useClientActions()
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const snackbar = useSnackbar()

  const clientsById = useMemo(() => {
    const map = new Map()
    clients.forEach((client) => map.set(String(client?._id), client))
    return map
  }, [clients])

  const openCallEditor = (call = null) => {
    modalsFunc.add({
      title: call?._id ? 'Редактировать звонок' : 'Добавить звонок',
      Children: (props) => (
        <CallEditorModal
          {...props}
          initialCall={call}
          onSave={async (payload) => {
            if (call?._id) await callActions.update(call._id, payload)
            else await callActions.create(payload)
            snackbar.success('Звонок сохранен')
            refetch()
          }}
        />
      ),
      declineButtonName: 'Отмена',
    })
  }

  const createClientFromCall = async (call) => {
    const name = call?.aiExtractedFields?.clientName || ''
    const nameParts = splitClientName(name)
    const normalizedPhone = call?.normalizedPhone || call?.phone || ''
    const client = await clientActions.set({
      ...nameParts,
      phone: normalizedPhone ? Number(normalizedPhone) : null,
      whatsapp: normalizedPhone ? Number(normalizedPhone) : null,
      clientType: 'none',
    })
    await callActions.link(call._id, { clientId: client._id })
    snackbar.success('Клиент создан и связан со звонком')
    refetch()
    return client
  }

  const openEventDraft = async (call) => {
    let nextCall = call
    let linkedClientId = normalizeId(nextCall?.linkedClientId)
    if (!linkedClientId) {
      const client = await createClientFromCall(call)
      linkedClientId = normalizeId(client?._id)
      nextCall = { ...call, linkedClientId }
    }
    const draft = await callActions.getEventDraft(nextCall._id)
    modalsFunc.event?.createFromDraft?.(
      {
        ...draft,
        clientId: linkedClientId || normalizeId(draft?.clientId),
      },
      async (event) => {
        await callActions.link(nextCall._id, {
          clientId: normalizeId(event?.clientId),
          eventId: normalizeId(event?._id),
        })
        snackbar.success('Заявка создана из звонка')
        refetch()
      }
    )
  }

  const analyzeCall = async (call) => {
    await callActions.analyze(call._id)
    snackbar.success('Текст разговора разобран')
    refetch()
  }

  const processRecording = async (call) => {
    await callActions.processRecording(call._id)
    snackbar.success('Запись распознана, текст разговора разобран')
    refetch()
  }

  const openClientView = (client) => {
    if (!client?._id) return
    modalsFunc.client?.view(client._id)
  }

  const openCallDetails = (call, client = null) => {
    modalsFunc.add({
      title: 'Звонок',
      TopLeftComponent: (
        <CardButtons
          item={call}
          typeOfItem="call"
          minimalActions
          alwaysCompact
          showCloneButton={false}
          showDeleteButton={false}
          showHistoryButton={false}
          showStatusButton={false}
          onEdit={() => openCallEditor(call)}
        />
      ),
      confirmButtonName: 'Закрыть',
      showDecline: false,
      onConfirm: true,
      Children: () => (
        <CallDetailsModalContent
          call={call}
          client={client}
          canUseAi={canUseAi}
          onOpenEditor={() => openCallEditor(call)}
          onAnalyze={() => analyzeCall(call)}
          onProcessRecording={() => processRecording(call)}
          onCreateClient={() => createClientFromCall(call)}
          onOpenEventDraft={() => openEventDraft(call)}
          onOpenClientView={openClientView}
        />
      ),
    })
  }

  return (
    <div className="tablet:px-4 tablet:pb-0 desktop:px-6 flex h-full min-h-0 flex-col gap-3 px-3 pb-3">
      <div className="tablet:flex-row tablet:items-center tablet:justify-between flex flex-col gap-2">
        <div>
          <div className="text-xl font-semibold text-gray-900">Звонки</div>
          <div className="text-sm text-gray-600">
            Журнал разговоров и AI-черновики заявок
          </div>
        </div>
        <AppButton
          onClick={() => openCallEditor()}
          className="gap-2"
          disabled={!canUseTelephony}
        >
          <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
          Добавить вручную
        </AppButton>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
              status === option.value
                ? 'border-general bg-general text-white'
                : 'border-gray-300 bg-white text-gray-700'
            }`}
            onClick={() => setStatus(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!canUseTelephony && (
          <Notice tone="warning" className="rounded-md p-5">
            IP-телефония, журнал звонков и AI-заявки доступны на тарифе с
            включенной опцией IP-телефония.
          </Notice>
        )}
        {canUseTelephony && !canUseAi && (
          <Notice tone="warning" className="mb-3 rounded-md p-5">
            AI-анализ звонков и распознавание записей доступны на тарифе с
            включенной опцией ИИ-возможности.
          </Notice>
        )}
        {canUseTelephony && isLoading && (
          <div className="py-6 text-gray-600">Загрузка...</div>
        )}
        {canUseTelephony && !isLoading && calls.length === 0 && (
          <div className="rounded-md border border-dashed border-gray-300 p-5 text-sm text-gray-600">
            Звонков пока нет. До подключения IP-телефонии можно добавить
            тестовый звонок вручную и проверить AI-черновик.
          </div>
        )}
        <div className="desktop:grid-cols-2 grid grid-cols-1 gap-3">
          {calls.map((call) => {
            const linkedClientId = normalizeId(call?.linkedClientId)
            const client = linkedClientId
              ? clientsById.get(linkedClientId)
              : null
            return (
              <CardWrapper
                key={call._id}
                outerClassName="p-0"
                onClick={() => openCallDetails(call, client)}
                className="card-body-pad flex min-h-[104px] cursor-pointer flex-col gap-2 p-3 pr-12 text-left hover:border-gray-300"
              >
                <CardActions>
                  <CardButtons
                    item={call}
                    typeOfItem="call"
                    minimalActions
                    alwaysCompact
                    showCloneButton={false}
                    showDeleteButton={false}
                    showHistoryButton={false}
                    showStatusButton={false}
                    onEdit={() => openCallEditor(call)}
                  />
                </CardActions>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="card-title flex items-center gap-2 text-base">
                      <FontAwesomeIcon icon={faPhone} className="h-4 w-4" />
                      <span className="truncate">
                        {call.phone || call.normalizedPhone || 'Без номера'}
                      </span>
                    </div>
                    <div className="card-muted mt-1 text-sm">
                      {DIRECTION_LABELS[call.direction] || 'Звонок'} ·{' '}
                      {formatDateTime(call.startedAt)}
                    </div>
                  </div>
                  <span className="status-chip status-chip--neutral shrink-0">
                    {STATUS_LABELS[call.status] || 'Новый'}
                  </span>
                </div>

                <div className="card-meta tablet:grid-cols-2 grid grid-cols-1 gap-1 text-sm">
                  <div>
                    <span className="card-muted">Клиент: </span>
                    {client ? (
                      <span className="card-title font-medium">
                        {getClientLabel(client)}
                      </span>
                    ) : call.linkedClientId ? (
                      <CallClientName
                        client={client}
                        linkedClientId={call.linkedClientId}
                      />
                    ) : (
                      'не связан'
                    )}
                  </div>
                  <div>
                    <span className="card-muted">Длительность: </span>
                    {Number(call.durationSec || 0)} сек
                  </div>
                </div>

                {call.aiSummary && (
                  <div className="card-meta line-clamp-2 text-sm leading-5">
                    {call.aiSummary}
                  </div>
                )}

                {call.processingError && (
                  <div className="text-sm text-red-600">
                    {call.processingError}
                  </div>
                )}
              </CardWrapper>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default CallsContent
