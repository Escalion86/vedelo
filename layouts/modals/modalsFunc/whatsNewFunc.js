import { useEffect, useMemo, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronDown,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons'
import FormWrapper from '@components/FormWrapper'
import NewsRichTextView from '@components/NewsRichTextView'
import newsAtom from '@state/atoms/newsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import {
  filterUnreadNews,
  getLatestUnreadNews,
} from '@helpers/whatsNew.mjs'

const formatNewsDate = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('ru-RU')
    : ''
}

const whatsNewFunc = () => {
  const WhatsNewModal = () => {
    const news = useAtomValue(newsAtom)
    const loggedUser = useAtomValue(loggedUserAtom)
    const setLoggedUser = useSetAtom(loggedUserAtom)
    const items = useMemo(() => (Array.isArray(news) ? news : []), [news])
    const [seenSnapshot] = useState(() => loggedUser?.lastSeenNewsAt ?? null)
    const latestUnreadNews = useMemo(
      () => getLatestUnreadNews(items, seenSnapshot),
      [items, seenSnapshot]
    )
    const latestUnreadId = String(latestUnreadNews?._id ?? '')
    const latestUnreadAt =
      latestUnreadNews?.publishedAt ?? latestUnreadNews?.createdAt ?? null
    const freshIds = useMemo(
      () =>
        new Set(
          filterUnreadNews(news, seenSnapshot).map((item) => String(item?._id))
        ),
      [news, seenSnapshot]
    )
    const [collapsedIds, setCollapsedIds] = useState(
      () =>
        new Set(
          items
            .filter((item) => String(item?._id) !== latestUnreadId)
            .map((item) => String(item?._id))
        )
    )

    useEffect(() => {
      if (!latestUnreadAt) return
      const seenAt = new Date(latestUnreadAt).toISOString()
      setLoggedUser((previous) =>
        previous ? { ...previous, lastSeenNewsAt: seenAt } : previous
      )
      fetch('/api/news/seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seenAt }),
      }).catch(() => null)
    }, [latestUnreadAt, setLoggedUser])

    const toggleItem = (id) => {
      setCollapsedIds((previous) => {
        const next = new Set(previous)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }

    if (items.length === 0) {
      return (
        <FormWrapper className="flex h-full flex-col">
          <div className="py-6 text-center text-sm text-gray-500">
            Новостей пока нет
          </div>
        </FormWrapper>
      )
    }

    return (
      <FormWrapper className="flex h-full min-h-0 flex-col">
        {/* Список новостей прокручивается сам, а карточки не сжимаются:
            иначе в модальном окне новости сплющивались вместо прокрутки. */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pb-1">
          {items.map((item) => {
            const id = String(item?._id ?? '')
            const isFresh = freshIds.has(id)
            const isCollapsed = collapsedIds.has(id)

            return (
              <div
                key={id}
                className="shrink-0 overflow-hidden rounded-lg border border-gray-200"
              >
                <button
                  type="button"
                  onClick={() => toggleItem(id)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition hover:bg-gray-50"
                >
                  <FontAwesomeIcon
                    icon={isCollapsed ? faChevronRight : faChevronDown}
                    className="h-3 w-3 shrink-0 text-gray-400"
                  />
                  {item?.version ? (
                    <span className="shrink-0 rounded bg-[var(--ui-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ui-primary-text)]">
                      {item.version}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                    {item?.title}
                  </span>
                  {isFresh ? (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-[var(--ui-primary)]"
                      title="Новое"
                    />
                  ) : null}
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatNewsDate(item?.publishedAt)}
                  </span>
                </button>
                {!isCollapsed ? (
                  <NewsRichTextView
                    newsItem={item}
                    className="px-4 pb-4 text-sm text-gray-700"
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      </FormWrapper>
    )
  }

  return {
    title: 'Что нового',
    Children: WhatsNewModal,
    onlyCloseButtonShow: true,
    closeButtonName: 'Закрыть',
  }
}

export default whatsNewFunc
