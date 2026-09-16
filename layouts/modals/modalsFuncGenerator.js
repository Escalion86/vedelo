// import goToUrlForAddEventToCalendar from '@helpers/goToUrlForAddEventToCalendar'
// import isUserQuestionnaireFilled from '@helpers/isUserQuestionnaireFilled'
import addModalSelector from '@state/selectors/addModalSelector'
import { setAtomValue } from '@state/storeHelpers'
// import copyLinkFunc from './modalsFunc/copyLinkFunc'
import cropImageFunc from './modalsFunc/cropImageFunc'
import errorFunc from './modalsFunc/errorFunc'
import eventFunc from './modalsFunc/eventFunc'
// import eventSignUpFunc from './modalsFunc/eventSignUpFunc2'
import eventStatusEditFunc from './modalsFunc/eventStatusEditFunc'
import eventViewFunc from './modalsFunc/eventViewFunc'
import eventAdditionalEventsFunc from './modalsFunc/eventAdditionalEventsFunc'
import upcomingEventsOverviewFunc from './modalsFunc/upcomingEventsOverviewFunc'
import transactionFunc from './modalsFunc/transactionFunc'
import eventsTagsFunc from './modalsFunc/eventsTagsFunc'
import townsFunc from './modalsFunc/townsFunc'
import whatsNewFunc from './modalsFunc/whatsNewFunc'
import newsFunc from './modalsFunc/newsFunc'
import eventTypesFunc from './modalsFunc/eventTypesFunc'
import artistRequisitesEditorFunc from './modalsFunc/artistRequisitesEditorFunc'
import jsonFunc from './modalsFunc/jsonFunc'
// import questionnaireConstructorFunc from './modalsFunc/questionnaireConstructorFunc'
import selectEventsFunc from './modalsFunc/selectEventsFunc'
// import selectServicesFunc from './modalsFunc/selectServicesFunc'
import selectUsersFunc from './modalsFunc/selectUsersFunc'
// import serviceApplyFunc from './modalsFunc/serviceApplyFunc'
import serviceFunc from './modalsFunc/serviceFunc'
import serviceGroupFunc from './modalsFunc/serviceGroupFunc'
// import serviceUserStatusEditFunc from './modalsFunc/serviceStatusEditFunc'
// import serviceUserFunc from './modalsFunc/serviceUserFunc'
// import serviceUserViewFunc from './modalsFunc/serviceUserViewFunc'
import serviceViewFunc from './modalsFunc/serviceViewFunc'
// import userDeleteFunc from './modalsFunc/userDeleteFunc'
import userFunc from './modalsFunc/userFunc'
// import userLoginHistoryFunc from './modalsFunc/userLoginHistoryFunc'
// import userQuestionnaireFunc from './modalsFunc/userQuestionnaireFunc'
// import userSignedUpEventsFunc from './modalsFunc/userSignedUpEventsFunc'
import userViewFunc from './modalsFunc/userViewFunc'
import userBillingFunc from './modalsFunc/userBillingFunc'
import userPaymentHistoryFunc from './modalsFunc/userPaymentHistoryFunc'
import userTopupFunc from './modalsFunc/userTopupFunc'
import userTopupInfoFunc from './modalsFunc/userTopupInfoFunc'
import userOnboardingFunc from './modalsFunc/userOnboardingFunc'
import firstRunTourFunc from './modalsFunc/firstRunTourFunc'
import changePasswordFunc from './modalsFunc/changePasswordFunc'
import userPasswordChangeFunc from './modalsFunc/userPasswordChangeFunc'
import userTariffChangeFunc from './modalsFunc/userTariffChangeFunc'
import tariffFunc from './modalsFunc/tariffFunc'
// import userSetPasswordFunc from './modalsFunc/userSetPasswordFunc'
// import eventSignUpToReserveAfterError from './modalsFunc/eventSignUpToReserveAfterError'
// import roleFunc from './modalsFunc/roleFunc'
// import browseLocationFunc from './modalsFunc/browseLocationFunc'
import historyFunc from './modalsFunc/historyFunc'
import clientFunc from './modalsFunc/clientFunc'
import clientContactMergeFunc from './modalsFunc/clientContactMergeFunc'
import clientViewFunc from './modalsFunc/clientViewFunc'
import clientMessengerFunc from './modalsFunc/clientMessengerFunc'
import clientTransactionsFunc from './modalsFunc/clientTransactionsFunc'
import clientSelectFunc from './modalsFunc/clientSelectFunc'
import clientEventsFunc from './modalsFunc/clientEventsFunc'
import {
  buildServiceDeleteBlockedText,
  buildServiceDeleteConfirmText,
} from '@helpers/serviceDeleteCheck'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'
// import userHistoryFunc from './modalsFunc/userHistoryFunc'
// import userActionsHistoryFunc from './modalsFunc/userActionsHistoryFunc'
// import userPersonalStatusEditFunc from './modalsFunc/userPersonalStatusEditFunc'
// import likesEditFunc from './modalsFunc/likesEditFunc'
// import likeEditFunc from './modalsFunc/likeEditFunc'
// import likesViewFunc from './modalsFunc/likesViewFunc'
// import eventAfterSignUpMessageFunc from './modalsFunc/eventAfterSignUpMessageFunc'
// import subEventFunc from './modalsFunc/subEventFunc'

