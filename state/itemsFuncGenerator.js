import { postData, putData, deleteData } from '@helpers/CRUD'
import isSiteLoadingAtom from './atoms/isSiteLoadingAtom'

import { getAtomValue, setAtomValue } from '@state/storeHelpers'
import addErrorModalSelector from './selectors/addErrorModalSelector'
import setLoadingSelector from './selectors/setLoadingSelector'
import setNotLoadingSelector from './selectors/setNotLoadingSelector'
import setErrorSelector from './selectors/setErrorSelector'
import setNotErrorSelector from './selectors/setNotErrorSelector'
import eventEditSelector from './selectors/eventEditSelector'
import eventDeleteSelector from './selectors/eventDeleteSelector'
import userDeleteSelector from './selectors/userDeleteSelector'
import userEditSelector from './selectors/userEditSelector'
import clientEditSelector from './selectors/clientEditSelector'
import clientDeleteSelector from './selectors/clientDeleteSelector'
import serviceEditSelector from './selectors/serviceEditSelector'
import serviceDeleteSelector from './selectors/serviceDeleteSelector'
import serviceGroupEditSelector from './selectors/serviceGroupEditSelector'
import serviceGroupDeleteSelector from './selectors/serviceGroupDeleteSelector'
import tariffEditSelector from './selectors/tariffEditSelector'
import tariffDeleteSelector from './selectors/tariffDeleteSelector'
import eventsAtom from './atoms/eventsAtom'
import clientsAtom from './atoms/clientsAtom'
import servicesAtom from './atoms/servicesAtom'
import serviceGroupsAtom from './atoms/serviceGroupsAtom'
import usersAtom from './atoms/usersAtom'
import tariffsAtom from './atoms/tariffsAtom'
// import siteSettingsAtom from './atoms/siteSettingsAtom'
// import questionnaireEditSelector from './selectors/questionnaireEditSelector'
// import questionnaireDeleteSelector from './selectors/questionnaireDeleteSelector'
// import questionnaireUsersEditSelector from './selectors/questionnaireUsersEditSelector'
// import questionnaireUsersDeleteSelector from './selectors/questionnaireUsersDeleteSelector'
// import serviceEditSelector from './selectors/serviceEditSelector'
// import serviceDeleteSelector from './selectors/serviceDeleteSelector'
// import servicesUsersEditSelector from './selectors/servicesUsersEditSelector'
// import servicesUsersDeleteSelector from './selectors/servicesUsersDeleteSelector'
// import setEventsUsersSelector from './async/setEventsUsersSelector'
// import signOutUserSelector from './async/signOutUserSelector'
// import signUpUserSelector from './async/signUpUserSelector'
// import setEventUserSelector from './async/setEventUserSelector'
// import rolesAtom from './atoms/rolesAtom'
// import updateEventsUsersSelector from './async/updateEventsUsersSelector'

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

const apiUrlByItemName = {
  serviceGroup: '/api/service-groups',
}

const getApiUrl = (itemName, itemId = null) => {
  const base = apiUrlByItemName[itemName] || `/api/${itemName.toLowerCase()}s`
  return itemId ? `${base}/${itemId}` : base
}

const getErrorText = (error) => {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (typeof error?.message === 'string') return error.message
  return ''
}

const buildErrorToast = (baseText, error) => {
  const details = getErrorText(error)
  if (!details || details.startsWith('HTTP ')) return baseText
  return `${baseText}: ${details}`
}

