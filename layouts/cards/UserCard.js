/* eslint-disable @next/next/no-img-element */
'use client'

import CardButtons from '@components/CardButtons'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import CardOverlay from '@components/CardOverlay'
import CardActions from '@components/CardActions'
import UserName from '@components/UserName'
import getUserAvatarSrc from '@helpers/getUserAvatarSrc'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import userSelector from '@state/selectors/userSelector'
import { useAtomValue } from 'jotai'
import tariffsAtom from '@state/atoms/tariffsAtom'
import formatDate from '@helpers/formatDate'
import CardWrapper from '@components/CardWrapper'
import {
  formatRegistrationSource,
  getUserRegistrationSource,
} from '@helpers/registrationSource.mjs'

const UserCard = ({ userId, user: userProp, hidden = false, style }) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const selectedUser = useAtomValue(userSelector(userId))
  const user = userProp ?? selectedUser
  const loading = useAtomValue(loadingAtom('user' + userId))
  const error = useAtomValue(errorAtom('user' + userId))
  const tariffs = useAtomValue(tariffsAtom)
  // const widthNum = useWindowDimensionsTailwindNum()
  // const itemFunc = useAtomValue(itemsFuncAtom)

  // const userStatusArr = USERS_STATUSES.find(
  //   (userStatus) => userStatus.value === user.status
  // )

  const tariffTitle = (() => {
    if (!user?.tariffId) return 'Не выбран'
    const tariff = tariffs.find(
      (item) => String(item?._id) === String(user.tariffId)
    )
    return tariff?.title || 'Не выбран'
  })()

  const tariffPaidUntil = (() => {
    if (!user?.tariffActiveUntil) return null
    const date = new Date(user.tariffActiveUntil)
    if (Number.isNaN(date.getTime())) return null
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  })()

  const formattedBalance = (() => {
    const value = Number(user?.balance ?? 0)
    if (!Number.isFinite(value)) return '0'
    return value.toLocaleString('ru-RU')
  })()

  const eventsCount = Number(user?.eventsCount ?? 0)
  const requestsCount = Number(user?.requestsCount ?? 0)

  const registrationLabel = user?.createdAt
    ? formatDate(user.createdAt, false, true)
    : 'Не указана'

  if (!user) return null

  return (
    <CardWrapper
      style={style}
      onClick={() => !loading && modalsFunc.user.view(user._id)}
      onSwipeLeft={() => !loading && modalsFunc.user?.edit(user._id)}
      onSwipeRight={() => !loading && modalsFunc.user?.delete(user._id)}
      className="card-body-pad flex h-full w-full cursor-pointer py-3 pr-3 pl-4 text-left hover:border-gray-300"
    >
      <CardOverlay loading={loading} error={error} rounded />
      <CardActions>
        <CardButtons
          item={user}
          compactTriggerClassName="card-menu-trigger h-10 min-h-10 w-10"
          typeOfItem="user"
          minimalActions
          alwaysCompact
        />
      </CardActions>
      <div className="flex h-full w-full min-w-0 flex-col">
        <div className="flex min-h-11 min-w-0 shrink-0 items-center border-b border-gray-200 pr-12 pb-2">
          <UserName
            user={user}
            className="card-title min-w-0 flex-1 truncate text-base"
          />
        </div>

        <div className="flex min-h-[106px] flex-1 shrink-0 items-center gap-3 py-3">
          <img
            className="h-14 w-14 min-w-14 rounded-lg object-cover"
            src={getUserAvatarSrc(user)}
            alt="user"
          />
          <div className="grid min-w-0 flex-1 grid-cols-2 content-center gap-x-3 gap-y-1.5">
            <div className="card-meta truncate text-xs font-semibold">
              Тариф: {tariffTitle}
              {tariffPaidUntil ? ` (${tariffPaidUntil})` : ''}
            </div>
            <div className="card-meta truncate text-xs font-semibold">
              Баланс: {formattedBalance} руб.
            </div>
            <div className="card-meta truncate text-xs font-semibold">
              Мероприятия: {eventsCount}
            </div>
            <div className="card-meta truncate text-xs font-semibold">
              Заявки: {requestsCount}
            </div>
            <div className="card-meta col-span-2 truncate text-xs font-semibold">
              Дата регистрации: {registrationLabel}
            </div>
            <div
              className="card-meta col-span-2 text-xs font-semibold"
              title="Последнее добавление, изменение или удаление по журналу действий. Время вашего устройства."
            >
              Последняя активность:{' '}
              <span className="whitespace-nowrap">
                {user.lastMutationAt
                  ? new Date(user.lastMutationAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Нет данных'}
              </span>
            </div>
            <div className="card-meta col-span-2 truncate text-xs font-semibold">
              Источник:{' '}
              {formatRegistrationSource(getUserRegistrationSource(user))}
            </div>
          </div>
        </div>

        <div className="flex min-h-10 shrink-0 items-center justify-end border-t border-gray-200 pt-2">
          <div onClick={(event) => event.stopPropagation()}>
            <ContactsIconsButtons
              user={user}
              compactButtons
              className="my-0 justify-end"
            />
          </div>
        </div>
      </div>
    </CardWrapper>
  )
}

export default UserCard
