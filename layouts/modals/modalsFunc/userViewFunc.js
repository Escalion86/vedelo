import CardButtons from '@components/CardButtons'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import FormWrapper from '@components/FormWrapper'
import ImageGallery from '@components/ImageGallery'
import TextLine from '@components/TextLine'
import UserName from '@components/UserName'
import UserCard from '@layouts/cards/UserCard'
import { USERS_ROLES } from '@helpers/constants'
import formatDate from '@helpers/formatDate'
import loggedUserActiveRoleSelector from '@state/selectors/loggedUserActiveRoleSelector'
import userSelector from '@state/selectors/userSelector'
import usersAtom from '@state/atoms/usersAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { useEffect, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import {
  formatRegistrationSource,
  getUserRegistrationSource,
} from '@helpers/registrationSource.mjs'
import Button from '@components/Button'
import Notice from '@components/Notice'
import switchImpersonation from '@helpers/switchImpersonation'
import { faUserSecret } from '@fortawesome/free-solid-svg-icons'

const LoginAsUserButton = ({ userId }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      await switchImpersonation({ targetUserId: userId })
    } catch (switchError) {
      setError(
        switchError?.message || 'Не удалось войти в кабинет пользователя'
      )
      setLoading(false)
    }
  }

  return (
    <div className="mt-4">
      <Button
        name="Войти в кабинет пользователя"
        icon={faUserSecret}
        loading={loading}
        onClick={handleClick}
        className="w-full"
      />
      {error ? (
        <Notice tone="error" role="alert" className="mt-2 text-sm">
          {error}
        </Notice>
      ) : null}
    </div>
  )
}

const CardButtonsComponent = ({ user }) => (
  <CardButtons
    item={user}
    typeOfItem="user"
    minimalActions
    alwaysCompact
    dropDownPlacement="left"
  />
)

const userViewFunc = (userId, params = {}) => {
  const UserModal = ({ closeModal, setTopLeftComponent }) => {
    const loggedUserActiveRole = useAtomValue(loggedUserActiveRoleSelector)
    const loggedUser = useAtomValue(loggedUserAtom)
    const isLoggedUserDev = loggedUserActiveRole?.dev

    const user = useAtomValue(userSelector(userId))
    const users = useAtomValue(usersAtom)
    const tariffs = useAtomValue(tariffsAtom)

    useEffect(() => {
      if (!user) closeModal()
    }, [closeModal, user])

    useEffect(() => {
      if (setTopLeftComponent)
        setTopLeftComponent(() => <CardButtonsComponent user={user} />)
    }, [setTopLeftComponent, user])

    const tariffInfo = useMemo(() => {
      if (!user?.tariffId) return 'Не выбран'
      const tariff = tariffs.find(
        (item) => String(item?._id) === String(user.tariffId)
      )
      const title = tariff?.title || 'Тариф'
      if (!user?.tariffActiveUntil) return title
      const date = new Date(user.tariffActiveUntil)
      if (Number.isNaN(date.getTime())) return title
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()
      return `${title} (${day}.${month}.${year})`
    }, [tariffs, user?.tariffId, user?.tariffActiveUntil])

    const formattedBalance = useMemo(() => {
      const value = Number(user?.balance ?? 0)
      if (!Number.isFinite(value)) return '0'
      return value.toLocaleString('ru-RU')
    }, [user?.balance])

    const roleLabel = useMemo(() => {
      const roleValue = user?.role
      return (
        USERS_ROLES.find((item) => item.value === roleValue)?.name ||
        roleValue ||
        '[не указано]'
      )
    }, [user?.role])

    const eventsCount = Number(user?.eventsCount ?? 0)
    const requestsCount = Number(user?.requestsCount ?? 0)
    const referrer = useMemo(
      () =>
        user?.referrerId
          ? users.find((item) => String(item?._id) === String(user.referrerId))
          : null,
      [user?.referrerId, users]
    )
    const referrals = useMemo(
      () =>
        users.filter(
          (item) => String(item?.referrerId ?? '') === String(user?._id ?? '')
        ),
      [user?._id, users]
    )

    if (!user) return null

    return (
      <FormWrapper flex className="flex-col">
        <ImageGallery images={user?.images} />
        <div className="mt-1 flex flex-1 flex-col">
          <div className="relative mb-1 flex min-h-6 items-center gap-x-2">
            {/* {user.status === 'member' && (
              <Tooltip title="Участник клуба">
                <div className="w-6 h-6">
                  <Image
                    src="/img/svg_icons/medal.svg"
                    width="24"
                    height="24"
                  />
                </div>
              </Tooltip>
            )} */}
            <UserName user={user} className="text-lg font-bold" />
            {!setTopLeftComponent && (
              <div className="absolute right-0">
                <CardButtonsComponent user={user} />
              </div>
            )}
          </div>
          {user.personalStatus && (
            <div className="text-general pt-1 pb-3 text-sm leading-[15px] font-normal italic">
              {user.personalStatus}
            </div>
          )}
          {isLoggedUserDev && <TextLine label="ID">{user?._id}</TextLine>}
          {isLoggedUserDev && String(loggedUser?._id) !== String(user._id) && (
            <LoginAsUserButton userId={user._id} />
          )}
          <TextLine label="Роль">{roleLabel}</TextLine>
          <TextLine label="Тариф">{tariffInfo}</TextLine>
          <TextLine label="Баланс">{formattedBalance} руб.</TextLine>
          <TextLine label="Создано мероприятий">{eventsCount}</TextLine>
          <TextLine label="Создано заявок">{requestsCount}</TextLine>
          <ContactsIconsButtons
            user={user}
            withTitle
            grid
            forceShowAll={params?.showContacts}
          />
          <TextLine label="Дата регистрации">
            {formatDate(user.createdAt)}
          </TextLine>
          <TextLine label="Источник регистрации">
            {formatRegistrationSource(getUserRegistrationSource(user))}
          </TextLine>
          <div className="mt-4 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-800">Реферер</h3>
            {referrer ? (
              <div className="mt-2">
                <UserCard userId={referrer._id} user={referrer} />
              </div>
            ) : (
              <div className="mt-1 text-sm text-gray-500">Нет реферера</div>
            )}
          </div>
          <div className="mt-4 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-800">
              Рефералы ({referrals.length})
            </h3>
            {referrals.length > 0 ? (
              <div className="mt-2 grid gap-3">
                {referrals.map((referral) => (
                  <UserCard
                    key={referral._id}
                    userId={referral._id}
                    user={referral}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-1 text-sm text-gray-500">Нет рефералов</div>
            )}
          </div>
        </div>
      </FormWrapper>
    )
  }

  return {
    title: `Профиль пользователя`,
    declineButtonName: 'Закрыть',
    closeButtonShow: true,
    Children: UserModal,
    // TopLeftComponent: () => {
    //   return (
    //   <CardButtons id={userId} typeOfItem="user" forForm direction="right" />
    // )},
  }
}

export default userViewFunc