const messages = {
  event: {
    update: {
      success: 'Мероприятие обновлено',
      error: 'Не удалось обновить мероприятие',
    },
    add: {
      success: 'Мероприятие создано',
      error: 'Не удалось создать мероприятие',
    },
    delete: {
      success: 'Мероприятие удалено',
      error: 'Не удалось удалить мероприятие',
    },
  },
  client: {
    update: {
      success: 'Клиент обновлен',
      error: 'Не удалось обновить клиента',
    },
    add: {
      success: 'Клиент создан',
      error: 'Не удалось создать клиента',
    },
    delete: {
      success: 'Клиент удален',
      error: 'Не удалось удалить клиента',
    },
  },
  service: {
    update: {
      success: 'Услуга обновлена',
      error: 'Не удалось обновить услугу',
    },
    add: {
      success: 'Услуга создана',
      error: 'Не удалось создать услугу',
    },
    delete: {
      success: 'Услуга удалена',
      error: 'Не удалось удалить услугу',
    },
  },
  serviceGroup: {
    update: {
      success: 'Группа услуг обновлена',
      error: 'Не удалось обновить группу услуг',
    },
    add: {
      success: 'Группа услуг создана',
      error: 'Не удалось создать группу услуг',
    },
    delete: {
      success: 'Группа услуг удалена',
      error: 'Не удалось удалить группу услуг',
    },
  },
  user: {
    update: {
      success: 'Пользователь обновлен',
      error: 'Не удалось обновить пользователя',
    },
    add: {
      success: 'Пользователь создан',
      error: 'Не удалось создать пользователя',
    },
    delete: {
      success: 'Пользователь удален',
      error: 'Не удалось удалить пользователя',
    },
  },
  tariff: {
    update: {
      success: 'Тариф обновлен',
      error: 'Не удалось обновить тариф',
    },
    add: {
      success: 'Тариф создан',
      error: 'Не удалось создать тариф',
    },
    delete: {
      success: 'Тариф удален',
      error: 'Не удалось удалить тариф',
    },
  },
  // eventsUser: {
  //   update: {
  //     success: 'Пользователь на мероприятии обновлен',
  //     error: 'Не удалось обновить пользователя на мероприятии',
  //   },
  //   add: {
  //     success: 'Пользователь на мероприятии создан',
  //     error: 'Не удалось создать пользователя на мероприятии',
  //   },
  //   delete: {
  //     success: 'Пользователь на мероприятии удален',
  //     error: 'Не удалось удалить пользователя на мероприятии',
  //   },
  // },
  // servicesUser: {
  //   update: {
  //     success: 'Заявка на услугу обновлена',
  //     error: 'Не удалось обновить заявку на услугу',
  //   },
  //   add: {
  //     success: 'Заявка на услугу создана',
  //     error: 'Не удалось создать заявку на услугу',
  //   },
  //   delete: {
  //     success: 'Заявка на услугу удалена',
  //     error: 'Не удалось удалить заявку на услугу',
  //   },
  // },
}

const setFunc = (atom) => (value) => setAtomValue(atom, value)

