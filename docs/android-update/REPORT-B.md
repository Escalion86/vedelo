# Этап Б — отзывы и персональная страница

Реализация этапа Б завершена в границах своей копии, готова к интеграции родителем. IDs: `REVIEWS-01`, `REVIEWS-03`, `REVIEWS-05`, `PERIOD-03`. Финальные проверки: сервер 38/38, целевой Jest 18/18, RN Web 6/6; typecheck, ESLint и проверка границ — exit 0. Приёмка APK/production не выполнялась. База: `35f9a64c29c0b8c078a0b54149a1949069a868ed`. Обязательные документы прочитаны; общий аудит не повторяется. Исходный git status: только чужой untracked `docs/android-update/`.

Границы: только модуль reviews, два точных маршрута, приватные review API и связанные тесты. Общие UI/DTO, меню, чужие экраны, версии, ROADMAP, AI_HANDOFF, auth/offline/sync ядро не меняются. Секреты, .env и production не читаются. Commit/deploy/EAS не выполняются. Новые зависимости не требуются.

Контракт: период по createdAt приглашения, страницы по 30; серверного поиска нет. Поиск явно ограничен текущей страницей. Публичная capability-ссылка остаётся внешней веб-страницей.

## Проверки

Журналы и фактические exit codes дописываются по мере работы в `/home/aleksei/reports/vedelo/2026-10-11/update/B`. Тяжёлые команды выполняются под общим flock.

- Server RED: `node --test tests/server/clientReviewsBearer.test.cjs`, exit **1**, 0 passed / 15 failed. Ожидаемые провалы: контекст выбирал cookie tenant, invalid Bearer не отклонялся. Первичная ошибка фикстуры (не-ASCII HTTP header) исправлена до этого RED; она не считается TDD-доказательством.
- Server GREEN: та же команда, exit **0**, 15 passed. `reviewContext(requireFeature=false, req?)` совместим с web без req; все приватные маршруты передают req. Public capability-код не менялся. Настройки используют тот же контекст; ответы private/no-store.

- `http-period-red`: `node --test tests/server/clientReviewsNative.http.test.cjs`; exit code **1**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/http-period-red.log`.

- `http-period-green`: `node --test tests/server/clientReviewsNative.http.test.cjs`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/http-period-green.log`.

HTTP-стенд использует localhost, синтетические модели-фикстуры и реальную подпись/валидацию mobile v1, Request/Response, review handlers и sharp. Cookie, тариф, облако, push заменены изолированными зависимостями; реальная MongoDB и Next-сервер здесь не запускаются. Секреты берутся только из встроенной тестовой константы, production/env не читается. Это проверка HTTP/контрактов, не доказательство реальных Mongo-конкурентных операций или облака.

HTTP PERIOD RED: 5 passed / 2 failed (родительский subtest включает провал), exit 1. Причина: `from=2026-02-30` возвращал 200 вместо 400. Добавлена строгая проверка существования календарной даты в приватном списке.

- `server-checks`: `node --test tests/server/clientReviewsBearer.test.cjs tests/server/clientReviewsNative.http.test.cjs helpers/clientReviews.test.mjs helpers/reviewAppearance.test.mjs helpers/tariffAccess.test.mjs`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/server-checks.log`.

- `eslint`: `npx --no-install eslint server/clientReviews.js app/api/client-reviews/route.js app/api/client-reviews/[id]/route.js app/api/client-reviews/statuses/route.js app/api/site/review-page/route.js app/api/site/review-page/logo/route.js`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/eslint.log`.

## Интеграционные компоненты (для родителя)

Экспорты из `mobile/src/features/reviews/index.ts` (подключение в чужие экраны выполняет родитель):

