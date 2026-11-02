import { useEffect, useRef, useCallback } from 'react'
import * as Notifications from 'expo-notifications'
import { Platform, AppState } from 'react-native'
import * as Application from 'expo-application'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { useQueryClient } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import { api } from '../api/client'
import { performNotificationTaskAction } from './taskActions'
import { createNotificationResponseProcessor } from './responseProcessor'
import { activateExpoPushToken } from './tokenLifecycle'
import { queueNativeIntent, resolveNotificationDestination } from '../native/intents'
import { device } from '../native/device'
import { getAuthSessionEpoch } from '../auth/tokenStore'
import { disableMobilePush, flushMobilePushDisable, hasMobilePushRegistry, mobilePushIsCurrent, registerMobilePush, type MobilePushProvider } from './mobileSubscription'
import {
  flushPendingPushUnsubscribe,
  queuePendingPushUnsubscribe,
} from './pendingUnsubscribe'
import {
  getPushEnabledPreference,
  getStoredPushToken,
  setPushEnabledPreference,
  setStoredPushToken,
} from './preferences'

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async (notification): Promise<Notifications.NotificationBehavior> => ({
    shouldShowAlert: mobilePushIsCurrent(notification.request.content.data?.deliveryId),
    shouldShowBanner: mobilePushIsCurrent(notification.request.content.data?.deliveryId),
    shouldShowList: mobilePushIsCurrent(notification.request.content.data?.deliveryId),
    shouldPlaySound: mobilePushIsCurrent(notification.request.content.data?.deliveryId),
    shouldSetBadge: mobilePushIsCurrent(notification.request.content.data?.deliveryId),
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
})

const registerPushTokenOnServer = async (token: string, provider: MobilePushProvider = 'expo') => {
  try {
    if (hasMobilePushRegistry()) return await registerMobilePush(token, provider)
    await api.post('/push/expo/subscribe', {
      pushToken: token,
      deviceId: Platform.OS === 'android' ? Application.getAndroidId() : '',
      platform: Platform.OS,
      deviceName: Device.modelName || 'Android',
      appVersion: Application.nativeApplicationVersion || '',
    })
    return true
  } catch (error) {
    console.warn('Failed to register push token')
    return false
  }
}

const TASK_ACTIONS: Record<string, 'complete' | 'postpone_1' | 'postpone_3'> = {
  TASK_COMPLETE: 'complete',
  TASK_TOMORROW: 'postpone_1',
  TASK_3_DAYS: 'postpone_3',
}

const CALL_ACTIONS: Record<string, 'create_event' | 'no_event'> = {
  CALL_CREATE_EVENT: 'create_event',
  CALL_NO_EVENT: 'no_event',
}

type CallDecisionResponse = {
  success?: boolean
  data?: {
    event?: { _id?: string | null } | null
  }
}

const registerNotificationCategories = async () => {
  await Notifications.setNotificationCategoryAsync('task-actions', [
    {
      identifier: 'TASK_COMPLETE',
      buttonTitle: 'Выполнено',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'TASK_TOMORROW',
      buttonTitle: 'На завтра',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'TASK_3_DAYS',
      buttonTitle: 'Через 3 дня',
      options: { opensAppToForeground: true },
    },
  ])
  await Notifications.setNotificationCategoryAsync('call-actions', [
    {
      identifier: 'CALL_CREATE_EVENT',
      buttonTitle: 'Да, создать заявку',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'CALL_NO_EVENT',
      buttonTitle: 'Нет',
      options: { opensAppToForeground: true },
    },
  ])
}

const configureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Ведело',
    description: 'Заявки, задачи, звонки и ежедневные напоминания',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  })
}

const getExpoToken = async (requestPermission: boolean) => {
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  if (requestPermission && existingStatus !== 'granted') {
    const result = await Notifications.requestPermissionsAsync()
    finalStatus = result.status
  }
  if (finalStatus !== 'granted') return { token: null, permission: finalStatus }

  await configureAndroidChannel()
  if (hasMobilePushRegistry()) {
    const capability = await device!.pushCapabilities()
    if (!capability.googleAvailable) {
      if (!capability.ruStoreConfigured) throw new Error('RuStore Push ещё не настроен для этой сборки')
      if (!capability.ruStoreAvailable) throw new Error('Для уведомлений требуется RuStore или поддерживаемое приложение VK')
      return { token: await device!.ruStorePushToken(), permission: finalStatus, provider: 'rustore' as const }
    }
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId })
  return { token: tokenData.data, permission: finalStatus, provider: 'expo' as const }
}

