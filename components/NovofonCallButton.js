'use client'

import { faHeadset } from '@fortawesome/free-solid-svg-icons/faHeadset'
import { faPhone } from '@fortawesome/free-solid-svg-icons/faPhone'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useAtomValue } from 'jotai'
import cn from 'classnames'
import DropDown from '@components/DropDown'
import { getCustomValue } from '@helpers/customSettings'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'

const NOVOFON_ANDROID_PACKAGE = 'ru.novofon.mobile'

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  return digits
}

const buildNovofonCallUrl = (phone) => {
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) return ''
  const telUrl = `tel:+${normalizedPhone}`

  if (
    typeof navigator !== 'undefined' &&
    /Android/i.test(navigator.userAgent || '')
  ) {
    return `intent://+${normalizedPhone}#Intent;scheme=tel;package=${NOVOFON_ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(telUrl)};end`
  }

  return telUrl
}

const NovofonCallButton = ({
  client,
  className,
  size = 'lg',
  withTitle = false,
  allowNovofon = true,
  preferred = false,
}) => {
  const loggedUser = useAtomValue(loggedUserAtom)
  const siteSettings = useAtomValue(siteSettingsAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const tariffAccess = getUserTariffAccess(loggedUser, tariffs)
  const custom = siteSettings?.custom ?? {}
  const novofonEnabled = getCustomValue(custom, 'novofonEnabled') === true
  const canUseTelephony = Boolean(tariffAccess?.allowTelephony)
  const phone = normalizePhone(client?.phone || client?.whatsapp)
  const displayPhone = client?.phone || client?.whatsapp
  const directCallUrl = `tel:+${displayPhone}`
  const url = buildNovofonCallUrl(phone)
  const hasNovofon = Boolean(
    allowNovofon && client?._id && phone && novofonEnabled && canUseTelephony && url
  )
  const callTitle = hasNovofon ? 'Выбрать способ звонка' : `+${displayPhone}`
  const accessibleTitle = preferred
    ? `${callTitle} — приоритетный канал связи`
    : callTitle

  if (!phone || (!client?.phone && !hasNovofon)) return null

  const openCall = (event) => {
    event.stopPropagation()
    window.open(directCallUrl)
  }

  const openNovofon = (event) => {
    event.stopPropagation()
    window.location.href = url
  }

  const trigger = (
    <button
      type="button"
      className={cn(
        withTitle
          ? 'group flex cursor-pointer items-center gap-x-2 text-left'
          : 'flex h-6 w-6 cursor-pointer items-center justify-center duration-300 hover:scale-110 hover:text-toxic',
        className
      )}
      onClick={hasNovofon ? undefined : openCall}
      aria-label={
        hasNovofon
          ? accessibleTitle
          : `Позвонить на +${displayPhone}${preferred ? ' — приоритетный канал связи' : ''}`
      }
      aria-haspopup={hasNovofon ? 'menu' : undefined}
      title={accessibleTitle}
      data-preferred-contact={preferred ? 'true' : undefined}
    >
      <span className={withTitle ? 'flex w-6 items-center justify-center' : 'inline-flex'}>
        <FontAwesomeIcon
          icon={faPhone}
          size={size}
          className={cn(
            'text-green-700 dark:text-green-400',
            withTitle ? 'h-6' : 'h-5 w-5'
          )}
        />
      </span>
      {withTitle ? (
        <span className="group-hover:text-toxic">+{displayPhone}</span>
      ) : null}
    </button>
  )

  if (!hasNovofon) return trigger

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <DropDown
        trigger={trigger}
        placement="right"
        renderInPortal
        menuPadding="sm"
        menuClassName="min-w-52 flex-col !items-stretch gap-1"
      >
        <button
          type="button"
          role="menuitem"
          className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
          onClick={openCall}
        >
          <FontAwesomeIcon
            icon={faPhone}
            className="w-4 text-green-700 dark:text-green-400"
          />
          Позвонить
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
          onClick={openNovofon}
        >
          <FontAwesomeIcon icon={faHeadset} className="w-4 text-yellow-600" />
          Позвонить через Novofon
        </button>
      </DropDown>
    </div>
  )
}

export default NovofonCallButton