```ts
type ReviewNavigation = {
  onOpenEvent?: (eventId: string) => void
  onOpenClient?: (clientId: string) => void
  onPlanContact?: (eventId: string) => void
}
type ReviewEvent = {
  _id: string
  clientId?: string | null
  status?: string
  eventDate?: string | null
  dateEnd?: string | null
  isDemo?: boolean
}
type EventClientReviewSectionProps = ReviewNavigation & {
  event: ReviewEvent
  onChanged?: () => void
}
type ClientReviewsSectionProps = ReviewNavigation & {
  clientId?: string
  unreadOnly?: boolean
  title?: string
  showFilters?: boolean
}
// EventClientReviewSection(props: EventClientReviewSectionProps)
// ClientReviewsSection(props: ClientReviewsSectionProps)
// UnreadClientReviewsSection(props: ReviewNavigation)
```

Event: передать сохранённый event, onPlanContact из существующего редактора задач, при необходимости onChanged. Client: `clientId={client._id}`, опциональный заголовок и callbacks. Attention: Unread-компонент с callbacks. Компоненты используют существующие AuthProvider/QueryClientProvider/ThemeProvider родителя. Открытие работы/клиента без callbacks использует реальные существующие `/events/[id]` и `/clients/[id]`; «Запланировать контакт» без callback открывает существующий `/events/edit/[id]?section=contacts`, как текущий EventDetailActions; родитель может передать собственный редактор через onPlanContact. Чужие экраны не менялись.

## Серверные файлы для совместимой выкладки

- `server/clientReviews.js`: аддитивный req в reviewContext через существующий getRequestContext; web-вызов без req сохранён.
- `app/api/client-reviews/route.js`: req в GET/POST, строгая существующая дата периода.
- `app/api/client-reviews/[id]/route.js`: req в PATCH всех шести действий.
- `app/api/client-reviews/statuses/route.js`: req в GET.
- `app/api/site/review-page/route.js`: GET/POST через общий контекст, private/no-store.
- `app/api/site/review-page/logo/route.js`: POST через общий контекст, прежний multipart file/sharp/cloud и tenant-путь, private/no-store.

Публичные endpoints, capability lookup, Mongo-схемы, флаги тарифа и mobile auth ядро не менялись. Для работающих новых нативных маршрутов нужна совместимая выкладка этих серверных изменений; агент её не выполняет.

- `server-final`: `node --test tests/server/clientReviewsBearer.test.cjs tests/server/clientReviewsNative.http.test.cjs helpers/clientReviews.test.mjs helpers/reviewAppearance.test.mjs helpers/tariffAccess.test.mjs`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/server-final.log`.

- `web-error-red`: `node --test tests/server/clientReviewsBearer.test.cjs`; exit code **1**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/web-error-red.log`.

- `web-error-green`: `node --test tests/server/clientReviewsBearer.test.cjs`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/web-error-green.log`.

Web error RED: 15 passed / 1 failed, exit 1 — общий контекст изменил строковый error оформления на объект. Исправление сохраняет прежний строковый error у `/site/review-page` и `/logo`, при этом Bearer/тариф и private/no-store остаются общими. Success DTO не менялся.

Историческая запись ожидания: targeted Jest стоял под общим flock с 12:55 +07 без вывода. Никакие тяжёлые команды без flock не выполнялись; владельцу направлена просьба проверить удерживающий процесс (блокировка не снимается агентом).

- `eslint-final`: `npx --no-install eslint server/clientReviews.js app/api/client-reviews/route.js app/api/client-reviews/[id]/route.js app/api/client-reviews/statuses/route.js app/api/site/review-page/route.js app/api/site/review-page/logo/route.js`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/eslint-final.log`.

