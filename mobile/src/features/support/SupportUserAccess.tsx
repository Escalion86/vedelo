import { Fragment, type PropsWithChildren } from 'react'
import { useAuth } from '../../shared/auth/AuthProvider'
import { ErrorNotice, PageHeader, Screen } from '../../shared/ui/components'
import { canUseUserSupport, SUPPORT_UNAVAILABLE_MESSAGE } from './userAccess'

export const SupportUserAccess = ({ children }: PropsWithChildren) => {
  const { user } = useAuth()
  if (!canUseUserSupport(user)) {
    return (
      <Screen>
        <PageHeader title="Обратная связь" />
        <ErrorNotice message={user?.role === 'dev'
          ? SUPPORT_UNAVAILABLE_MESSAGE
          : 'Для обращения в поддержку войдите в пользовательский аккаунт.'} />
      </Screen>
    )
  }
  return <Fragment key={`${user?.tenantId}:${user?._id}`}>{children}</Fragment>
}