const modalsFuncGenerator = (router, itemsFunc, loggedUser, options = {}) => {
  const addModal = (value) => setAtomValue(addModalSelector, value)
  // const itemsFunc = getRecoil(itemsFuncAtom)
  const canManageUsers = ['dev', 'admin'].includes(loggedUser?.role)
  const disableServerSync = Boolean(options?.disableServerSync)
  const workItemTerms = resolveWorkItemTerminology(options?.siteSettings)

  return {
    add: addModal,
    confirm: ({
      title = 'Отмена изменений',
      text = 'Вы уверены, что хотите закрыть окно без сохранения изменений?',
      onConfirm,
    }) =>
      addModal({
        title,
        text,
        onConfirm,
      }),
    minimalSize: () =>
      addModal({
        title: 'Маленький размер фотографии',
        text: 'Фотография слишком маленькая. Размер должен быть не менее 100x100',
        confirmButtonName: `Понятно`,
        onConfirm: true,
        showDecline: false,
      }),
    // copyLink: (data) => addModal(copyLinkFunc(data)),
    browserUpdate: (url) =>
      addModal({
        title: 'Устаревшая версия браузера',
        text: `Необходимо обновить браузер. Некоторые функции сайта могут не работать. Пожалуйста обновите браузер.\n\nТекущая версия браузера: ${navigator.userAgent}`,
        confirmButtonName: `Обновить`,
        onConfirm: true,
        showDecline: true,
        onConfirm: () => router.push(url, ''),
      }),
    custom: addModal,
    cropImage: (...data) => addModal(cropImageFunc(...data)),
    error: (data) => addModal(errorFunc(data)),
    json: (data) => addModal(jsonFunc(data)),
    selectEvents: (
      itemsId,
      filterRules,
      onChange,
      exceptedIds,
      acceptedIds,
      maxEvents,
      canSelectNone,
      modalTitle
    ) =>
      addModal(
        selectEventsFunc(
          itemsId,
          filterRules,
          onChange,
          exceptedIds,
          acceptedIds,
          maxEvents,
          canSelectNone,
          modalTitle
        )
      ),
    selectUsers: (
      itemsId,
      filterRules,
      onChange,
      exceptedIds,
      acceptedIds,
      maxUsers,
      canSelectNone,
      modalTitle
    ) =>
      addModal(
        selectUsersFunc(
          itemsId,
          filterRules,
          onChange,
          exceptedIds,
          acceptedIds,
          maxUsers,
          canSelectNone,
          modalTitle
        )
      ),
    // selectServices: (
    //   itemsId,
    //   filterRules,
    //   onChange,
    //   exceptedIds,
    //   acceptedIds,
    //   maxServices,
    //   canSelectNone,
    //   modalTitle
    // ) =>
    //   addModal(
    //     selectServicesFunc(
    //       itemsId,
    //       filterRules,
    //       onChange,
    //       exceptedIds,
    //       acceptedIds,
    //       maxServices,
    //       canSelectNone,
    //       modalTitle
    //     )
    //   ),
    eventsTags: {
      edit: () => addModal(eventsTagsFunc()),
    },
    settings: {
      towns: () => addModal(townsFunc()),
      eventTypes: () => addModal(eventTypesFunc()),
      artistRequisitesEditor: () => addModal(artistRequisitesEditorFunc()),
    },
    whatsNew: {
      view: () => addModal(whatsNewFunc()),
    },
    news: {
      add: (onSaved) =>
        loggedUser?.role === 'dev' ? addModal(newsFunc(null, onSaved)) : null,
      edit: (newsItem, onSaved) =>
        loggedUser?.role === 'dev'
          ? addModal(newsFunc(newsItem, onSaved))
          : null,
    },
    transaction: {
      add: (eventId, props) =>
        addModal(
          transactionFunc({
            eventId,
            ...props,
          })
        ),
      edit: (eventId, transactionId, props) =>
        addModal(
          transactionFunc({
            eventId,
            transactionId,
            ...props,
          })
        ),
      history: (transactionId) => addModal(historyFunc('transaction', transactionId)),
    },
    event: {
      add: (eventId) => addModal(eventFunc(eventId, true)),
      create: (initialStatus = 'draft', options = {}) =>
        addModal(eventFunc(null, false, initialStatus, options)),
      createFromDraft: (initialEvent, onSaved) =>
        addModal(
          eventFunc(null, false, initialEvent?.status || 'draft', {
            initialEvent,
            onSaved,
            aiFilledFields: initialEvent?.aiFilledFields,
            aiWarnings: initialEvent?.aiWarnings,
          })
        ),
      edit: (eventId, options) =>
        addModal(eventFunc(eventId, false, null, options)),
      history: (eventId) => addModal(historyFunc('event', eventId)),
      statusEdit: (eventId) => addModal(eventStatusEditFunc(eventId)),
      close: (eventId) =>
        addModal({
          title: `Закрытие ${workItemTerms.genitive}`,
          text: `Вы уверены, что хотите закрыть ${workItemTerms.accusative}?`,
          onConfirm: async () => itemsFunc.event.close(eventId),
        }),
      cancel: (eventId) =>
        addModal({
          title: 'Отмена события',
          text: `Вы уверены, что хотите отменить ${workItemTerms.accusative}? Карточка не удалится, изменится только статус.`,
          onConfirm: async () => itemsFunc.event.cancel(eventId),
        }),
      uncancel: (eventId) =>
        addModal({
          title: 'Возобновление события',
          text: `Вы уверены, что хотите возобновить ${workItemTerms.accusative}?`,
          onConfirm: async () => itemsFunc.event.uncancel(eventId),
        }),
      delete: async (eventId) => {
        if (disableServerSync) {
          addModal({
            title: 'Удаление события',
            text: 'Серверная синхронизация отключена. Событие будет удалено только локально на этом устройстве.',
            onConfirm: async () => itemsFunc.event.delete(eventId),
          })
          return
        }
        try {
          const response = await fetch(`/api/events/${eventId}/delete-check`)
          const result = await response.json()
          const reasons = Array.isArray(result?.data?.reasons)
            ? result.data.reasons
            : []
          if (!result?.success) {
            addModal({
              title: `Удаление ${workItemTerms.genitive} недоступно`,
              text: result?.error || `Не удалось проверить ${workItemTerms.accusative}`,
              confirmButtonName: 'Понятно',
              onConfirm: true,
              showDecline: false,
            })
            return
          }
          if (reasons.length > 0) {
            const reasonLines = reasons
              .map((item) => {
                if (item.type === 'transactions')
                  return `Транзакции: ${item.count}`
                return null
              })
              .filter(Boolean)
              .join('\n')
            addModal({
              title: `Удаление ${workItemTerms.genitive} недоступно`,
              text: `Удалить ${workItemTerms.accusative} нельзя, есть связанные данные:\n${reasonLines}`,
              confirmButtonName: 'Понятно',
              onConfirm: true,
              showDecline: false,
            })
            return
          }
          addModal({
            title: 'Удаление события',
            text: `Вы уверены, что хотите удалить ${workItemTerms.accusative}?`,
            onConfirm: async () => itemsFunc.event.delete(eventId),
          })
        } catch (error) {
          addModal({
            title: `Удаление ${workItemTerms.genitive} недоступно`,
            text: `Не удалось проверить ${workItemTerms.accusative}`,
            confirmButtonName: 'Понятно',
            onConfirm: true,
            showDecline: false,
          })
        }
      },
      view: (eventId, options) =>
        addModal(eventViewFunc(eventId, { ...options, siteSettings })),
      additionalEvents: (eventId) =>
        addModal(eventAdditionalEventsFunc(eventId)),
      upcomingOverview: () => addModal(upcomingEventsOverviewFunc()),
      // editLikes: (eventId) => addModal(likesEditFunc(eventId)),
      // viewLikes: (eventId) => addModal(likesViewFunc(eventId)),
    },
    user: {
      add: (userId) =>
        canManageUsers ? addModal(userFunc(userId, true)) : null,
      edit: (userId) => (canManageUsers ? addModal(userFunc(userId)) : null),
      delete: (userId) =>
        canManageUsers
          ? addModal({
              title: 'Удаление пользователя',
              text: 'Вы уверены, что хотите удалить пользователя?',
              onConfirm: async () => itemsFunc.user.delete(userId),
            })
          : null,
      view: (userId, params) => addModal(userViewFunc(userId, params)),
      billing: (userId) =>
        canManageUsers ? addModal(userBillingFunc(userId)) : null,
      paymentHistory: (userId) =>
        canManageUsers ? addModal(userPaymentHistoryFunc(userId)) : null,
      topup: (userId, onSuccess) =>
        canManageUsers ? addModal(userTopupFunc(userId, onSuccess)) : null,
      topupInfo: (userId) => addModal(userTopupInfoFunc(userId)),
      onboarding: () => addModal(userOnboardingFunc()),
      firstRunWizard: () => addModal(userOnboardingFunc()),
      firstRunTour: () => addModal(firstRunTourFunc()),
      changePassword: () => addModal(changePasswordFunc()),
      passwordChange: (userId) =>
        canManageUsers ? addModal(userPasswordChangeFunc(userId)) : null,
      tariffChange: (userId) =>
        canManageUsers ? addModal(userTariffChangeFunc(userId)) : null,
    },
    tariff: {
      add: (tariffId) =>
        canManageUsers ? addModal(tariffFunc(tariffId, true)) : null,
      edit: (tariffId) =>
        canManageUsers ? addModal(tariffFunc(tariffId)) : null,
      delete: (tariffId) =>
        canManageUsers
          ? addModal({
              title: 'Удаление тарифа',
              text: 'Вы уверены, что хотите удалить тариф?',
              onConfirm: async () => itemsFunc.tariff.delete(tariffId),
            })
          : null,
    },
    service: {
      add: (serviceId) => addModal(serviceFunc(serviceId, true)),
      edit: (serviceId) => addModal(serviceFunc(serviceId)),
      view: (serviceId) => addModal(serviceViewFunc(serviceId)),
      delete: async (serviceId) => {
        if (disableServerSync) {
          addModal({
            title: 'Удаление услуги',
            text: 'Серверная синхронизация отключена. Услуга будет удалена только локально на этом устройстве.',
            onConfirm: async () => itemsFunc.service.delete(serviceId),
          })
          return
        }
        try {
          const response = await fetch(
            `/api/services/${serviceId}/delete-check`
          )
          const result = await response.json()
          const reasons = Array.isArray(result?.data?.reasons)
            ? result.data.reasons
            : []
          if (!result?.success) {
            addModal({
              title: 'Удаление услуги недоступно',
              text: result?.error || 'Не удалось проверить услугу',
              confirmButtonName: 'Понятно',
              onConfirm: true,
              showDecline: false,
            })
            return
          }
          if (reasons.length > 0) {
            const eventsReason = reasons.find((item) => item.type === 'events')
            addModal({
              title: 'Удаление услуги недоступно',
              text: buildServiceDeleteBlockedText(eventsReason?.count),
              confirmButtonName: 'Понятно',
              onConfirm: true,
              showDecline: false,
            })
            return
          }
          addModal({
            title: 'Удаление услуги',
            text: buildServiceDeleteConfirmText(),
            onConfirm: async () => itemsFunc.service.delete(serviceId),
          })
        } catch (error) {
          addModal({
            title: 'Удаление услуги недоступно',
            text: 'Не удалось проверить услугу',
            confirmButtonName: 'Понятно',
            onConfirm: true,
            showDecline: false,
          })
        }
      },
      buy: (serviceId, userId) =>
        addModal({
          title: 'Покупка услуги',
          text: 'Вы уверены, что хотите приобрести услугу?',
          onConfirm: async () => {
            itemsFunc.service.buy(serviceId, userId)
            addModal({
              title: 'Покупка услуги',
              text: 'Заявка на покупку услуги отправлена! Администратор свяжется с вами в ближайшее время.',
            })
          },
        }),
    },
    serviceGroup: {
      add: (onSuccess) => addModal(serviceGroupFunc(null, true, onSuccess)),
      edit: (serviceGroupId, onSuccess) =>
        addModal(serviceGroupFunc(serviceGroupId, false, onSuccess)),
      delete: (serviceGroupId, options = {}) =>
        addModal({
          title: 'Удаление группы услуг',
          text: `Вы уверены, что хотите удалить группу услуг${
            options?.title ? ` «${options.title}»` : ''
          }?\n\nСама группа будет удалена, а все услуги из нее будут перемещены в группу «Без группы».`,
          onConfirm: async () => itemsFunc.serviceGroup.delete(serviceGroupId),
        }),
    },
    client: {
      history: (clientId) => addModal(historyFunc('client', clientId)),
      edit: (clientId, onSuccess) =>
        addModal(clientFunc(clientId, false, onSuccess)),
      add: (onSuccess, options) =>
        addModal(clientFunc(null, true, onSuccess, options)),
      select: (onSelect, title, options) =>
        addModal(clientSelectFunc(onSelect, title, options)),
      view: (clientId) => addModal(clientViewFunc(clientId)),
      messenger: (clientId) => addModal(clientMessengerFunc(clientId)),
      contactMerge: (clientId) => addModal(clientContactMergeFunc(clientId)),
      transactions: (clientId) => addModal(clientTransactionsFunc(clientId)),
      events: (clientId) => addModal(clientEventsFunc(clientId)),
      delete: async (clientId) => {
        if (disableServerSync) {
          addModal({
            title: 'Удаление клиента',
            text: 'Серверная синхронизация отключена. Клиент будет удален только локально на этом устройстве.',
            onConfirm: async () => itemsFunc.client.delete(clientId),
          })
          return
        }
        try {
          const response = await fetch(`/api/clients/${clientId}/delete-check`)
          const result = await response.json()
          const reasons = Array.isArray(result?.data?.reasons)
            ? result.data.reasons
            : []
          if (!result?.success) {
            addModal({
              title: 'Удаление клиента недоступно',
              text: result?.error || 'Не удалось проверить клиента',
              confirmButtonName: 'Понятно',
              onConfirm: true,
              showDecline: false,
            })
            return
          }
          if (reasons.length > 0) {
            const reasonLines = reasons
              .map((item) => {
                if (item.type === 'events') return `Мероприятия: ${item.count}`
                if (item.type === 'transactions')
                  return `Транзакции: ${item.count}`
                return null
              })
              .filter(Boolean)
              .join('\n')
            addModal({
              title: 'Удаление клиента недоступно',
              text: `Удалить клиента нельзя, есть связанные данные:\n${reasonLines}`,
              confirmButtonName: 'Понятно',
              onConfirm: true,
              showDecline: false,
            })
            return
          }
          addModal({
            title: 'Удаление клиента',
            text: 'Вы уверены, что хотите удалить клиента?',
            onConfirm: async (refreshPage) => {
              await itemsFunc.client.delete(clientId)
              if (typeof refreshPage === 'function') refreshPage()
            },
          })
        } catch (error) {
          addModal({
            title: 'Удаление клиента недоступно',
            text: 'Не удалось проверить клиента',
            confirmButtonName: 'Понятно',
            onConfirm: true,
            showDecline: false,
          })
        }
      },
    },
    // serviceUser: {
    //   add: (serviceId) => addModal(serviceUserFunc(serviceId, true)),
    //   edit: (serviceId) => addModal(serviceUserFunc(serviceId)),
    //   view: (serviceUserId) => addModal(serviceUserViewFunc(serviceUserId)),
    //   delete: (serviceUserId) =>
    //     addModal({
    //       title: 'Удаление заявки на услугу',
    //       text: 'Вы уверены, что хотите удалить заявку на услугу?',
    //       onConfirm: async () => itemsFunc.servicesUser.delete(serviceUserId),
    //     }),
    //   statusEdit: (serviceUserId) =>
    //     addModal(serviceUserStatusEditFunc(serviceUserId)),
    // },
    // browseLocation: () => addModal(browseLocationFunc()),
  }
}

export default modalsFuncGenerator
