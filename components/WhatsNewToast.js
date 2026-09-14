'use client'

import { useAtom, useAtomValue } from 'jotai'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullhorn, faXmark } from '@fortawesome/free-solid-svg-icons'
import unreadNewsSelector from '@state/selectors/unreadNewsSelector'
import whatsNewToastDismissedAtom from '@state/atoms/whatsNewToastDismissedAtom'
import { modalsFuncAtom } from '@state/atoms'
import { buildNewsToastLabel } from '@helpers/whatsNew.mjs'

const WhatsNewToast = () => {
  const unreadNews = useAtomValue(unreadNewsSelector)
  const [dismissed, setDismissed] = useAtom(whatsNewToastDismissedAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)

  if (dismissed || unreadNews.length === 0) return null

  return (
    <aside
      className="tablet:bottom-6 tablet:left-auto tablet:right-6 tablet:w-80 fixed right-3 bottom-20 left-3 z-40 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
      aria-label="Новые возможности Ведело"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ui-primary)] text-[var(--ui-primary-text)]">
          <FontAwesomeIcon icon={faBullhorn} className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-800">Что нового</div>
          <div className="text-xs text-gray-500">
            {buildNewsToastLabel(unreadNews.length, unreadNews[0]?.version)}
          </div>
          <button
            type="button"
            onClick={() => modalsFunc.whatsNew?.view()}
            className="mt-2 cursor-pointer rounded-lg bg-[var(--ui-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--ui-primary-text)] transition hover:opacity-90"
          >
            Подробнее
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          title="Скрыть до следующего входа"
          aria-label="Скрыть уведомление до следующего входа"
        >
          <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}

export default WhatsNewToast