- `server-verified`: `node --test tests/server/clientReviewsBearer.test.cjs tests/server/clientReviewsNative.http.test.cjs helpers/clientReviews.test.mjs helpers/reviewAppearance.test.mjs helpers/tariffAccess.test.mjs`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/server-verified.log`.

Новые нативные маркеры (для проверки будущего APK): `client-reviews-section`, `unread-client-reviews`, `reviews-filters-toggle`, `reviews-filters-reset`, `reviews-filter-summary`, `reviews-search`, `reviews-period-trigger`, `reviews-period` (modal), `reviews-page`, `review-card-<id>`, `review-note-<id>`, `review-read-<id>`, `event-client-review-section`, `review-completed-confirm`, `review-request`, `review-revoke-confirm`, `review-share-panel`, `review-copy-link`, `review-mark-sent`, `review-page-settings`, `review-page-save`, `review-logo-upload`, `review-logo`, `review-page-preview`, `review-preview-cover`, `review-preview-rating-1…5`, `review-link-preview`.

Предпросмотр нативный: живые шесть полей, выбор оценки/комментарий как пример без запроса, светлая/тёмная схема формы отдельно от кабинета, карточка ссылки. Точные web-градиенты обложки в native не воспроизводятся: используются цвета шаблонов (публичная внешняя страница получает исходные web-градиенты). Новых бинарных ассетов и зависимостей нет.

Дополнительно готов `EventClientReviewStatus({ eventId: string })` и `useReviewStatuses()`: один tenant-scoped Query-кэш карты `/client-reviews/statuses` для карточек работ, polling 30 секунд, без N+1 и секретов. Подключение в чужую карточку выполняет родитель.

- `malformed-bearer-red`: `node --test tests/server/clientReviewsBearer.test.cjs`; exit code **1**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/malformed-bearer-red.log`.

- `malformed-bearer-green`: `node --test tests/server/clientReviewsBearer.test.cjs tests/server/clientReviewsNative.http.test.cjs helpers/clientReviews.test.mjs helpers/reviewAppearance.test.mjs helpers/tariffAccess.test.mjs`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/malformed-bearer-green.log`.

Malformed Bearer RED: `malformed-bearer-red.log`, 15 passed / 1 failed, exit 1. Bearer без токена и нестандартное написание схемы попадали в web-cookie fallback. В приватном reviewContext добавлен отказ 401 для этих форм перед вызовом getRequestContext; валидный стандартный mobile Bearer по-прежнему проверяет существующее ядро. Public capability-контекст не менялся. GREEN: расширенный набор 38/38, exit 0; по всем приватным методам проверены `Bearer invalid`, `Bearer`, `bearer invalid`, `BEARER invalid` с web-cookie. Отозванная mobile-сессия, архивный пользователь и подписанный токен с неверным tenant также дают 401.

Новые функции online-only, общий offline/auth/sync не меняется. Query-чтения выполняются и при offline-сигнале, чтобы сетевой отказ показывался как ошибка с повтором, а не бесконечное ожидание. Несохранённые поля остаются в локальной форме; секрет приглашения не записывается в Query-кэш и очищается при выходе из отправки/работы/профиля.

- `eslint-bearer`: `npx --no-install eslint server/clientReviews.js app/api/client-reviews/route.js app/api/client-reviews/[id]/route.js app/api/client-reviews/statuses/route.js app/api/site/review-page/route.js app/api/site/review-page/logo/route.js`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/eslint-bearer.log`.

- `native-red`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock npm --prefix mobile test -- --runTestsByPath src/features/reviews/reviews.test.tsx`; exit code **1**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/native-red.log`.

- `native-refetch-red`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock npm --prefix mobile test -- --runTestsByPath src/features/reviews/retry.test.tsx`; exit code **1**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/native-refetch-red.log`.

Период сохранён ровно по API: `createdAt` приглашения, `from` включает UTC-полночь, `to` включает весь UTC-день; дата карточки отображается в часовом поясе устройства. В карточке отдельно подписаны дата запроса и дата получения ответа. Поиск ограничен текущими 30 записями и явно так назван.

Native RED: `native-red.log`, exit 1, 10 failed / 10 total. Поведенческие ожидания не находили рабочий список, заметку, приглашение, оформление и статус до подключения публичных экспортов модуля; тесты написаны до реализации, отдельные внутренние файлы готовились во время ожидания очереди. После этого RED index подключён к готовым реальным компонентам, временные пустые входы удалены.

Native lifecycle RED: `native-refetch-red.log`, exit 1, 2 failed. Один реальный провал — после blur/завершения запроса/возврата кнопка оставалась disabled (ожидалось false, получено true). busy теперь снимается по завершению запроса даже в фоне; приватные результаты/секрет по-прежнему защищены lifetime и remount по user/tenant/event. Второй тест задержался на холодном RN-рендере и упёрся в стандартные 5 секунд — он не засчитывается как доказательство RED заметки. Повтор выполняется адресно, таймауты не повышались.

