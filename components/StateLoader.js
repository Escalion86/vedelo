import { useAtom, useAtomValue, useSetAtom } from 'jotai'

import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { useEffect, useRef } from 'react'
import LoadingSpinner from '@components/LoadingSpinner'
import ModalsPortal from '@layouts/modals/ModalsPortal'
import isSiteLoadingAtom from '@state/atoms/isSiteLoadingAtom'
import cn from 'classnames'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useWindowDimensionsRecoil } from '@helpers/useWindowDimensions'
import { modalsFuncAtom } from '@state/atoms'
import modalsFuncGenerator from '@layouts/modals/modalsFuncGenerator'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import itemsFuncGenerator from '@state/itemsFuncGenerator'
import useSnackbar from '@helpers/useSnackbar'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import { pages } from '@helpers/constants'
import isPageAllowedForRole from '@helpers/pageAccess'
import { resolveServerSyncDisabled } from '@helpers/serverSyncMode'
import { sendClientLog } from '@helpers/clientLog'
import { useEventActions } from '@helpers/useEventsQuery'
import { useClientActions } from '@helpers/useClientsQuery'
import {
  useServiceActions,
  useServiceGroupActions,
} from '@helpers/useEntityQueries'
import { isPushSupported, syncPushSubscription } from '@helpers/pushClient'
import useCabinetPerformanceMetrics from '@helpers/useCabinetPerformanceMetrics'
import { shouldOpenFirstRunWizard } from '@helpers/firstRunWizard.mjs'
import useCabinetStateHydration from '@helpers/useCabinetStateHydration'
import useServerSync from '@helpers/useServerSync'
import { reachGoalOnce } from '@helpers/metrikaGoals'

