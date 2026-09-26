import CompactEventForm from '@components/CompactEventForm'
import { EVENT_STATUSES } from '@helpers/constants'
import DateTimePicker from '@components/DateTimePicker'
import AiFieldHighlight from '@components/AiFieldHighlight'
import ErrorsList from '@components/ErrorsList'
import FormWrapper from '@components/FormWrapper'
import IconCheckBox from '@components/IconCheckBox'
import AddIconButton from '@components/AddIconButton'
import IconActionButton from '@components/IconActionButton'
import Notice from '@components/Notice'
import Textarea from '@components/Textarea'
import { faCircleCheck, faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import ClientPicker from '@components/ClientPicker'
import ColleaguePicker from '@components/ColleaguePicker'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  DEFAULT_ADDRESS,
  DEFAULT_EVENT,
  TRANSACTION_CATEGORIES,
  TRANSACTION_TYPES,
} from '@helpers/constants'
import TabContext from '@components/Tabs/TabContext'
import TabPanel from '@components/Tabs/TabPanel'
import EventStatusPicker from '@components/ValuePicker/EventStatusPicker'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { postData } from '@helpers/CRUD'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import useErrors from '@helpers/useErrors'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import { modalsFuncAtom } from '@state/atoms'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import Input from '@components/Input'
import ComboBox from '@components/ComboBox'
import AddressPoolPicker from '@components/AddressPoolPicker'
import InputWrapper from '@components/InputWrapper'
import LabeledContainer from '@components/LabeledContainer'
import OtherContactsPicker from '@components/OtherContactsPicker'
import DocumentsEditor from '@components/DocumentsEditor'
import EventProposalsSection from '@components/EventProposalsSection'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import ServiceMultiSelect from '@components/ServiceMultiSelect'
import ActionIconButton from '@components/ActionIconButton'
import selectEventServicesFunc from './selectEventServicesFunc'
import serviceFunc from './serviceFunc'
import openEventAdditionalEventEditorModal from './eventAdditionalEventEditorModal'
import servicesAtom from '@state/atoms/servicesAtom'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  getEventCloseSuggestionState,
  shouldSuggestEventClosingOnDismiss,
} from '@helpers/eventCloseSuggestion'
import { shouldShowEventConflictWarning } from '@helpers/eventConflictWarning'
import { getEventTransactionAction } from '@helpers/eventTransactionAction'
import {
  useDeleteTransactionMutation,
  useTransactionsQuery,
} from '@helpers/useTransactionsQuery'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { useEventQuery, useEventsQuery } from '@helpers/useEventsQuery'
import {
  getCloseBlockedByObligationsMessage,
  getTransactionDateLabel,
  OBLIGATION_PAYMENT_METHOD,
} from '@helpers/transactionObligation'
import { normalizeDocumentTemplatesFromSettings } from '@helpers/documentTemplates'
import {
  mergeLegacyEventDocuments,
  normalizeEventDocuments,
} from '@helpers/eventDocuments'
import { shouldShowColleagueTransferControls } from '@helpers/firstRunWizard.mjs'
import { canUseProposalBuilder } from '@helpers/proposalAccess'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'

const normalizeAddressValue = (rawAddress) => {
  const normalized = { ...DEFAULT_ADDRESS }

  if (!rawAddress) return normalized

  if (typeof rawAddress === 'string') {
    return { ...normalized, comment: rawAddress }
  }

  if (typeof rawAddress !== 'object') return normalized

  Object.keys(DEFAULT_ADDRESS).forEach((key) => {
    if (
      key in rawAddress &&
      rawAddress[key] !== undefined &&
      rawAddress[key] !== null
    ) {
      normalized[key] = rawAddress[key]
    }
  })

  return normalized
}

const normalizeOtherContacts = (contacts) => {
  if (!Array.isArray(contacts)) return []
  return contacts
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      return {
        clientId: item.clientId ?? null,
        comment: typeof item.comment === 'string' ? item.comment : '',
      }
    })
    .filter(Boolean)
}

const normalizeAdditionalEvents = (items) => {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      return {
        title: typeof item.title === 'string' ? item.title : '',
        description:
          typeof item.description === 'string' ? item.description : '',
        date: item.date ?? null,
        done: Boolean(item.done),
        doneAt: item.doneAt ?? null,
        googleCalendarEventId:
          typeof item.googleCalendarEventId === 'string'
            ? item.googleCalendarEventId
            : '',
      }
    })
    .filter(Boolean)
}

const getSuggestedDecisionAdditionalEventDate = (eventDateValue) => {
  const now = new Date()
  const suggested = new Date(now)
  suggested.setDate(suggested.getDate() + 3)
  suggested.setSeconds(0, 0)

  if (!eventDateValue) return suggested.toISOString()
  const eventDate = new Date(eventDateValue)
  if (Number.isNaN(eventDate.getTime())) return suggested.toISOString()

  const latestAllowed = new Date(eventDate)
  latestAllowed.setDate(latestAllowed.getDate() - 1)
  latestAllowed.setSeconds(0, 0)

  return (
    suggested.getTime() > latestAllowed.getTime() ? latestAllowed : suggested
  ).toISOString()
}

