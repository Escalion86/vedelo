'use client'

import fieldHelp from '@helpers/fieldHelp.json'

import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import AppButton from '@components/AppButton'
import SurfaceCard from '@components/SurfaceCard'
import Textarea from '@components/Textarea'
import useSnackbar from '@helpers/useSnackbar'
import { useReviewAction } from '@helpers/useClientReviews'
import { REVIEW_STATUS_LABELS } from '@helpers/clientReviews.mjs'
import StatusChip from '@components/StatusChip'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar } from '@fortawesome/free-solid-svg-icons/faStar'

export default function ClientReviewCard({ review, showLinks = true }) {
  const [note, setNote] = useState(review.note || '')
  const [noteEditing, setNoteEditing] = useState(false)
  const hasNote = Boolean(review.note?.trim())
  const action = useReviewAction()
  const snackbar = useSnackbar()
  const modals = useAtomValue(modalsFuncAtom)
  const save = async (body) => {
    try {
      await action.mutateAsync({ id: review._id, ...body })
      if (body.action === 'note') setNoteEditing(false)
      snackbar.success('Изменения сохранены')
    } catch (error) {
      snackbar.error(error.message)
    }
  }
  return (
    <SurfaceCard className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {review.rating ? (
          <StatusChip tone="today" className="gap-2 py-1">
            <span
              role="img"
              aria-label={`Оценка: ${review.rating} из 5`}
              className="inline-flex gap-1"
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <FontAwesomeIcon
                  key={star}
                  icon={faStar}
                  className={`h-3.5 w-3.5 ${star <= review.rating ? 'text-[var(--ui-primary)]' : 'text-gray-400'}`}
                  aria-hidden="true"
                />
              ))}
            </span>
            <span aria-hidden="true">{review.rating} из 5</span>
          </StatusChip>
        ) : (
          <StatusChip
            tone={review.status === 'expired' ? 'overdue' : 'neutral'}
          >
            {REVIEW_STATUS_LABELS[review.status]}
          </StatusChip>
        )}
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
        {!hasNote && !noteEditing ? (
          <AppButton
            variant="ghost"
            size="sm"
            onClick={() => setNoteEditing(true)}
          >
            Добавить заметку
          </AppButton>
        ) : null}
      </div>
      {hasNote || noteEditing ? (
        <details open={noteEditing || undefined}>
          <summary className="cursor-pointer text-sm">
            Внутренняя заметка
          </summary>
          <Textarea
            label="Заметка для себя"
            help={fieldHelp['review.privateNote']}
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
      ) : null}
    </SurfaceCard>
  )
}