const StateLoader = (props) => {
  if (props.error && Object.keys(props.error).length > 0)
    console.log('props.error', props.error)

  const snackbar = useSnackbar()

  const router = useRouter()
  const queryClient = useQueryClient()

  const [modalFunc, setModalsFunc] = useAtom(modalsFuncAtom)

  const isSiteLoading = useAtomValue(isSiteLoadingAtom)

  // const [mode, setMode] = useAtom(modeAtom)

  const loggedUser = useAtomValue(loggedUserAtom)
  const siteSettingsState = useAtomValue(siteSettingsAtom)

  const setItemsFunc = useSetAtom(itemsFuncAtom)
  const serverSyncDisabled = resolveServerSyncDisabled(siteSettingsState)
  const eventActions = useEventActions()
  const clientActions = useClientActions()
  const serviceActions = useServiceActions()
  const serviceGroupActions = useServiceGroupActions()

  useCabinetStateHydration(props)
  useServerSync({ queryClient, serverSyncDisabled, snackbar })

  useWindowDimensionsRecoil()

  const customSettings = siteSettingsState?.custom
  const isTenantPushEnabled =
    (typeof customSettings?.get === 'function'
      ? customSettings.get('publicLeadPushEnabled')
      : customSettings?.publicLeadPushEnabled) === true

  useCabinetPerformanceMetrics({
    page: props.page,
    events: props.events,
    clients: props.clients,
    transactions: props.transactions,
    services: props.services,
    tariffs: props.tariffs,
    users: props.users,
    eventsPaging: props.eventsPaging,
    isSiteLoading,
  })

  useEffect(() => {
    const itemsFunc = itemsFuncGenerator(snackbar, loggedUser, {
      disableServerSync: serverSyncDisabled,
      eventActions,
      clientActions,
      serviceActions,
      serviceGroupActions,
    })
    setItemsFunc(itemsFunc)
    setModalsFunc(
      modalsFuncGenerator(
        router,
        itemsFunc,
        loggedUser,
        {
          disableServerSync: serverSyncDisabled,
          siteSettings: siteSettingsState,
        }
        // loggedUser,
        // siteSettingsState,
      )
    )
  }, [
    loggedUser,
    clientActions,
    eventActions,
    router,
    serverSyncDisabled,
    serviceActions,
    serviceGroupActions,
    setItemsFunc,
    setModalsFunc,
    snackbar,
    siteSettingsState,
  ])

  useEffect(() => {
    if (!loggedUser?._id) return
    fetch('/api/acquisition/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'cabinet_visit' }),
      keepalive: true,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (result?.activatedNow) reachGoalOnce('activation_complete')
      })
      .catch(() => null)
  }, [loggedUser?._id, props.page])

  useEffect(() => {
    if (loggedUser?.acquisitionFunnel?.paymentSucceededAt) {
      reachGoalOnce('payment_success')
    }
  }, [loggedUser?.acquisitionFunnel?.paymentSucceededAt])

  useEffect(() => {
    if (!loggedUser?._id) return
    if (!isPushSupported()) return
    if (Notification.permission !== 'granted') return
    if (!isTenantPushEnabled) return

    let cancelled = false

    const syncCurrentPushSubscription = async () => {
      try {
        if (cancelled) return
        await syncPushSubscription({
          ensureLocalSubscription: true,
        }).catch(() => null)
      } catch (error) {
        // Silent sync: user can still manage push manually from settings.
      }
    }

    syncCurrentPushSubscription()

    return () => {
      cancelled = true
    }
  }, [isTenantPushEnabled, loggedUser?._id])

  useEffect(() => {
    if (!loggedUser?._id) return
    const access = getUserTariffAccess(loggedUser, props.tariffs ?? [])
    const needsTariff = !access.trialActive && !access.hasTariff
    const allowedPages = ['tariff-select', 'tariffs']
    if (needsTariff && props.page && !allowedPages.includes(props.page)) {
      router.push('/cabinet/tariff-select')
    }
  }, [
    loggedUser,
    loggedUser?._id,
    loggedUser?.tariffId,
    props.page,
    props.tariffs,
    router,
  ])

  const onboardingShownRef = useRef(false)
  const startupErrorLoggedRef = useRef(false)

  useEffect(() => {
    if (!props.error || startupErrorLoggedRef.current) return
    startupErrorLoggedRef.current = true
    sendClientLog({
      type: 'cabinet-props-error',
      page: props.page,
      message:
        typeof props.error?.message === 'string'
          ? props.error.message
          : 'unknown',
      name: props.error?.name,
      code: props.error?.code,
      digest: props.error?.digest,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      hasLoggedUser: Boolean(props.loggedUser?._id),
      hasEvents: Array.isArray(props.events),
      eventsCount: Array.isArray(props.events) ? props.events.length : null,
    })
  }, [props.error, props.events, props.loggedUser?._id, props.page])

  useEffect(() => {
    const shouldOpen = shouldOpenFirstRunWizard({
      loggedUser,
      siteSettings: siteSettingsState,
      alreadyShown: onboardingShownRef.current,
    })

    if (shouldOpen && modalFunc?.user?.firstRunWizard) {
      onboardingShownRef.current = true
      modalFunc.user.firstRunWizard()
    }
  }, [
    loggedUser,
    siteSettingsState,
    siteSettingsState?.custom?.firstRunWizardCompleted,
    siteSettingsState?.custom?.firstRunWizardShowToken,
    modalFunc,
  ])

  useEffect(() => {
    if (!loggedUser?._id || !props.page) return
    const role = loggedUser?.role ?? 'user'
    const pageConfig = pages.find((item) => item.href === props.page)
    const isAllowed = isPageAllowedForRole(pageConfig?.accessRoles, role)
    if (!isAllowed) {
      router.push('/cabinet/eventsUpcoming')
    }
  }, [loggedUser?._id, loggedUser?.role, props.page, router])

  // Убрали авто-редирект со страницы заявок при пустом списке.

  // useEffect(() => {
  //   if (loggedUser) {
  //     postData(
  //       `/api/loginhistory`,
  //       {
  //         userId: loggedUser._id,
  //         browser: browserVer(true),
  //       },
  //       null,
  //       null,
  //       false,
  //       null,
  //       true
  //     )
  //   }
  // }, [loggedUser])

  return (
    <div className={cn('relative overflow-hidden', props.className)}>
      {isSiteLoading ? (
        <div className="h-[100dvh] w-full">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="relative w-full bg-transparent">{props.children}</div>
      )}
      <ModalsPortal />
    </div>
  )
}

export default StateLoader
