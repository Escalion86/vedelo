import cn from 'classnames'
import { useAtomValue } from 'jotai'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEnvelope } from '@fortawesome/free-regular-svg-icons/faEnvelope'
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons/faWhatsapp'
import { faViber } from '@fortawesome/free-brands-svg-icons/faViber'
import { faTelegramPlane } from '@fortawesome/free-brands-svg-icons/faTelegramPlane'
import { faInstagram } from '@fortawesome/free-brands-svg-icons/faInstagram'
import { faVk } from '@fortawesome/free-brands-svg-icons/faVk'
import { faSms } from '@fortawesome/free-solid-svg-icons/faSms'
import ClientChatButton from '@components/ClientChatButton'
import NovofonCallButton from '@components/NovofonCallButton'
import { getMaxContactAction } from '@helpers/maxContact'
import useSnackbar from '@helpers/useSnackbar'
import { modalsFuncAtom } from '@state/atoms'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'

const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('Не удалось скопировать номер')
}

const ContactIconBtn = ({
  url,
  icon,
  size = 'lg',
  className = null,
  buttonClassName = '',
  title,
  onAfterOpen,
  preferred = false,
}) => {
  const handleClick = (event) => {
    event.stopPropagation()
    window.open(url)
    onAfterOpen?.()
  }
  const actionTitle = preferred
    ? `${title || 'Открыть контакт'} — приоритетный канал связи`
    : title || 'Открыть контакт'

  if (buttonClassName) {
    return (
      <button
        type="button"
        className={buttonClassName}
        onClick={handleClick}
        aria-label={actionTitle}
        title={actionTitle}
        data-preferred-contact={preferred ? 'true' : undefined}
      >
        <FontAwesomeIcon className={cn('h-5 w-5', className)} icon={icon} />
      </button>
    )
  }

  return (
    <button
      type="button"
      className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center"
      onClick={handleClick}
      aria-label={actionTitle}
      title={actionTitle}
      data-preferred-contact={preferred ? 'true' : undefined}
    >
      <FontAwesomeIcon
        className={cn(
          'hover:text-toxic h-6 duration-300 hover:scale-110',
          className
        )}
        icon={icon}
        size={size}
      />
    </button>
  )
}

const ContactIconBtnWithTitle = ({
  url,
  icon,
  size = 'lg',
  className = null,
  title,
  onAfterOpen,
  preferred = false,
}) => (
  <button
    type="button"
    className="group flex cursor-pointer items-center gap-x-2"
    onClick={(event) => {
      event.stopPropagation()
      window.open(url)
      onAfterOpen?.()
    }}
    aria-label={preferred ? `${title} — приоритетный канал связи` : title}
    data-preferred-contact={preferred ? 'true' : undefined}
  >
    <span className="flex w-6 items-center justify-center">
      <FontAwesomeIcon
        className={cn(
          'group-hover:text-toxic h-6 duration-300 group-hover:scale-115',
          className
        )}
        icon={icon}
        size={size}
      />
    </span>
    <span className="group-hover:text-toxic">{title}</span>
  </button>
)

const MaxContactButton = ({
  action,
  withTitle,
  buttonClassName,
  unconfirmed,
  preferred,
  onOpen,
}) => {
  const title =
    action.type === 'link'
      ? 'Открыть контакт в MAX'
      : `Скопировать ${action.phone} и открыть MAX`
  const badge = (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded px-0.5 text-[7px] leading-none font-bold tracking-[-0.04em] text-white',
        unconfirmed ? 'bg-red-500' : 'bg-[#615cff]'
      )}
    >
      MAX
    </span>
  )
  const actionTitle = preferred ? `${title} — приоритетный канал связи` : title

  if (withTitle) {
    return (
      <button
        type="button"
        className="group flex cursor-pointer items-center gap-x-2 text-left"
        onClick={onOpen}
        aria-label={actionTitle}
        title={actionTitle}
        data-preferred-contact={preferred ? 'true' : undefined}
      >
        <span className="flex w-6 items-center justify-center transition duration-300 group-hover:scale-110">
          {badge}
        </span>
        <span className="group-hover:text-toxic">{action.label}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        buttonClassName,
        !buttonClassName &&
          'inline-flex h-6 min-w-6 cursor-pointer items-center justify-center transition duration-300 hover:scale-110'
      )}
      onClick={onOpen}
      aria-label={actionTitle}
      title={actionTitle}
      data-preferred-contact={preferred ? 'true' : undefined}
    >
      {badge}
    </button>
  )
}

