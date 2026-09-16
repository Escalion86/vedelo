import {
  // faHome,
  // faListAlt,
  faArrowLeft,
  faCircleExclamation,
  faSignOutAlt,
  faSpinner,
  faTags,
  faUserAlt,
  faWallet,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
// import getParentDir from '@state/atoms/getParentDir'
import menuOpenAtom from '@state/atoms/menuOpen'
import cn from 'classnames'
import { motion } from 'framer-motion'
import { signOut } from 'next-auth/react'
import Link from 'next/link'
// import { useRouter } from 'next/router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import Avatar from './Avatar'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { getNounDays } from '@helpers/getNoun'
import { modalsFuncAtom } from '@state/atoms'
import Button from '@components/Button'
import getPersonFullName from '@helpers/getPersonFullName'
import switchImpersonation from '@helpers/switchImpersonation'
// import { faCalendarAlt } from '@fortawesome/free-regular-svg-icons'

const variants = {
  show: {
    scale: 1,
    // width: 'auto',
    // height: 'auto',
    top: 0,
    right: 0,
    translateX: 0,
    translateY: 0,
  },
  hide: {
    scale: 0,
    top: 7,
    right: 7,
    // width: 0,
    // height: 0,
    translateX: '50%',
    translateY: '-50%',
  },
}

const MenuItem = ({ onClick, icon, title, href, danger, iconSpin }) => {
  const Component = (
    <div
      onClick={onClick}
      className={cn(
        'group flex cursor-pointer items-center gap-x-2 border px-3 py-2 duration-300',
        danger
          ? 'border-red-700 bg-red-600 hover:bg-red-700'
          : 'border-gray-300 bg-white hover:bg-gray-500'
      )}
    >
      <FontAwesomeIcon
        icon={icon}
        className={cn(
          'h-5 w-5',
          danger ? 'text-white' : 'text-general group-hover:text-white',
          iconSpin && 'animate-spin'
        )}
      />
      <span
        className={cn(
          'prevent-select-text whitespace-nowrap',
          danger
            ? 'font-semibold text-white'
            : 'text-black group-hover:text-white'
        )}
      >
        {title}
      </span>
    </div>
  )

  if (href)
    return (
      <Link href={href} shallow>
        {Component}
      </Link>
    )
  else return Component
}

const UserMenu = () => {
  const setMenuOpen = useSetAtom(menuOpenAtom)
  const [isUserMenuOpened, setIsUserMenuOpened] = useState(false)
  const containerRef = useRef(null)
  const [nowTs] = useState(() => Date.now())
  const loggedUser = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)

  const impersonationActive = loggedUser?.impersonation?.active === true
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState('')

  const handleRestore = async () => {
    if (restoring) return
    setRestoring(true)
    setRestoreError('')
    try {
      await switchImpersonation({ restore: true })
    } catch (error) {
      setRestoreError(error?.message || 'Не удалось вернуться в свой кабинет')
      setRestoring(false)
    }
  }

  const selectedTariffTitle = useMemo(() => {
    if (!loggedUser?.tariffId) return 'Тариф не выбран'
    const tariff = tariffs.find(
      (item) => String(item?._id) === String(loggedUser.tariffId)
    )
    return tariff?.title || 'Тариф не выбран'
  }, [loggedUser?.tariffId, tariffs])

  const selectedTariff = useMemo(() => {
    if (!loggedUser?.tariffId) return null
    return tariffs.find(
      (item) => String(item?._id) === String(loggedUser.tariffId)
    )
  }, [loggedUser?.tariffId, tariffs])

  const formattedBalance = useMemo(() => {
    const value = Number(loggedUser?.balance ?? 0)
    if (!Number.isFinite(value)) return '0'
    return value.toLocaleString('ru-RU')
  }, [loggedUser?.balance])

  const tariffActiveUntil = useMemo(() => {
    if (!loggedUser?.tariffActiveUntil) return null
    const date = new Date(loggedUser.tariffActiveUntil)
    if (Number.isNaN(date.getTime())) return null
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  }, [loggedUser?.tariffActiveUntil])

  const warningInfo = useMemo(() => {
    if (!loggedUser?.tariffActiveUntil || !selectedTariff) return null
    const price = Number(selectedTariff.price ?? 0)
    if (!Number.isFinite(price) || price <= 0) return null
    const balance = Number(loggedUser?.balance ?? 0)
    const missingAmount = Math.max(
      price - (Number.isFinite(balance) ? balance : 0),
      0
    )
    if (!missingAmount) return null
    const endDate = new Date(loggedUser.tariffActiveUntil)
    if (Number.isNaN(endDate.getTime())) return null
    const diffMs = endDate.getTime() - nowTs
    const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
    if (daysLeft > 5) return null
    return {
      daysLeft,
      missingAmount,
    }
  }, [loggedUser?.balance, loggedUser?.tariffActiveUntil, nowTs, selectedTariff])
  const fullName = getPersonFullName(loggedUser, { fallback: '-' })
  const [firstLine, ...restLines] = fullName.split(' ')
  const secondLine = restLines.join(' ')

  // const router = useRouter()

  useEffect(() => {
    if (!isUserMenuOpened) return undefined

    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsUserMenuOpened(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsUserMenuOpened(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isUserMenuOpened])

  return (
    <div ref={containerRef} className="z-50 flex items-start justify-end h-16">
      <div className="relative mt-2.5 flex w-12 flex-col items-end">
        <button
          type="button"
          aria-label="Меню пользователя"
          aria-expanded={isUserMenuOpened}
          aria-haspopup="true"
          className="cursor-pointer rounded-full"
          onClick={() => {
            setMenuOpen(false)
            setIsUserMenuOpened((prev) => !prev)
          }}
        >
          <Avatar user={loggedUser} className="z-10" />
        </button>
        {warningInfo && (
          <div className="absolute z-20 flex items-center justify-center w-5 h-5 bg-red-600 rounded-full shadow -top-1 -right-2">
            <FontAwesomeIcon
              icon={faCircleExclamation}
              className="w-3 h-3 text-white"
            />
          </div>
        )}
        {/* {router && ( */}
        <motion.div
          className={cn(
            'absolute overflow-hidden rounded-tr-3xl border border-gray-800 duration-300'
            // isUserMenuOpened
            //   ? 'scale-100 h-auto translate-y-0 translate-x-0 w-auto'
            //   : 'w-0 h-0 scale-0 translate-x-[40%] -translate-y-1/2'
          )}
          variants={variants}
          animate={isUserMenuOpened ? 'show' : 'hide'}
          initial="hide"
          transition={{ duration: 0.2, type: 'tween' }}
        >
          <div className="flex flex-col justify-center px-3 py-1 font-bold leading-4 text-white border-b border-gray-800 cursor-default bg-general h-11 rounded-tr-3xl">
            <span>{firstLine}</span>
            <span>{secondLine}</span>
          </div>
          <div className="px-3 py-2 text-xs text-gray-700 truncate bg-white border-b border-gray-300">
            Тариф: {selectedTariffTitle}
            {tariffActiveUntil ? (
              <>
                {' '}
                (до{' '}
                <span
                  className={warningInfo ? 'font-semibold text-red-600' : ''}
                >
                  {tariffActiveUntil}
                </span>
                )
              </>
            ) : (
              ''
            )}
            <br />
            <div className="flex items-center gap-x-1">
              Баланс:{' '}
              <span className={warningInfo ? 'font-semibold text-red-600' : ''}>
                {formattedBalance} руб.
              </span>
              <Button
                name="Пополнить"
                superThin
                className="ml-2 h-6 rounded px-2 text-[10px]"
                onClick={() => modalsFunc.user?.topupInfo(loggedUser?._id)}
              />
            </div>
            {warningInfo && (
              <div className="mt-1 text-xs text-red-600 bg-white text-wrap">
                До окончания действия тарифа осталось{' '}
                {getNounDays(warningInfo.daysLeft)}. Необходимо пополнить баланс
                на {warningInfo.missingAmount.toLocaleString('ru-RU')} руб.
              </div>
            )}
          </div>

          {/* <MenuItem
              href="/cabinet/events"
              icon={faCalendarAlt}
              title="Мероприятия"
            /> */}
          <MenuItem
            href="/cabinet/tariff-select"
            icon={faTags}
            title="Смена тарифа"
            onClick={() => setIsUserMenuOpened(false)}
          />
          <MenuItem
            href="/cabinet/billing-history"
            icon={faWallet}
            title="Баланс и платежи"
            onClick={() => setIsUserMenuOpened(false)}
          />
          <MenuItem
            href="/cabinet/profile"
            icon={faUserAlt}
            title="Профиль"
            onClick={() => setIsUserMenuOpened(false)}
          />
          {/* {getParentDir(router.asPath) === 'cabinet' && (
              <MenuItem href="/" icon={faHome} title="Главная страница сайта" />
            )} */}
          {/* {getParentDir(router.asPath) === 'cabinet' ? (
              <MenuItem href="/" icon={faHome} title="Главная страница сайта" />
            ) : (
              <MenuItem href="/cabinet" icon={faListAlt} title="Мой кабинет" />
            )} */}
          {impersonationActive ? (
            <>
              {restoreError ? (
                <div
                  className="border border-red-700 bg-red-600 px-3 py-2 text-xs leading-tight text-white"
                  role="alert"
                >
                  {restoreError}
                </div>
              ) : null}
              <MenuItem
                danger
                onClick={handleRestore}
                icon={restoring ? faSpinner : faArrowLeft}
                iconSpin={restoring}
                title={restoring ? 'Возвращаемся…' : 'Вернуться в свой кабинет'}
              />
            </>
          ) : (
            <MenuItem
              onClick={signOut}
              icon={faSignOutAlt}
              title="Выйти из учетной записи"
            />
          )}
        </motion.div>
        {/* )} */}
      </div>
    </div>
  )
}

export default UserMenu
