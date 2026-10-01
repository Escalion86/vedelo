import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faGenderless } from '@fortawesome/free-solid-svg-icons/faGenderless'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import birthDateToAge from '@helpers/birthDateToAge'
import { EVENT_STATUSES_WITH_TIME, GENDERS } from '@helpers/constants'
import eventStatusFunc from '@helpers/eventStatus'
import getUserAvatarSrc from '@helpers/getUserAvatarSrc'
import serverSettingsAtom from '@state/atoms/serverSettingsAtom'
// import eventFullAtomAsync from '@state/async/eventFullAtomAsync'
import userSelector from '@state/selectors/userSelector'
import cn from 'classnames'
import { useAtomValue } from 'jotai'
import DateTimeEvent from './DateTimeEvent'
import TextLinesLimiter from './TextLinesLimiter'
import UserName from './UserName'
import serviceSelector from '@state/selectors/serviceSelector'
import eventSelector from '@state/selectors/eventSelector'
import Image from 'next/image'
import formatAddress from '@helpers/formatAddress'

const ItemContainer = ({
  onClick,
  active,
  children,
  noPadding = false,
  className,
  noBorder = false,
  checkable = true,
  style,
}) => (
  <div
    className={cn(
      'relative flex w-full max-w-full',
      { 'cursor-pointer hover:bg-blue-200': onClick },
      { 'bg-green-200': active },
      { 'px-1 py-0.5': !noPadding },
      { 'border-b border-gray-700 last:border-0': !noBorder },
      className
    )}
    style={style}
    onClick={
      onClick
        ? (e) => {
            e.stopPropagation()
            onClick()
          }
        : null
    }
  >
    {checkable && (
      <div
        className={cn(
          'absolute bottom-0 left-0 top-0 flex items-center overflow-hidden bg-general transition-all duration-300',
          active ? 'w-7' : 'w-0'
        )}
      >
        {typeof active === 'boolean' ? (
          <FontAwesomeIcon
            icon={faCheck}
            className="ml-0.5 h-6 w-6 text-white"
          />
        ) : (
          <div className="ml-0.5 flex h-6 w-6 items-center justify-center text-lg text-white">
            {active}
          </div>
        )}
      </div>
    )}
    {children}
  </div>
)

export const UserItemFromId = ({
  userId,
  onClick = null,
  active = false,
  noBorder,
  ...props
}) => {
  const user = useAtomValue(userSelector(userId))
  return (
    <UserItem
      item={user}
      active={active}
      onClick={onClick}
      noBorder={noBorder}
      {...props}
    />
  )
}

export const UserItem = ({
  item,
  onClick = null,
  active = false,
  noBorder = false,
  style,
  className,
  hideGender,
  children,
  nameFieldWrapperClassName,
}) => {
  const serverDate = new Date(useAtomValue(serverSettingsAtom)?.dateTime)

  const seeBirthday = true

  const userGender =
    item.gender && GENDERS.find((gender) => gender.value === item.gender)

  return (
    <ItemContainer
      onClick={onClick}
      active={active}
      noPadding
      className={cn('flex h-[42px]', className)}
      noBorder={noBorder}
      style={style}
    >
      {!hideGender && (
        <div
          className={cn(
            'flex h-full w-6 min-w-6 flex-col items-center justify-center gap-y-1 tablet:w-7 tablet:min-w-7',
            userGender ? 'bg-' + userGender.color : 'bg-gray-400'
          )}
        >
          <FontAwesomeIcon
            className="h-[18px] w-[18px] text-white"
            icon={userGender ? userGender.icon : faGenderless}
          />
          {seeBirthday && (
            <span className="whitespace-nowrap text-sm leading-3 text-white">
              {birthDateToAge(item.birthday, serverDate, false, false, true)}
            </span>
          )}
        </div>
      )}
      <Image
        className="aspect-1 h-[42px] object-cover"
        src={getUserAvatarSrc(item)}
        alt="Фотография пользователя"
        width={42}
        height={42}
        unoptimized
      />
      <div className="relative flex flex-1 items-center gap-x-0.5 px-1 py-0.5">
        <div
          className={cn(
            'flex max-h-full flex-1 items-center',
            nameFieldWrapperClassName
          )}
        >
          <div className="flex max-h-full flex-1 flex-col gap-x-1 text-xs text-gray-800 phoneH:text-sm tablet:text-base">
            <UserName
              user={item}
              className="inline min-h-[28px] flex-1 font-bold"
              thin
              trunc={2}
            >
              {hideGender && seeBirthday && (
                <span className="whitespace-nowrap font-normal">
                  {` (${birthDateToAge(item.birthday, serverDate)})`}
                </span>
              )}
            </UserName>
          </div>
        </div>
        {children && children(item)}
      </div>
    </ItemContainer>
  )
}