- `native-note-refetch-red`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock npm --prefix mobile test -- --runTestsByPath src/features/reviews/retry.test.tsx --testNamePattern Фоновый сбой GET`; exit code **1**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/native-note-refetch-red.log`.

Повтор RED обновления заметки расширен на список и карточку работы: обе секции обязаны сохранять открытую заметку, если фоновое GET завершилось ошибкой. Приватные состояния секций/оформления дополнительно сбрасываются при смене user/tenant/client/event через локальный React key, без изменения общего auth/sync.

Адресный `native-note-refetch-red` завершился настоящим ожидаемым провалом: 1 failed / 1 skipped, exit 1; после сообщения об ошибке GET в дереве отсутствует поле «Заметка для себя». Это доказательство потери черновика, без таймаута.

## Контракты API и границы проверки

| Метод | Авторизация и тариф | Нативное действие |
| --- | --- | --- |
| GET `/api/client-reviews` | Bearer либо прежняя web-сессия, server tenant; чтение без опции | Список и read-back `_id` внутри `eventId`, 30 записей, page с нуля |
| POST `/api/client-reviews` | То же + allowClientReviews | eventId, confirmedCompleted; capability только по явному действию |
| PATCH `/api/client-reviews/[id]` | server tenant; link/renew/sent требуют опцию, note/read/revoke доступны без неё | Отправка, отключение, перевыпуск, заметка и прочтение |
| GET `/api/client-reviews/statuses` | server tenant, без опции | Общая карта статусов без capability и N+1 |
| GET `/api/site/review-page` | server tenant, без опции | Шесть полей оформления, флаг, origin |
| POST `/api/site/review-page` | server tenant + опция | Только publicName, specialization, greeting, accent, cover, logoUrl; затем GET |
| POST `/api/site/review-page/logo` | server tenant + опция | Прежний multipart file, PNG/JPG/WebP ≤5 МБ, sharp/WebP, существующее облако |

DTO модуля локальные в `features/reviews/types.ts`; общие DTO не правились. Query ключи включают userId/tenantId; capability URL хранится только в локальном состоянии явной отправки. Публичный `/review/[id]#secret` остаётся внешним web-сценарием; mobile JWT не заменяет capability. Тариф не блокирует полученный отзыв и действующую ранее отправленную публичную ссылку.

Тестовая инфраструктура явно прогревает ленивые RN-примитивы при загрузке test-модуля, до индивидуальных ожиданий. Стандартные таймауты и поведенческие assertions сохранены; реальные UI-компоненты не заменяются макетами.

- `native-note-both-red`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock npm --prefix mobile test -- --runTestsByPath src/features/reviews/retry.test.tsx --testNamePattern Фоновый сбой GET`; exit code **1**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/native-note-both-red.log`.

RED обеих секций: `native-note-both-red.log`, exit 1, 2 failed / 1 skipped — одинаковый ожидаемый провал отсутствующего поля заметки после фонового GET. В обеих секциях карточки теперь остаются при наличии кэшированных данных; ошибка и повтор показываются отдельно, старые данные подписаны, ложное пустое состояние при ошибке скрыто.

Целевой GREEN, отдельный typecheck и RN Web поставлены в общую очередь. Каждый процесс берёт один и тот же flock; тяжёлые проверки не перекрываются. До результата статус остаётся «в работе».

Первый целевой GREEN: тестовые результаты 16 passed / 2 failed. Оба провала — тест нажимал «Следующая страница» до завершения загрузки после смены фильтров. Исправлено ожидание появления и enabled-состояния кнопки, сами assertions сохранены. QueryClient тестового стенда теперь имеет gcTime=0 (как retry-стенд): GC таймеры кэша не должны удерживать Jest после cleanup; продуктовый Query-кэш не менялся. Native lifecycle 3/3 уже прошёл в этом запуске. Итоговый exit code будет записан runner после реального выхода процесса.

- `native-green`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock npm --prefix mobile test -- --runTestsByPath src/features/reviews/reviews.test.tsx src/features/reviews/api.test.ts src/features/reviews/retry.test.tsx`; exit code **1**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/native-green.log`.

