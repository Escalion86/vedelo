'use client'

/* eslint-disable @next/next/no-img-element */
// import DevSwitch from '@components/DevSwitch'
import Link from 'next/link'
import { useAtomValue } from 'jotai'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBell } from '@fortawesome/free-solid-svg-icons'
import UserMenu from './UserMenu'
import unreadNewsSelector from '@state/selectors/unreadNewsSelector'
import { modalsFuncAtom } from '@state/atoms'

const CabinetHeader = ({ title = '', titleLink, icon, count = null }) => {
  const unreadNews = useAtomValue(unreadNewsSelector)
  const modalsFunc = useAtomValue(modalsFuncAtom)

  return (
    <div
      className="cabinet-header relative z-20 flex h-16 w-full items-center justify-end gap-x-4 px-3"
      style={{ gridArea: 'header' }}
    >
      <div className="flex min-w-0 flex-1 items-center">
        <Link
          href="/"
          shallow
          className="tablet:flex hidden shrink-0 items-center gap-2"
        >
          <img
            className="h-10 rounded-full"
            src={icon || '/brand/vedelo-mark.svg'}
            alt="Логотип Ведело"
          />
          <span className="text-xl font-semibold tracking-tight">Ведело</span>
        </Link>
        {title ? (
          <div className="tablet:ml-4 tablet:border-l tablet:border-gray-200 tablet:pl-4 tablet:text-sm tablet:font-normal tablet:text-gray-600 flex min-w-0 items-center gap-2 text-base font-semibold text-gray-800">
            {titleLink ? (
              <Link
                href={titleLink}
                shallow
                className="truncate hover:text-gray-900"
              >
                {title}
              </Link>
            ) : (
              <span className="truncate">{title}</span>
            )}
            {Number.isFinite(count) ? (
              <span className="shrink-0 text-xs font-semibold text-[var(--ui-primary)]">
                {count}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => modalsFunc.whatsNew?.view()}
        className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
        title="Что нового"
        aria-label={
          unreadNews.length > 0
            ? `Открыть новости платформы: ${unreadNews.length} непрочитанных`
            : 'Открыть новости платформы'
        }
      >
        <FontAwesomeIcon icon={faBell} className="h-5 w-5" />
        {unreadNews.length > 0 ? (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white"
            title={`${unreadNews.length} непрочитанных новостей`}
          >
            {unreadNews.length}
          </span>
        ) : null}
      </button>
      <UserMenu />
    </div>
  )
}

export default CabinetHeader
