/* eslint-disable react-hooks/exhaustive-deps */
import DateTimePicker from '@components/DateTimePicker'
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import InputWrapper from '@components/InputWrapper'
import ClientPicker from '@components/ClientPicker'
import EventPicker from '@components/EventPicker'
import Note from '@components/Note'
import Notice from '@components/Notice'
import { normalizeTransactionCategory } from '@helpers/transactionCategory.mjs'
import {
  TRANSACTION_CATEGORIES,
  TRANSACTION_PAYMENT_METHODS,
  TRANSACTION_TYPES,
} from '@helpers/constants'
import {
  getTransactionDateHint,
  getTransactionDateLabel,
  OBLIGATION_PAYMENT_METHOD,
} from '@helpers/transactionObligation'
import { modalsFuncAtom } from '@state/atoms'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useAtomValue } from 'jotai'
import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import { setAtomValue } from '@state/storeHelpers'
import {
  useCreateTransactionMutation,
  useTransactionsQuery,
  useUpdateTransactionMutation,
} from '@helpers/useTransactionsQuery'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { useEventsQuery } from '@helpers/useEventsQuery'

const transactionFunc = (
  { eventId, transactionId, contractSum, initialValues } = {}
) => {
  const TransactionModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
  }) => {
    const { data: clients = [] } = useClientsQuery()
    const { data: eventsPayload } = useEventsQuery({
      scope: 'all',
      enabled: false,
    })
    const events = eventsPayload?.data ?? []
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const { data: transactions = [] } = useTransactionsQuery(undefined, {
      enabled: false,
    })
    const createTransactionMutation = useCreateTransactionMutation()
    const updateTransactionMutation = useUpdateTransactionMutation()

    const transaction = useMemo(
      () =>
        transactionId
          ? transactions.find((item) => item._id === transactionId)
          : null,
      [transactionId, transactions]
    )

    const initialEventId = useMemo(
      () => eventId ?? transaction?.eventId ?? null,
      [eventId, transaction?.eventId]
    )
    const initialClientId = useMemo(
      () => transaction?.clientId ?? null,
      [transaction?.clientId]
    )
    const initialType = useMemo(
      () => transaction?.type ?? initialValues?.type ?? 'income',
      [initialValues?.type, transaction?.type]
    )
    const initialCategory = useMemo(
      () =>
        normalizeTransactionCategory(
          transaction?.category ??
          initialValues?.category ??
          (initialType === 'income' ? 'final_payment' : 'other')
        ),
      [initialValues?.category, transaction?.category, initialType]
    )
    const initialPaymentMethod = useMemo(
      () => transaction?.paymentMethod ?? 'transfer',
      [transaction?.paymentMethod]
    )
    const [selectedEventId, setSelectedEventId] = useState(initialEventId)
    const [selectedClientId, setSelectedClientId] = useState(
      initialClientId ?? null
    )
    const selectedEvent = useMemo(() => {
      const id = selectedEventId
      return id ? events.find((item) => item._id === id) : null
    }, [events, selectedEventId])
    const incomeTotal = useMemo(() => {
      if (!selectedEventId) return 0
      return (transactions ?? [])
        .filter(
          (item) => item.eventId === selectedEventId && item.type === 'income'
        )
        .reduce((total, item) => total + (Number(item.amount) || 0), 0)
    }, [transactions, selectedEventId])
    const defaultAmount = useMemo(() => {
      const base = selectedEvent?.contractSum ?? contractSum ?? 0
      const value = Number(base) - incomeTotal
      if (!Number.isFinite(value)) return 0
      return value > 0 ? value : 0
    }, [selectedEvent?.contractSum, contractSum, incomeTotal])
    const initialAmount = useMemo(() => {
      if (transaction?.amount !== undefined && transaction?.amount !== null)
        return transaction.amount
      if (Object.hasOwn(initialValues ?? {}, 'amount'))
        return initialValues.amount ?? ''
      return defaultAmount
    }, [transaction?.amount, initialValues, defaultAmount])
    const initialDate = useMemo(() => {
      if (transaction?.date) return new Date(transaction.date).toISOString()
      return new Date().toISOString()
    }, [transaction?.date])
    const initialComment = useMemo(
      () => transaction?.comment ?? '',
      [transaction?.comment]
    )

    const [amount, setAmount] = useState(initialAmount)
    const [amountTouched, setAmountTouched] = useState(false)
    const [type, setType] = useState(initialType)
    const [category, setCategory] = useState(initialCategory)
    const [paymentMethod, setPaymentMethod] = useState(initialPaymentMethod)
    const [date, setDate] = useState(initialDate)
    const [comment, setComment] = useState(initialComment)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const showRelations = !eventId || Boolean(transactionId)
    const isReadOnly = selectedEvent?.status === 'closed'

    const taxAmount = useMemo(() => {
      const base = selectedEvent?.contractSum ?? contractSum ?? 0
      return Number((base * 0.06).toFixed(2))
    }, [selectedEvent?.contractSum, contractSum])

    const isTaxCategory = category === 'taxes'
    const isObligation = paymentMethod === OBLIGATION_PAYMENT_METHOD
    const wasObligation = initialPaymentMethod === OBLIGATION_PAYMENT_METHOD
    const requiresActualDateConfirmation =
      Boolean(transactionId) && wasObligation && !isObligation
    const dateLabel = getTransactionDateLabel(paymentMethod)
    const dateHint = getTransactionDateHint(paymentMethod)

    const openEventSelectModal = useCallback(() => {
      modalsFunc.selectEvents(
        [selectedEventId],
        [],
        (data) => setSelectedEventId(data[0] ?? null),
        [],
        null,
        1,
        false,
        'Выбор мероприятия'
      )
    }, [modalsFunc, selectedEventId])

    useEffect(() => {
      if (selectedEvent?.clientId) {
        setSelectedClientId(selectedEvent.clientId)
      }
    }, [selectedEvent?.clientId])

    useEffect(() => {
      if (transactionId) return
      if (!selectedEvent?.isTransferred) return
      if (category === 'other') setCategory('referral_in')
      if (type !== 'income') setType('income')
    }, [transactionId, selectedEvent?.isTransferred])

    useEffect(() => {
      if (transactionId) return
      if (amountTouched) return
      setAmount(
        Object.hasOwn(initialValues ?? {}, 'amount')
          ? (initialValues.amount ?? '')
          : defaultAmount
      )
    }, [transactionId, amountTouched, initialValues, defaultAmount])

    const selectedClient = useMemo(
      () =>
        selectedClientId && clients.length
          ? clients.find((client) => client._id === selectedClientId)
          : null,
      [clients, selectedClientId]
    )

    const isFormChanged = useMemo(
      () =>
        initialEventId !== selectedEventId ||
        initialClientId !== selectedClientId ||
        initialAmount !== amount ||
        initialType !== type ||
        initialCategory !== category ||
        initialPaymentMethod !== paymentMethod ||
        initialDate !== date ||
        initialComment !== comment,
      [
        selectedEventId,
        selectedClientId,
        amount,
        type,
        category,
        paymentMethod,
        date,
        comment,
        initialEventId,
        initialClientId,
        initialAmount,
        initialType,
        initialCategory,
        initialPaymentMethod,
        initialDate,
        initialComment,
      ]
    )

    const availableCategories = useMemo(
      () =>
        TRANSACTION_CATEGORIES.filter(
          (item) => item.type === type || item.type === 'both'
        ),
      [type]
    )

    useEffect(() => {
      if (!availableCategories.length) return
      if (!availableCategories.find((item) => item.value === category)) {
        setCategory(availableCategories[0].value)
      }
    }, [availableCategories, category])

    const handleSave = useCallback(async () => {
      if (isReadOnly) {
        setError('Редактирование недоступно для закрытого мероприятия')
        return
      }
      if (requiresActualDateConfirmation && date === initialDate) {
        setError(
          'После смены обязательства на обычный метод оплаты укажите фактическую дату совершения транзакции'
        )
        return
      }
      setError('')
      setLoading(true)

      const payload = {
        amount: Number(amount) || 0,
        type,
        category,
        paymentMethod,
        date,
        comment: comment?.trim() ?? '',
      }
      const payloadContractSum =
        selectedEvent?.contractSum ?? contractSum ?? undefined
      const payloadRelations = {
        eventId: selectedEventId || null,
        clientId: selectedClientId || null,
      }

      if (transactionId) {
        setAtomValue(loadingAtom('transaction' + transactionId), true)
        setAtomValue(errorAtom('transaction' + transactionId), false)
        try {
          await updateTransactionMutation.mutateAsync({
            transactionId,
            payload: {
              ...payload,
              ...payloadRelations,
            },
          })
          setAtomValue(loadingAtom('transaction' + transactionId), false)
          setAtomValue(errorAtom('transaction' + transactionId), false)
          closeModal()
        } catch (requestError) {
          setAtomValue(loadingAtom('transaction' + transactionId), false)
          setAtomValue(errorAtom('transaction' + transactionId), true)
          setError(requestError?.message || 'Не удалось обновить транзакцию')
        }
      } else {
        try {
          await createTransactionMutation.mutateAsync({
            ...payload,
            ...payloadRelations,
            contractSum: payloadContractSum,
          })
          closeModal()
        } catch (requestError) {
          setError(requestError?.message || 'Не удалось создать транзакцию')
        }
      }

      setLoading(false)
    }, [
      amount,
      type,
      date,
      comment,
      category,
      paymentMethod,
      selectedEventId,
      selectedClientId,
      selectedEvent?.contractSum,
      isReadOnly,
      requiresActualDateConfirmation,
      initialDate,
      transactionId,
      contractSum,
      createTransactionMutation,
      updateTransactionMutation,
      closeModal,
    ])

    const handleSaveRef = useRef(handleSave)
    handleSaveRef.current = handleSave

    useEffect(() => {
      setOnConfirmFunc(isReadOnly ? undefined : () => handleSaveRef.current?.())
    }, [isReadOnly, setOnConfirmFunc])

    useEffect(() => {
      setOnShowOnCloseConfirmDialog(!isReadOnly && isFormChanged)
    }, [isFormChanged, isReadOnly, setOnShowOnCloseConfirmDialog])

    useEffect(() => {
      setDisableConfirm(
        loading ||
          isReadOnly ||
          (transactionId ? !isFormChanged : false)
      )
    }, [
      selectedEventId,
      selectedClientId,
      transactionId,
      isFormChanged,
      loading,
      isReadOnly,
      setDisableConfirm,
    ])

    return (
      <FormWrapper>
        {isReadOnly && (
          <Note noMargin className="mb-3">
            Редактирование недоступно, так как мероприятие закрыто.
          </Note>
        )}
        {showRelations && (
          <>
            <EventPicker
              selectedEvent={selectedEvent}
              selectedEventId={selectedEventId}
              onSelectClick={openEventSelectModal}
              onClear={() => setSelectedEventId(null)}
              label="Мероприятие"
              disabled={isReadOnly}
              showEditButton={!!selectedEventId}
              fullWidth
            />
            <ClientPicker
              selectedClient={selectedClient}
              onClear={() => {
                setSelectedClientId(null)
                if (selectedEvent?.clientId) setSelectedEventId(null)
              }}
              clearTitle={selectedEvent?.clientId
                ? 'Очистить выбор клиента и связанного мероприятия'
                : 'Очистить выбор клиента'}
              selectedClientId={selectedClientId}
              onSelectClick={() =>
                modalsFunc.client?.select((newClientId) => {
                  setSelectedClientId(newClientId)
                })
              }
              onViewClick={() => modalsFunc.client?.view(selectedClientId)}
              label="Клиент"
              disabled={isReadOnly}
              fullWidth
            />
          </>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Сумма"
              type="number"
              value={amount}
              onChange={(value) => {
                setAmountTouched(true)
                setAmount(value)
              }}
              min={0}
              disabled={loading || isReadOnly}
              step={1000}
            />
          </div>
          {isTaxCategory && (
            <button
              type="button"
              className="px-2 py-1 mb-2 text-xs font-semibold text-gray-700 transition bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50"
              onClick={() => setAmount(taxAmount)}
              disabled={loading || isReadOnly}
              title="Рассчитать 6% от договорной суммы"
            >
              6%
            </button>
          )}
        </div>
        <InputWrapper label="Тип" paddingY fitWidth>
          <div className="flex gap-2">
            {TRANSACTION_TYPES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`rounded border px-3 py-2 text-sm font-semibold transition ${
                  type === item.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setType(item.value)}
                disabled={loading || isReadOnly}
              >
                {item.name}
              </button>
            ))}
          </div>
        </InputWrapper>
        <InputWrapper label="Категория" paddingY fitWidth>
          <div className="flex flex-wrap gap-2">
            {availableCategories.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`rounded border px-3 py-2 text-sm font-semibold transition ${
                  category === item.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setCategory(item.value)}
                disabled={loading || isReadOnly}
              >
                {item.name}
              </button>
            ))}
          </div>
        </InputWrapper>
        <InputWrapper label="Метод оплаты" paddingY fitWidth>
          <div className="flex flex-wrap gap-2">
            {TRANSACTION_PAYMENT_METHODS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`cursor-pointer rounded border px-3 py-2 text-sm font-semibold transition ${
                  paymentMethod === item.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setPaymentMethod(item.value)}
                disabled={loading || isReadOnly}
              >
                {item.name}
              </button>
            ))}
          </div>
        </InputWrapper>
        <DateTimePicker
          value={date}
          onChange={(value) => setDate(value ?? new Date().toISOString())}
          label={dateLabel}
          disabled={loading || isReadOnly}
        />
        {dateHint ? <Note noMargin>{dateHint}</Note> : null}
        {requiresActualDateConfirmation ? (
          <Note noMargin>
            После смены метода оплаты укажите фактическую дату совершения
            транзакции.
          </Note>
        ) : null}
        <Input
          label="Комментарий"
          value={comment}
          onChange={setComment}
          disabled={loading || isReadOnly}
        />
        {error && (
          <Notice tone="error" role="alert" className="rounded-md">
            {error}
          </Notice>
        )}
      </FormWrapper>
    )
  }

  const isEdit = Boolean(transactionId)

  return {
    title: `${isEdit ? 'Редактирование' : 'Создание'} транзакции`,
    confirmButtonName: isEdit ? 'Сохранить' : 'Создать',
    Children: TransactionModal,
  }
}

export default transactionFunc
