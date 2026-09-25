import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const privacySource = await readFile(
  new URL('../app/privacy/page.js', import.meta.url),
  'utf8'
)
const disconnectRouteSource = await readFile(
  new URL('../app/api/google-calendar/disconnect/route.js', import.meta.url),
  'utf8'
)
const metrikaSource = await readFile(
  new URL('../components/YandexMetrika.js', import.meta.url),
  'utf8'
)
const layoutSource = await readFile(
  new URL('../app/layout.js', import.meta.url),
  'utf8'
)

test('политика подробно раскрывает обработку данных Google Calendar', () => {
  const requiredPatterns = [
    /Данные Google Calendar/i,
    /OAuth/i,
    /токен/i,
    /список\s+календарей/i,
    /импорт/i,
    /создавать,\s+обновлять\s+и\s+удалять\s+события/i,
    /имя и контакты\s+клиента/i,
    /финансов/i,
  ]

  for (const pattern of requiredPatterns) {
    assert.match(privacySource, pattern)
  }
})

test('политика содержит требования Google Limited Use и точную ссылку', () => {
  assert.match(privacySource, /Limited Use/)
  assert.match(
    privacySource,
    /https:\/\/developers\.google\.com\/terms\/api-services-user-data-policy/
  )
  assert.match(privacySource, /не прода[её]т/i)
  assert.match(privacySource, /реклам/i)
})

test('политика объясняет отключение Google Calendar и удаление данных', () => {
  assert.match(
    privacySource,
    /независимо отключить синхронизацию или\s+импорт/i
  )
  assert.match(privacySource, /отозвать доступ/i)
  assert.match(privacySource, /NEXT_PUBLIC_SUPPORT_EMAIL/)
  assert.match(privacySource, /удален/i)
})

test('описание отключения соответствует фактической очистке данных интеграции', () => {
  for (const field of [
    'calendarId',
    'refreshToken',
    'accessToken',
    'tokenExpiry',
    'scope',
    'syncToken',
    'connectedAt',
    'email',
  ]) {
    assert.match(disconnectRouteSource, new RegExp(`${field}:`))
  }

  assert.match(disconnectRouteSource, /calendarName:\s*''/)
  assert.match(privacySource, /После\s+отключения\s+удаляются\s+OAuth-токены/i)
  assert.match(
    privacySource,
    /идентификатор календаря только\s+соответствующего подключения/i
  )
  assert.match(privacySource, /второе\s+подключение\s+продолжает\s+работать/i)
  assert.doesNotMatch(disconnectRouteSource, /dbUser\.googleCalendarImport\s*=/)
})

test('политика правдиво раскрывает использование Яндекс Метрики', () => {
  assert.match(privacySource, /Яндекс Метрик/i)
  assert.match(privacySource, /Вебвизор/i)
  assert.match(privacySource, /112668604/)
  assert.match(privacySource, /публичных маркетинговых страницах/i)
  assert.match(privacySource, /кабинет/i)
  assert.match(metrikaSource, /defer:\s*true/)
  assert.match(metrikaSource, /clickmap:\s*false/)
  assert.match(metrikaSource, /trackLinks:\s*false/)
  assert.match(metrikaSource, /webvisor:\s*false/)
  assert.doesNotMatch(layoutSource, /AnalyticsConsent/)
  assert.doesNotMatch(
    privacySource,
    /не использует аналитические системы и не ведет поведенческую аналитику/i
  )
})