export const EventItemFromId = ({ eventId, ...props }) => {
  const event = useAtomValue(eventSelector(eventId))
  return <EventItem item={event} {...props} />
}

export const EventItem = ({
  item,
  onClick = null,
  active = false,
  bordered = false,
  className,
  classNameHeight = 'h-[33px]',
  noBorder,
  noStatusIcon,
}) => {
  const eventStatus = eventStatusFunc(item)
  const eventStatusObj = EVENT_STATUSES_WITH_TIME.find(
    (data) => data.value === eventStatus
  )

  return (
    <ItemContainer
      onClick={onClick}
      active={active}
      className={cn(
        'flex text-xs tablet:text-sm',
        classNameHeight,
        bordered ? 'border border-gray-500' : '',
        className
      )}
      noPadding
      noBorder={noBorder || bordered}
    >
      {!noStatusIcon && (
        <div
          className={cn(
            'flex w-7 items-center justify-center',
            eventStatusObj ? 'bg-' + eventStatusObj.color : 'bg-gray-400'
          )}
        >
          <FontAwesomeIcon
            className="h-6 w-6 text-white"
            icon={eventStatusObj ? eventStatusObj.icon : faGenderless}
          />
        </div>
      )}
      <div className="flex flex-1 items-center justify-between px-1 leading-4">
        <div className="flex h-full flex-col justify-evenly">
          <TextLinesLimiter
            className="-mb-[1px] font-bold text-general"
            lines={1}
          >
            {formatAddress(item?.address, 'Мероприятие')}
          </TextLinesLimiter>
        </div>
        <div className="gap-x-2 text-gray-600">
          <DateTimeEvent
            wrapperClassName="flex-1 font-bold justify-end"
            dateClassName="text-general"
            timeClassName="italic"
            durationClassName="italic font-normal"
            event={item}
            showDayOfWeek
            thin
            twoLines
          />
        </div>
      </div>
    </ItemContainer>
  )
}

export const ServiceItemFromId = ({
  serviceId,
  onClick = null,
  active = false,
  bordered = false,
}) => {
  const service = useAtomValue(serviceSelector(serviceId))
  return (
    <ServiceItem
      item={service}
      active={active}
      onClick={onClick}
      bordered={bordered}
    />
  )
}

export const ServiceItem = ({
  item,
  onClick = null,
  active = false,
  className,
  noBorder,
  style,
}) => (
  <ItemContainer
    onClick={onClick}
    active={active}
    className={cn('flex h-[50px]', className)}
    noPadding
    noBorder={noBorder}
    style={style}
  >
    <div className="px-1">
      <div className="h-5 truncate text-sm font-bold text-gray-800">
        {item.title}
      </div>
      <div className="flex items-center gap-x-2 text-xs text-gray-600">
        <TextLinesLimiter
          className="textarea w-full max-w-full flex-1 overflow-hidden leading-[0.85rem]"
          lines={2}
        >
          {item.description}
        </TextLinesLimiter>
      </div>
    </div>
  </ItemContainer>
)

