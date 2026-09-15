'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_STORAGE_KEY,
  getAnalyticsConsent,
  isAnalyticsHost,
} from '@helpers/metrikaConfig.mjs'

const saveChoice = (choice) => {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, choice)
  } catch {
    // При недоступном localStorage выбор действует до перезагрузки страницы.
  }
  window.dispatchEvent(
    new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: { choice } })
  )
}

const subscribeToChoice = (onStoreChange) => {
  window.addEventListener(ANALYTICS_CONSENT_EVENT, onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

const subscribeToHost = () => () => {}
const getServerChoice = () => null
const getClientHostSupport = () => isAnalyticsHost(window.location.hostname)
const getServerHostSupport = () => false

const useAnalyticsChoice = () =>
  useSyncExternalStore(subscribeToChoice, getAnalyticsConsent, getServerChoice)

export const AnalyticsConsentSettings = () => {
  const choice = useAnalyticsChoice()

  const updateChoice = (nextChoice) => {
    const shouldReload = choice === 'granted' && nextChoice === 'denied'
    saveChoice(nextChoice)
    if (shouldReload) window.location.reload()
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p>
        Текущий выбор:{' '}
        <strong className="text-black">
          {choice === 'granted'
            ? 'аналитика разрешена'
            : choice === 'denied'
              ? 'только обязательные технологии'
              : 'не выбран'}
        </strong>
        .
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="ui-btn ui-btn-primary cursor-pointer rounded-lg px-4 py-2"
          onClick={() => updateChoice('granted')}
        >
          Разрешить аналитику
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-800"
          onClick={() => updateChoice('denied')}
        >
          Отключить аналитику
        </button>
      </div>
    </div>
  )
}

const AnalyticsConsent = () => {
  const choice = useAnalyticsChoice()
  const isSupportedHost = useSyncExternalStore(
    subscribeToHost,
    getClientHostSupport,
    getServerHostSupport
  )

  const choose = (nextChoice) => {
    saveChoice(nextChoice)
  }

  if (!isSupportedHost || choice) return null

  return (
    <aside
      className="fixed right-4 bottom-4 left-4 z-[1400] mx-auto max-w-3xl rounded-2xl border border-[#d8c39f] bg-white p-4 text-sm text-gray-700 shadow-2xl sm:p-5"
      aria-label="Настройки аналитики"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="leading-6">
          Ведело использует Яндекс Метрику для оценки работы сайта. Аналитика
          включится только с вашего согласия. Подробнее — в{' '}
          <Link href="/privacy#analytics" className="text-general underline">
            Политике конфиденциальности
          </Link>
          .
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-800"
            onClick={() => choose('denied')}
          >
            Только обязательные
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-primary cursor-pointer rounded-lg px-4 py-2"
            onClick={() => choose('granted')}
          >
            Разрешить аналитику
          </button>
        </div>
      </div>
    </aside>
  )
}

export default AnalyticsConsent
