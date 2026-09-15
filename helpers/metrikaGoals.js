'use client'

import {
  METRIKA_QUEUE_KEY,
  YANDEX_METRIKA_ID,
  getAnalyticsConsent,
} from '@helpers/metrikaConfig.mjs'

const canSendMetrikaGoal = () =>
  typeof window !== 'undefined' &&
  getAnalyticsConsent() === 'granted' &&
  typeof window.ym === 'function'

const queueMetrikaGoal = (goalName, params) => {
  const queue = Array.isArray(window[METRIKA_QUEUE_KEY])
    ? window[METRIKA_QUEUE_KEY]
    : []
  queue.push({ goalName, params })
  window[METRIKA_QUEUE_KEY] = queue.slice(-50)
}

export const reachGoal = (goalName, params) => {
  if (!goalName || typeof window === 'undefined') return false
  if (getAnalyticsConsent() !== 'granted') return false
  if (!canSendMetrikaGoal()) {
    queueMetrikaGoal(goalName, params)
    return true
  }
  window.ym(YANDEX_METRIKA_ID, 'reachGoal', goalName, params)
  return true
}

export const reachGoalOnce = (goalName, params) => {
  if (typeof window === 'undefined') return false
  const key = `artistcrm:metrika-goal:${goalName}`
  try {
    if (window.localStorage.getItem(key) === '1') return false
  } catch {
    // Метрика должна работать и при недоступном localStorage.
  }
  const sent = reachGoal(goalName, params)
  if (sent) {
    try {
      window.localStorage.setItem(key, '1')
    } catch {
      // Событие уже отправлено или поставлено в очередь.
    }
  }
  return sent
}
