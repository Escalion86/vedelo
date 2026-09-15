'use client'

import { useEffect } from 'react'
import {
  ANALYTICS_CONSENT_EVENT,
  LEGACY_METRIKA_QUEUE_KEY,
  METRIKA_QUEUE_KEY,
  YANDEX_METRIKA_ID,
  getAnalyticsConsent,
  isAnalyticsHost,
} from '@helpers/metrikaConfig.mjs'

const INITIALIZED_KEY = '__vedeloMetrikaInitialized'

const flushGoalQueue = () => {
  const goals = [METRIKA_QUEUE_KEY, LEGACY_METRIKA_QUEUE_KEY].flatMap((key) =>
    Array.isArray(window[key]) ? window[key] : []
  )

  window[METRIKA_QUEUE_KEY] = []
  window[LEGACY_METRIKA_QUEUE_KEY] = []
  goals.slice(-50).forEach((goal) => {
    if (goal?.goalName) {
      window.ym(YANDEX_METRIKA_ID, 'reachGoal', goal.goalName, goal.params)
    }
  })
}

const initializeMetrika = () => {
  if (window[INITIALIZED_KEY]) return
  window[INITIALIZED_KEY] = true

  window.ym =
    window.ym ||
    function metrikaQueue() {
      ;(window.ym.a = window.ym.a || []).push(arguments)
    }
  window.ym.l = Date.now()

  const scriptUrl = `https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}`
  const hasScript = Array.from(document.scripts).some(
    (script) => script.src === scriptUrl
  )
  if (!hasScript) {
    const script = document.createElement('script')
    script.async = true
    script.src = scriptUrl
    document.head.appendChild(script)
  }

  window.ym(YANDEX_METRIKA_ID, 'init', {
    ssr: true,
    clickmap: true,
    ecommerce: 'dataLayer',
    referrer: document.referrer,
    url: window.location.href,
    accurateTrackBounce: true,
    trackLinks: true,
  })
  flushGoalQueue()
}

const YandexMetrika = () => {
  useEffect(() => {
    if (!isAnalyticsHost(window.location.hostname)) return undefined

    const activateWhenAllowed = () => {
      if (getAnalyticsConsent() === 'granted') initializeMetrika()
    }

    activateWhenAllowed()
    window.addEventListener(ANALYTICS_CONSENT_EVENT, activateWhenAllowed)
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, activateWhenAllowed)
    }
  }, [])

  return null
}

export default YandexMetrika