const createLocalId = (itemName) =>
  `local-${itemName}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const atomByItemName = {
  event: eventsAtom,
  client: clientsAtom,
  service: servicesAtom,
  serviceGroup: serviceGroupsAtom,
  user: usersAtom,
  tariff: tariffsAtom,
}

const getCurrentItemById = (itemName, itemId) => {
  const sourceAtom = atomByItemName[itemName]
  if (!sourceAtom || !itemId) return null
  const list = getAtomValue(sourceAtom)
  if (!Array.isArray(list)) return null
  return list.find((item) => item?._id === itemId) ?? null
}

// const setFamilyFunc = (selector) => (id, value) =>
//   setRecoil(selector(id), value)

const props = {
  setLoading: setFunc(isSiteLoadingAtom),
  addErrorModal: setFunc(addErrorModalSelector),
  setLoadingCard: setFunc(setLoadingSelector),
  setNotLoadingCard: setFunc(setNotLoadingSelector),
  setErrorCard: setFunc(setErrorSelector),
  setNotErrorCard: setFunc(setNotErrorSelector),
  setEvent: setFunc(eventEditSelector),
  deleteEvent: setFunc(eventDeleteSelector),
  setClient: setFunc(clientEditSelector),
  deleteClient: setFunc(clientDeleteSelector),
  setUser: setFunc(userEditSelector),
  setTariff: setFunc(tariffEditSelector),

  // setEventsUsers: setFamilyFunc(setEventsUsersSelector),
  // updateEventsUsers: setFamilyFunc(updateEventsUsersSelector),
  // deleteEventsUser: setFunc(signOutUserSelector),
  // addEventsUser: setFunc(signUpUserSelector),
  // setEventsUser: setFunc(setEventUserSelector),

  // setSiteSettings: setFunc(siteSettingsAtom),
  // setQuestionnaire: setFunc(questionnaireEditSelector),
  // deleteQuestionnaire: setFunc(questionnaireDeleteSelector),
  // setQuestionnaireUsers: setFunc(questionnaireUsersEditSelector),
  // deleteQuestionnaireUsers: setFunc(questionnaireUsersDeleteSelector),
  setService: setFunc(serviceEditSelector),
  deleteService: setFunc(serviceDeleteSelector),
  setServiceGroup: setFunc(serviceGroupEditSelector),
  deleteServiceGroup: setFunc(serviceGroupDeleteSelector),
  deleteUser: setFunc(userDeleteSelector),
  deleteTariff: setFunc(tariffDeleteSelector),
  // setServicesUser: setFunc(servicesUsersEditSelector),
  // deleteServicesUser: setFunc(servicesUsersDeleteSelector),
  // setRoles: setFunc(rolesAtom),
}

const itemsFuncGenerator = (
  snackbar,
  loggedUser,
  options = {},
  array = [
    'event',
    'client',
    'service',
    'serviceGroup',
    'user',
    'tariff',
    // 'eventsUser',
    // 'user',
    // 'questionnaire',
    // 'questionnairesUser',
    // 'service',
    // 'eventsUser',
    // 'servicesUser',
    // 'eventsTag',
  ]
) => {
  const disableServerSync = Boolean(options?.disableServerSync)
  const eventActions = options?.eventActions
  const clientActions = options?.clientActions
  const {
    setLoadingCard,
    setNotLoadingCard,
    setErrorCard,
    // setNotErrorCard,
    addErrorModal,
    // snackbar = {},
  } = props
  const obj = {}
  array?.length > 0 &&
    array.forEach((itemName) => {
      obj[itemName] = {
        set: async (item, clone, noSnackbar) => {
          if (disableServerSync) {
            const localId =
              item?._id && !clone ? item._id : createLocalId(itemName)
            const prevItem =
              item?._id && !clone
                ? getCurrentItemById(itemName, item._id)
                : null
            const localItem = {
              ...(prevItem ?? {}),
              ...item,
              _id: localId,
              _localOnly: true,
              _localUpdatedAt: new Date().toISOString(),
            }
            if (item?._id && !clone) setLoadingCard(itemName + item._id)
            props['set' + capitalizeFirstLetter(itemName)](localItem)
            if (item?._id && !clone) setNotLoadingCard(itemName + item._id)
            if (!noSnackbar) {
              const message =
                item?._id && !clone
                  ? `${messages[itemName]?.update?.success || 'Изменение сохранено'} (локально)`
                  : `${messages[itemName]?.add?.success || 'Элемент создан'} (локально)`
              snackbar.success(message)
            }
            return localItem
          }

          const serverActions =
            itemName === 'event'
              ? eventActions
              : itemName === 'client'
                ? clientActions
                : itemName === 'service'
                  ? options?.serviceActions
                  : itemName === 'serviceGroup'
                    ? options?.serviceGroupActions
                    : null

          if (serverActions?.set) {
            const isUpdate = Boolean(item?._id && !clone)
            if (isUpdate) setLoadingCard(itemName + item._id)
            try {
              const data = await serverActions.set(item, clone)
              if (itemName === 'service') props.setService(data)
              if (isUpdate) setNotLoadingCard(itemName + item._id)
              if (!noSnackbar) {
                const message = isUpdate
                  ? messages[itemName]?.update?.success
                  : messages[itemName]?.add?.success
                if (message) snackbar.success(message)
              }
              return data
            } catch (error) {
              if (!noSnackbar) {
                const message = isUpdate
                  ? messages[itemName]?.update?.error
                  : messages[itemName]?.add?.error
                if (message) snackbar.error(buildErrorToast(message, error))
              }
              setErrorCard(itemName + item?._id)
              const data = {
                errorPlace: isUpdate ? 'UPDATE ERROR' : 'CREATE ERROR',
                itemName,
                item,
                error,
              }
              addErrorModal(data)
              console.log(data)
              return null
            }
          }

          if (item?._id && !clone) {
            setLoadingCard(itemName + item._id)
            return await putData(
              getApiUrl(itemName, item._id),
              item,
              (data) => {
                setNotLoadingCard(itemName + item._id)
                if (!noSnackbar && messages[itemName]?.update?.success)
                  snackbar.success(messages[itemName].update.success)
                props['set' + capitalizeFirstLetter(itemName)](data)
                // setEvent(data)
              },
              (error) => {
                if (!noSnackbar && messages[itemName]?.update?.error)
                  snackbar.error(
                    buildErrorToast(messages[itemName].update.error, error)
                  )
                setErrorCard(itemName + item._id)
                const data = {
                  errorPlace: 'UPDATE ERROR',
                  itemName,
                  item,
                  error,
                }
                addErrorModal(data)
              },
              false,
              loggedUser?._id
            )
          } else {
            const clearedItem = { ...item }
            delete clearedItem._id
            return await postData(
              getApiUrl(itemName),
              clearedItem,
              (data) => {
                if (!noSnackbar && messages[itemName]?.add?.success)
                  snackbar.success(messages[itemName].add.success)
                props['set' + capitalizeFirstLetter(itemName)](data)
                // setEvent(data)
              },
              (error) => {
                if (!noSnackbar && messages[itemName]?.add?.error)
                  snackbar.error(
                    buildErrorToast(messages[itemName].add.error, error)
                  )
                setErrorCard(itemName + item._id)
                const data = {
                  errorPlace: 'CREATE ERROR',
                  itemName,
                  item,
                  error,
                }
                addErrorModal(data)
                console.log(data)
              },
              false,
              loggedUser?._id
            )
          }
        },
        delete: async (itemId) => {
          if (disableServerSync) {
            setLoadingCard(itemName + itemId)
            props['delete' + capitalizeFirstLetter(itemName)](itemId)
            setNotLoadingCard(itemName + itemId)
            if (messages[itemName]?.delete?.success)
              snackbar.success(
                `${messages[itemName].delete.success} (локально)`
              )
            return true
          }
          const serverActions =
            itemName === 'event'
              ? eventActions
              : itemName === 'client'
                ? clientActions
                : itemName === 'service'
                  ? options?.serviceActions
                  : itemName === 'serviceGroup'
                    ? options?.serviceGroupActions
                    : null

          if (serverActions?.delete) {
            setLoadingCard(itemName + itemId)
            try {
              await serverActions.delete(itemId)
              if (itemName === 'service') {
                props.deleteService(itemId)
              }
              if (itemName === 'serviceGroup') {
                props.deleteServiceGroup(itemId)
              }
              setNotLoadingCard(itemName + itemId)
              if (messages[itemName]?.delete?.success)
                snackbar.success(messages[itemName].delete.success)
              return true
            } catch (error) {
              if (messages[itemName]?.delete?.error)
                snackbar.error(
                  buildErrorToast(messages[itemName].delete.error, error)
                )
              setErrorCard(itemName + itemId)
              const data = {
                errorPlace: 'DELETE ERROR',
                itemName,
                itemId,
                error,
              }
              addErrorModal(data)
              console.log(data)
              return false
            }
          }
          setLoadingCard(itemName + itemId)
          return await deleteData(
            getApiUrl(itemName, itemId),
            () => {
              setNotLoadingCard(itemName + itemId)
              if (messages[itemName]?.delete?.success)
                snackbar.success(messages[itemName].delete.success)
              props['delete' + capitalizeFirstLetter(itemName)](itemId)
            },
            (error) => {
              setNotLoadingCard(itemName + itemId)
              if (messages[itemName]?.delete?.error)
                snackbar.error(
                  buildErrorToast(messages[itemName].delete.error, error)
                )
              setErrorCard(itemName + itemId)
              const data = {
                errorPlace: 'DELETE ERROR',
                itemName,
                itemId,
                error,
              }
              addErrorModal(data)
              console.log(data)
            },
            false,
            loggedUser?._id
            //  deleteEvent(itemId)
          )
        },
      }
    })

  obj.event.cancel = async (eventId) => {
    if (disableServerSync) {
      const prevEvent = getCurrentItemById('event', eventId) ?? {}
      setLoadingCard('event' + eventId)
      props.setEvent({
        ...prevEvent,
        _id: prevEvent?._id || eventId,
        status: 'canceled',
        _localOnly: true,
        _localUpdatedAt: new Date().toISOString(),
      })
      setNotLoadingCard('event' + eventId)
      snackbar.success('Мероприятие отменено (локально)')
      return true
    }

    setLoadingCard('event' + eventId)
    if (eventActions?.updateStatus) {
      try {
        const data = await eventActions.updateStatus(eventId, 'canceled')
        snackbar.success('Мероприятие отменено')
        setNotLoadingCard('event' + eventId)
        return data
      } catch (error) {
        snackbar.error(
          buildErrorToast('Не удалось отменить мероприятие', error)
        )
        setErrorCard('event' + eventId)
        const data = { errorPlace: 'EVENT CANCEL ERROR', eventId, error }
        addErrorModal(data)
        console.log(data)
        return null
      }
    }
    return await putData(
      `/api/events/${eventId}`,
      { status: 'canceled' },
      (data) => {
        snackbar.success('Мероприятие отменено')
        setNotLoadingCard('event' + eventId)
        props.setEvent(data)
      },
      (error) => {
        snackbar.error(
          buildErrorToast('Не удалось отменить мероприятие', error)
        )
        setErrorCard('event' + eventId)
        const data = { errorPlace: 'EVENT CANCEL ERROR', eventId, error }
        addErrorModal(data)
        console.log(data)
      },
      false,
      loggedUser?._id
    )
  }

  obj.event.close = async (eventId) => {
    if (disableServerSync) {
      const prevEvent = getCurrentItemById('event', eventId) ?? {}
      setLoadingCard('event' + eventId)
      props.setEvent({
        ...prevEvent,
        _id: prevEvent?._id || eventId,
        status: 'closed',
        _localOnly: true,
        _localUpdatedAt: new Date().toISOString(),
      })
      setNotLoadingCard('event' + eventId)
      snackbar.success('Мероприятие закрыто (локально)')
      return true
    }

    setLoadingCard('event' + eventId)
    if (eventActions?.updateStatus) {
      try {
        const data = await eventActions.updateStatus(eventId, 'closed')
        snackbar.success('Мероприятие закрыто')
        setNotLoadingCard('event' + eventId)
        return data
      } catch (error) {
        snackbar.error(buildErrorToast('Не удалось закрыть мероприятие', error))
        setErrorCard('event' + eventId)
        const data = { errorPlace: 'EVENT CLOSE ERROR', eventId, error }
        addErrorModal(data)
        console.log(data)
        return null
      }
    }
    return await putData(
      `/api/events/${eventId}`,
      { status: 'closed' },
      (data) => {
        snackbar.success('Мероприятие закрыто')
        setNotLoadingCard('event' + eventId)
        props.setEvent(data)
      },
      (error) => {
        snackbar.error(buildErrorToast('Не удалось закрыть мероприятие', error))
        setErrorCard('event' + eventId)
        const data = { errorPlace: 'EVENT CLOSE ERROR', eventId, error }
        addErrorModal(data)
        console.log(data)
      },
      false,
      loggedUser?._id
    )
  }
  // obj.roles = {}
  // obj.roles.update = async (roles) => {
  //   return await postData(
  //     `/api/roles`,
  //     roles,
  //     (data) => {
  //       snackbar.success('Роли обновлены')
  //       props.setRoles(data)
  //     },
  //     (error) => {
  //       snackbar.error('Не удалось обновить роли')
  //       const data = { errorPlace: 'ROLES UPDATE ERROR', roles, error }
  //       addErrorModal(data)
  //       console.log(data)
  //     },
  //     false,
  //     loggedUser?._id
  //   )
  // }

  obj.event.uncancel = async (eventId) => {
    if (disableServerSync) {
      const prevEvent = getCurrentItemById('event', eventId) ?? {}
      setLoadingCard('event' + eventId)
      props.setEvent({
        ...prevEvent,
        _id: prevEvent?._id || eventId,
        status: 'active',
        _localOnly: true,
        _localUpdatedAt: new Date().toISOString(),
      })
      setNotLoadingCard('event' + eventId)
      snackbar.success('Мероприятие активировано (локально)')
      return true
    }

    setLoadingCard('event' + eventId)
    if (eventActions?.updateStatus) {
      try {
        const data = await eventActions.updateStatus(eventId, 'active')
        snackbar.success('Мероприятие активировано')
        setNotLoadingCard('event' + eventId)
        return data
      } catch (error) {
        snackbar.error(
          buildErrorToast('Не удалось активировать мероприятие', error)
        )
        setErrorCard('event' + eventId)
        const data = { errorPlace: 'EVENT ACTIVE ERROR', eventId, error }
        addErrorModal(data)
        console.log(data)
        return null
      }
    }
    return await putData(
      `/api/events/${eventId}`,
      { status: 'active' },
      (data) => {
        snackbar.success('Мероприятие активировано')
        setNotLoadingCard('event' + eventId)
        props.setEvent(data)
      },
      (error) => {
        snackbar.error(
          buildErrorToast('Не удалось активировать мероприятие', error)
        )
        setErrorCard('event' + eventId)
        const data = { errorPlace: 'EVENT ACTIVE ERROR', eventId, error }
        addErrorModal(data)
        console.log(data)
      },
      false,
      loggedUser?._id
    )
  }

  return obj
}

export default itemsFuncGenerator