const getPushSetupError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/^RuStore Push ещё|^Для уведомлений требуется/.test(message)) return message
  if (
    /Default FirebaseApp is not initialized|FCM credentials|google-services/i.test(
      message
    )
  ) {
    return 'Push не настроен в этой сборке Ведело. Установите обновлённую версию приложения.'
  }
  return 'Не удалось подключить push-уведомления. Проверьте интернет и повторите попытку.'
}

export const getExpoPushDeviceState = async () => {
  const [{ status }, enabled, token] = await Promise.all([
    Notifications.getPermissionsAsync(),
    getPushEnabledPreference(),
    getStoredPushToken(),
  ])
  return { permission: status, enabled, subscribed: Boolean(token) }
}

export const enableExpoPushNotifications = async () => {
  try {
    await flushPendingPushUnsubscribe()
    await flushMobilePushDisable()
    await registerNotificationCategories()
    const epoch = getAuthSessionEpoch()
    const { token, permission, provider } = await getExpoToken(true)
    if (!token) return { ok: false, permission, error: 'Разрешение на уведомления не выдано' }
    if (epoch !== getAuthSessionEpoch()) return { ok: false, permission, error: 'Сессия изменилась. Повторите подключение.' }
    const registered = await registerPushTokenOnServer(token, provider)
    if (!registered) return { ok: false, permission, error: 'Не удалось зарегистрировать устройство' }
    await Promise.all([setStoredPushToken(token), setPushEnabledPreference(true)])
    return { ok: true, permission, token }
  } catch (error) {
    const { status } = await Notifications.getPermissionsAsync().catch(
      () => ({ status: 'undetermined' as Notifications.PermissionStatus })
    )
    return { ok: false, permission: status, error: getPushSetupError(error) }
  }
}

export const disableExpoPushNotifications = async () => {
  const token = await getStoredPushToken()
  await setPushEnabledPreference(false)
  if (hasMobilePushRegistry()) {
    const pending = await disableMobilePush()
    await setStoredPushToken(null)
    await Notifications.dismissAllNotificationsAsync().catch(() => undefined)
    return { ok: true, pending }
  }
  if (!token) return { ok: true, pending: false }
  await queuePendingPushUnsubscribe(token)
  try {
    await flushPendingPushUnsubscribe()
    return { ok: true, pending: false }
  } catch {
    return { ok: true, pending: true }
  }
}

const handleNotificationResponse = async (response: Notifications.NotificationResponse) => {
  const data = response?.notification?.request?.content?.data as Record<string, string> | undefined
  if (!mobilePushIsCurrent(data?.deliveryId)) return
  const taskAction = TASK_ACTIONS[response.actionIdentifier]
  if (taskAction && data?.eventId && data?.taskId) {
    try {
      await performNotificationTaskAction({
        eventId: data.eventId,
        taskId: data.taskId,
        action: taskAction,
      })
      return { eventChanged: true }
    } catch (error) {
      console.warn('Failed to perform notification action')
      throw error
    }
  }
  const callDecision = CALL_ACTIONS[response.actionIdentifier]
  if (callDecision && data?.callId) {
    const result = await api.post<CallDecisionResponse>(
      `/mobile/v1/calls/${encodeURIComponent(data.callId)}/decision`,
      { decision: callDecision }
    )
    const eventId = result?.data?.event?._id
    if (callDecision === 'create_event' && eventId) {
      queueNativeIntent(`/events/${eventId}`)
    } else {
      queueNativeIntent('/more/calls')
    }
    return { eventChanged: callDecision === 'create_event' }
  }
  queueNativeIntent(resolveNotificationDestination(data))
}

