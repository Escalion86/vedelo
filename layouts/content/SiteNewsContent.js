'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faEye,
  faEyeSlash,
  faPen,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import ContentHeader from '@components/ContentHeader'
import AddIconButton from '@components/AddIconButton'
import EmptyState from '@components/EmptyState'
import HeaderActions from '@components/HeaderActions'
import MutedText from '@components/MutedText'
import Notice from '@components/Notice'
import SectionCard from '@components/SectionCard'
import { modalsFuncAtom } from '@state/atoms'
import loggedUserActiveRoleSelector from '@state/selectors/loggedUserActiveRoleSelector'
import { deleteData, putData } from '@helpers/CRUD'

const formatDate = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('ru-RU')
    : '—'
}

const SiteNewsContent = () => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const loggedUserActiveRole = useAtomValue(loggedUserActiveRoleSelector)
  const canEdit = loggedUserActiveRole?.dev === true
  const [newsList, setNewsList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorText, setErrorText] = useState('')

  const loadNews = useCallback(async () => {
    setIsLoading(true)
    setErrorText('')
    try {
      const response = await fetch('/api/news?all=1')
      const json = await response.json().catch(() => null)
      if (response.ok && json?.success && Array.isArray(json.data)) {
        setNewsList(json.data)
      } else {
        setNewsList([])
        setErrorText(json?.error || 'Не удалось загрузить новости')
      }
    } catch {
      setNewsList([])
      setErrorText('Не удалось загрузить новости')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canEdit) return undefined

    const timeoutId = window.setTimeout(() => {
      void loadNews()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [canEdit, loadNews])

  const handleTogglePublish = (item) => {
    setErrorText('')
    void putData(
      `/api/news/${item._id}`,
      {
        title: item.title,
        version: item.version ?? '',
        items: item.items ?? [],
        contentHtml: item.contentHtml ?? '',
        isPublished: item.isPublished !== true,
      },
      loadNews,
      () => setErrorText('Не удалось изменить публикацию')
    )
  }

  const handleDelete = (item) => {
    modalsFunc.confirm({
      title: 'Удаление новости',
      text: `Удалить новость «${item.title}»? Действие необратимое.`,
      onConfirm: () =>
        deleteData(`/api/news/${item._id}`, loadNews, () =>
          setErrorText('Не удалось удалить новость')
        ),
    })
  }

  if (!canEdit) {
    return (
      <div className="flex h-full flex-col gap-4">
        <ContentHeader />
        <SectionCard className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState text="Доступно только администраторам" bordered={false} />
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <ContentHeader>
        <HeaderActions
          left={<div />}
          right={
            <>
              <MutedText>Всего: {newsList.length}</MutedText>
              <AddIconButton
                onClick={() => modalsFunc.news?.add(loadNews)}
                disabled={!modalsFunc.news?.add}
                title="Добавить новость"
                size="sm"
                variant="neutral"
              />
            </>
          }
        />
      </ContentHeader>
      {errorText ? <Notice tone="error">{errorText}</Notice> : null}
      <SectionCard className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-4">
        {isLoading ? (
          <MutedText>Загрузка…</MutedText>
        ) : newsList.length > 0 ? (
          <div className="flex flex-col gap-3">
            {newsList.map((item) => (
              <article
                key={item._id}
                className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {item.version ? (
                    <span className="shrink-0 rounded bg-[var(--ui-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ui-primary-text)]">
                      {item.version}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 text-sm font-semibold text-gray-800">
                    {item.title}
                  </span>
                  <Notice
                    as="span"
                    tone={item.isPublished ? 'success' : 'neutral'}
                    className="shrink-0 !rounded !px-1.5 !py-0.5 !text-[10px] !font-semibold"
                  >
                    {item.isPublished ? 'Опубликована' : 'Черновик'}
                  </Notice>
                </div>
                <MutedText>
                  Публикация: {formatDate(item.publishedAt)} ·{' '}
                  {item.contentHtml
                    ? 'Оформленный текст'
                    : `Пунктов: ${(item.items ?? []).length}`}
                </MutedText>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => modalsFunc.news?.edit(item, loadNews)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-gray-200 text-gray-500 transition hover:bg-gray-50"
                    title="Редактировать"
                    aria-label={`Редактировать новость «${item.title}»`}
                  >
                    <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(item)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-gray-200 text-gray-500 transition hover:bg-gray-50"
                    title={
                      item.isPublished ? 'Снять с публикации' : 'Опубликовать'
                    }
                    aria-label={`${item.isPublished ? 'Снять с публикации' : 'Опубликовать'} новость «${item.title}»`}
                  >
                    <FontAwesomeIcon
                      icon={item.isPublished ? faEyeSlash : faEye}
                      className="h-3.5 w-3.5"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-red-200 text-red-500 transition hover:bg-red-50"
                    title="Удалить"
                    aria-label={`Удалить новость «${item.title}»`}
                  >
                    <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState text="Новостей пока нет" bordered={false} />
        )}
      </SectionCard>
    </div>
  )
}

export default SiteNewsContent
