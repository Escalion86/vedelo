'use client'

import { useState } from 'react'
import { useAtomValue } from 'jotai'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { getPastRequestAge } from '@helpers/pastRequests'
import getPersonFullName from '@helpers/getPersonFullName'
import formatDateTime from '@helpers/formatDateTime'
import AppButton from '@components/AppButton'
import ModalSection from '@components/ModalSection'
import StatusChip from '@components/StatusChip'
import Notice from '@components/Notice'

export default function PastRequests({
  requests,
  now,
  isError,
  onRetry,
  onOpenEvent,
}) {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const { data: clients = [] } = useClientsQuery()
  const [visibleCount, setVisibleCount] = useState(5)
  const clientsById = new Map(
    clients.map((client) => [String(client._id), client])
  )

  if (!isError && requests.length === 0) return null

  return (
    <ModalSection
      id="attention-past-requests"
      title="Заявки с прошедшей датой"
      titleClassName="card-title"
      titleRight={
        !isError ? (
          <StatusChip tone="today">{requests.length}</StatusChip>
        ) : null
      }
    >
      {isError ? (
        <Notice tone="error">
          <p>Не удалось проверить заявки с прошедшей датой.</p>
          <AppButton variant="secondary" size="sm" onClick={onRetry}>
            Повторить
          </AppButton>
        </Notice>
      ) : (
        <>
          <p className="card-muted mb-3 text-sm">
            Дата прошла — уточните результат. Если работа состоялась, проверьте
            оплаты и закройте заявку. Если нет — отмените или перенесите дату.
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
                <div className="card-muted mt-1 text-xs">
                  {request.dateEnd ? 'Окончание работы' : 'Дата работы'}:{' '}
                  {formatDateTime(
                    request.dateEnd ?? request.eventDate,
                    true,
                    false,
                    true,
                    false
                  )}
                  {' · '}
                  {getPastRequestAge(request, now)}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <AppButton
                    size="sm"
                    className="min-h-10"
                    variant="secondary"
                    onClick={() =>
                      modalsFunc.event.statusEdit(request._id, {
                        initialStatus: 'closed',
                      })
                    }
                  >
                    Закрыть
                  </AppButton>
                  <AppButton
                    size="sm"
                    className="min-h-10"
                    variant="secondary"
                    onClick={() =>
                      modalsFunc.event.statusEdit(request._id, {
                        initialStatus: 'canceled',
                      })
                    }
                  >
                    Отменить
                  </AppButton>
                  <AppButton
                    size="sm"
                    className="min-h-10"
                    variant="secondary"
                    onClick={() =>
                      modalsFunc.event.edit(request._id, { focusDates: true })
                    }
                  >
                    Перенести дату
                  </AppButton>
                  <AppButton
                    size="sm"
                    className="min-h-10"
                    variant="ghost"
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
              className="mt-3"
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
