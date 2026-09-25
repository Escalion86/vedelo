'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useEventsQuery } from '@helpers/useEventsQuery'
import { getRequestsWithoutNextStep } from '@helpers/additionalEvents'
import { useClientsQuery } from '@helpers/useClientsQuery'
import getPersonFullName from '@helpers/getPersonFullName'
import formatDateTime from '@helpers/formatDateTime'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import ModalSection from '@components/ModalSection'
import StatusChip from '@components/StatusChip'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import openEventAdditionalEventEditorModal from '@layouts/modals/modalsFunc/eventAdditionalEventEditorModal'

const RequestsWithoutNextStep = ({ onOpenEvent }) => {
  const { data, isPending, isError, refetch } = useEventsQuery({
    scope: 'drafts',
  })
  const { data: clients = [] } = useClientsQuery()
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const itemsFunc = useAtomValue(itemsFuncAtom)
  const latestEvents = useRef([])
  useEffect(() => {
    latestEvents.current = data?.data ?? []
  }, [data])
  const [visibleCount, setVisibleCount] = useState(5)
  const requests = useMemo(() => getRequestsWithoutNextStep(data?.data), [data])
  const clientsById = useMemo(
    () => new Map(clients.map((client) => [String(client._id), client])),
    [clients]
  )

  const scheduleContact = (request) => {
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + 1)
    nextDate.setHours(11, 0, 0, 0)
    openEventAdditionalEventEditorModal({
      modalsFunc,
      title: 'Следующий контакт по заявке',
      requireScheduled: true,
      sourceItem: {
        title: 'Связаться с клиентом',
        date: nextDate.toISOString(),
      },
      introText:
        'Выберите, что и когда нужно сделать. Задача сохранится в заявке.',
      onConfirm: async (nextItem) => {
        const current = latestEvents.current.find(
          (item) => item._id === request._id
        )
        if (!current || current.status !== 'draft') {
          throw new Error('Заявка изменилась. Закройте окно и обновите список.')
        }
        const updated = await itemsFunc?.event?.set(
          {
            _id: current._id,
            additionalEvents: [...(current.additionalEvents ?? []), nextItem],
          },
          false,
          true
        )
        if (!updated?._id)
          throw new Error('Не удалось сохранить задачу. Попробуйте ещё раз.')
      },
    })
  }

  return (
    <ModalSection
      id="attention-no-next-step"
      title="Заявки без следующего шага"
      titleClassName="card-title"
      titleRight={
        !isPending && !isError ? (
          <StatusChip tone="today">{requests.length}</StatusChip>
        ) : null
      }
    >
      {isPending ? (
        <p className="card-muted text-sm" role="status">
          Проверяем заявки…
        </p>
      ) : isError ? (
        <Notice tone="error">
          <p>Не удалось проверить заявки.</p>
          <AppButton
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => refetch()}
          >
            Повторить
          </AppButton>
        </Notice>
      ) : requests.length === 0 ? (
        <p className="card-muted text-sm">Заявок без следующего шага нет.</p>
      ) : (
        <>
          <p className="card-muted mb-3 text-sm">
            Здесь заявки без невыполненной задачи с датой. Назначьте звонок,
            встречу или другое действие. Просроченные задачи показаны в
            «Просрочено».
          </p>
          <div className="flex flex-col gap-2">
            {requests.slice(0, visibleCount).map((request) => (
              <div
                key={request._id}
                className="rounded-lg border border-gray-200 p-3"
              >
                <div className="card-title text-sm break-words">
                  {getPersonFullName(
                    clientsById.get(String(request.clientId)),
                    { fallback: 'Клиент не указан' }
                  )}
                </div>
                <div className="card-muted text-sm break-words">
                  {request.eventType || 'Заявка'}
                </div>
                {request.eventDate ? (
                  <div className="card-muted text-xs">
                    Дата работы:{' '}
                    {formatDateTime(
                      request.eventDate,
                      true,
                      false,
                      true,
                      false
                    )}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <AppButton
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => scheduleContact(request)}
                  >
                    Назначить контакт
                  </AppButton>
                  <AppButton
                    size="sm"
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => onOpenEvent(request._id)}
                  >
                    Открыть заявку
                  </AppButton>
                </div>
              </div>
            ))}
          </div>
          {requests.length > visibleCount ? (
            <AppButton
              variant="secondary"
              size="sm"
              className="mt-3 cursor-pointer"
              onClick={() => setVisibleCount((count) => count + 10)}
            >
              Показать ещё ({requests.length - visibleCount})
            </AppButton>
          ) : null}
        </>
      )}
    </ModalSection>
  )
}

export default RequestsWithoutNextStep
