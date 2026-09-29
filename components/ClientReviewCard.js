'use client'

import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import AppButton from '@components/AppButton'
import SurfaceCard from '@components/SurfaceCard'
import Textarea from '@components/Textarea'
import useSnackbar from '@helpers/useSnackbar'
import { useReviewAction } from '@helpers/useClientReviews'
import { REVIEW_STATUS_LABELS } from '@helpers/clientReviews.mjs'

export default function ClientReviewCard({ review, showLinks = true }) {
  const [note, setNote] = useState(review.note)
  const action = useReviewAction()
  const snackbar = useSnackbar()
  const modals = useAtomValue(modalsFuncAtom)
  const save = async (body) => {
    try {
      await action.mutateAsync({ id: review._id, ...body })
      snackbar.success('Изменения сохранены')
    } catch (error) {
      snackbar.error(error.message)
    }
  }
  return (
    <SurfaceCard className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>
          {review.rating
            ? `★ ${review.rating} из 5`
            : REVIEW_STATUS_LABELS[review.status]}
        </strong>
        <span className="text-sm">
          {new Date(review.submittedAt || review.createdAt).toLocaleDateString(
            'ru-RU'
          )}
        </span>
      </div>
      {review.clientName ? (
        <p className="font-medium">{review.clientName}</p>
      ) : null}
      {review.eventTitle ? (
        <p className="text-sm">
          {review.eventTitle}
          {review.eventDate
            ? ` · ${new Date(review.eventDate).toLocaleDateString('ru-RU')}`
            : ''}
        </p>
      ) : null}
      {review.comment ? (
        <p className="break-words whitespace-pre-wrap">{review.comment}</p>
      ) : null}
      {review.submittedAt ? (
        <p className="text-sm">{review.readAt ? 'Прочитан' : 'Новый отзыв'}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {showLinks ? (
          <>
            <AppButton
              variant="secondary"
              onClick={() => modals?.event?.view(review.eventId)}
            >
              Открыть работу
            </AppButton>
            <AppButton
              variant="secondary"
              onClick={() => modals?.client?.view(review.clientId)}
            >
              Клиент и контакты
            </AppButton>
          </>
        ) : null}
        {review.rating && review.rating <= 3 ? (
          <AppButton
            variant="secondary"
            onClick={() => modals?.event?.additionalEvents(review.eventId)}
          >
            Запланировать контакт
          </AppButton>
        ) : null}
        {review.submittedAt && !review.readAt ? (
          <AppButton
            variant="secondary"
            disabled={action.isPending}
            onClick={() => save({ action: 'read' })}
          >
            Отметить прочитанным
          </AppButton>
        ) : null}
      </div>
      <details>
        <summary className="cursor-pointer text-sm">Внутренняя заметка</summary>
        <Textarea
          label="Заметка для себя"
          ariaLabel="Внутренняя заметка"
          value={note}
          onChange={setNote}
          error={note.length > 2000 ? 'Не более 2000 символов' : false}
        />
        <AppButton
          variant="secondary"
          disabled={
            action.isPending || note === review.note || note.length > 2000
          }
          onClick={() => save({ action: 'note', note })}
        >
          Сохранить заметку
        </AppButton>
      </details>
    </SurfaceCard>
  )
}
