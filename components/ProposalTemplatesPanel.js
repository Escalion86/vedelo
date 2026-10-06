'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import AppButton from '@components/AppButton'
import IconActionButton from '@components/IconActionButton'
import Notice from '@components/Notice'
import useSnackbar from '@helpers/useSnackbar'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'

const ProposalTemplatesPanel = ({ enabled }) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const snackbar = useSnackbar()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [message, setMessage] = useState(null)

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const response = await fetch('/api/proposal-templates', {
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(body?.error?.message || 'Не удалось загрузить шаблоны')
      setItems(body.data || [])
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    // Первичная загрузка шаблонов с сервера, включая состояние loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const remove = async (item) => {
    if (
      !window.confirm(
        `Удалить шаблон «${item.name}»? Использованный шаблон будет архивирован.`
      )
    )
      return
    setDeletingId(item._id)
    try {
      const response = await fetch(`/api/proposal-templates/${item._id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Не удалось удалить шаблон')
      snackbar.success('Шаблон удалён')
      await load()
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
    } finally {
      setDeletingId('')
    }
  }

  if (!enabled)
    return (
      <Notice tone="warning">
        Коммерческие предложения недоступны на текущем тарифе.
      </Notice>
    )

  return (
    <div className="flex flex-col gap-3" aria-busy={loading}>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">
            Шаблоны предложений{items.length ? `: ${items.length}` : ''}
          </div>
          <div className="text-xs text-gray-500">
            Структурные страницы, услуги, сообщения и медиаподборки
          </div>
        </div>
        <AppButton
          variant="primary"
          size="sm"
          className="tablet:w-auto w-full"
          onClick={() => modalsFunc?.proposalTemplate?.add(load)}
        >
          Добавить шаблон
        </AppButton>
      </div>
      {loading ? (
        <div className="py-6 text-center text-sm text-gray-500">Загрузка…</div>
      ) : items.length ? (
        <div className="tablet:grid-cols-2 grid gap-3">
          {items.map((item) => (
            <div
              key={item._id}
              className="proposal-template-card flex items-start gap-3 rounded-lg border border-gray-200 p-3"
            >
              <div className="min-w-0 flex-1 break-words">
                <div className="font-semibold">{item.name}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {item.blocks?.filter((block) => block.enabled !== false)
                    .length || 0}{' '}
                  блоков · {item.media?.length || 0} медиа ·{' '}
                  {item.defaults?.servicesIds?.length || 0} услуг ·{' '}
                  {item.status === 'archived' ? 'архив' : 'активен'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <IconActionButton
                  icon={faPencilAlt}
                  variant="warning"
                  size="sm"
                  title={`Редактировать шаблон «${item.name}»`}
                  onClick={() =>
                    modalsFunc?.proposalTemplate?.edit(item, load)
                  }
                />
                <IconActionButton
                  icon={faTrashAlt}
                  variant="danger"
                  size="sm"
                  title={`Удалить шаблон «${item.name}»`}
                  disabled={deletingId === item._id}
                  onClick={() => remove(item)}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Создайте первый шаблон предложения
        </div>
      )}
    </div>
  )
}

export default ProposalTemplatesPanel
