'use client'

import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { useQueryClient } from '@tanstack/react-query'
import clientsAtom from '@state/atoms/clientsAtom'
import eventsAtom from '@state/atoms/eventsAtom'
import isSiteLoadingAtom from '@state/atoms/isSiteLoadingAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import newsAtom from '@state/atoms/newsAtom'
import servicesAtom from '@state/atoms/servicesAtom'
import serviceGroupsAtom from '@state/atoms/serviceGroupsAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import transactionsAtom from '@state/atoms/transactionsAtom'
import usersAtom from '@state/atoms/usersAtom'
import { queryKeys } from '@helpers/queryKeys'
import { useServiceGroupsQuery } from '@helpers/useEntityQueries'
import {
  buildEventsQueryPayload,
  resolveCabinetEventsScope,
} from '@helpers/cabinetStateHydration.mjs'

const useCabinetStateHydration = (props) => {
  const {
    clients: initialClients,
    events: initialEvents,
    eventsPaging,
    loggedUser: initialLoggedUser,
    news: initialNews,
    page,
    services: initialServices,
    siteSettings: initialSiteSettings,
    tariffs: initialTariffs,
    transactions: initialTransactions,
    users: initialUsers,
  } = props
  const queryClient = useQueryClient()
  const setClients = useSetAtom(clientsAtom)
  const setEvents = useSetAtom(eventsAtom)
  const setIsSiteLoading = useSetAtom(isSiteLoadingAtom)
  const setLoggedUser = useSetAtom(loggedUserAtom)
  const setNews = useSetAtom(newsAtom)
  const setServices = useSetAtom(servicesAtom)
  const setServiceGroups = useSetAtom(serviceGroupsAtom)
  const setSiteSettings = useSetAtom(siteSettingsAtom)
  const setTariffs = useSetAtom(tariffsAtom)
  const setTransactions = useSetAtom(transactionsAtom)
  const setUsers = useSetAtom(usersAtom)
  const { data: serviceGroups = [] } = useServiceGroupsQuery()

  useEffect(() => {
    setServiceGroups(serviceGroups)
  }, [serviceGroups, setServiceGroups])

  useEffect(() => {
    const events = Array.isArray(initialEvents) ? initialEvents : []
    const clients = Array.isArray(initialClients) ? initialClients : []
    const transactions = Array.isArray(initialTransactions)
      ? initialTransactions
      : []
    const services = Array.isArray(initialServices) ? initialServices : []
    const tariffs = Array.isArray(initialTariffs) ? initialTariffs : []
    const users = Array.isArray(initialUsers) ? initialUsers : []
    const news = Array.isArray(initialNews) ? initialNews : []
    const eventsScope = resolveCabinetEventsScope({ page, eventsPaging })
    const eventsQueryPayload = buildEventsQueryPayload({
      events: initialEvents,
      eventsPaging,
    })

    setLoggedUser(initialLoggedUser ?? null)
    setEvents(events)
    setClients(clients)
    setTransactions(transactions)
    setServices(services)
    setTariffs(tariffs)
    setUsers(users)
    setSiteSettings(initialSiteSettings ?? {})
    setNews(news)

    queryClient.setQueryData(
      queryKeys.events({ scope: eventsScope }),
      eventsQueryPayload
    )
    queryClient.setQueryData(
      queryKeys.events({ scope: 'all' }),
      eventsQueryPayload
    )
    events.forEach((event) => {
      if (event?._id)
        queryClient.setQueryData(queryKeys.event(event._id), event)
    })
    queryClient.setQueryData(queryKeys.clients(), clients)
    queryClient.setQueryData(queryKeys.transactionsAll, transactions)
    // Пустой список услуг на страницах, которые их не загружают, не должен
    // попадать в кэш: свежие (staleTime) пустые данные блокируют запрос
    // /api/services и каталог услуг остаётся пустым до перезагрузки.
    if (Array.isArray(services) && services.length) {
      queryClient.setQueryData(queryKeys.services(), services)
    }
    queryClient.setQueryData(queryKeys.tariffs(), tariffs)
    queryClient.setQueryData(queryKeys.users(), users)
    queryClient.setQueryData(queryKeys.siteSettings, initialSiteSettings ?? {})
    if (initialLoggedUser) {
      queryClient.setQueryData(queryKeys.loggedUser, initialLoggedUser)
    }
    queryClient.setQueryData(queryKeys.statistics(), {
      events,
      clients,
      services,
      transactions,
      filters: {},
    })
    setIsSiteLoading(false)
  }, [
    eventsPaging,
    initialClients,
    initialEvents,
    initialLoggedUser,
    initialNews,
    initialServices,
    initialSiteSettings,
    initialTariffs,
    initialTransactions,
    initialUsers,
    page,
    queryClient,
    setClients,
    setEvents,
    setIsSiteLoading,
    setLoggedUser,
    setNews,
    setServices,
    setSiteSettings,
    setTariffs,
    setTransactions,
    setUsers,
  ])
}

export default useCabinetStateHydration