- `typecheck`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock npm run typecheck`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/typecheck.log`.

- `browser`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock node --test tests/components/clientReviewsNative.browser.test.cjs`; exit code **1**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/browser.log`.

Typecheck завершён: exit 0. Первый RN Web прогон: exit 1, 0 passed / 1 failed, сборка стенда остановилась на отсутствующей закрывающей скобке текстовой сетевой фикстуры. Это ошибка инфраструктуры, не TDD RED продукта; скобка исправлена, полный браузерный повтор выполняется под тем же flock.

- `native-final`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock npm --prefix mobile test -- --runTestsByPath src/features/reviews/reviews.test.tsx src/features/reviews/api.test.ts src/features/reviews/retry.test.tsx`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/native-final.log`.

`native-final`: 18/18, exit 0. В журнале найдены React act warnings от асинхронных Query-уведомлений. Тестовая обвязка оборачивает notifyManager callbacks в настоящий act; console не заглушается. Дополнительно тест ждёт завершённой отправки и перечитанного списка после reset. Продуктовый код не меняется; выполняется чистый targeted повтор и повторный typecheck после изменения тестов.

- `browser-final`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock node --test tests/components/clientReviewsNative.browser.test.cjs`; exit code **1**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/browser-final.log`.

RN Web повтор `browser-final`: exit 1, 0 passed / 1 failed, timeout выбора дат. Проверка конкретной публичной реализации RN Web показала: findNodeHandle намеренно бросает «not supported on web». PeriodPicker вызывает его для нативного accessibility focus; общий UI по границам не меняется. Только браузерный адаптер заменяет числовой view handle на null. Реальный PeriodPicker/его UI/обработка дат остаются в сборке. Нативный accessibility focus этим стендом не проверяется; это дополнительное ограничение, телефонная приёмка остаётся родителю. Для следующих ошибок стенд сохраняет failure.json/txt/png с синтетическими данными.

- `native-clean`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock npm --prefix mobile test -- --runTestsByPath src/features/reviews/reviews.test.tsx src/features/reviews/api.test.ts src/features/reviews/retry.test.tsx`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/native-clean.log`.

Чистый целевой GREEN `native-clean.log`: 3 suites / 18 tests passed, exit 0, без console/act warnings. Assertions и стандартные таймауты сохранены. Полный Jest не запускался. Продуктовый код после исправления фонового GET не менялся.

- `typecheck-final`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock npm run typecheck`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/typecheck-final.log`.

Финальный `mobile npm run typecheck` под общим flock: exit 0 после всех изменений TS-тестов. Все дальнейшие правки допустимы только в браузерном стенде/отчётных файлах; если потребуется менять модуль, адресные проверки будут повторены.

- `browser-focus`: `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock node --test tests/components/clientReviewsNative.browser.test.cjs`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/browser-focus.log`.

- `boundaries`: `python3 /home/aleksei/reports/vedelo/2026-10-11/update/B/boundaries.py`; exit code **0**; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/B/boundaries.log`.

## Итог приёмки этапа Б

| Проверка | Итог | Журнал |
| --- | --- | --- |
| Сервер, приватная auth/tenant/тариф и публичная capability | 38/38, exit 0 | `malformed-bearer-green.log` |
| Целевой native Jest (три своих файла) | 18/18, 3 suites, exit 0, без console/act warnings | `native-clean.log` |
| Отдельный mobile typecheck после правок | exit 0 | `typecheck-final.log` |
| ESLint шести серверных файлов | exit 0 | `eslint-bearer.log` |
| RN Web: две темы × 360/390/420, высота 520 | 1 тест / 6 сценариев, exit 0, console errors 0, overflow 0 | `browser-focus.log` |
| Границы, базовый SHA, пробелы, симлинки зависимостей | exit 0 | `boundaries.log`, `boundaries.json` |