export const useExpoPushNotifications = (enabled = true) => {
  const queryClient = useQueryClient()
  const notificationListener = useRef<Notifications.EventSubscription | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)
  const appStateRef = useRef(AppState.currentState)
  const pushTokenRef = useRef<string | null>(null)
  const pushTokenListenerRef = useRef<Notifications.EventSubscription | null>(null)

  const registerForPushNotifications = useCallback(async (): Promise<string | null> => {
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device')
      return null
    }

    try {
      await flushMobilePushDisable()
      const preferenceEnabled = await getPushEnabledPreference()
      if (!preferenceEnabled) return null
      const epoch = getAuthSessionEpoch()
      const { token, provider } = await getExpoToken(false)
      if (!token) return null
      if (epoch !== getAuthSessionEpoch()) return null
      if (hasMobilePushRegistry()) {
        if (!await registerPushTokenOnServer(token, provider) || epoch !== getAuthSessionEpoch()) return null
        await setStoredPushToken(token); pushTokenRef.current = token; return token
      }
      const previousToken = pushTokenRef.current || await getStoredPushToken()
      const activated = await activateExpoPushToken(token, previousToken, {
        register: registerPushTokenOnServer,
        store: setStoredPushToken,
      })
      pushTokenRef.current = activated
      return activated
    } catch (error) {
      console.warn('Failed to get push token')
      return null
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const processResponse = createNotificationResponseProcessor<Notifications.NotificationResponse>({
      getKey: (response) =>
        `${response.notification.request.identifier}:${response.actionIdentifier}`,
      handle: handleNotificationResponse,
      afterSuccess: async (result) => {
        if (result?.eventChanged) {
          await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'events'] })
        }
        await Notifications.clearLastNotificationResponseAsync().catch(() => undefined)
      },
    })
    const retryLastResponse = () =>
      Notifications.getLastNotificationResponseAsync()
        .then(processResponse)
        .catch(() => console.warn('Failed to handle pending notification'))

    registerNotificationCategories().catch((error) => {
      console.warn('Failed to register notification categories')
    })
    registerForPushNotifications()
    flushPendingPushUnsubscribe().catch(() => undefined)
    flushMobilePushDisable().catch(() => undefined)
    void retryLastResponse()

    pushTokenListenerRef.current = Notifications.addPushTokenListener(
      (devicePushToken) => {
        if (hasMobilePushRegistry()) { void registerForPushNotifications(); return }
        void (async () => {
          const preferenceEnabled = await getPushEnabledPreference()
          if (!preferenceEnabled) return
          const projectId = Constants.expoConfig?.extra?.eas?.projectId
          const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId,
            devicePushToken,
          })
          const previousToken = pushTokenRef.current || await getStoredPushToken()
          const activated = await activateExpoPushToken(
            tokenData.data,
            previousToken,
            {
              register: registerPushTokenOnServer,
              store: setStoredPushToken,
            }
          )
          pushTokenRef.current = activated
        })().catch(() => console.warn('Failed to rotate push token'))
      }
    )
    const nativeTokenSubscription = hasMobilePushRegistry() ? device!.addListener('pushTokenChanged', () => { void registerForPushNotifications() }) : null

    notificationListener.current = Notifications.addNotificationReceivedListener(
      () => {
        // Notification will be shown automatically by the handler
      }
    )

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void processResponse(response).catch((error) => {
          console.warn('Failed to handle notification response')
        })
      }
    )

    const networkSubscription = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        void retryLastResponse()
        flushPendingPushUnsubscribe().catch(() => undefined)
      }
    })

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        void retryLastResponse()
        flushPendingPushUnsubscribe().catch(() => undefined)
        if (hasMobilePushRegistry()) {
          void flushMobilePushDisable().then(() => registerForPushNotifications()).catch(() => undefined)
        } else if (pushTokenRef.current) {
          getPushEnabledPreference().then((preferenceEnabled) => {
            if (!preferenceEnabled || !pushTokenRef.current) return
            registerPushTokenOnServer(pushTokenRef.current)
          })
        }
      }
      appStateRef.current = nextAppState
    })

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove()
      }
      if (responseListener.current) {
        responseListener.current.remove()
      }
      if (pushTokenListenerRef.current) {
        pushTokenListenerRef.current.remove()
      }
      networkSubscription()
      nativeTokenSubscription?.remove()
      subscription?.remove()
    }
  }, [enabled, queryClient, registerForPushNotifications])

  return {
    registerForPushNotifications,
  }
}
