/* eslint-disable react-hooks/exhaustive-deps */
import EventStatusPicker from '@components/ValuePicker/EventStatusPicker'
import Button from '@components/Button'
import Input from '@components/Input'
import Notice from '@components/Notice'
import LoadingSpinner from '@components/LoadingSpinner'
import { apiJson } from '@helpers/apiClient'
import useSnackbar from '@helpers/useSnackbar'
import { DEFAULT_EVENT } from '@helpers/constants'
// import isEventExpiredFunc from '@helpers/isEventExpired'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { modalsFuncAtom } from '@state/atoms'
// import expectedIncomeOfEventSelector from '@state/selectors/expectedIncomeOfEventSelector'
// import totalIncomeOfEventSelector from '@state/selectors/totalIncomeOfEventSelector'
import { postData } from '@helpers/CRUD'
import { getEventCloseSuggestionState } from '@helpers/eventCloseSuggestion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { useEventQuery } from '@helpers/useEventsQuery'
import { useTransactionsQuery } from '@helpers/useTransactionsQuery'
import { formatMoney } from '@helpers/formatMoney'
import { OBLIGATION_PAYMENT_METHOD } from '@helpers/transactionObligation'

const normalizeCancelReasons = (list = []) =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  )

const eventStatusEditFunc = (eventId, options = {}) => {
  const EventStatusEditModal = ({
    event,
    transactions,
    closeModal,
    setOnConfirmFunc,
    setOnDeclineFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
    setDisableDecline,
    setTopLeftComponent,
  }) => {
    const setEvent = useAtomValue(itemsFuncAtom).event.set
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const snackbar = useSnackbar()
    const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
    // const isEventExpired = isEventExpiredFunc(event)

    // const totalIncome = useAtomValue(totalIncomeOfEventSelector(eventId))
    // const expectedIncome = useAtomValue(
    //   expectedIncomeOfEventSelector(eventId)
    // )
    // const canSetClosed = totalIncome >= expectedIncome && isEventExpired

    const [status, setStatus] = useState(
      options.initialStatus ?? event?.status ?? DEFAULT_EVENT.status
    )
    const [saveError, setSaveError] = useState('')
    const [cancelReason, setCancelReason] = useState(
      event?.cancelReason ?? ''
    )
    const eventTransactions = useMemo(
      () =>
        (transactions ?? []).filter((transaction) => transaction.eventId === eventId),
      [eventId, transactions]
    )
    const closeState = useMemo(
      () =>
        getEventCloseSuggestionState(
          {
            status,
            contractSum: event?.contractSum ?? 0,
            isByContract: event?.isByContract,
            eventDate: event?.eventDate,
            dateEnd: event?.dateEnd,
          },
          eventTransactions
        ),
      [
        event?.contractSum,
        event?.dateEnd,
        event?.eventDate,
        event?.isByContract,
        eventTransactions,
        status,
      ]
    )
    const canClose = closeState.canClose
    const hasTaxes = closeState.hasTaxes
    const pendingAdditionalEvents = useMemo(
      () =>
        (Array.isArray(event?.additionalEvents) ? event.additionalEvents : [])
          .map((item, index) => {
            if (!item || item.done) return null
            const title =
              typeof item.title === 'string' && item.title.trim()
                ? item.title.trim()
                : `Событие #${index + 1}`
            const date = item?.date ? new Date(item.date) : null
            const dateLabel =
              date instanceof Date && !Number.isNaN(date.getTime())
                ? date.toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'без даты'
            return { title, dateLabel }
          })
          .filter(Boolean),
      [event?.additionalEvents]
    )
    const hasPendingAdditionalEvents = pendingAdditionalEvents.length > 0
    const contractSum = Number(event?.contractSum ?? 0)
    const firstObligationTransaction = useMemo(
      () =>
        eventTransactions.find(
          (transaction) =>
            String(transaction?.paymentMethod || '').trim() ===
            OBLIGATION_PAYMENT_METHOD
        ),
      [eventTransactions]
    )
    const closeBlockReasons = useMemo(() => {
      if (event?.status === 'closed') return []
      const reasons = []
      if (closeState.hasObligations)
        reasons.push(
          'есть транзакции с обязательствами — переведите их на другой метод оплаты и укажите фактическую дату совершения'
        )
      if (event?.isByContract && !hasTaxes)
        reasons.push('не добавлена транзакция «Налоги»')
      if (contractSum > closeState.incomeTotal)
        reasons.push(
          `сумма поступлений меньше договорной (внесено ${formatMoney(
            closeState.incomeTotal
          )} из ${formatMoney(contractSum)})`
        )
      if (hasPendingAdditionalEvents)
        reasons.push('не все задачи мероприятия отмечены выполненными')
      return reasons
    }, [
      closeState.hasObligations,
      closeState.incomeTotal,
      contractSum,
      event?.isByContract,
      event?.status,
      hasPendingAdditionalEvents,
      hasTaxes,
      status,
    ])
    const openTransactionFromBlock = () => {
      if (closeState.hasObligations && firstObligationTransaction?._id)
        modalsFunc.transaction?.edit(eventId, firstObligationTransaction._id, {
          contractSum,
        })
      else modalsFunc.transaction?.add(eventId, { contractSum })
    }
    const statusDisabledValues = useMemo(() => {
      if (event?.status === 'closed') return []
      if (!canClose || hasPendingAdditionalEvents) return ['closed']
      return []
    }, [canClose, hasPendingAdditionalEvents, event?.status])
    const hasEvent = Boolean(event && eventId)
    const cancelReasons = useMemo(
      () => normalizeCancelReasons(siteSettings?.custom?.cancelReasons ?? []),
      [siteSettings?.custom?.cancelReasons]
    )
    const normalizedCancelReason = useMemo(
      () => (typeof cancelReason === 'string' ? cancelReason.trim() : ''),
      [cancelReason]
    )
    const needsCancelReason = status === 'canceled'
    const isClosing = status === 'closed'
    const canApplySelectedStatus =
      (!isClosing || canClose) && !(isClosing && hasPendingAdditionalEvents)
    const hasReasonChanged =
      normalizedCancelReason !== (event?.cancelReason ?? '')

    const applyStatus = async (removePendingAdditionalEvents = false) => {
      setSaveError('')
      const saved = await setEvent(
        {
          _id: event?._id,
          status,
          cancelReason: needsCancelReason ? normalizedCancelReason : '',
          ...(removePendingAdditionalEvents
            ? {
                additionalEvents: (
                  Array.isArray(event?.additionalEvents)
                    ? event.additionalEvents
                    : []
                ).filter((item) => Boolean(item?.done)),
              }
            : {}),
        },
        false,
        true
      )
      if (!saved?._id) {
        setSaveError('Не удалось сохранить статус. Попробуйте ещё раз.')
        return
      }
      snackbar.success('Статус сохранён')
      closeModal()
      if (needsCancelReason && normalizedCancelReason) {
        const nextReasons = normalizeCancelReasons([
          ...cancelReasons,
          normalizedCancelReason,
        ])
        if (nextReasons.length !== cancelReasons.length) {
          await postData(
            '/api/site',
            {
              custom: {
                ...(siteSettings?.custom ?? {}),
                cancelReasons: nextReasons,
              },
            },
            (data) => setSiteSettings(data),
            null,
            false,
            null
          )
        }
      }
    }
    const onClickConfirm = async () => {
      const needsAdditionalEventsConfirmation =
        status === 'canceled' && pendingAdditionalEvents.length > 0

      if (needsAdditionalEventsConfirmation) {
        modalsFunc.add({
          title: 'Подтверждение закрытия/отмены',
          text:
            'Закрытие или отмена мероприятия приведет к отмене и удалению невыполненных задач:\n' +
            pendingAdditionalEvents
              .map(
                (item, index) =>
                  `${index + 1}. ${item.title} (${item.dateLabel})`
              )
              .join('\n') +
            '\n\nПродолжить?',
          confirmButtonName: 'Да, продолжить',
          declineButtonName: 'Нет',
          showDecline: true,
          onConfirm: () => applyStatus(true),
        })
        return
      }

      await applyStatus(false)
    }

    const onClickConfirmRef = useRef(onClickConfirm)

    useEffect(() => {
      onClickConfirmRef.current = onClickConfirm
    }, [onClickConfirm])

    useEffect(() => {
      if (!hasEvent) return
      const isFormChanged =
        event?.status !== status ||
        hasReasonChanged ||
        (!needsCancelReason && Boolean(event?.cancelReason))
      setDisableConfirm(
        !isFormChanged ||
          !canApplySelectedStatus ||
          (needsCancelReason && !normalizedCancelReason)
      )
      setOnConfirmFunc(
        isFormChanged ? () => onClickConfirmRef.current() : undefined
      )
    }, [
      event?.cancelReason,
      event?.status,
      canApplySelectedStatus,
      hasEvent,
      hasReasonChanged,
      needsCancelReason,
      normalizedCancelReason,
      setDisableConfirm,
      setOnConfirmFunc,
      status,
    ])

    if (!hasEvent)
      return (
        <div className="flex w-full justify-center text-lg ">
          ОШИБКА! Мероприятие не найдено!
        </div>
      )

    return (
      <div className="flex flex-col gap-y-2">
        {saveError ? <Notice tone="error">{saveError}</Notice> : null}
        <EventStatusPicker
          required
          status={status}
          onChange={setStatus}
          disabledValues={statusDisabledValues}
        />
        {needsCancelReason && (
          <Input
            label="Причина отмены"
            value={cancelReason}
            onChange={setCancelReason}
            dataList={{ name: 'cancel-reasons', list: cancelReasons }}
            required
            fullWidth
            noMargin
          />
        )}
        {closeBlockReasons.length > 0 && (
          <Notice tone="warning" className="text-sm">
            <div className="font-semibold">Статус «Закрыто» недоступен:</div>
            <ul className="ml-4 list-disc">
              {closeBlockReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </Notice>
        )}
        {closeBlockReasons.length > 0 && !canClose && (
          <Button
            thin
            className="self-start"
            name={
              closeState.hasObligations
                ? 'Изменить транзакцию-обязательство'
                : 'Внести транзакцию'
            }
            onClick={openTransactionFromBlock}
          />
        )}
        {/* {!canSetClosed && (
          <>
            <div className="text-red-500">
              Закрытие мероприятия не доступно так как:
            </div>
            <ul className="ml-4 -mt-2 list-disc">
              {totalIncome < expectedIncome && (
                <li className="text-red-500">
                  финансы мероприятия не полностью заполнены
                </li>
              )}
              {!isEventExpired && (
                <li className="text-red-500">мероприятие не завершено</li>
              )}
            </ul>
          </>
        )} */}
      </div>
    )
  }

  const LoadedEventStatusEditModal = (props) => {
    const eventQuery = useEventQuery(eventId)
    // Прошедшая заявка может отсутствовать в SSR-выборке транзакций «Важного».
    const transactionsQuery = useTransactionsQuery(undefined, {
      queryKey: ['transactions', 'event', eventId],
      queryFn: async () =>
        (await apiJson(`/api/transactions?eventIds=${encodeURIComponent(eventId)}`))?.data ?? [],
      staleTime: 0,
    })
    if (eventQuery.isPending || transactionsQuery.isPending)
      return <LoadingSpinner text="Проверяем заявку и оплаты…" />
    if (!eventQuery.data || !transactionsQuery.data)
      return (
        <Notice tone="error">
          <p>Не удалось загрузить данные для изменения статуса.</p>
          <Button
            name="Повторить"
            onClick={() => {
              eventQuery.refetch()
              transactionsQuery.refetch()
            }}
          />
        </Notice>
      )
    return (
      <EventStatusEditModal
        {...props}
        event={eventQuery.data}
        transactions={transactionsQuery.data}
      />
    )
  }

  return {
    title: `Редактирование статуса мероприятия`,
    confirmButtonName: 'Применить',
    Children: LoadedEventStatusEditModal,
    // TopLeftComponent: () => (
    //   <CardButtons
    //     item={{ _id: eventId }}
    //     typeOfItem="event"
    //     forForm
    //     direction="right"
    //   />
    // ),
  }
}

export default eventStatusEditFunc

