'use client'

import { UpcomingEventsOverview } from '@layouts/modals/modalsFunc/upcomingEventsOverviewFunc'
import FirstRequestPrompt from '@components/FirstRequestPrompt'
import LearningTip from '@components/LearningTip'

const noop = () => {}

/**
 * Страница «Важное» (/cabinet/attention).
 * Рендерит тот же обзор, что и модалка «Требует внимания»:
 * просроченные/сегодняшние/завтрашние задачи и события, просроченные задатки,
 * незакрытые прошедшие мероприятия, заявки без следующего шага, неотвеченные сообщения, состояние
 * синхронизации, мероприятия на 3 дня и ближайшие значимые даты клиентов.
 * closeModal здесь не нужен — переходы открывают модалки поверх страницы.
 */
const AttentionContent = () => (
  <div className="h-full min-h-0 overflow-y-auto p-3 laptop:p-4">
    <div className="mx-auto w-full max-w-3xl">
      <FirstRequestPrompt />
      <UpcomingEventsOverview closeModal={noop} />
      <LearningTip />
    </div>
  </div>
)

export default AttentionContent
