import { useCallback, useEffect, useState } from 'react'
import NewsRichTextEditor from '@components/NewsRichTextEditor'
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import Notice from '@components/Notice'
import { postData, putData } from '@helpers/CRUD'
import { NEWS_LIMITS } from '@helpers/whatsNew.mjs'
import {
  getNewsContentHtml,
  hasMeaningfulNewsContent,
} from '@helpers/newsRichText.mjs'

// TipTap откладывает создание до клиентского mount (immediatelyRender: false).
// Не добавляем второй загрузчик с неинтерактивной заглушкой поверх редактора.

const newsFunc = (newsItem = null, onSaved = null) => {
  const newsId = newsItem?._id ?? null
  const isEdit = Boolean(newsId)
  const initialTitle = newsItem?.title ?? ''
  const initialVersion = newsItem?.version ?? ''
  const initialContentHtml = getNewsContentHtml(newsItem)
  const initiallyPublished = newsItem?.isPublished === true

  const NewsModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
  }) => {
    const [title, setTitle] = useState(initialTitle)
    const [version, setVersion] = useState(initialVersion)
    const [contentHtml, setContentHtml] = useState(initialContentHtml)
    const [isPublished, setIsPublished] = useState(initiallyPublished)
    const [saveError, setSaveError] = useState('')

    const isChanged =
      title !== initialTitle ||
      version !== initialVersion ||
      contentHtml !== initialContentHtml ||
      isPublished !== initiallyPublished
    const canSave =
      title.trim().length > 0 &&
      title.trim().length <= NEWS_LIMITS.TITLE_MAX &&
      version.trim().length <= NEWS_LIMITS.VERSION_MAX &&
      hasMeaningfulNewsContent(contentHtml) &&
      (isChanged || !isEdit)

    const handleSave = useCallback(async () => {
      setSaveError('')
      const payload = {
        title,
        version,
        contentHtml,
        items: [],
        isPublished,
      }
      const request = isEdit ? putData : postData
      const url = isEdit ? `/api/news/${newsId}` : '/api/news'
      await request(
        url,
        payload,
        () => {
          if (typeof onSaved === 'function') onSaved()
          closeModal()
        },
        (error) =>
          setSaveError(error?.message || 'Не удалось сохранить новость')
      )
    }, [closeModal, contentHtml, isPublished, title, version])

    useEffect(() => {
      setDisableConfirm(!canSave)
      setOnShowOnCloseConfirmDialog(isChanged)
      setOnConfirmFunc(canSave ? handleSave : undefined)
    }, [
      canSave,
      handleSave,
      isChanged,
      setDisableConfirm,
      setOnConfirmFunc,
      setOnShowOnCloseConfirmDialog,
    ])

    return (
      <FormWrapper className="flex h-full flex-col gap-3">
        <Input
          label="Заголовок"
          value={title}
          onChange={setTitle}
          maxLength={NEWS_LIMITS.TITLE_MAX}
          required
        />
        <Input
          label="Версия (необязательно, например 1.18.0)"
          value={version}
          onChange={setVersion}
          maxLength={NEWS_LIMITS.VERSION_MAX}
        />
        <div className="flex flex-col gap-1.5">
          <div className="input-label">
            Текст новости
            <span className="ml-1 text-danger">*</span>
          </div>
          <NewsRichTextEditor
            value={contentHtml}
            onChange={setContentHtml}
            directory={`news/${newsId || 'draft'}`}
            placeholder="Расскажите о нововведениях и при необходимости добавьте изображения"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(event) => setIsPublished(event.target.checked)}
            className="h-4 w-4 cursor-pointer"
          />
          Опубликована (видна пользователям)
        </label>
        {saveError ? <Notice tone="error">{saveError}</Notice> : null}
      </FormWrapper>
    )
  }

  return {
    title: isEdit ? 'Редактирование новости' : 'Новая новость',
    confirmButtonName: 'Сохранить',
    Children: NewsModal,
  }
}

export default newsFunc
