'use client'

// import Fab from '@components/Fab'
// import FabMenu from '@components/FabMenu'
// import LoadingSpinner from '@components/LoadingSpinner'
import StateLoader from '@components/StateLoader'
import { CONTENTS } from '@layouts/content/contentsMap'
// import isUserQuestionnaireFilled from '@helpers/isUserQuestionnaireFilled'
import BurgerLayout from '@layouts/BurgerLayout'
import CabinetHeader from '@layouts/CabinetHeader'
import CabinetWrapper from '@layouts/wrappers/CabinetWrapper'
import ContentWrapper from '@layouts/wrappers/ContentWrapper'
// import fetchProps from '@server/fetchProps'
// import loggedUserActiveStatusAtom from '@state/atoms/loggedUserActiveStatusAtom'
// import loggedUserAtom from '@state/atoms/loggedUserAtom'
// import loggedUserActiveRoleSelector from '@state/selectors/loggedUserActiveRoleSelector'
// import { getSession } from 'next-auth/react'
// import { useRouter } from 'next/router'
import { Provider } from 'jotai'
import store from '@state/store'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import RegistrationOfferBanner from '@components/RegistrationOfferBanner'
import DomainMigrationBanner from '@components/DomainMigrationBanner'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'
// import { useAtomValue } from 'jotai'

// const SuspenseChild = () => (
//   <div className="z-10 flex h-[calc(100vh-4rem)] w-full items-center justify-center">
//     <LoadingSpinner text="идет загрузка...." />
//   </div>
// )

function CabinetPage(props) {
  const { page } = props
  const pathname = usePathname()

  const pageFromPath = useMemo(() => {
    const parts = pathname?.split('/').filter(Boolean) || []
    return parts[parts.length - 1] || null
  }, [pathname])

  const currentPage = page || pageFromPath || 'eventsUpcoming'
  const [headerCountState, setHeaderCountState] = useState({
    page: null,
    count: null,
  })

  const handleHeaderCountChange = useCallback(
    (count) => {
      setHeaderCountState((current) => {
        if (current.page === currentPage && current.count === count) {
          return current
        }
        return { page: currentPage, count }
      })
    },
    [currentPage]
  )

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme')
    document.body.classList.toggle('theme-dark', storedTheme === 'dark')
  }, [])
  // const router = useRouter()
  // const page = router.asPath.replace('/cabinet/', '').split('?')[0]
  // const loggedUser = useAtomValue(loggedUserAtom)
  // const loggedUserActiveRole = useAtomValue(loggedUserActiveRoleSelector)
  // const loggedUserActiveStatusName = useAtomValue(loggedUserActiveStatusAtom)
  // const showFab = !loggedUserActiveRole?.hideFab || page === 'settingsFabMenu'

  // let redirect
  // if (!props.loggedUser) redirect = '/'

  // // Ограничиваем пользователям доступ к страницам
  // useEffect(() => {
  //   if (redirect) router.push(redirect, '', { shallow: true })
  // }, [redirect])

  // if (redirect) return null

  const Component = CONTENTS[currentPage]
    ? CONTENTS[currentPage].Component
    : () => <div className="flex justify-center px-2">Ошибка 404</div>

  const workItemTerms = resolveWorkItemTerminology(props.siteSettings)
  const title =
    currentPage === 'eventsUpcoming'
      ? `Предстоящие ${workItemTerms.plural}`
      : currentPage === 'eventsPast'
        ? `Прошедшие ${workItemTerms.plural}`
        : currentPage === 'events'
          ? workItemTerms.pluralCapitalized
          : CONTENTS[currentPage]?.name || ''
  const headerCount =
    headerCountState.page === currentPage ? headerCountState.count : null

  return (
    <>
      {/* <button onClick={() => signOut()}>SignOut</button> */}
      <Provider store={store}>
        <StateLoader {...props}>
          {/* {loggedUser && ( */}
          <CabinetWrapper>
            <CabinetHeader title={title} count={headerCount} />
            <BurgerLayout />
            <ContentWrapper page={currentPage}>
              <DomainMigrationBanner />
              <RegistrationOfferBanner user={props.loggedUser} />
              <Component
                {...props}
                onHeaderCountChange={handleHeaderCountChange}
              />
              {/* {!redirect && (
                <Suspense fallback={<SuspenseChild />}>
                  <Component {...props} />
                </Suspense>
              )} */}
            </ContentWrapper>
            {/* <FabMenu show={showFab} /> */}
          </CabinetWrapper>
          {/* )} */}
        </StateLoader>
      </Provider>
    </>
  )
}

export default CabinetPage