Все журналы и отдельные `.exit` находятся в `/home/aleksei/reports/vedelo/2026-10-11/update/B`. Машинный итог — `result.json`, результаты браузера — `browser/results.json`. Сохранено 30 снимков: list/note/event/settings/page × обе темы × три ширины. Реальные взаимодействия включают период/сброс/страницы, сбой/повтор заметки, прочтение, планирование контакта, создание/copy/ручной sent/подтверждённый revoke/renew, оформление/ошибку POST/upload/read-back. Снимки списка, заметки, приглашения, формы и предпросмотра просмотрены вручную в обеих темах, включая 360/390/420.

Закрытые IDs в объёме этапа Б: `REVIEWS-01` (модуль workflow, статусы и интеграционные секции), `REVIEWS-03` (шесть полей, фото, предпросмотр, сохранение/read-back), `REVIEWS-05` (свёрнутые фильтры со сводкой/сбросом), `PERIOD-03` (общий PeriodPicker и действующая API-семантика). Общие ROADMAP/матрица и версии не менялись; глобальную Android-приёмку после интеграции проводит родитель.

## Оставшиеся ограничения и действия родителя

- Подключить три экспортированных компонента в Event/Client/Attention и обновить меню. Два точных маршрута уже готовы; чужие экраны/меню не правились.
- Выполнить совместимую выкладку шести перечисленных серверных файлов, полный Jest, сборку и приёмку на телефоне. АDB-устройства нет; production не использовался, его авторизация повторно не запрашивалась. Commit/deploy/EAS не выполнялись.
- HTTP — localhost/изолированные модели-фикстуры, реальная подпись mobile и handlers/sharp; настоящие MongoDB, облако, push и доставка мессенджера не проверены.
- Новые функции online-only; локальные несохранённые поля не стираются при сетевом сбое. Поиск проверяет только текущую страницу (30 записей), период относится к createdAt/UTC, дата карточки отображается по часовому поясу устройства.
- Нативный предпросмотр воспроизводит поля/палитры и цвета обложек; web-градиенты остаются на публичной странице. Символ ⓘ общего FieldHelp в Linux/RN Web виден пустым глифом; общий UI/фонты не менялись. Нативный глиф и accessibility focus требуют устройства. RN Web использует локальный адаптер неподдерживаемого findNodeHandle и платформенные/network фикстуры; это проверка стенда.

## Полный перечень своих файлов

- `server/clientReviews.js`
- `app/api/client-reviews/route.js`
- `app/api/client-reviews/[id]/route.js`
- `app/api/client-reviews/statuses/route.js`
- `app/api/site/review-page/route.js`
- `app/api/site/review-page/logo/route.js`
- `mobile/src/features/reviews/ClientReviewsScreen.tsx`
- `mobile/src/features/reviews/ClientReviewsSection.tsx`
- `mobile/src/features/reviews/EventClientReviewSection.tsx`
- `mobile/src/features/reviews/EventClientReviewStatus.tsx`
- `mobile/src/features/reviews/ReviewCard.tsx`
- `mobile/src/features/reviews/ReviewPagePreview.tsx`
- `mobile/src/features/reviews/ReviewPageScreen.tsx`
- `mobile/src/features/reviews/api.test.ts`
- `mobile/src/features/reviews/api.ts`
- `mobile/src/features/reviews/domain.ts`
- `mobile/src/features/reviews/hooks.ts`
- `mobile/src/features/reviews/index.ts`
- `mobile/src/features/reviews/lifetime.ts`
- `mobile/src/features/reviews/retry.test.tsx`
- `mobile/src/features/reviews/reviews.test.tsx`
- `mobile/src/features/reviews/styles.ts`
- `mobile/src/features/reviews/types.ts`
- `mobile/app/more/client-reviews.tsx`
- `mobile/app/more/review-page.tsx`
- `tests/server/clientReviewsBearer.test.cjs`
- `tests/server/clientReviewsNative.http.test.cjs`
- `tests/components/clientReviewsNative.browser.test.cjs`
- `docs/android-update/REPORT-B.md`

Новых зависимостей нет. Серверные success DTO и публичная capability-авторизация сохранены; подробные API/props приведены выше. Контрольные SHA-256 исходников и фактические команды/cwd/exit codes/counts сохранены в машинном манифесте.