const eventFunc = (
  eventId,
  clone = false,
  initialStatus = null,
  options = {}
) => {
  const initialTab = options?.initialTab || 'Общие'
  const EventModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnDeclineFunc,
    setOnCloseButtonFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
    setComponentInFooter,
    setConfirmButtonName,
    setTitle,
    setDeclineButtonShow,
    setCloseButtonShow,
  }) => {
    const { data: eventFromQuery } = useEventQuery(eventId)
    const event = eventId ? eventFromQuery : (options?.initialEvent ?? null)
    const hasInitialEvent = Boolean(options?.initialEvent)
    const itemsFunc = useAtomValue(itemsFuncAtom)
    const setEvent = itemsFunc?.event?.set
    const { data: clients = [] } = useClientsQuery()
    const loggedUser = useAtomValue(loggedUserAtom)
    const [validationAttempt, setValidationAttempt] = useState(0)
    const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
    const useCompactForm = siteSettings?.custom?.eventFormVariant !== 'classic'
    const workItemTerms = resolveWorkItemTerminology(siteSettings)
    const colleagues = useMemo(
      () => clients.filter((client) => client.clientType === 'colleague'),
      [clients]
    )
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const { data: transactions = [] } = useTransactionsQuery(undefined, {
      enabled: false,
    })
    const tariffs = useAtomValue(tariffsAtom)
    const services = useAtomValue(servicesAtom)
    const { data: eventsPayload } = useEventsQuery({
      scope: 'all',
      enabled: false,
    })
    const events = useMemo(
      () => eventsPayload?.data ?? [],
      [eventsPayload?.data]
    )
    const deleteTransactionMutation = useDeleteTransactionMutation()
    const closeModalRef = useRef(closeModal)
    const [aiHighlightedFields, setAiHighlightedFields] = useState(
      () =>
        new Set(
          !eventId && !clone && Array.isArray(options?.aiFilledFields)
            ? options.aiFilledFields
            : []
        )
    )
    const importAiMetadataLoadedRef = useRef(false)
    const hasAiHighlightedFields = aiHighlightedFields.size > 0
    const [aiWarnings, setAiWarnings] = useState(() =>
      !eventId && !clone && Array.isArray(options?.aiWarnings)
        ? options.aiWarnings.filter(
            (warning) => typeof warning === 'string' && warning.trim()
          )
        : []
    )
    useEffect(() => {
      if (
        importAiMetadataLoadedRef.current ||
        !eventId ||
        (!event?.importedFromCalendar && !event?.importedFromFile) ||
        (event?.importedFromFile
          ? event.fileImportChecked
          : event?.calendarImportChecked)
      ) {
        return
      }
      importAiMetadataLoadedRef.current = true
      const importedFields = event.importedFromFile
        ? event.fileImportAiFields
        : event.calendarImportAiFields
      const importedWarnings = event.importedFromFile
        ? event.fileImportWarnings
        : event.calendarImportWarnings
      if (Array.isArray(importedFields)) {
        setAiHighlightedFields(new Set(importedFields))
      }
      if (Array.isArray(importedWarnings)) {
        setAiWarnings(
          importedWarnings.filter(
            (warning) => typeof warning === 'string' && warning.trim()
          )
        )
      }
    }, [event])
    const isAiFieldHighlighted = useCallback(
      (field) => aiHighlightedFields.has(field),
      [aiHighlightedFields]
    )
    const clearAiFields = useCallback((...fields) => {
      setAiHighlightedFields((current) => {
        if (!fields.some((field) => current.has(field))) return current
        const next = new Set(current)
        fields.forEach((field) => next.delete(field))
        return next
      })
    }, [])

    const initialIsTransferred =
      event?.isTransferred ??
      (event?.colleagueId ? true : (DEFAULT_EVENT.isTransferred ?? false))

    const initialStatusValue = clone
      ? 'active'
      : (event?.status ?? initialStatus ?? DEFAULT_EVENT.status)
    const [status, setStatus] = useState(initialStatusValue)
    const [persistedEventId, setPersistedEventId] = useState(event?._id ?? null)
    const isDraft = status === 'draft'
    const showColleagueTransferControls =
      shouldShowColleagueTransferControls(siteSettings)

    const [clientId, setClientId] = useState(
      event?.clientId ?? DEFAULT_EVENT.clientId
    )
    const [eventDate, setEventDate] = useState(
      event?.eventDate ?? DEFAULT_EVENT.eventDate
    )
    const [dateEnd, setDateEnd] = useState(
      event?.dateEnd ?? DEFAULT_EVENT.dateEnd ?? null
    )
    const [dateEndTouched, setDateEndTouched] = useState(false)
    const [documents, setDocuments] = useState(() =>
      mergeLegacyEventDocuments(
        clone ? DEFAULT_EVENT : (event ?? DEFAULT_EVENT)
      )
    )
    const [address, setAddress] = useState(() => {
      const normalized = normalizeAddressValue(event?.address)

      if (!normalized.town && siteSettings?.defaultTown && !eventId) {
        normalized.town = siteSettings.defaultTown
      }
      return normalized
    })

    const [contractSum, setContractSum] = useState(
      event?.contractSum ?? DEFAULT_EVENT.contractSum ?? 0
    )
    const [waitDeposit, setWaitDeposit] = useState(
      clone ? false : (event?.waitDeposit ?? DEFAULT_EVENT.waitDeposit ?? false)
    )
    const [depositDueAt, setDepositDueAt] = useState(
      clone ? null : (event?.depositDueAt ?? DEFAULT_EVENT.depositDueAt ?? null)
    )
    const [depositExpectedAmount, setDepositExpectedAmount] = useState(
      clone
        ? null
        : (event?.depositExpectedAmount ??
            DEFAULT_EVENT.depositExpectedAmount ??
            null)
    )
    const [isByContract, setIsByContract] = useState(
      event?.isByContract ?? DEFAULT_EVENT.isByContract ?? false
    )
    const [isTransferred, setIsTransferred] = useState(initialIsTransferred)
    const [colleagueId, setColleagueId] = useState(
      event?.colleagueId ?? DEFAULT_EVENT.colleagueId ?? null
    )
    const [description, setDescription] = useState(
      event?.description ?? event?.comment ?? DEFAULT_EVENT.description ?? ''
    )
    const [eventType, setEventType] = useState(
      event?.eventType ?? DEFAULT_EVENT.eventType ?? ''
    )
    const [financeComment, setFinanceComment] = useState(
      event?.financeComment ?? DEFAULT_EVENT.financeComment ?? ''
    )
    const [requestCreatedAt, setRequestCreatedAt] = useState(() => {
      if (!eventId || clone) return new Date().toISOString()
      return (
        event?.requestCreatedAt ?? event?.createdAt ?? new Date().toISOString()
      )
    })
    const [additionalEvents, setAdditionalEvents] = useState(() =>
      clone
        ? []
        : normalizeAdditionalEvents(
            event?.additionalEvents ?? DEFAULT_EVENT.additionalEvents ?? []
          )
    )
    const [showDoneAdditionalEvents, setShowDoneAdditionalEvents] =
      useState(false)
    const [calendarImportChecked, setCalendarImportChecked] = useState(
      event?.calendarImportChecked ??
        (eventId ? (DEFAULT_EVENT.calendarImportChecked ?? false) : true)
    )
    const [fileImportChecked, setFileImportChecked] = useState(
      event?.fileImportChecked ?? false
    )
    const [servicesIds, setServicesIds] = useState(
      event?.servicesIds ?? DEFAULT_EVENT.servicesIds ?? []
    )
    const [otherContacts, setOtherContacts] = useState(
      event?.otherContacts ?? DEFAULT_EVENT.otherContacts ?? []
    )
    const googleCalendarResponse = event?.googleCalendarResponse ?? null
    const googleCalendarResponseText = useMemo(() => {
      if (!googleCalendarResponse) return ''
      if (typeof googleCalendarResponse === 'string')
        return googleCalendarResponse
      try {
        return JSON.stringify(googleCalendarResponse, null, 2)
      } catch {
        return String(googleCalendarResponse)
      }
    }, [googleCalendarResponse])

    const importedFromCalendar =
      event?.importedFromCalendar ?? DEFAULT_EVENT.importedFromCalendar

    const [errors, , addError, removeError, clearErrors] = useErrors()
    const addErrorRef = useRef(addError)
    const clearErrorsRef = useRef(clearErrors)

    useEffect(() => {
      addErrorRef.current = addError
      clearErrorsRef.current = clearErrors
      closeModalRef.current = closeModal
    }, [addError, clearErrors, closeModal])

    const initialEventValues = useMemo(() => {
      return {
        clientId: event?.clientId ?? DEFAULT_EVENT.clientId,
        eventDate: event?.eventDate ?? DEFAULT_EVENT.eventDate,
        address: (() => {
          const normalized = normalizeAddressValue(event?.address)
          if (
            !normalized.town &&
            siteSettings?.defaultTown &&
            !eventId &&
            !event?.address?.town
          ) {
            normalized.town = siteSettings.defaultTown
          }
          return normalized
        })(),
        contractSum: event?.contractSum ?? DEFAULT_EVENT.contractSum,
        waitDeposit: event?.waitDeposit ?? DEFAULT_EVENT.waitDeposit,
        depositDueAt: event?.depositDueAt ?? DEFAULT_EVENT.depositDueAt,
        depositExpectedAmount:
          event?.depositExpectedAmount ?? DEFAULT_EVENT.depositExpectedAmount,
        isByContract: event?.isByContract ?? DEFAULT_EVENT.isByContract,
        description:
          event?.description ?? event?.comment ?? DEFAULT_EVENT.description,
        eventType: event?.eventType ?? DEFAULT_EVENT.eventType,
        financeComment: event?.financeComment ?? DEFAULT_EVENT.financeComment,
        dateEnd: event?.dateEnd ?? DEFAULT_EVENT.dateEnd,
        documents: mergeLegacyEventDocuments(
          clone ? DEFAULT_EVENT : (event ?? DEFAULT_EVENT)
        ),
        calendarImportChecked:
          event?.calendarImportChecked ??
          (eventId ? DEFAULT_EVENT.calendarImportChecked : true),
        fileImportChecked: event?.fileImportChecked ?? false,
        servicesIds: event?.servicesIds ?? DEFAULT_EVENT.servicesIds ?? [],
        otherContacts: normalizeOtherContacts(
          event?.otherContacts ?? DEFAULT_EVENT.otherContacts ?? []
        ),
        colleagueId: event?.colleagueId ?? DEFAULT_EVENT.colleagueId,
        isTransferred: initialIsTransferred,
        status: initialStatusValue,
        requestCreatedAt:
          event?.requestCreatedAt ?? event?.createdAt ?? requestCreatedAt,
        additionalEvents: clone
          ? []
          : normalizeAdditionalEvents(
              event?.additionalEvents ?? DEFAULT_EVENT.additionalEvents ?? []
            ),
      }
    }, [
      event,
      initialIsTransferred,
      initialStatusValue,
      requestCreatedAt,
      siteSettings?.defaultTown,
    ])

    const initialAddressSignature = useMemo(
      () => JSON.stringify(initialEventValues.address ?? {}),
      [initialEventValues.address]
    )

    const addressSignature = useMemo(
      () => JSON.stringify(address ?? {}),
      [address]
    )

    const isFormChanged = useMemo(
      () =>
        (!eventId && hasInitialEvent) ||
        initialEventValues.clientId !== clientId ||
        initialEventValues.eventDate !== eventDate ||
        initialEventValues.dateEnd !== dateEnd ||
        initialAddressSignature !== addressSignature ||
        initialEventValues.contractSum !== contractSum ||
        initialEventValues.waitDeposit !== waitDeposit ||
        initialEventValues.depositDueAt !== depositDueAt ||
        initialEventValues.depositExpectedAmount !== depositExpectedAmount ||
        initialEventValues.isByContract !== isByContract ||
        initialEventValues.isTransferred !== isTransferred ||
        initialEventValues.colleagueId !== colleagueId ||
        initialEventValues.description !== description ||
        initialEventValues.eventType !== eventType ||
        initialEventValues.financeComment !== financeComment ||
        initialEventValues.status !== status ||
        initialEventValues.requestCreatedAt !== requestCreatedAt ||
        JSON.stringify(initialEventValues.additionalEvents ?? []) !==
          JSON.stringify(additionalEvents) ||
        JSON.stringify(initialEventValues.documents ?? []) !==
          JSON.stringify(documents) ||
        initialEventValues.calendarImportChecked !== calendarImportChecked ||
        initialEventValues.fileImportChecked !== fileImportChecked ||
        JSON.stringify(initialEventValues.servicesIds ?? []) !==
          JSON.stringify(servicesIds) ||
        JSON.stringify(initialEventValues.otherContacts ?? []) !==
          JSON.stringify(otherContacts),
      [
        clientId,
        eventDate,
        dateEnd,
        initialAddressSignature,
        addressSignature,
        contractSum,
        waitDeposit,
        depositDueAt,
        depositExpectedAmount,
        isByContract,
        isTransferred,
        colleagueId,
        description,
        eventType,
        financeComment,
        documents,
        calendarImportChecked,
        fileImportChecked,
        servicesIds,
        otherContacts,
        initialEventValues,
        status,
        requestCreatedAt,
        additionalEvents,
        hasInitialEvent,
      ]
    )

    useEffect(() => {
      setAddress(initialEventValues.address)
    }, [initialEventValues.address])

    useEffect(() => {
      if (clone) return
      if (!event?._id) return
      setPersistedEventId(event._id)
    }, [event?._id])

    const sourceEventId = clone
      ? null
      : (persistedEventId ?? event?._id ?? null)

    useEffect(() => {
      const editing = !clone && Boolean(sourceEventId)
      setTitle?.(
        editing
          ? `Редактирование ${workItemTerms.genitive}`
          : useCompactForm
            ? isDraft
              ? workItemTerms.newLabel
              : `Создание ${workItemTerms.genitive}`
            : 'Создание рабочей карточки'
      )
      setConfirmButtonName?.(
        editing
          ? 'Применить'
          : useCompactForm && isDraft
            ? 'Создать заявку'
            : 'Создать'
      )
      setDeclineButtonShow?.(!useCompactForm)
      setCloseButtonShow?.(!useCompactForm)
    }, [
      setConfirmButtonName,
      setTitle,
      setDeclineButtonShow,
      setCloseButtonShow,
      sourceEventId,
      workItemTerms.genitive,
      workItemTerms.newLabel,
      useCompactForm,
      isDraft,
    ])

    const eventTransactions = useMemo(
      () =>
        (transactions ?? [])
          .filter((transaction) => transaction.eventId === sourceEventId)
          .sort(
            (a, b) =>
              new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
          ),
      [sourceEventId, transactions]
    )

    const incomeTransactions = useMemo(
      () => eventTransactions.filter((item) => item.type === 'income'),
      [eventTransactions]
    )
    const expenseTransactions = useMemo(
      () => eventTransactions.filter((item) => item.type === 'expense'),
      [eventTransactions]
    )
    const hasDepositTransaction = useMemo(
      () =>
        incomeTransactions.some(
          (item) =>
            ['deposit', 'advance'].includes(String(item?.category ?? '')) &&
            Number(item?.amount ?? 0) > 0
        ),
      [incomeTransactions]
    )
    const closeState = useMemo(
      () =>
        getEventCloseSuggestionState(
          {
            status,
            contractSum,
            isByContract,
            eventDate,
            dateEnd,
          },
          eventTransactions
        ),
      [contractSum, dateEnd, eventDate, eventTransactions, isByContract, status]
    )
    const canClose = closeState.canClose
    const isEventFinished = closeState.isEventFinished
    const canSetClosedStatus = !isDraft && isEventFinished && canClose
    const isClosed = status === 'closed'
    const formLockedClassName = isClosed ? 'pointer-events-none opacity-65' : ''
    const closeStatusDisabledReason = !isEventFinished
      ? 'Закрыть можно только после завершения мероприятия'
      : closeState.hasObligations
        ? getCloseBlockedByObligationsMessage()
        : !canClose
          ? 'Закрыть можно только после всех поступлений и обязательных налогов'
          : ''

    const missingFields = useMemo(() => {
      const fields = []
      if (!clientId) fields.push('Клиент')
      if (!(useCompactForm && isDraft) && !eventDate) fields.push('Дата начала')
      if (showColleagueTransferControls && isTransferred && !colleagueId) {
        fields.push('Коллега')
      }
      return fields
    }, [
      useCompactForm,
      isDraft,
      clientId,
      eventDate,
      isTransferred,
      colleagueId,
      showColleagueTransferControls,
    ])
    const requiredMissing = missingFields.length > 0

    const dateRangeError = useMemo(() => {
      if (!eventDate || !dateEnd) return ''
      const startDate = new Date(eventDate)
      const endDate = new Date(dateEnd)
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
        return ''
      return startDate.getTime() > endDate.getTime()
        ? 'Дата начала не может быть позже даты завершения'
        : ''
    }, [eventDate, dateEnd])

    // UX-13: счётчики незаполненных/ошибочных полей по вкладкам формы
    const tabErrorCounts = useMemo(() => {
      const generalCount =
        (eventDate ? 0 : 1) +
        (showColleagueTransferControls && isTransferred && !colleagueId
          ? 1
          : 0) +
        (dateRangeError ? 1 : 0)
      const clientCount = clientId ? 0 : 1
      return { general: generalCount, client: clientCount }
    }, [
      clientId,
      colleagueId,
      dateRangeError,
      eventDate,
      isTransferred,
      showColleagueTransferControls,
    ])

    const defaultDurationMinutes = useMemo(() => {
      const minutes = Number(
        siteSettings?.custom?.defaultEventDurationMinutes ?? 60
      )
      return Number.isFinite(minutes) && minutes > 0 ? minutes : 60
    }, [siteSettings?.custom?.defaultEventDurationMinutes])
    const tariffAccess = useMemo(
      () => getUserTariffAccess(loggedUser, tariffs),
      [loggedUser, tariffs]
    )
    const canUseDocuments = Boolean(tariffAccess?.allowDocuments)
    const canUseProposals = canUseProposalBuilder(loggedUser)
    const [agreedProposal, setAgreedProposal] = useState(
      event?.agreedProposal || null
    )
    const handleProposalApplied = useCallback(
      ({
        contractSum: appliedContractSum,
        servicesIds: appliedServicesIds,
        agreedProposal: appliedProposal,
      }) => {
        setContractSum(appliedContractSum)
        setServicesIds(appliedServicesIds)
        setAgreedProposal(appliedProposal)
      },
      []
    )

    const getTransactionsForEvent = useCallback(
      (targetEventId) =>
        (transactions ?? []).filter(
          (transaction) =>
            String(transaction?.eventId) === String(targetEventId)
        ),
      [transactions]
    )

    const shouldSuggestClosingAfterSave = useCallback(
      (savedEvent) => {
        if (!savedEvent?._id) return false
        const savedEventTransactions = getTransactionsForEvent(savedEvent._id)
        return getEventCloseSuggestionState(
          {
            status: savedEvent?.status,
            contractSum: savedEvent?.contractSum,
            isByContract: savedEvent?.isByContract,
            eventDate: savedEvent?.eventDate,
            dateEnd: savedEvent?.dateEnd,
          },
          savedEventTransactions
        ).shouldSuggestClosing
      },
      [getTransactionsForEvent]
    )

    const getPersistedEventForCloseSuggestion = useCallback(() => {
      if (!sourceEventId) return null
      return (
        (events ?? []).find(
          (item) => String(item?._id) === String(sourceEventId)
        ) ??
        event ??
        null
      )
    }, [event, events, sourceEventId])

    const shouldSuggestClosingOnDismiss = useCallback(() => {
      const persistedEvent = getPersistedEventForCloseSuggestion()
      if (!persistedEvent?._id) return false

      return shouldSuggestEventClosingOnDismiss(
        persistedEvent,
        getTransactionsForEvent(persistedEvent._id),
        new Date(),
        { clone }
      )
    }, [getPersistedEventForCloseSuggestion, getTransactionsForEvent])

    const buildEventSaveContext = useCallback(() => {
      const normalizedContractSum =
        typeof contractSum === 'number' && !Number.isNaN(contractSum)
          ? contractSum
          : 0
      // При сохранении сервер повторно проверяет принадлежность storageKey.
      const normalizedDocuments = normalizeEventDocuments(documents, {
        trustStorageKey: true,
      })
      const normalizedOtherContacts = normalizeOtherContacts(otherContacts)
        .map((item) => ({
          clientId: item.clientId ?? null,
          comment: item.comment?.trim() ?? '',
        }))
        .filter((item) => item.clientId)
      const normalizedAdditionalEvents = normalizeAdditionalEvents(
        additionalEvents
      )
        .map((item) => ({
          title: item.title?.trim() ?? '',
          description: item.description?.trim() ?? '',
          date: item.date ?? null,
          done: Boolean(item.done),
          doneAt: item.done ? (item.doneAt ?? new Date().toISOString()) : null,
          googleCalendarEventId: item.googleCalendarEventId?.trim() ?? '',
        }))
        .filter((item) => item.title || item.description || item.date)
      const effectiveIsTransferred = showColleagueTransferControls
        ? isTransferred
        : Boolean(initialEventValues.isTransferred)
      const effectiveColleagueId = showColleagueTransferControls
        ? isTransferred
          ? colleagueId
          : null
        : (initialEventValues.colleagueId ?? null)

      const payload = {
        _id: sourceEventId ?? null,
        clientId,
        status,
        requestCreatedAt: requestCreatedAt ?? new Date().toISOString(),
        additionalEvents: normalizedAdditionalEvents,
        isTransferred: effectiveIsTransferred,
        colleagueId: effectiveIsTransferred ? effectiveColleagueId : null,
        eventDate,
        dateEnd,
        address: normalizeAddressValue(address),
        contractSum: normalizedContractSum,
        waitDeposit: hasDepositTransaction ? false : Boolean(waitDeposit),
        depositDueAt:
          hasDepositTransaction || !waitDeposit ? null : depositDueAt,
        depositExpectedAmount:
          hasDepositTransaction || !waitDeposit
            ? null
            : (depositExpectedAmount ?? null),
        isByContract,
        description: description?.trim() ?? '',
        eventType: eventType?.trim() ?? '',
        financeComment: financeComment?.trim() ?? '',
        calendarImportChecked,
        servicesIds,
        otherContacts: normalizedOtherContacts,
        ...(event?.importedFromFile && !clone ? { fileImportChecked } : {}),
      }

      if (canUseDocuments) {
        payload.documents = normalizedDocuments
      }

      return {
        payload,
        isCreatingDraftRequest:
          !payload?._id && !clone && payload.status === 'draft',
        hasAdditionalEvents: (payload?.additionalEvents?.length ?? 0) > 0,
      }
    }, [
      additionalEvents,
      address,
      calendarImportChecked,
      canUseDocuments,
      fileImportChecked,
      event?.importedFromFile,
      clientId,
      colleagueId,
      contractSum,
      dateEnd,
      depositDueAt,
      depositExpectedAmount,
      description,
      documents,
      eventDate,
      eventType,
      financeComment,
      hasDepositTransaction,
      initialEventValues,
      isByContract,
      isTransferred,
      otherContacts,
      requestCreatedAt,
      servicesIds,
      showColleagueTransferControls,
      sourceEventId,
      status,
      waitDeposit,
    ])

    const currentSavePayloadKey = useMemo(
      () => JSON.stringify(buildEventSaveContext().payload),
      [buildEventSaveContext]
    )
    const [lastSavedPayloadKey, setLastSavedPayloadKey] = useState(null)

    useEffect(() => {
      if (lastSavedPayloadKey !== null) return
      if (!sourceEventId) return
      setLastSavedPayloadKey(currentSavePayloadKey)
    }, [currentSavePayloadKey, lastSavedPayloadKey, sourceEventId])

    const saveEvent = useCallback(
      async (statusOverride = null) => {
        const { payload, isCreatingDraftRequest, hasAdditionalEvents } =
          buildEventSaveContext()
        const savePayload = statusOverride
          ? { ...payload, status: statusOverride }
          : payload
        const savedEvent = await setEvent(savePayload, clone)
        const nextEventId = savedEvent?._id ?? payload?._id ?? null
        if (!nextEventId) {
          throw new Error(`Не удалось создать ${workItemTerms.accusative}`)
        }
        setAiHighlightedFields(new Set())
        if (nextEventId) {
          setPersistedEventId(nextEventId)
        }
        setLastSavedPayloadKey(
          JSON.stringify(
            savePayload?._id || !nextEventId
              ? savePayload
              : { ...savePayload, _id: nextEventId }
          )
        )
        if (statusOverride) setStatus(statusOverride)
        if (typeof options?.onSaved === 'function') {
          await options.onSaved(savedEvent)
        }

        return {
          savedEvent,
          payload: savePayload,
          isCreatingDraftRequest: statusOverride
            ? false
            : isCreatingDraftRequest,
          hasAdditionalEvents,
        }
      },
      [buildEventSaveContext, setEvent, workItemTerms.accusative]
    )

    const openAdditionalEventModal = useCallback(
      (index = null, options = {}) => {
        const sourceItem = options?.sourceItem
          ? { ...options.sourceItem }
          : index !== null
            ? additionalEvents[index]
            : {
                title: '',
                description: '',
                date: new Date().toISOString(),
                done: false,
                googleCalendarEventId: '',
              }
        openEventAdditionalEventEditorModal({
          modalsFunc,
          index,
          sourceItem,
          title: options?.title,
          confirmButtonName: options?.confirmButtonName ?? 'Сохранить',
          declineButtonName: options?.declineButtonName ?? 'Отмена',
          introText: options?.introText,
          onConfirm: async (nextItem) => {
            if (typeof options?.onConfirm === 'function') {
              await options.onConfirm(nextItem)
              return
            }
            if (index !== null) {
              setAdditionalEvents((prev) =>
                prev.map((item, idx) =>
                  idx === index ? { ...item, ...nextItem } : item
                )
              )
              return
            }
            setAdditionalEvents((prev) => [...prev, nextItem])
          },
        })
      },
      [additionalEvents, modalsFunc]
    )

    const openCloseSuggestionModal = useCallback(
      (targetEventId) => {
        if (!targetEventId) return false

        modalsFunc.add({
          title: `Закрыть ${workItemTerms.accusative}?`,
          text: `${workItemTerms.labelCapitalized} полностью оплачено и завершено. Возможно, стоит закрыть ${workItemTerms.accusative}?`,
          confirmButtonName: `Закрыть ${workItemTerms.accusative}`,
          confirmButtonPendingName: `Закрываем ${workItemTerms.accusative}...`,
          declineButtonName: 'Оставить открытым',
          showDecline: true,
          waitForConfirm: true,
          onConfirm: async () => {
            await setEvent({ _id: targetEventId, status: 'closed' }, false)
            closeModalRef.current()
          },
          onDecline: () => {
            closeModalRef.current()
          },
        })

        return true
      },
      [
        modalsFunc,
        setEvent,
        workItemTerms.accusative,
        workItemTerms.labelCapitalized,
      ]
    )

    const handleSaveSuccess = useCallback(
      async ({
        savedEvent,
        payload,
        isCreatingDraftRequest,
        hasAdditionalEvents,
      }) => {
        const isDraftFollowUpPromptNeeded =
          isCreatingDraftRequest && !hasAdditionalEvents && savedEvent?._id

        if (isDraftFollowUpPromptNeeded) {
          const suggestedDate = getSuggestedDecisionAdditionalEventDate(
            savedEvent?.eventDate ?? payload?.eventDate
          )
          const suggestedLabel = new Date(suggestedDate).toLocaleString(
            'ru-RU',
            {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }
          )
          openAdditionalEventModal(null, {
            title: 'Добавить задачу',
            introText: `Рекомендуется добавить напоминание "Что решили клиенты" на ${suggestedLabel}. Вы можете изменить детали ниже.`,
            sourceItem: {
              title: 'Что решили клиенты',
              description: '',
              date: suggestedDate,
              done: false,
              googleCalendarEventId: '',
            },
            confirmButtonName: 'Добавить',
            declineButtonName: 'Позже',
            onConfirm: async (nextItem) => {
              const currentEvent = (events ?? []).find(
                (item) => String(item?._id) === String(savedEvent._id)
              )
              const currentAdditionalEvents = Array.isArray(
                currentEvent?.additionalEvents
              )
                ? currentEvent.additionalEvents
                : Array.isArray(savedEvent?.additionalEvents)
                  ? savedEvent.additionalEvents
                  : []

              await setEvent(
                {
                  _id: savedEvent._id,
                  additionalEvents: [...currentAdditionalEvents, nextItem],
                },
                false,
                true
              )
            },
          })
          closeModalRef.current()
          return
        }

        if (shouldSuggestClosingAfterSave(savedEvent)) {
          openCloseSuggestionModal(savedEvent._id)
          return
        }

        if (
          !isCreatingDraftRequest ||
          hasAdditionalEvents ||
          !savedEvent?._id
        ) {
          closeModalRef.current()
        }
      },
      [
        events,
        openCloseSuggestionModal,
        openAdditionalEventModal,
        setEvent,
        shouldSuggestClosingAfterSave,
      ]
    )

    const validateEventForm = useCallback(
      (targetStatus = status) => {
        setValidationAttempt((value) => value + 1)
        clearErrorsRef.current()
        let hasError = false

        if (!clientId) {
          addErrorRef.current({ clientId: 'Выберите клиента' })
          hasError = true
        }
        if (!(useCompactForm && targetStatus === 'draft') && !eventDate) {
          addErrorRef.current({
            eventDate: `Укажите дату ${workItemTerms.genitive}`,
          })
          hasError = true
        }
        if (showColleagueTransferControls && isTransferred && !colleagueId) {
          addErrorRef.current({ colleagueId: 'Выберите коллегу' })
          hasError = true
        }
        if (dateRangeError) {
          addErrorRef.current({ dateEnd: dateRangeError })
          hasError = true
        }

        return !hasError
      },
      [
        useCompactForm,
        status,
        clientId,
        colleagueId,
        dateRangeError,
        eventDate,
        isTransferred,
        showColleagueTransferControls,
        workItemTerms.genitive,
      ]
    )

    const addMinutesToDate = (value, minutes) => {
      if (!value) return null
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return null
      date.setMinutes(date.getMinutes() + minutes)
      return date.toISOString()
    }

    const shiftEndByStartChange = (
      prevStartValue,
      nextStartValue,
      endValue
    ) => {
      if (!prevStartValue || !nextStartValue || !endValue) return null
      const prevStart = new Date(prevStartValue)
      const nextStart = new Date(nextStartValue)
      const prevEnd = new Date(endValue)
      if (
        Number.isNaN(prevStart.getTime()) ||
        Number.isNaN(nextStart.getTime()) ||
        Number.isNaN(prevEnd.getTime())
      ) {
        return null
      }

      const durationMs = prevEnd.getTime() - prevStart.getTime()
      if (durationMs <= 0) {
        return new Date(
          nextStart.getTime() + defaultDurationMinutes * 60 * 1000
        ).toISOString()
      }

      return new Date(nextStart.getTime() + durationMs).toISOString()
    }

    useEffect(() => {
      if (dateEndTouched) return
      if (!eventDate) return
      if (!dateEnd) {
        setDateEnd(addMinutesToDate(eventDate, defaultDurationMinutes))
      }
    }, [dateEnd, dateEndTouched, defaultDurationMinutes, eventDate])

    const buildRange = useCallback(
      (startValue, endValue) => {
        if (!startValue) return null
        const start = new Date(startValue)
        if (Number.isNaN(start.getTime())) return null
        let end = endValue ? new Date(endValue) : null
        if (!end || Number.isNaN(end.getTime()) || end <= start) {
          end = new Date(start.getTime() + defaultDurationMinutes * 60 * 1000)
        }
        return { start, end }
      },
      [defaultDurationMinutes]
    )

    const getConflictsCount = useCallback(() => {
      const targetRange = buildRange(eventDate, dateEnd)
      if (!targetRange) return 0
      let count = 0

      ;(events ?? []).forEach((item) => {
        if (!item) return
        if (eventId && String(item._id) === String(eventId)) return
        if (item.status === 'canceled') return
        const range = buildRange(item.eventDate, item.dateEnd)
        if (!range) return
        const overlaps =
          targetRange.start < range.end && range.start < targetRange.end
        if (overlaps) count += 1
      })

      return count
    }, [buildRange, dateEnd, eventDate, events])
    const onClickConfirm = () => {
      const proceedSave = async () => {
        const saveResult = await saveEvent()
        await handleSaveSuccess(saveResult)
      }

      if (validateEventForm()) {
        const conflictsCount = getConflictsCount()
        const shouldShowConflictWarning = shouldShowEventConflictWarning({
          eventId,
          initialEventDate: initialEventValues.eventDate,
          initialDateEnd: initialEventValues.dateEnd,
          eventDate,
          dateEnd,
          conflictsCount,
        })

        if (shouldShowConflictWarning) {
          modalsFunc.add({
            title: 'Пересечение по времени',
            text: `Внимание! В выбранном периоде есть ${workItemTerms.plural} (${conflictsCount}). Все равно сохранить?`,
            confirmButtonName: 'Все равно сохранить',
            declineButtonName: 'Вернуться',
            showDecline: true,
            onConfirm: proceedSave,
          })
          return
        }
        return proceedSave()
      }
    }

    const onClickConfirmRef = useRef(onClickConfirm)
    onClickConfirmRef.current = onClickConfirm

    const handleDismissRequest = useCallback(() => {
      if (shouldSuggestClosingOnDismiss()) {
        const persistedEvent = getPersistedEventForCloseSuggestion()
        if (openCloseSuggestionModal(persistedEvent?._id)) return
      }

      closeModalRef.current()
    }, [
      getPersistedEventForCloseSuggestion,
      openCloseSuggestionModal,
      shouldSuggestClosingOnDismiss,
    ])

    const handleDismissRequestRef = useRef(handleDismissRequest)
    handleDismissRequestRef.current = handleDismissRequest

    useEffect(() => {
      setOnShowOnCloseConfirmDialog(isFormChanged)
      setDisableConfirm(false)
      setOnConfirmFunc(
        isFormChanged || useCompactForm
          ? () => onClickConfirmRef.current()
          : null
      )
      setOnDeclineFunc(
        isFormChanged ? () => handleDismissRequestRef.current() : null
      )
      if (setOnCloseButtonFunc) {
        setOnCloseButtonFunc(
          isFormChanged ? null : () => handleDismissRequestRef.current()
        )
      }
    }, [
      isFormChanged,
      useCompactForm,
      setDisableConfirm,
      setOnConfirmFunc,
      setOnCloseButtonFunc,
      setOnDeclineFunc,
      setOnShowOnCloseConfirmDialog,
    ])

    useEffect(() => {
      if (!setComponentInFooter) return
      if (
        (useCompactForm && !validationAttempt) ||
        (!requiredMissing && !dateRangeError)
      ) {
        setComponentInFooter(null)
        return
      }
      setComponentInFooter(
        <div className="flex flex-col gap-1 text-sm text-red-600">
          {requiredMissing && (
            <div>Заполните поля: {missingFields.join(', ')}</div>
          )}
          {dateRangeError && <div>{dateRangeError}</div>}
        </div>
      )
    }, [
      dateRangeError,
      missingFields,
      requiredMissing,
      setComponentInFooter,
      useCompactForm,
      validationAttempt,
    ])

    const selectedClient = useMemo(() => {
      if (!clientId) return null
      const clientFromList = clients.find(
        (client) => String(client._id) === String(clientId)
      )
      if (clientFromList) return clientFromList
      return String(options?.initialClient?._id) === String(clientId)
        ? options.initialClient
        : null
    }, [clientId, clients])
    const selectedServiceTitles = useMemo(
      () =>
        (services ?? [])
          .filter((item) => (servicesIds ?? []).includes(item._id))
          .map((item) => item?.title)
          .filter(Boolean),
      [services, servicesIds]
    )
    const hasDoneAdditionalEvents = useMemo(
      () => (additionalEvents ?? []).some((item) => Boolean(item?.done)),
      [additionalEvents]
    )
    const filteredAdditionalEvents = useMemo(
      () =>
        (additionalEvents ?? [])
          .map((item, index) => ({ item, index }))
          .filter(({ item }) =>
            showDoneAdditionalEvents ? true : !Boolean(item?.done)
          ),
      [additionalEvents, showDoneAdditionalEvents]
    )
    const documentTemplates = useMemo(
      () => normalizeDocumentTemplatesFromSettings(siteSettings?.custom ?? {}),
      [siteSettings?.custom]
    )
    const eventTypeOptions = useMemo(() => {
      const rawEventTypes = Array.isArray(siteSettings?.custom?.eventTypes)
        ? siteSettings.custom.eventTypes
        : []
      const eventTypesSet = new Set(
        rawEventTypes
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      )
      if (eventType && typeof eventType === 'string')
        eventTypesSet.add(eventType.trim())
      return Array.from(eventTypesSet).sort((a, b) => a.localeCompare(b, 'ru'))
    }, [eventType, siteSettings?.custom?.eventTypes])

    const townOptions = useMemo(() => {
      const townsSet = new Set(
        (siteSettings?.towns ?? [])
          .map((town) => (typeof town === 'string' ? town.trim() : ''))
          .filter(Boolean)
      )
      if (address?.town && typeof address.town === 'string')
        townsSet.add(address.town.trim())

      return Array.from(townsSet).sort((a, b) => a.localeCompare(b, 'ru'))
    }, [address?.town, siteSettings?.towns])

    const handleCreateTown = async (town) => {
      const normalizedTown = typeof town === 'string' ? town.trim() : ''
      if (!normalizedTown) return
      const nextTowns = Array.from(
        new Set([...(siteSettings?.towns ?? []), normalizedTown])
      )
      await postData(
        '/api/site',
        { towns: nextTowns },
        (data) => setSiteSettings(data),
        null,
        false,
        loggedUser?._id
      )
    }

    const handleCreateEventType = async () => {
      const rawEventType = window.prompt('Новый тип события')
      const normalizedEventType =
        typeof rawEventType === 'string' ? rawEventType.trim() : ''
      if (!normalizedEventType) return
      clearAiFields('eventType')
      setEventType(normalizedEventType)
      const currentEventTypes = Array.isArray(siteSettings?.custom?.eventTypes)
        ? siteSettings.custom.eventTypes
        : []
      const nextEventTypes = Array.from(
        new Set([...currentEventTypes, normalizedEventType])
      )
      await postData(
        '/api/site',
        {
          custom: {
            ...(siteSettings?.custom ?? {}),
            eventTypes: nextEventTypes,
          },
        },
        (data) => setSiteSettings(data),
        null,
        false,
        loggedUser?._id
      )
    }

    const [financeError, setFinanceError] = useState('')
    const [financeLoading, setFinanceLoading] = useState(false)

    const handleDeleteTransaction = async (id) => {
      if (!id) return
      modalsFunc.confirm({
        title: 'Удаление транзакции',
        text: 'Вы уверены, что хотите удалить транзакцию?',
        onConfirm: async () => {
          setFinanceError('')
          setFinanceLoading(true)
          try {
            await deleteTransactionMutation.mutateAsync(id)
          } catch {
            setFinanceError('Не удалось удалить транзакцию')
          }
          setFinanceLoading(false)
        },
      })
    }

    const openClientSelectModal = () => {
      modalsFunc.client?.select((newClientId) => {
        clearAiFields('clientId')
        setClientId(newClientId)
      })
    }

    const openServiceCreateModal = () => {
      modalsFunc.add(
        serviceFunc(null, true, (createdService) => {
          if (!createdService?._id) return
          clearAiFields('servicesIds')
          setServicesIds((prev) =>
            prev.includes(createdService._id)
              ? prev
              : [...prev, createdService._id]
          )
          removeError('servicesIds')
        })
      )
    }

    const openServiceEditModal = (serviceId) => {
      if (!serviceId) return
      modalsFunc.add(serviceFunc(serviceId))
    }

    const selectedColleague = useMemo(
      () =>
        colleagueId && colleagues.length
          ? colleagues.find((colleague) => colleague._id === colleagueId)
          : null,
      [colleagueId, colleagues]
    )

    const openColleagueSelectModal = () => {
      modalsFunc.client?.select(
        (newColleagueId) => {
          setColleagueId(newColleagueId)
        },
        'Выбор коллеги',
        { clientTypes: ['colleague'] }
      )
    }

    const handleOtherContactSelect = (index) => {
      modalsFunc.client?.select((newClientId) => {
        setOtherContacts((prev) =>
          prev.map((item, idx) =>
            idx === index ? { ...item, clientId: newClientId } : item
          )
        )
      })
    }

    const handleOtherContactCommentChange = (index, value) => {
      setOtherContacts((prev) =>
        prev.map((item, idx) =>
          idx === index ? { ...item, comment: value } : item
        )
      )
    }

    const handleOtherContactRemove = (index) => {
      setOtherContacts((prev) => prev.filter((_, idx) => idx !== index))
    }

    const handleOtherContactAdd = () => {
      modalsFunc.client?.select((newClientId) => {
        if (!newClientId) return
        setOtherContacts((prev) => [
          ...prev,
          { clientId: newClientId, comment: '' },
        ])
      })
    }

    const handleAdditionalEventRemove = (index) => {
      setAdditionalEvents((prev) => prev.filter((_, idx) => idx !== index))
    }

    const handleAdditionalEventAdd = () => {
      openAdditionalEventModal(null)
    }

    const handleAdditionalEventEdit = (index) => {
      openAdditionalEventModal(index)
    }

    const handleAdditionalEventToggleDone = (index) => {
      setAdditionalEvents((prev) =>
        prev.map((item, idx) =>
          idx === index
            ? {
                ...item,
                done: !item?.done,
                doneAt: !item?.done ? new Date().toISOString() : null,
              }
            : item
        )
      )
    }

    const performTransactionAction = async (
      transactionAction,
      transactionId
    ) => {
      try {
        setFinanceError('')

        let targetEventId = transactionAction.eventId ?? sourceEventId
        let targetContractSum = contractSum

        if (transactionAction.type === 'autosave') {
          setFinanceLoading(true)
          const { savedEvent } = await saveEvent(
            transactionAction.promoteDraft ? 'active' : null
          )
          targetEventId = savedEvent?._id ?? targetEventId
          targetContractSum = savedEvent?.contractSum ?? targetContractSum
        }

        if (!targetEventId) {
          setFinanceError(`Сначала сохраните ${workItemTerms.accusative}`)
          return
        }

        if (transactionId)
          modalsFunc.transaction?.edit(targetEventId, transactionId, {
            contractSum: targetContractSum,
          })
        else {
          const initialValues =
            waitDeposit && !hasDepositTransaction
              ? {
                  type: 'income',
                  category: 'deposit',
                  amount: depositExpectedAmount ?? '',
                }
              : undefined
          modalsFunc.transaction?.add(targetEventId, {
            contractSum: targetContractSum,
            initialValues,
          })
        }
      } catch (error) {
        setFinanceError(
          error?.message ||
            `Не удалось сохранить ${workItemTerms.accusative} перед добавлением транзакции`
        )
      } finally {
        setFinanceLoading(false)
      }
    }

    const openTransactionModal = (transactionId) => {
      const requiresAutosaveForTransactions =
        !sourceEventId || lastSavedPayloadKey !== currentSavePayloadKey
      const transactionAction = getEventTransactionAction({
        clone,
        status,
        sourceEventId,
        isFormChanged: requiresAutosaveForTransactions,
      })

      if (transactionAction.type === 'blocked') {
        setFinanceError(transactionAction.error)
        return
      }

      const confirmTransactionAction = () => {
        if (
          transactionAction.type === 'autosave' &&
          !validateEventForm(transactionAction.promoteDraft ? 'active' : status)
        ) {
          setFinanceError(
            `Заполните обязательные поля ${workItemTerms.genitive} перед добавлением транзакции`
          )
          return
        }
        return performTransactionAction(transactionAction, transactionId)
      }

      if (transactionAction.promoteDraft) {
        modalsFunc.add({
          title: 'Добавить транзакцию к заявке?',
          text: `Чтобы добавить транзакцию, статус ${workItemTerms.genitive} будет изменён на «Подтверждено» перед открытием формы.${sourceEventId ? '' : ' Карточка будет сохранена.'} Продолжить?`,
          confirmButtonName: 'Подтвердить и добавить',
          closeButtonName: 'Отмена',
          waitForConfirm: true,
          onConfirm: confirmTransactionAction,
        })
        return
      }

      if (transactionAction.type === 'autosave' && !validateEventForm()) {
        setFinanceError(
          `Заполните обязательные поля ${workItemTerms.genitive} перед добавлением транзакции`
        )
        return
      }

      if (transactionAction.type === 'autosave' && !sourceEventId) {
        modalsFunc.add({
          title: `Создать ${workItemTerms.accusative} для транзакции?`,
          text: `Чтобы привязать транзакцию, будет создана карточка ${workItemTerms.genitive}. После закрытия транзакции вы вернётесь к её редактированию.`,
          confirmButtonName: 'Создать и продолжить',
          closeButtonName: 'Отмена',
          waitForConfirm: true,
          onConfirm: confirmTransactionAction,
        })
        return
      }

      confirmTransactionAction()
    }

    const openServicesSelection = () =>
      modalsFunc.add(
        selectEventServicesFunc(servicesIds, (ids) => {
          clearAiFields('servicesIds')
          setServicesIds(ids)
          removeError('servicesIds')
        })
      )

    const fields = {
      hints: (
        <>
          {hasAiHighlightedFields ? (
            <div className="ai-filled-hint mb-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
              Поля с фиолетовой подсветкой заполнены ИИ. Проверьте их —
              подсветка отдельного поля исчезнет после вашего изменения.
            </div>
          ) : null}
          {(!calendarImportChecked ||
            (event?.importedFromFile && !fileImportChecked)) &&
          aiWarnings.length > 0 ? (
            <Notice tone="warning" className="ai-draft-warning mb-3">
              <div className="font-medium">
                ИИ не смог определить всё однозначно:
              </div>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {aiWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </>
      ),
      status: (
        <>
          <div className="event-status-picker">
            <EventStatusPicker
              status={status}
              onChange={setStatus}
              label={useCompactForm ? '' : 'Статус мероприятия'}
              disabledValues={canSetClosedStatus || isClosed ? [] : ['closed']}
              disabledReasons={{ closed: closeStatusDisabledReason }}
            />
            {status !== 'closed' &&
            !canSetClosedStatus &&
            (!useCompactForm || sourceEventId) ? (
              <Notice tone="warning" className="mt-2 text-xs">
                {closeStatusDisabledReason}
              </Notice>
            ) : null}
            {isClosed ? (
              <Notice tone="error" className="mt-2 text-xs">
                Статус «Закрыто»: редактирование полей мероприятия недоступно.
              </Notice>
            ) : null}
          </div>
        </>
      ),
      services: (
        <>
          <AiFieldHighlight active={isAiFieldHighlighted('servicesIds')}>
            {useCompactForm ? (
              servicesIds.length ? (
                <AddIconButton
                  title="Выбрать услуги"
                  size="sm"
                  onClick={openServicesSelection}
                />
              ) : (
                <ActionIconButton
                  variant="success"
                  size="sm"
                  className="px-3 text-sm"
                  onClick={openServicesSelection}
                >
                  Выбрать услуги
                </ActionIconButton>
              )
            ) : (
              <ServiceMultiSelect
                value={servicesIds}
                onChange={(value) => {
                  clearAiFields('servicesIds')
                  setServicesIds(value)
                }}
                onCreate={openServiceCreateModal}
                onEdit={openServiceEditModal}
                error={errors.servicesIds}
                onClearError={() => removeError('servicesIds')}
              />
            )}
          </AiFieldHighlight>
        </>
      ),
      eventType: (
        <>
          <AiFieldHighlight active={isAiFieldHighlighted('eventType')}>
            <div className="mt-4">
              <ComboBox
                label="Тип события"
                items={eventTypeOptions}
                value={eventType}
                onChange={(value) => {
                  clearAiFields('eventType')
                  removeError('eventType')
                  setEventType(value ?? '')
                }}
                placeholder="Выберите тип события"
                fullWidth
                noMargin
                className="min-w-38 flex-1"
                error={errors.eventType}
                postfix={
                  <AddIconButton
                    onClick={handleCreateEventType}
                    title="Добавить тип события"
                    size="sm"
                  />
                }
              />
            </div>
          </AiFieldHighlight>
        </>
      ),
      dates: (
        <>
          <div className="flex flex-wrap items-center gap-x-1">
            <AiFieldHighlight active={isAiFieldHighlighted('eventDate')}>
              <DateTimePicker
                value={eventDate}
                onChange={(value) => {
                  clearAiFields('eventDate', 'dateEnd')
                  removeError(errors.dateEnd ? 'dateEnd' : 'eventDate')
                  const nextStart = value ?? null
                  setDateEnd(
                    (prevEnd) =>
                      shiftEndByStartChange(eventDate, nextStart, prevEnd) ??
                      prevEnd
                  )
                  setEventDate(nextStart)
                }}
                label="Дата начала"
                error={errors.eventDate}
              />
            </AiFieldHighlight>
            <AiFieldHighlight active={isAiFieldHighlighted('dateEnd')}>
              <DateTimePicker
                value={dateEnd}
                onChange={(value) => {
                  clearAiFields('dateEnd')
                  removeError('dateEnd')
                  setDateEndTouched(true)
                  setDateEnd(value ?? null)
                }}
                label="Дата окончания"
              />
            </AiFieldHighlight>
          </div>
        </>
      ),
      address: (
        <>
          <AiFieldHighlight active={isAiFieldHighlighted('address')}>
            <AddressPoolPicker
              address={address}
              onChange={(value) => {
                clearAiFields('address')
                setAddress(value)
              }}
              label={useCompactForm ? '' : 'Локация'}
              required={false}
              errors={errors}
              townOptions={townOptions}
              onCreateTown={handleCreateTown}
            />
          </AiFieldHighlight>
        </>
      ),
      description: (
        <>
          <AiFieldHighlight active={isAiFieldHighlighted('description')}>
            <Textarea
              label={useCompactForm ? 'Запрос клиента' : 'Описание'}
              onChange={(value) => {
                clearAiFields('description')
                setDescription(value)
              }}
              value={description}
              rows={3}
            />
          </AiFieldHighlight>
        </>
      ),
      other: (
        <>
          {showColleagueTransferControls && (
            <>
              <IconCheckBox
                checked={isTransferred}
                onClick={() => {
                  setIsTransferred((prev) => !prev)
                  removeError('colleagueId')
                }}
                label="Передано коллеге"
                checkedIcon={faCircleCheck}
                checkedIconColor="#F97316"
              />
              {isTransferred && (
                <ColleaguePicker
                  selectedColleague={selectedColleague}
                  selectedColleagueId={colleagueId}
                  onSelectClick={openColleagueSelectModal}
                  label="Коллега"
                  required={isTransferred}
                  error={errors.colleagueId}
                  compact
                  paddingY
                  fullWidth
                />
              )}
            </>
          )}
          {event?.importedFromFile && !clone ? (
            <div className="space-y-2">
              <IconCheckBox
                checked={fileImportChecked}
                onClick={() => setFileImportChecked((value) => !value)}
                label="Импорт из файла проверен"
                checkedIcon={faCircleCheck}
                checkedIconColor="#10B981"
              />
              <details className="text-sm">
                <summary className="cursor-pointer">
                  Источник: {event.fileImportName || 'файл'}
                </summary>
                <pre className="mt-2 text-xs break-words whitespace-pre-wrap">
                  {event.fileImportSource}
                </pre>
              </details>
            </div>
          ) : (
            !calendarImportChecked && (
              <IconCheckBox
                checked={calendarImportChecked}
                onClick={() => setCalendarImportChecked(true)}
                label={
                  importedFromCalendar
                    ? 'Импорт из календаря проверен'
                    : 'Проверка мероприятия завершена'
                }
                checkedIcon={faCircleCheck}
                checkedIconColor="#10B981"
              />
            )
          )}
          <DateTimePicker
            value={requestCreatedAt}
            onChange={(value) => setRequestCreatedAt(value ?? null)}
            label="Дата заявки"
          />
        </>
      ),
      client: (
        <>
          <AiFieldHighlight active={isAiFieldHighlighted('clientId')}>
            <ClientPicker
              selectedClient={selectedClient}
              selectedClientId={clientId}
              onSelectClick={openClientSelectModal}
              onViewClick={() => modalsFunc.client?.view(clientId)}
              onEditClick={() => modalsFunc.client?.edit(clientId)}
              onCreateClick={() =>
                modalsFunc.client?.add((newClient) => {
                  if (!newClient?._id) return
                  clearAiFields('clientId')
                  setClientId(newClient._id)
                  removeError('clientId')
                })
              }
              label="Клиент"
              required
              error={errors.clientId}
              paddingY
              fullWidth
              compact
              showSelectButton
            />
          </AiFieldHighlight>
        </>
      ),
      contacts: (
        <>
          <OtherContactsPicker
            contacts={otherContacts}
            clients={clients}
            onSelectContact={handleOtherContactSelect}
            onChangeComment={handleOtherContactCommentChange}
            onRemoveContact={handleOtherContactRemove}
            onEditContact={(index) => {
              const contact = otherContacts[index]
              if (contact?.clientId) modalsFunc.client?.edit(contact.clientId)
            }}
            onViewContact={(index) => {
              const contact = otherContacts[index]
              if (contact?.clientId) modalsFunc.client?.view(contact.clientId)
            }}
            onAddContact={handleOtherContactAdd}
          />
        </>
      ),
      reminders: (
        <>
          <LabeledContainer
            label={useCompactForm ? undefined : 'Задачи/События'}
          >
            <div className="flex w-full flex-col gap-2">
              <div className="flex w-full justify-end">
                <AddIconButton
                  onClick={() => handleAdditionalEventAdd()}
                  title="Добавить задачу/событие"
                  label="Добавить задачу/событие"
                  size="sm"
                  className="px-3"
                />
              </div>
              {hasDoneAdditionalEvents ? (
                <IconCheckBox
                  checked={showDoneAdditionalEvents}
                  onClick={() => setShowDoneAdditionalEvents((prev) => !prev)}
                  label="Показывать выполненные"
                  checkedIcon={faCircleCheck}
                  checkedIconColor="#16A34A"
                  noMargin
                />
              ) : null}

              {additionalEvents.length ===
              0 ? null : filteredAdditionalEvents.length === 0 ? (
                <div className="text-sm text-gray-500">
                  Нет событий для выбранного фильтра
                </div>
              ) : (
                <div className="tablet:grid-cols-2 laptop:grid-cols-3 grid grid-cols-1 gap-2">
                  {filteredAdditionalEvents.map(({ item, index }) => (
                    <div
                      key={`additional-event-${index}`}
                      className={`w-full rounded border p-2 ${
                        item?.done
                          ? 'border-emerald-200 bg-emerald-50/70'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => handleAdditionalEventToggleDone(index)}
                          title={
                            item?.done
                              ? 'Отметить как не выполнено'
                              : 'Отметить как выполнено'
                          }
                          aria-label={
                            item?.done
                              ? 'Отметить как не выполнено'
                              : 'Отметить как выполнено'
                          }
                          className={`mt-0.5 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border transition ${
                            item?.done
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-gray-300 bg-white text-gray-400 hover:border-emerald-400 hover:text-emerald-500'
                          }`}
                        >
                          <FontAwesomeIcon icon={faCircleCheck} />
                        </button>
                        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-sm font-semibold ${
                                item?.done
                                  ? 'text-emerald-700'
                                  : 'text-gray-900'
                              }`}
                            >
                              {item?.done ? '✓ ' : ''}
                              {item?.title || `Событие #${index + 1}`}
                            </div>
                            <div className="text-xs text-gray-600">
                              {item?.date
                                ? new Date(item.date).toLocaleString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Дата не указана'}
                            </div>
                            {item?.description ? (
                              <div className="text-xs text-gray-700">
                                {item.description}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                            <IconActionButton
                              icon={faPencilAlt}
                              onClick={() => handleAdditionalEventEdit(index)}
                              title="Редактировать событие"
                              variant="warning"
                              size="xs"
                              className="min-h-8 min-w-8"
                            />
                            <IconActionButton
                              icon={faTrashAlt}
                              onClick={() => handleAdditionalEventRemove(index)}
                              title="Удалить событие"
                              variant="danger"
                              size="xs"
                              className="min-h-8 min-w-8"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </LabeledContainer>
        </>
      ),
      finance: (
        <>
          <AiFieldHighlight active={isAiFieldHighlighted('contractSum')}>
            <Input
              label="Договорная сумма"
              type="number"
              value={contractSum}
              onChange={(value) => {
                clearAiFields('contractSum')
                setContractSum(value)
              }}
              min={0}
              step={1000}
              noMargin
            />
          </AiFieldHighlight>
          {!hasDepositTransaction ? (
            <div className="mt-3 flex flex-col gap-2">
              <AiFieldHighlight active={isAiFieldHighlighted('waitDeposit')}>
                <IconCheckBox
                  checked={waitDeposit}
                  onClick={() => {
                    clearAiFields('waitDeposit', 'depositExpectedAmount')
                    setWaitDeposit((prev) => {
                      const next = !prev
                      if (!next) {
                        setDepositDueAt(null)
                        setDepositExpectedAmount(null)
                      } else if (!depositDueAt) {
                        setDepositDueAt(
                          new Date(
                            Date.now() + 24 * 60 * 60 * 1000
                          ).toISOString()
                        )
                      }
                      return next
                    })
                  }}
                  label="Ждем задаток"
                  checkedIcon={faCircleCheck}
                  checkedIconColor="#F97316"
                  noMargin
                />
              </AiFieldHighlight>
              {waitDeposit ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
                  <AiFieldHighlight
                    active={isAiFieldHighlighted('depositExpectedAmount')}
                  >
                    <Input
                      label="Сумма задатка"
                      type="number"
                      value={depositExpectedAmount}
                      onChange={(value) => {
                        clearAiFields('depositExpectedAmount')
                        setDepositExpectedAmount(value)
                      }}
                      min={0}
                      step={1000}
                      noMargin
                      className="w-[140px]"
                      inputClassName="w-[60px]"
                    />
                  </AiFieldHighlight>
                  <AiFieldHighlight
                    active={isAiFieldHighlighted('depositDueAt')}
                  >
                    <DateTimePicker
                      value={depositDueAt}
                      onChange={(value) => {
                        clearAiFields('depositDueAt')
                        setDepositDueAt(value ?? null)
                      }}
                      label="Дата ожидания задатка"
                      noMargin
                    />
                  </AiFieldHighlight>
                </div>
              ) : null}
            </div>
          ) : null}
          <AiFieldHighlight active={isAiFieldHighlighted('financeComment')}>
            <Textarea
              label="Комментарий по финансам"
              value={financeComment}
              onChange={(value) => {
                clearAiFields('financeComment')
                setFinanceComment(value)
              }}
              rows={2}
              wrapperClassName="mt-2"
              noMargin
            />
          </AiFieldHighlight>
          <AiFieldHighlight
            active={isAiFieldHighlighted('isByContract')}
            className="mt-3"
          >
            <IconCheckBox
              checked={isByContract}
              onClick={() => {
                clearAiFields('isByContract')
                setIsByContract((prev) => !prev)
              }}
              label="По договору"
              checkedIcon={faCircleCheck}
              checkedIconColor="#2563EB"
              noMargin
            />
          </AiFieldHighlight>
        </>
      ),
      documents: (
        <>
          {canUseDocuments && (
            <div className="mt-3">
              <LabeledContainer
                label={useCompactForm ? undefined : 'Файлы и документы'}
                noMargin
              >
                <DocumentsEditor
                  showHeading={false}
                  proposalsEnabled={canUseProposals}
                  documents={documents}
                  onChange={setDocuments}
                  entityType="events"
                  entityId={sourceEventId}
                  entityLabel={workItemTerms.accusative}
                  documentTemplates={documentTemplates}
                  payments={eventTransactions}
                  hasAgreedProposal={Boolean(agreedProposal)}
                  noMargin
                />
              </LabeledContainer>
            </div>
          )}
        </>
      ),
      proposals: (
        <>
          {canUseProposals ? (
            <div className="mt-3">
              <LabeledContainer
                label="Коммерческие предложения"
                help="КП необязательно и не требует договора или счёта. Создайте предложение, проверьте варианты и цены, затем опубликуйте. После публикации можно скопировать ссылку или отправить её в Telegram. Шаблоны повторяемых текстов и медиа настраиваются в разделе «Документы → Предложения»."
                noMargin
              >
                {persistedEventId ? (
                  <EventProposalsSection
                    eventId={persistedEventId}
                    onApplied={handleProposalApplied}
                  />
                ) : (
                  <Notice tone="info" className="rounded-md">
                    Сначала сохраните мероприятие. После сохранения откройте его
                    редактирование снова — здесь появится создание коммерческого
                    предложения.
                  </Notice>
                )}
              </LabeledContainer>
            </div>
          ) : null}
        </>
      ),
      transactions: (
        <>
          {closeState.hasObligations ? (
            <Notice tone="warning" role="alert" className="rounded-md">
              {getCloseBlockedByObligationsMessage()}
            </Notice>
          ) : null}
          <LabeledContainer
            label="Транзакции"
            noMargin
            className="mt-3"
            contentClassName="flex flex-col gap-2"
          >
            {financeError ? (
              <Notice tone="error" role="alert" className="rounded-md">
                {financeError}
              </Notice>
            ) : null}

            {eventTransactions.length === 0 ? null : (
              <div className="divide-y divide-gray-100">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                    Поступления
                  </div>
                  {incomeTransactions.length === 0 ? (
                    <div className="px-3 pb-3 text-sm text-gray-500">
                      Поступлений нет
                    </div>
                  ) : (
                    incomeTransactions.map((transaction) => (
                      <div
                        key={transaction._id}
                        className="laptop:flex-row laptop:items-center laptop:justify-between flex flex-col gap-2 px-3 py-3"
                      >
                        <div className="flex flex-1 flex-wrap gap-3 text-sm">
                          <span className="font-semibold text-gray-900">
                            {transaction.amount.toLocaleString()} руб.
                          </span>
                          <span className="text-emerald-700">
                            {TRANSACTION_TYPES.find(
                              (item) => item.value === transaction.type
                            )?.name ?? transaction.type}
                          </span>
                          {transaction.category && (
                            <span className="text-gray-600">
                              {
                                TRANSACTION_CATEGORIES.find(
                                  (item) => item.value === transaction.category
                                )?.name
                              }
                            </span>
                          )}
                          {transaction.paymentMethod ===
                          OBLIGATION_PAYMENT_METHOD ? (
                            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              Обязательство
                            </span>
                          ) : null}
                          <span className="text-gray-600">
                            {getTransactionDateLabel(transaction.paymentMethod)}
                            {': '}
                            {transaction.date
                              ? new Date(transaction.date).toLocaleString(
                                  'ru-RU',
                                  {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }
                                )
                              : ''}
                          </span>
                          {transaction.comment && (
                            <span className="text-gray-700">
                              {transaction.comment}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <IconActionButton
                            icon={faPencilAlt}
                            onClick={() =>
                              openTransactionModal(transaction._id)
                            }
                            disabled={financeLoading}
                            title="Редактировать транзакцию"
                            variant="warning"
                            size="sm"
                          />
                          <IconActionButton
                            icon={faTrashAlt}
                            onClick={() =>
                              handleDeleteTransaction(transaction._id)
                            }
                            disabled={financeLoading}
                            title="Удалить транзакцию"
                            variant="danger"
                            size="sm"
                          />
                        </div>
                      </div>
                    ))
                  )}
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                    Расходы
                  </div>
                  {expenseTransactions.length === 0 ? (
                    <div className="px-3 pb-3 text-sm text-gray-500">
                      Расходов нет
                    </div>
                  ) : (
                    expenseTransactions.map((transaction) => (
                      <div
                        key={transaction._id}
                        className="laptop:flex-row laptop:items-center laptop:justify-between flex flex-col gap-2 px-3 py-3"
                      >
                        <div className="flex flex-1 flex-wrap gap-3 text-sm">
                          <span className="font-semibold text-gray-900">
                            {transaction.amount.toLocaleString()} руб.
                          </span>
                          <span className="text-red-700">
                            {TRANSACTION_TYPES.find(
                              (item) => item.value === transaction.type
                            )?.name ?? transaction.type}
                          </span>
                          {transaction.category && (
                            <span className="text-gray-600">
                              {
                                TRANSACTION_CATEGORIES.find(
                                  (item) => item.value === transaction.category
                                )?.name
                              }
                            </span>
                          )}
                          {transaction.paymentMethod ===
                          OBLIGATION_PAYMENT_METHOD ? (
                            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              Обязательство
                            </span>
                          ) : null}
                          <span className="text-gray-600">
                            {getTransactionDateLabel(transaction.paymentMethod)}
                            {': '}
                            {transaction.date
                              ? new Date(transaction.date).toLocaleString(
                                  'ru-RU',
                                  {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }
                                )
                              : ''}
                          </span>
                          {transaction.comment && (
                            <span className="text-gray-700">
                              {transaction.comment}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <IconActionButton
                            icon={faPencilAlt}
                            onClick={() =>
                              openTransactionModal(transaction._id)
                            }
                            disabled={financeLoading}
                            title="Редактировать транзакцию"
                            variant="warning"
                            size="sm"
                          />
                          <IconActionButton
                            icon={faTrashAlt}
                            onClick={() =>
                              handleDeleteTransaction(transaction._id)
                            }
                            disabled={financeLoading}
                            title="Удалить транзакцию"
                            variant="danger"
                            size="sm"
                          />
                        </div>
                      </div>
                    ))
                  )}
              </div>
            )}
            <div className="flex w-full justify-end">
              <AddIconButton
                onClick={() => openTransactionModal()}
                disabled={clone || financeLoading}
                title="Добавить транзакцию"
                label="Добавить транзакцию"
                size="sm"
                className="px-3 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </LabeledContainer>
        </>
      ),
      google: (
        <>
          {googleCalendarResponseText ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm">
                Ответ Google Calendar
              </summary>
              <pre className="max-h-72 overflow-auto text-xs break-words whitespace-pre-wrap">
                {googleCalendarResponseText}
              </pre>
            </details>
          ) : null}
        </>
      ),
    }
    if (useCompactForm)
      return (
        <>
          <CompactEventForm
            fields={fields}
            errors={errors}
            validationAttempt={validationAttempt}
            initialTab={initialTab}
            isClosed={isClosed}
            isDraft={isDraft}
            isNew={!sourceEventId}
            selectedClient={selectedClient}
            clientHighlighted={isAiFieldHighlighted('clientId')}
            onSelectClient={openClientSelectModal}
            onCreateClient={() =>
              modalsFunc.client?.add((newClient) => {
                if (!newClient?._id) return
                clearAiFields('clientId')
                setClientId(newClient._id)
                removeError('clientId')
              })
            }
            services={services ?? []}
            servicesIds={servicesIds}
            onRemoveService={(id) => {
              clearAiFields('servicesIds')
              setServicesIds((ids) => ids.filter((value) => value !== id))
            }}
            eventType={eventType}
            eventDate={eventDate}
            dateEnd={dateEnd}
            address={address}
            contractSum={contractSum}
            paidAmount={
              sourceEventId
                ? incomeTransactions.reduce(
                    (sum, item) => sum + Number(item.amount || 0),
                    0
                  )
                : 0
            }
            expenseAmount={
              sourceEventId
                ? expenseTransactions.reduce(
                    (sum, item) => sum + Number(item.amount || 0),
                    0
                  )
                : 0
            }
            waitDeposit={waitDeposit}
            depositExpectedAmount={depositExpectedAmount}
            additionalEvents={additionalEvents}
            otherContacts={otherContacts}
            proposalsEnabled={canUseProposals}
            documents={documents}
            aiHighlightedFields={aiHighlightedFields}
            statusLabel={
              EVENT_STATUSES.find((item) => item.value === status)?.name ||
              status
            }
            status={status}
            onClearDates={() => {
              clearAiFields('eventDate', 'dateEnd')
              setEventDate(null)
              setDateEnd(null)
              removeError('eventDate')
              removeError('dateEnd')
            }}
          />
        </>
      )
    return (
      <>
        <TabContext
          value={initialTab}
          variant="fullWidth"
          scrollButtons={false}
          allowScrollButtonsMobile={false}
        >
          <TabPanel tabName="Общие" tabBadge={tabErrorCounts.general}>
            <FormWrapper>
              {fields.hints}
              {fields.status}
              <div className={formLockedClassName}>
                {fields.services}
                {fields.eventType}
                {fields.dates}
                {fields.address}
                {fields.description}
                {fields.other}
                <ErrorsList errors={errors} />
              </div>
            </FormWrapper>
          </TabPanel>

          <TabPanel
            tabName="Клиент и Контакты"
            tabBadge={tabErrorCounts.client}
          >
            <FormWrapper>
              <div className={formLockedClassName}>
                {fields.client}
                {fields.contacts}
                {fields.reminders}
              </div>
            </FormWrapper>
          </TabPanel>

          <TabPanel tabName="Финансы и Документы">
            <div className={`flex flex-col gap-2 ${formLockedClassName}`}>
              {fields.finance}
              {fields.documents}
              {fields.proposals}
              {fields.transactions}
            </div>
          </TabPanel>
          {googleCalendarResponseText ? (
            <TabPanel tabName="Ответ Google Calendar">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-800">
                  Ответ Google Calendar
                </div>
                <button
                  type="button"
                  className="h-8 rounded border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    if (!navigator?.clipboard) return
                    navigator.clipboard.writeText(googleCalendarResponseText)
                  }}
                >
                  Скопировать
                </button>
              </div>
              <pre className="max-h-72 w-full overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs whitespace-pre-wrap text-gray-800">
                {googleCalendarResponseText}
              </pre>
            </TabPanel>
          ) : null}
        </TabContext>
      </>
    )
  }

  return {
    title: `${eventId && !clone ? 'Редактирование' : 'Создание'} рабочей карточки`,
    confirmButtonName: eventId && !clone ? 'Применить' : 'Создать',
    Children: EventModal,
  }
}

export default eventFunc
