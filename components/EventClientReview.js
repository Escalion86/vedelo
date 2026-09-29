'use client'

import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import { useClientQuery } from '@helpers/useClientsQuery'
import { getProposalContactOptions } from '@helpers/proposalContactOptions'
import { copyProposalText } from '@helpers/copyProposalText'
import { useClientReviews, useReviewAction } from '@helpers/useClientReviews'
import { canRequestClientReview } from '@helpers/clientReviews.mjs'
import useSnackbar from '@helpers/useSnackbar'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import Textarea from '@components/Textarea'
import SurfaceCard from '@components/SurfaceCard'
import LoadingSpinner from '@components/LoadingSpinner'
import ClientReviewCard from '@components/ClientReviewCard'

function ShareReview({ review, clientId }) {
  const [message, setMessage] = useState(
    `Спасибо, что обратились ко мне! Поделитесь, пожалуйста, впечатлением о работе: ${review.url}\nМожно просто поставить оценку или добавить несколько слов.`
  )
  const { data: client } = useClientQuery(clientId)
  const action = useReviewAction()
  const snackbar = useSnackbar()
  const copy = async (text) => {
    try {
      await copyProposalText(text)
      snackbar.info('Скопировано')
    } catch {
      snackbar.error('Не удалось скопировать. Выделите текст вручную')
    }
  }
  return (
    <div className="space-y-3">
      <Notice tone="info">
        Ссылка действует 30 дней с создания. Скопируйте сообщение и отправьте
        клиенту. Открытие мессенджера само по себе не отправляет сообщение.
      </Notice>
      <Textarea
        label="Сообщение клиенту"
        ariaLabel="Сообщение клиенту"
        value={message}
        onChange={setMessage}
        rows={6}
      />
      <div className="flex flex-wrap gap-2">
        <AppButton onClick={() => copy(message)}>
          Скопировать сообщение
        </AppButton>
        <AppButton variant="secondary" onClick={() => copy(review.url)}>
          Скопировать ссылку
        </AppButton>
        {getProposalContactOptions(client, message).map((option) => (
          <AppButton
            key={option.id}
            variant="secondary"
            onClick={() =>
              window.open(option.url, '_blank', 'noopener,noreferrer')
            }
          >
            {option.label}
          </AppButton>
        ))}
      </div>
      <AppButton
        variant="secondary"
        disabled={action.isPending}
        onClick={async () => {
          try {
            await action.mutateAsync({ id: review._id, action: 'sent' })
            snackbar.success('Отправка отмечена')
          } catch (error) {
            snackbar.error(error.message)
          }
        }}
      >
        Я отправил сообщение
      </AppButton>
    </div>
  )
}

export default function EventClientReview({ event }) {
  const query = useClientReviews({ eventId: event._id })
  const action = useReviewAction()
  const modals = useAtomValue(modalsFuncAtom)
  const snackbar = useSnackbar()
  const [confirmed, setConfirmed] = useState(false)
  const review = query.data?.items?.[0]
  const eligible = canRequestClientReview(event)
  const run = async (body) => {
    try {
      const result = await action.mutateAsync(body)
      if (result.url)
        modals.add({
          title: 'Запрос отзыва',
          confirmButtonName: 'Закрыть',
          showDecline: false,
          onConfirm: true,
          Children: () => (
            <ShareReview review={result} clientId={event.clientId} />
          ),
        })
      else snackbar.success('Изменения сохранены')
    } catch (error) {
      snackbar.error(error.message)
    }
  }
  if (!eligible && !review && !query.isError) return null
  return (
    <SurfaceCard className="space-y-3">
      <h3 className="font-semibold">Отзыв клиента</h3>
      {query.isPending ? (
        <LoadingSpinner text="Загружаем…" />
      ) : query.isError ? (
        <Notice tone="error">
          Не удалось загрузить отзыв.{' '}
          <AppButton variant="secondary" onClick={() => query.refetch()}>
            Повторить
          </AppButton>
        </Notice>
      ) : (
        <>
          {review ? (
            <ClientReviewCard review={review} showLinks={false} />
          ) : null}
          {!query.data.allowClientReviews ? (
            <Notice tone="info">
              Доступно на тарифе с отзывами клиентов. Полученные отзывы
              сохраняются.
            </Notice>
          ) : null}
          {eligible && query.data.allowClientReviews && !review?.submittedAt ? (
            <>
              {!review && event.status !== 'closed' ? (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Работа выполнена
                </label>
              ) : null}
              <AppButton
                disabled={
                  action.isPending ||
                  (!review && event.status !== 'closed' && !confirmed)
                }
                onClick={() =>
                  run(
                    review
                      ? {
                          id: review._id,
                          action: ['expired', 'revoked'].includes(review.status)
                            ? 'renew'
                            : 'link',
                        }
                      : { eventId: event._id, confirmedCompleted: confirmed }
                  )
                }
              >
                {action.isPending
                  ? 'Подготавливаем…'
                  : !review
                    ? 'Запросить отзыв'
                    : ['expired', 'revoked'].includes(review.status)
                      ? 'Создать новую ссылку'
                      : 'Отправить ссылку'}
              </AppButton>
            </>
          ) : null}
          {review && ['created', 'sent'].includes(review.status) ? (
            <AppButton
              variant="danger"
              disabled={action.isPending}
              onClick={() =>
                modals.add({
                  title: 'Отключить ссылку на отзыв?',
                  text: 'Клиент больше не сможет отправить отзыв по этой ссылке.',
                  confirmButtonName: 'Отключить',
                  onConfirm: () => run({ id: review._id, action: 'revoke' }),
                })
              }
            >
              Отключить ссылку
            </AppButton>
          ) : null}
        </>
      )}
    </SurfaceCard>
  )
}