const ContactsIconsButtons = ({
  user,
  withTitle,
  grid,
  className,
  message,
  smsViaPhone,
  forceWhatsApp = true,
  forceTelegram = true,
  forceMax = true,
  showChat = false,
  compactButtons = false,
  onPhoneMessengerAttempt,
}) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const itemsFunc = useAtomValue(itemsFuncAtom)
  const snackbar = useSnackbar()
  const Btn = withTitle ? ContactIconBtnWithTitle : ContactIconBtn
  const preferredChannel = user?.preferredContactChannel
  const maxUnconfirmed = Boolean(
    !user?.max && forceMax && user?.phone && !user?.maxPhoneUnavailable
  )
  const maxAction = getMaxContactAction(
    user?.max || (maxUnconfirmed ? user.phone : '')
  )
  const compactButtonClassName = compactButtons
    ? 'contact-quick-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-primary)]/40'
    : ''
  const compactAuxiliaryClassName = compactButtons
    ? 'contact-quick-button h-8 w-8 rounded-lg border'
    : ''

  const encodedMessage =
    message !== undefined || message !== null
      ? encodeURIComponent(message)
      : undefined

  const handlePhoneMessengerAttempt = (provider, targetClient) => {
    if (onPhoneMessengerAttempt) {
      onPhoneMessengerAttempt(provider, targetClient)
      return
    }
    if (!showChat || !targetClient?._id || !targetClient?.phone) return

    const messengerName = {
      whatsapp: 'WhatsApp',
      telegram: 'Telegram',
      max: 'MAX',
    }[provider]
    const unavailableField = {
      whatsapp: 'whatsappPhoneUnavailable',
      telegram: 'telegramPhoneUnavailable',
      max: 'maxPhoneUnavailable',
    }[provider]
    const confirmedField = {
      whatsapp: 'whatsapp',
      telegram: 'telegramPhone',
      max: 'max',
    }[provider]
    if (!messengerName) return

    setTimeout(() => {
      modalsFunc.custom({
        title: `Контакт в ${messengerName}`,
        text:
          provider === 'max'
            ? `Удалось найти клиента в MAX по номеру ${maxAction.phone}?`
            : `Удалось открыть контакт клиента в ${messengerName} по номеру +${targetClient.phone}?`,
        confirmButtonName: 'Да',
        declineButtonName: 'Нет',
        neutralButtonName: 'Не знаю',
        crossActsAsDecline: false,
        waitForConfirm: true,
        onConfirm: async () => {
          const savedClient = await itemsFunc.client.set(
            {
              _id: targetClient._id,
              [confirmedField]:
                provider === 'max' ? maxAction.phone : targetClient.phone,
              [unavailableField]: false,
            },
            false,
            true
          )
          if (!savedClient) throw new Error('Контакт клиента не сохранён')
        },
        onDecline: () =>
          itemsFunc.client.set(
            {
              _id: targetClient._id,
              [unavailableField]: true,
            },
            false,
            true
          ),
      })
    }, 300)
  }

  const handleMaxOpen = async (event) => {
    event.stopPropagation()
    if (!maxAction) return

    if (maxAction.type === 'phone') {
      try {
        await copyTextToClipboard(maxAction.phone)
        snackbar.success('Номер скопирован. Вставьте его в поиск MAX')
      } catch {
        snackbar.warning(
          `Не удалось скопировать номер. Введите его в MAX вручную: ${maxAction.phone}`
        )
      }
    }

    if (maxAction.type === 'phone') {
      try {
        window.location.assign(maxAction.url)
      } catch {
        snackbar.warning('Не удалось открыть приложение MAX')
      }
    } else {
      window.open(maxAction.url, '_blank', 'noopener,noreferrer')
    }
    if (maxUnconfirmed) handlePhoneMessengerAttempt('max', user)
  }

  return (
    <div
      className={cn(
        'my-1 items-center gap-y-2',
        grid
          ? 'laptop:grid-cols-3 tablet:grid-cols-2 grid grid-cols-1'
          : 'flex',
        withTitle ? 'gap-x-3' : 'gap-x-2',
        className
      )}
    >
      {message || smsViaPhone ? (
        user?.phone ? (
          <Btn
            icon={faSms}
            className="text-green-700"
            url={
              message
                ? `sms:+${user.phone}?body=${encodedMessage}`
                : `sms:+${user.phone}`
            }
            title={'+' + user.phone}
            buttonClassName={compactButtonClassName}
          />
        ) : null
      ) : user?.phone || (showChat && user?.whatsapp) ? (
        <NovofonCallButton
          client={user}
          withTitle={withTitle}
          allowNovofon={showChat}
          preferred={preferredChannel === 'phone'}
          className={compactButtonClassName}
        />
      ) : null}
      {user?.whatsapp ? (
        <Btn
          icon={faWhatsapp}
          className="text-green-600"
          url={`https://wa.me/${user.whatsapp}${
            message ? `?text=${encodedMessage}` : ''
          }`}
          title={'+' + user.whatsapp}
          preferred={preferredChannel === 'whatsapp'}
          buttonClassName={compactButtonClassName}
        />
      ) : (
        forceWhatsApp &&
        user?.phone &&
        !user?.whatsappPhoneUnavailable && (
          <Btn
            icon={faWhatsapp}
            className="text-red-400"
            url={`https://wa.me/${user.phone}${
              message ? `?text=${encodedMessage}` : ''
            }`}
            title={'+' + user.phone}
            preferred={preferredChannel === 'whatsapp'}
            buttonClassName={compactButtonClassName}
            onAfterOpen={() => handlePhoneMessengerAttempt('whatsapp', user)}
          />
        )
      )}
      {!message && user?.viber && (
        <Btn
          icon={faViber}
          className="text-purple-600"
          url={'viber://chat?number=' + user.viber}
          title={'+' + user.viber}
          buttonClassName={compactButtonClassName}
        />
      )}

      {!message &&
        (user?.telegram ? (
          <Btn
            icon={faTelegramPlane}
            className="text-blue-600"
            url={`tg://resolve?domain=${user.telegram}`}
            title={'@' + user.telegram}
            preferred={preferredChannel === 'telegram'}
            buttonClassName={compactButtonClassName}
          />
        ) : user?.telegramPhone ? (
          <Btn
            icon={faTelegramPlane}
            className="text-blue-600"
            url={`tg://resolve?phone=${user.telegramPhone}`}
            title={'+' + user.telegramPhone}
            preferred={preferredChannel === 'telegram'}
            buttonClassName={compactButtonClassName}
          />
        ) : (
          forceTelegram &&
          user?.phone &&
          !user?.telegramPhoneUnavailable && (
            <Btn
              icon={faTelegramPlane}
              className="text-red-400"
              url={`tg://resolve?phone=${user.phone}`}
              title={'+' + user.phone}
              preferred={preferredChannel === 'telegram'}
              buttonClassName={compactButtonClassName}
              onAfterOpen={() => handlePhoneMessengerAttempt('telegram', user)}
            />
          )
        ))}
      {!message && maxAction && (
        <MaxContactButton
          action={maxAction}
          withTitle={withTitle}
          buttonClassName={compactButtonClassName}
          unconfirmed={maxUnconfirmed}
          preferred={preferredChannel === 'max'}
          onOpen={handleMaxOpen}
        />
      )}
      {!message && user?.instagram && (
        <Btn
          icon={faInstagram}
          className="text-yellow-700"
          url={'https://instagram.com/' + user.instagram}
          title={'@' + user.instagram}
          buttonClassName={compactButtonClassName}
        />
      )}
      {!message && user?.vk && (
        <Btn
          icon={faVk}
          url={'https://vk.com/' + user.vk}
          className="text-blue-600"
          title={'@' + user.vk}
          preferred={preferredChannel === 'vk'}
          buttonClassName={compactButtonClassName}
        />
      )}
      {!message && user?.email && (
        <Btn
          icon={faEnvelope}
          className="text-red-400"
          url={'mailto:' + user.email}
          title={user.email}
          buttonClassName={compactButtonClassName}
        />
      )}
      {!message && showChat && (
        <ClientChatButton
          clientId={user?._id}
          withTitle={withTitle}
          className={compactAuxiliaryClassName}
        />
      )}
    </div>
  )
}

export default ContactsIconsButtons
