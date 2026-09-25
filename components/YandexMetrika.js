'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  LEGACY_METRIKA_QUEUE_KEY,
  METRIKA_QUEUE_KEY,
  YANDEX_METRIKA_ID,
  isAnalyticsHost,
  isPublicAnalyticsPath,
} from '@helpers/metrikaConfig.mjs'

const INITIALIZED_KEY = '__vedeloMetrikaInitialized'
const LAST_HIT_KEY = '__vedeloMetrikaLastPublicHit'

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
    defer: true,
    ssr: true,
    accurateTrackBounce: true,
    clickmap: false,
    ecommerce: false,
    sendTitle: false,
    trackLinks: false,
    webvisor: false,
  })
}

const YandexMetrika = () => {
  const pathname = usePathname()

  useEffect(() => {
    if (!isAnalyticsHost(window.location.hostname)) return undefined
    if (!isPublicAnalyticsPath(pathname)) {
      window[LAST_HIT_KEY] = null
      return undefined
    }

    initializeMetrika()
    const url = window.location.href
    if (window[LAST_HIT_KEY] !== url) {
      window[LAST_HIT_KEY] = url
      window.ym(YANDEX_METRIKA_ID, 'hit', url, {
        referrer: document.referrer,
      })
    }
    flushGoalQueue()
    return undefined
  }, [pathname])

  return null
}

export default YandexMetrika
