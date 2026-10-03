'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import AppButton from '@components/AppButton'
import ComboBox from '@components/ComboBox'
import IconActionButton from '@components/IconActionButton'
import Input from '@components/Input'
import LabeledContainer from '@components/LabeledContainer'
import LoadingSpinner from '@components/LoadingSpinner'
import MutedText from '@components/MutedText'
import Notice from '@components/Notice'
import ReviewLinkCardPreview from '@components/ReviewLinkCardPreview'
import ReviewPageView from '@components/ReviewPageView'
import SurfaceCard from '@components/SurfaceCard'
import Textarea from '@components/Textarea'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import useSnackbar from '@helpers/useSnackbar'
import {
  DEFAULT_REVIEW_APPEARANCE,
  REVIEW_ACCENTS,
  REVIEW_COVERS,
} from '@helpers/reviewAppearance.mjs'

const EMPTY_FORM = { ...DEFAULT_REVIEW_APPEARANCE }
const logoLoader = ({ src }) => src

const ReviewPageSettingsContent = () => {
  const snackbar = useSnackbar()
  const fileInput = useRef(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saved, setSaved] = useState(EMPTY_FORM)
  const [meta, setMeta] = useState({ allowClientReviews: false, origin: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [previewDark, setPreviewDark] = useState(false)
  const [previewRating, setPreviewRating] = useState(0)
  const [previewComment, setPreviewComment] = useState('')
  const [sampleDate] = useState(() => new Date(Date.now() - 3 * 86400000))

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/site/review-page', {
          cache: 'no-store',
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || result?.success === false) {
          throw new Error(result?.error || 'Не удалось загрузить настройки')
        }
        if (cancelled) return
        const next = {
          ...EMPTY_FORM,
          ...(result.data?.reviewPage ?? {}),
        }
        setForm(next)
        setSaved(next)
        setMeta({
          allowClientReviews: result.data?.allowClientReviews === true,
          origin: result.data?.origin || '',
        })
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'Не удалось загрузить настройки')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const canEdit = meta.allowClientReviews
  const hasChanges = JSON.stringify(form) !== JSON.stringify(saved)
  const previewAppearance = form.publicName.trim() ? form : null

  const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }))

  const save = async () => {
    if (isSaving || !canEdit || !hasChanges) return
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch('/api/site/review-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || 'Не удалось сохранить настройки')
      }
      const next = { ...EMPTY_FORM, ...(result.data?.reviewPage ?? {}) }
      setForm(next)
      setSaved(next)
      snackbar.success('Оформление страницы отзывов сохранено')
    } catch (saveError) {
      const message = saveError?.message || 'Не удалось сохранить настройки'
      setError(message)
      snackbar.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const uploadLogo = async (file) => {
    setUploadError('')
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Изображение не должно превышать 5 МБ')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setUploadError('Разрешены PNG, JPG и WebP')
      return
    }
    setIsUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch('/api/site/review-page/logo', {
        method: 'POST',
        body,
      })
      const result = await response.json().catch(() => ({}))
      const url = result?.data?.url
      if (!response.ok || result?.success === false || !url) {
        throw new Error(
          result?.error || 'Не удалось загрузить изображение. Повторите попытку'
        )
      }
      updateForm({ logoUrl: url })
      snackbar.success('Изображение загружено')
    } catch (uploadFailure) {
      setUploadError(
        uploadFailure?.message ||
          'Не удалось загрузить изображение. Повторите попытку'
      )
    } finally {
      setIsUploading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner text="Загрузка настроек..." />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-2 lg:items-start">
        <section className="flex min-w-0 flex-col gap-3">
          {!canEdit ? (
            <Notice tone="info" role="status">
              Публичная страница отзывов доступна на тарифе с опцией «Отзывы
              клиентов». Уже отправленные ссылки показывают сохранённое
              оформление, но менять его сейчас нельзя.
            </Notice>
          ) : null}
          <SurfaceCard paddingClassName="p-4" className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Страница отзыва
              </h2>
              <MutedText className="text-gray-500">
                Так клиент увидит страницу, которая открывается по ссылке из
                сообщения. Сохранённое оформление применяется к странице отзыва
                и благодарности.
              </MutedText>
            </div>
            <Input
              label="Публичное имя"
              ariaLabel="Публичное имя"
              fullWidth
              noMargin
              maxLength={80}
              disabled={!canEdit}
              value={form.publicName}
              onChange={(publicName) => updateForm({ publicName })}
              placeholder="Например: Студия «Полёт»"
              help="Имя или название, которое увидит клиент. Пока поле пустое, страница остаётся нейтральной и не показывает ваши данные."
            />
            <Input
              label="Специализация"
              ariaLabel="Специализация"
              fullWidth
              noMargin
              maxLength={120}
              disabled={!canEdit}
              value={form.specialization}
              onChange={(specialization) => updateForm({ specialization })}
              placeholder="Например: фотограф, декоратор"
              help="Короткая подпись под именем. Видна клиенту на странице отзыва."
            />
            <Textarea
              label="Короткое обращение"
              ariaLabel="Короткое обращение"
              fullWidth
              noMargin
              rows={3}
              maxLength={300}
              value={form.greeting}
              disabled={!canEdit}
              onChange={(greeting) => updateForm({ greeting })}
              help="Необязательная фраза над формой: «Спасибо, что выбрали нас». Попадает в карточку ссылки в мессенджере."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <ComboBox
                label="Акцентный цвет"
                fullWidth
                noMargin
                items={REVIEW_ACCENTS}
                disabled={!canEdit}
                value={form.accent}
                onChange={(accent) => updateForm({ accent })}
                help="Цвет звёзд и кнопки на странице отзыва. Показан в предпросмотре."
              />
              <ComboBox
                label="Обложка"
                fullWidth
                noMargin
                items={REVIEW_COVERS}
                disabled={!canEdit}
                value={form.cover}
                onChange={(cover) => updateForm({ cover })}
                help="Готовый шаблон шапки страницы. Свой дизайн загрузить нельзя."
              />
            </div>
            <LabeledContainer
              label="Фото или логотип"
              help="PNG, JPG или WebP до 5 МБ. Показывается в шапке страницы и в карточке ссылки в мессенджере. Не заменяет публичное имя."
            >
              <div className="flex flex-wrap items-center gap-3">
                {form.logoUrl ? (
                  <Image
                    src={form.logoUrl}
                    alt="Загруженное изображение страницы отзыва"
                    width={96}
                    height={96}
                    loader={logoLoader}
                    unoptimized
                    className="h-24 w-24 rounded-lg border border-gray-200 bg-white object-contain p-1"
                  />
                ) : (
                  <span className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-500">
                    Нет фото
                  </span>
                )}
                <AppButton
                  variant="secondary"
                  size="sm"
                  disabled={!canEdit || isUploading}
                  aria-busy={isUploading}
                  onClick={() => fileInput.current?.click()}
                >
                  {isUploading
                    ? 'Загружаем…'
                    : form.logoUrl
                      ? 'Заменить фото'
                      : 'Загрузить фото'}
                </AppButton>
                {form.logoUrl ? (
                  <IconActionButton
                    icon={faTrashAlt}
                    variant="danger"
                    size="sm"
                    title="Убрать фото со страницы отзывов"
                    disabled={!canEdit || isUploading}
                    onClick={() => updateForm({ logoUrl: '' })}
                  />
                ) : null}
                <input
                  ref={fileInput}
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Файл фото или логотипа"
                  disabled={!canEdit || isUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) uploadLogo(file)
                  }}
                />
              </div>
              {uploadError ? (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {uploadError}
                </p>
              ) : (
                <MutedText className="mt-2 text-gray-500">
                  Новое фото применится после сохранения оформления.
                </MutedText>
              )}
            </LabeledContainer>
            {error ? (
              <Notice tone="error" role="alert">
                {error}
              </Notice>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <MutedText className="text-gray-500">
                {hasChanges ? 'Есть несохранённые изменения' : 'Всё сохранено'}
              </MutedText>
              <AppButton
                variant="primary"
                className="min-h-11"
                disabled={!canEdit || !hasChanges || isSaving}
                aria-busy={isSaving}
                onClick={save}
              >
                {isSaving ? 'Сохраняем…' : 'Сохранить'}
              </AppButton>
            </div>
          </SurfaceCard>
          <Notice tone="info">
            Что станет публичным: публичное имя, специализация, фото и короткое
            обращение появятся в шапке страницы отзыва и в карточке ссылки,
            которую увидит каждый, у кого есть ссылка. Оценка, комментарий, имя
            клиента, дата работы и суммы не публикуются и недоступны по одному
            идентификатору приглашения.
          </Notice>
        </section>
        <section className="flex min-w-0 flex-col gap-3">
          <SurfaceCard paddingClassName="p-4" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-900">
                Предпросмотр формы
              </h2>
              <div
                className="flex items-center gap-2"
                role="group"
                aria-label="Тема предпросмотра"
              >
                <AppButton
                  variant={previewDark ? 'ghost' : 'secondary'}
                  size="sm"
                  aria-pressed={!previewDark}
                  onClick={() => setPreviewDark(false)}
                >
                  Светлая
                </AppButton>
                <AppButton
                  variant={previewDark ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={previewDark}
                  onClick={() => setPreviewDark(true)}
                >
                  Тёмная
                </AppButton>
              </div>
            </div>
            {!previewAppearance ? (
              <MutedText className="text-gray-500">
                Пока публичное имя не заполнено, страница останется нейтральной.
                Заполните имя, чтобы увидеть персонализацию.
              </MutedText>
            ) : null}
            <div
              className="max-h-[640px] overflow-y-auto rounded-xl border border-gray-200"
              aria-label="Предпросмотр страницы отзыва"
            >
              <ReviewPageView
                appearance={previewAppearance}
                state="form"
                preview
                performerName={form.publicName.trim() || 'специалист'}
                eventDate={sampleDate}
                rating={previewRating}
                comment={previewComment}
                onRatingChange={setPreviewRating}
                onCommentChange={setPreviewComment}
                scheme={previewDark ? 'dark' : 'light'}
              />
            </div>
            <MutedText className="text-gray-500">
              Это предпросмотр: звёзды и комментарий можно примерить, отправка
              происходит на реальной ссылке.
            </MutedText>
          </SurfaceCard>
          <SurfaceCard paddingClassName="p-4" className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Карточка ссылки в мессенджере
            </h2>
            <ReviewLinkCardPreview
              appearance={previewAppearance}
              origin={meta.origin}
            />
            <MutedText className="text-gray-500">
              Так ссылку увидят в MAX, Telegram и VK до открытия. Заголовок,
              описание и изображение обновляются вместе с оформлением.
            </MutedText>
          </SurfaceCard>
        </section>
      </div>
    </div>
  )
}

export default ReviewPageSettingsContent
