'use client'

import { useState } from 'react'
import Notice from '@components/Notice'
import SupportAttachmentPicker from '@components/SupportAttachmentPicker'
import getPersonFullName from '@helpers/getPersonFullName'

const getRecipientLabel = (user) => {
  const name = getPersonFullName(user, { fallback: '' })
  const contact = user.phone ? `+${user.phone}` : user.email || ''
  return [name || 'Без имени', contact].filter(Boolean).join(' — ')
}

const SupportTicketComposer = ({
  onSubmit,
  onCancel,
  loading,
  developer = false,
  recipients = [],
}) => {
  const [category, setCategory] = useState('bug')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!title.trim() || !message.trim())
      return setError('Заполните тему и сообщение')
    if (developer && !targetUserId) return setError('Выберите пользователя')
    const formData = new FormData()
    formData.append('category', category)
    formData.append('title', title.trim())
    formData.append('message', message.trim())
    if (developer) formData.append('targetUserId', targetUserId)
    files.forEach((file) => formData.append('files', file))
    try {
      await onSubmit(formData)
    } catch (reason) {
      setError(reason?.message || 'Не удалось создать обращение')
    }
  }

  return (
    <form
      onSubmit={submit}
      className="support-surface space-y-4 rounded-xl border p-4"
    >
      <h2 className="text-lg font-semibold">
        {developer ? 'Новый тикет пользователю' : 'Новое обращение'}
      </h2>
      {error ? (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      ) : null}
      {developer ? (
        <label className="block text-sm font-medium">
          Пользователь
          <select
            value={targetUserId}
            disabled={loading}
            required
            onChange={(event) => setTargetUserId(event.target.value)}
            className="mt-1 h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3"
          >
            <option value="" disabled>
              Выберите пользователя
            </option>
            {recipients.map((user) => (
              <option key={String(user._id)} value={String(user._id)}>
                {getRecipientLabel(user)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block text-sm font-medium">
        Тип
        <select
          value={category}
          disabled={loading}
          onChange={(event) => setCategory(event.target.value)}
          className="mt-1 h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3"
        >
          <option value="bug">Ошибка</option>
          <option value="idea">Идея</option>
          <option value="question">Вопрос</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Тема
        <input
          value={title}
          maxLength={160}
          disabled={loading}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-3"
          placeholder={
            developer ? 'Коротко обозначьте тему' : 'Коротко опишите обращение'
          }
        />
      </label>
      <label className="block text-sm font-medium">
        Сообщение
        <textarea
          value={message}
          maxLength={5000}
          disabled={loading}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-1 min-h-32 w-full rounded-lg border border-gray-300 bg-white p-3"
          placeholder={
            developer
              ? 'Напишите сообщение пользователю…'
              : 'Что произошло или что вы хотите предложить?'
          }
        />
      </label>
      <SupportAttachmentPicker
        files={files}
        onChange={setFiles}
        disabled={loading}
        onError={setError}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={loading}
          className="filter-control filter-control--primary cursor-pointer disabled:opacity-50"
        >
          {loading ? 'Отправляем…' : 'Создать тикет'}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onCancel}
          className="filter-control cursor-pointer"
        >
          Отмена
        </button>
      </div>
    </form>
  )
}

export default SupportTicketComposer
