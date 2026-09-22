'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useRouter, useSearchParams } from 'next/navigation'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { modalsFuncAtom } from '@state/atoms'
import Notice from '@components/Notice'
import SupportAttachmentPicker from '@components/SupportAttachmentPicker'
import SupportTicketCard from '@components/SupportTicketCard'
import {
  useSupportTicketMutations,
  useSupportTicketQuery,
  useSupportTicketsQuery,
} from '@helpers/useSupportTickets'

const SupportTicketComposer = dynamic(
  () => import('@components/SupportTicketComposer')
)

const CATEGORY_LABELS = { bug: 'Ошибка', idea: 'Идея', question: 'Вопрос' }
const STATUS_LABELS = {
  open: 'Открыт',
  in_progress: 'В работе',
  resolved: 'Решён',
}

const formatDate = (value) =>
  value ? new Date(value).toLocaleString('ru-RU') : ''

const TicketDetail = ({ ticketId, developer, onClose }) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const query = useSupportTicketQuery(ticketId)
  const { replyMutation, statusMutation, readMutation } =
    useSupportTicketMutations()
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const pages = useMemo(() => query.data?.pages || [], [query.data?.pages])
  const ticket = pages[0]?.data?.ticket
  const messages = useMemo(
    () => [...pages].reverse().flatMap((page) => page?.data?.messages || []),
    [pages]
  )

  useEffect(() => {
    if (ticket?.unread) readMutation.mutate(ticketId)
    // mutate intentionally omitted: only ticket unread state should trigger this action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.unread, ticketId])

  const sendReply = async (event) => {
    event.preventDefault()
    setError('')
    if (!message.trim()) return setError('Введите сообщение')
    const formData = new FormData()
    formData.append('message', message.trim())
    files.forEach((file) => formData.append('files', file))
    try {
      await replyMutation.mutateAsync({ ticketId, formData })
      setMessage('')
      setFiles([])
    } catch (reason) {
      setError(reason?.message || 'Не удалось отправить сообщение')
    }
  }

  if (query.isLoading)
    return <div className="p-4 text-gray-500">Загружаем диалог…</div>
  if (query.error || !ticket)
    return (
      <Notice tone="error">{query.error?.message || 'Тикет не найден'}</Notice>
    )

  return (
    <section className="support-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
      <header className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="filter-control cursor-pointer"
          >
            ← К списку
          </button>
          {developer ? (
            <select
              aria-label="Статус тикета"
              value={ticket.status}
              disabled={statusMutation.isPending}
              onChange={(event) =>
                statusMutation.mutate({
                  ticketId,
                  status: event.target.value,
                })
              }
              className="h-10 cursor-pointer rounded-lg border border-gray-300 bg-white px-3"
            >
              <option value="open">Открыт</option>
              <option value="in_progress">В работе</option>
              <option value="resolved">Решён</option>
            </select>
          ) : null}
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">
              {CATEGORY_LABELS[ticket.category]}
            </span>
            <span className="text-xs text-gray-500">
              {STATUS_LABELS[ticket.status]}
            </span>
          </div>
          <h2 className="min-w-0 text-lg font-semibold break-words">
            {ticket.title}
          </h2>
          {developer && ticket.createdByLabel ? (
            <button
              type="button"
              disabled={!ticket.createdBy}
              onClick={() => modalsFunc.user?.view(ticket.createdBy)}
              className="cursor-pointer text-left text-sm text-gray-500 underline decoration-dotted underline-offset-2 disabled:cursor-default disabled:no-underline"
            >
              Автор: {ticket.createdByLabel}
            </button>
          ) : null}
        </div>
      </header>
      <div className="min-h-64 flex-1 space-y-3 overflow-y-auto p-4">
        {query.hasNextPage ? (
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="filter-control mx-auto flex cursor-pointer"
          >
            {query.isFetchingNextPage
              ? 'Загружаем…'
              : 'Показать ранние сообщения'}
          </button>
        ) : null}
        {messages.map((item) => {
          const ownSide = developer
            ? item.authorRole === 'developer'
            : item.authorRole === 'user'
          return (
            <article
              key={item.id}
              className={`flex ${ownSide ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[92%] rounded-xl border p-3 sm:max-w-[75%] ${ownSide ? 'support-message-own' : 'support-message-other'}`}
              >
                <div className="mb-1 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span>
                    {item.authorLabel ||
                      (item.authorRole === 'developer'
                        ? 'Разработчик'
                        : 'Пользователь')}
                  </span>
                  <time>{formatDate(item.createdAt)}</time>
                </div>
                <p className="text-sm break-words whitespace-pre-wrap">
                  {item.body}
                </p>
                {item.attachments?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.attachments.map((attachment) => (
                      <a
                        key={attachment.url}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative h-24 w-24 overflow-hidden rounded-lg border border-gray-300"
                      >
                        <Image
                          src={attachment.url}
                          alt={attachment.name}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
      <form
        onSubmit={sendReply}
        className="space-y-3 border-t border-gray-200 p-4"
      >
        {error ? (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        ) : null}
        <textarea
          value={message}
          maxLength={5000}
          disabled={replyMutation.isPending}
          onChange={(event) => setMessage(event.target.value)}
          className="min-h-24 w-full rounded-lg border border-gray-300 bg-white p-3"
          placeholder="Напишите сообщение…"
        />
        <SupportAttachmentPicker
          files={files}
          onChange={setFiles}
          disabled={replyMutation.isPending}
          onError={setError}
        />
        <button
          type="submit"
          disabled={replyMutation.isPending}
          className="filter-control filter-control--primary cursor-pointer disabled:opacity-50"
        >
          {replyMutation.isPending ? 'Отправляем…' : 'Отправить'}
        </button>
      </form>
    </section>
  )
}

const FeedbackContent = ({ users = [] }) => {
  const loggedUser = useAtomValue(loggedUserAtom)
  const developer =
    loggedUser?.role === 'dev' && loggedUser?.impersonation?.active !== true
  const router = useRouter()
  const searchParams = useSearchParams()
  const ticketId = searchParams.get('ticketId') || ''
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [creating, setCreating] = useState(false)
  const ticketsQuery = useSupportTicketsQuery({ status, category })
  const { createMutation } = useSupportTicketMutations()
  const tickets =
    ticketsQuery.data?.pages.flatMap((page) => page?.data || []) || []
  const recipients = useMemo(
    () =>
      users
        .filter((user) => !user?.archive && user?.role !== 'dev')
        .toSorted((left, right) => {
          const leftName = [left?.firstName, left?.secondName]
            .filter(Boolean)
            .join(' ')
          const rightName = [right?.firstName, right?.secondName]
            .filter(Boolean)
            .join(' ')
          return leftName.localeCompare(rightName, 'ru')
        }),
    [users]
  )

  const openTicket = (id) => router.replace(`/cabinet/feedback?ticketId=${id}`)
  const closeTicket = () => router.replace('/cabinet/feedback')
  const createTicket = async (formData) => {
    const result = await createMutation.mutateAsync(formData)
    setCreating(false)
    openTicket(result.data.ticket.id)
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 p-2 sm:p-4">
      {ticketId ? (
        <TicketDetail
          ticketId={ticketId}
          developer={developer}
          onClose={closeTicket}
        />
      ) : creating ? (
        <SupportTicketComposer
          onSubmit={createTicket}
          onCancel={() => setCreating(false)}
          loading={createMutation.isPending}
          developer={developer}
          recipients={developer ? recipients : []}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="filter-control cursor-pointer"
            >
              <option value="">Все статусы</option>
              <option value="open">Открытые</option>
              <option value="in_progress">В работе</option>
              <option value="resolved">Решённые</option>
            </select>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="filter-control cursor-pointer"
            >
              <option value="">Все типы</option>
              <option value="bug">Ошибки</option>
              <option value="idea">Идеи</option>
              <option value="question">Вопросы</option>
            </select>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="filter-control filter-control--primary ml-auto cursor-pointer"
            >
              {developer ? 'Новый тикет пользователю' : 'Новое обращение'}
            </button>
          </div>
          {ticketsQuery.error ? (
            <Notice tone="error">{ticketsQuery.error.message}</Notice>
          ) : null}
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <SupportTicketCard
                key={ticket.id}
                ticket={ticket}
                developer={developer}
                onOpen={openTicket}
              />
            ))}
          </div>
          {ticketsQuery.isLoading ? (
            <p className="p-4 text-center text-gray-500">
              Загружаем обращения…
            </p>
          ) : null}
          {!ticketsQuery.isLoading && tickets.length === 0 ? (
            <Notice tone="neutral">
              {developer
                ? 'Обращений пока нет.'
                : 'Вы ещё не создавали обращений.'}
            </Notice>
          ) : null}
          {ticketsQuery.hasNextPage ? (
            <button
              type="button"
              onClick={() => ticketsQuery.fetchNextPage()}
              disabled={ticketsQuery.isFetchingNextPage}
              className="filter-control mx-auto cursor-pointer"
            >
              {ticketsQuery.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}

export default FeedbackContent
