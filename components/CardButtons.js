import { faCopy, faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import {
  faArrowDown,
  faArrowUp,
  faCalendarAlt,
  faClockRotateLeft,
  faCode,
  faExchangeAlt,
  faEllipsisV,
  faExternalLinkAlt,
  faMoneyBill,
  faPencilAlt,
  faKey,
  faLink,
  faReceipt,
  faUser,
  faUserSecret,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { EVENT_STATUSES, SERVICE_USER_STATUSES } from '@helpers/constants'
import { modalsFuncAtom } from '@state/atoms'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import windowDimensionsTailwindSelector from '@state/selectors/windowDimensionsTailwindSelector'
import cn from 'classnames'
import { useAtomValue } from 'jotai'
import CardButton from './CardButton'
import DropDown from './DropDown'
import useCopyToClipboard from '@helpers/useCopyToClipboard'
import { getAdditionalEventsSummary } from '@helpers/additionalEvents'
import { shouldShowAdditionalEventsAction } from '@helpers/eventCardActions'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'
import switchImpersonation from '@helpers/switchImpersonation'
import useSnackbar from '@helpers/useSnackbar'
import { useRef } from 'react'

const MENU_ITEM_TONE = {
  red: {
    base: 'bg-white text-red-500',
    hover: 'hover:bg-red-600 hover:text-white',
    active: 'bg-red-500 text-white',
  },
  orange: {
    base: 'bg-white text-orange-500',
    hover: 'hover:bg-orange-600 hover:text-white',
    active: 'bg-orange-500 text-white',
  },
  blue: {
    base: 'bg-white text-blue-500',
    hover: 'hover:bg-blue-600 hover:text-white',
    active: 'bg-blue-500 text-white',
  },
  green: {
    base: 'bg-white text-green-500',
    hover: 'hover:bg-green-600 hover:text-white',
    active: 'bg-green-500 text-white',
  },
  purple: {
    base: 'bg-white text-purple-600',
    hover: 'hover:bg-purple-700 hover:text-white',
    active: 'bg-purple-600 text-white',
  },
  gray: {
    base: 'bg-white text-gray-500',
    hover: 'hover:bg-gray-600 hover:text-white',
    active: 'bg-gray-500 text-white',
  },
}

const MenuItem = ({
  active,
  icon,
  onClick,
  color = 'red',
  tooltipText,
  badges = [],
}) => {
  const tone = MENU_ITEM_TONE[color] || MENU_ITEM_TONE.red

  return (
    <div
      className={cn(
        'flex h-9 cursor-pointer items-center gap-x-2 px-2 text-base font-normal duration-300',
        tone.hover,
        active ? tone.active : tone.base
      )}
      onClick={(e) => {
        e.stopPropagation()
        onClick && onClick()
      }}
    >
      <FontAwesomeIcon icon={icon} className="h-7 w-7" />
      <div className="prevent-select-text whitespace-nowrap">{tooltipText}</div>
      {badges.length > 0 ? (
        <div className="ml-auto flex items-center gap-1">
          {badges.map((badge) => (
            <span
              key={badge.key}
              title={badge.title}
              className={cn(
                'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white shadow-sm',
                badge.className
              )}
            >
              {badge.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const CardButtons = ({
  item,
  typeOfItem,
  showOnSiteOnClick,
  onUpClick,
  onDownClick,
  className,
  forForm,
  alwaysCompact,
  alwaysCompactOnPhone,
  dropDownPlacement = 'right',
  showEditButton = true,
  showDeleteButton = true,
  onEdit,
  onDelete,
  minimalActions = false,
  calendarLink,
  onOpenCalendar,
  onEditClientContacts,
  onEditFinanceDocs,
  onAdditionalEvents,
  showAdditionalEventsButton = true,
  showCopyIdButton = true,
  showCloneButton = true,
  showHistoryButton = true,
  showStatusButton = true,
  compactTriggerClassName = '',
}) => {
  const terms = useWorkItemTerminology()
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const loggedUser = useAtomValue(loggedUserAtom)
  const device = useAtomValue(windowDimensionsTailwindSelector)
  const snackbar = useSnackbar()
  const impersonationPendingRef = useRef(false)

  const canManageUsers = ['dev', 'admin'].includes(loggedUser?.role)
  const canCopyId =
    showCopyIdButton &&
    loggedUser?.role === 'dev' &&
    ['event', 'transaction', 'user', 'client'].includes(typeOfItem) &&
    Boolean(item?._id)
  const canManageItem =
    typeOfItem !== 'user' && typeOfItem !== 'tariff' ? true : canManageUsers
  const isEventEditTabsMenu =
    minimalActions &&
    typeOfItem === 'event' &&
    canManageItem &&
    Boolean(onEditClientContacts || onEditFinanceDocs)
  const canEditStatus =
    showStatusButton && ['event', 'serviceUser'].includes(typeOfItem)

  const copyId = useCopyToClipboard(item?._id, 'ID скопирован в буфер обмена')

  // Keep hooks unconditional while the item is loading or has been removed.
  if (!item?._id) return null

  const additionalEventsSummary = getAdditionalEventsSummary([item], new Date())
  const additionalEventsBadges = [
    {
      key: 'overdue',
      title: 'Просрочено',
      value: Number(additionalEventsSummary?.overdue || 0),
      className: 'bg-red-600',
    },
    {
      key: 'today',
      title: 'Сегодня',
      value: Number(additionalEventsSummary?.today || 0),
      className: 'bg-amber-500',
    },
    {
      key: 'tomorrow',
      title: 'Завтра',
      value: Number(additionalEventsSummary?.tomorrow || 0),
      className: 'bg-blue-600',
    },
  ].filter((badge) => badge.value > 0)

  const upDownSee =
    (!forForm && typeOfItem === 'service') || typeOfItem === 'product' || false
  const showAdditionalEventsAction = shouldShowAdditionalEventsAction({
    typeOfItem,
    status: item?.status,
    enabled: showAdditionalEventsButton,
  })
  // (typeOfItem === 'event' && loggedUserActiveRole.events.edit) ||
  // (typeOfItem === 'user' && loggedUserActiveRole.users.edit) ||
  // (typeOfItem === 'service' && loggedUserActiveRole.services.edit) ||
  // (typeOfItem === 'serviceUser' && loggedUserActiveRole.servicesUsers.edit) ||
  // (typeOfItem === 'product' && loggedUserActiveRole.products.edit) ||
  // (typeOfItem === 'productUser' && loggedUserActiveRole.productsUsers.edit) ||

  const show = minimalActions
    ? isEventEditTabsMenu
      ? {
          copyId: canCopyId,
          editBtn: showEditButton,
          editClientContacts: showEditButton && Boolean(onEditClientContacts),
          editFinanceDocs: showEditButton && Boolean(onEditFinanceDocs),
          cloneBtn:
            showCloneButton && typeOfItem !== 'user' && typeOfItem !== 'tariff',
          openCalendar: typeOfItem === 'event' && Boolean(calendarLink),
          additionalEvents: showAdditionalEventsAction,
          historyBtn: showHistoryButton && ['event', 'client', 'transaction'].includes(typeOfItem),
          statusBtn: canEditStatus,
          deleteBtn:
            showDeleteButton && canManageItem && item.status !== 'closed',
        }
      : {
          copyId: canCopyId,
          editBtn: showEditButton && canManageItem,
          cloneBtn:
            showCloneButton && typeOfItem !== 'user' && typeOfItem !== 'tariff',
          openCalendar: typeOfItem === 'event' && Boolean(calendarLink),
          additionalEvents: showAdditionalEventsAction,
          historyBtn: showHistoryButton && ['event', 'client', 'transaction'].includes(typeOfItem),
          statusBtn: canEditStatus,
          deleteBtn:
            showDeleteButton && canManageItem && item.status !== 'closed',
          userPaymentHistory: typeOfItem === 'user' && canManageUsers,
          userBilling: typeOfItem === 'user' && canManageUsers,
          userTariff: typeOfItem === 'user' && canManageUsers,
          setPasswordBtn: typeOfItem === 'user' && canManageUsers,
          impersonateUser:
            typeOfItem === 'user' &&
            loggedUser?.role === 'dev' &&
            loggedUser?.impersonation?.active !== true &&
            String(loggedUser?._id) !== String(item?._id),
          userEvents: typeOfItem === 'client',
          contactMerge: typeOfItem === 'client',
        }
    : {
        copyId: canCopyId,
        userActionsHistory: typeOfItem === 'user',
        userPaymentHistory: typeOfItem === 'user' && canManageUsers,
        userBilling: typeOfItem === 'user' && canManageUsers,
        userTariff: typeOfItem === 'user' && canManageUsers,
        setPasswordBtn: typeOfItem === 'user' && canManageUsers,
        impersonateUser:
          typeOfItem === 'user' &&
          loggedUser?.role === 'dev' &&
          loggedUser?.impersonation?.active !== true &&
          String(loggedUser?._id) !== String(item?._id),
        addToCalendar: typeOfItem === 'event',
        openCalendar: typeOfItem === 'event' && Boolean(calendarLink),
        additionalEvents: showAdditionalEventsAction,
        historyBtn: showHistoryButton && ['event', 'client', 'transaction'].includes(typeOfItem),
        upBtn: onUpClick && upDownSee,
        downBtn: onDownClick && upDownSee,
        editBtn: showEditButton && canManageItem,
        cloneBtn:
          showCloneButton && typeOfItem !== 'user' && typeOfItem !== 'tariff',
        showOnSiteBtn: showOnSiteOnClick,
        statusBtn: canEditStatus,
        deleteBtn:
          showDeleteButton && canManageItem && item.status !== 'closed',
        userEvents: typeOfItem === 'client',
        contactMerge: typeOfItem === 'client',
      }

  const numberOfButtons = Object.keys(show).reduce(
    (p, c) => p + (show[c] ? 1 : 0),
    0
  )

  if (numberOfButtons === 0) return null

  const isCompact =
    alwaysCompact ||
    ((numberOfButtons > 3 || alwaysCompactOnPhone) &&
      ['phoneV', 'phoneH', 'tablet'].includes(device))

  const ItemComponent = isCompact ? MenuItem : CardButton
  const handleOpenCalendar = () => {
    if (onOpenCalendar) {
      onOpenCalendar()
      return
    }
    if (calendarLink) window.open(calendarLink, '_blank', 'noreferrer')
  }

  const handleImpersonateUser = async () => {
    if (impersonationPendingRef.current) return
    impersonationPendingRef.current = true
    try {
      await switchImpersonation({ targetUserId: item._id })
    } catch (error) {
      impersonationPendingRef.current = false
      snackbar.error(error?.message || 'Не удалось войти в кабинет')
    }
  }

  const items = (
    <>
      {isEventEditTabsMenu && show.editBtn && (
        <ItemComponent
          icon={faPencilAlt}
          onClick={() => {
            if (onEdit) onEdit()
            else modalsFunc[typeOfItem].edit(item._id)
          }}
          color="orange"
          tooltipText="Редактирование"
        />
      )}
      {isEventEditTabsMenu && show.editClientContacts && (
        <ItemComponent
          icon={faUser}
          onClick={() => onEditClientContacts?.()}
          color="blue"
          tooltipText="Клиент и контакты"
        />
      )}
      {isEventEditTabsMenu && show.editFinanceDocs && (
        <ItemComponent
          icon={faMoneyBill}
          onClick={() => onEditFinanceDocs?.()}
          color="green"
          tooltipText="Финансы и документы"
        />
      )}
      {show.copyId && (
        <ItemComponent
          icon={faCode}
          onClick={() => copyId(item._id)}
          color="blue"
          tooltipText="Скопировать ID"
        />
      )}
      {show.upBtn && (
        <ItemComponent
          icon={faArrowUp}
          onClick={() => {
            onUpClick()
          }}
          color="gray"
          tooltipText="Переместить выше"
        />
      )}
      {show.downBtn && (
        <ItemComponent
          icon={faArrowDown}
          onClick={() => {
            onDownClick()
          }}
          color="gray"
          tooltipText="Переместить ниже"
        />
      )}
      {show.userPaymentHistory && (
        <ItemComponent
          icon={faReceipt}
          onClick={() => {
            modalsFunc[typeOfItem].paymentHistory(item._id)
          }}
          color="green"
          tooltipText="Баланс и платежи"
        />
      )}
      {show.userBilling && (
        <ItemComponent
          icon={faMoneyBill}
          onClick={() => {
            modalsFunc[typeOfItem].billing(item._id)
          }}
          color="green"
          tooltipText="Управление балансом"
        />
      )}
      {show.impersonateUser && (
        <ItemComponent
          icon={faUserSecret}
          onClick={handleImpersonateUser}
          color="purple"
          tooltipText="Войти в кабинет пользователя"
        />
      )}
      {show.userTariff && (
        <ItemComponent
          icon={faExchangeAlt}
          onClick={() => {
            modalsFunc[typeOfItem].tariffChange(item._id)
          }}
          color="blue"
          tooltipText="Сменить тариф"
        />
      )}
      {show.setPasswordBtn && (
        <ItemComponent
          icon={faKey}
          onClick={() => {
            modalsFunc[typeOfItem].passwordChange(item._id)
          }}
          color="purple"
          tooltipText="Смена пароля"
        />
      )}
      {show.userEvents && (
        <ItemComponent
          icon={faCalendarAlt}
          onClick={() => {
            modalsFunc[typeOfItem].events(item._id)
          }}
          color="blue"
          tooltipText={
            typeOfItem === 'client'
              ? `Заявки и ${terms.plural}`
              : `${terms.pluralCapitalized} с пользователем`
          }
        />
      )}
      {show.contactMerge && (
        <ItemComponent
          icon={faLink}
          onClick={() => {
            modalsFunc[typeOfItem].contactMerge(item._id)
          }}
          color="blue"
          tooltipText="Объединение контактов"
        />
      )}
      {show.openCalendar && (
        <ItemComponent
          icon={faExternalLinkAlt}
          onClick={handleOpenCalendar}
          color="blue"
          tooltipText="Открыть в календаре"
        />
      )}
      {show.additionalEvents && (
        <ItemComponent
          icon={faCalendarAlt}
          onClick={() => {
            if (onAdditionalEvents) onAdditionalEvents()
            else modalsFunc.event?.additionalEvents?.(item._id)
          }}
          color="blue"
          tooltipText="Задачи/События"
          badges={additionalEventsBadges}
        />
      )}
      {show.historyBtn && (
        <ItemComponent
          icon={faClockRotateLeft}
          onClick={() => modalsFunc[typeOfItem].history(item._id)}
          color="purple"
          tooltipText="История изменений"
        />
      )}
      {!isEventEditTabsMenu && show.editBtn && (
        <ItemComponent
          icon={faPencilAlt}
          onClick={() => {
            if (onEdit) onEdit()
            else modalsFunc[typeOfItem].edit(item._id)
          }}
          color="orange"
          tooltipText={isEventEditTabsMenu ? 'Редактирование' : 'Редактировать'}
        />
      )}
      {!isEventEditTabsMenu && show.editClientContacts && (
        <ItemComponent
          icon={faUser}
          onClick={() => onEditClientContacts?.()}
          color="blue"
          tooltipText="Клиент и контакты"
        />
      )}
      {!isEventEditTabsMenu && show.editFinanceDocs && (
        <ItemComponent
          icon={faMoneyBill}
          onClick={() => onEditFinanceDocs?.()}
          color="green"
          tooltipText="Финансы и документы"
        />
      )}
      {show.cloneBtn && (
        <ItemComponent
          icon={faCopy}
          onClick={() => {
            modalsFunc[typeOfItem].add(item._id)
          }}
          color="blue"
          tooltipText={typeOfItem === 'event' ? 'Сделать копию' : 'Клонировать'}
        />
      )}
      {show.statusBtn
        ? (() => {
            const status = item.status ?? 'active'
            const statusesList =
              typeOfItem === 'serviceUser'
                ? SERVICE_USER_STATUSES
                : EVENT_STATUSES
            const statusConfig = statusesList.find(
              ({ value }) => value === status
            )
            if (!statusConfig) return null
            const { icon, color, name } = statusConfig
            return (
              <ItemComponent
                icon={icon}
                onClick={() => {
                  modalsFunc[typeOfItem].statusEdit(item._id)
                }}
                color={
                  color.indexOf('-') > 0
                    ? color.slice(0, color.indexOf('-'))
                    : color
                }
                tooltipText={`${name} (изменить статус)`}
              />
            )
          })()
        : null}
      {show.deleteBtn && (
        <ItemComponent
          icon={faTrashAlt}
          onClick={() => {
            if (onDelete) onDelete()
            else modalsFunc[typeOfItem].delete(item._id)
          }}
          color="red"
          tooltipText="Удалить"
        />
      )}
    </>
  )

  return isCompact ? (
    <DropDown
      trigger={
        <button
          type="button"
          className={cn(
            'card-buttons-compact-trigger text-general hover:border-general/30 hover:bg-general/10 flex h-8 min-h-8 w-8 cursor-pointer items-center justify-center rounded-bl-2xl border border-transparent p-0 transition',
            compactTriggerClassName
          )}
          aria-label="Открыть меню действий"
        >
          <FontAwesomeIcon icon={faEllipsisV} className="h-5 min-h-5 w-5" />
        </button>
      }
      className={className}
      menuPadding={false}
      placement={dropDownPlacement}
      renderInPortal
    >
      <div className="overflow-hidden rounded-lg">{items}</div>
    </DropDown>
  ) : (
    <div className={cn('flex', className)}>{items}</div>
  )
}

export default CardButtons
