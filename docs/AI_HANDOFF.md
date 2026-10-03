# AI Handoff: «Ведело»

Актуально на 2026-09-25. Этот документ — быстрый технический контекст для нового разработчика или ИИ. Перед работой также обязательно прочитать корневой `AGENTS.md` и релевантные части `docs/ROADMAP.md`.

## 1. Идентичность проекта

- Продукт: **«Ведело»**.
- Предыдущее название: **ArtistCRM**.
- Назначение: CRM для малого бизнеса и частных специалистов.
- Основной домен: `https://vedelo.ru`.
- Legacy-домен: `https://artistcrm.ru`.
- GitHub: `https://github.com/Escalion86/vedelo.git`.
- Локальная папка владельца: `D:\Programming\Projects\vedelo`.
- Основная ветка: `main`.
- На момент обновления handoff: web `1.27.29` (миграция legacy-категорий, очистка связей и полировка списка транзакций; деплой `1.26.1` подтверждён владельцем), Android `1.1.0`.

Ключевая ценность продукта: не терять заявки, фиксировать следующий контакт, контролировать задатки/оплаты, сроки работ и документы.

## 2. Что уже завершено

Ребрендинг:

- общая конфигурация `helpers/brand.mjs`;
- web/PWA/Android metadata и графика;
- подпись старого бренда только на legacy-экранах переноса;
- основной домен и canonical URL переведены на `vedelo.ru`;
- публичный маркетинг использует «заказы», артистические SEO-страницы могут использовать «мероприятия».
- на новом origin убрана подпись старого бренда; она сохранена только в
  сценарии переноса установленной legacy PWA;
- Яндекс Метрика переведена на счётчик `112668604` и без отдельного баннера
  загружается только на публичных маркетинговых страницах и `/login`; кабинет
  не отправляет просмотры и цели. Webvisor, clickmap, автоматическое
  отслеживание ссылок, ecommerce и noscript-пиксель отключены;
- PWA-иконки опубликованы по versioned URL `/icons/vedelo-v1/**`, чтобы
  установленные WebAPK получили новый логотип при ребрендинге, несмотря на
  `immutable`-кэш прежних путей;
- юридические документы обновлены, отдельное согласие опубликовано на
  `/personal-data-consent`, регистрация сохраняет даты и версии трёх документов.

Гибкая терминология:

- `SiteSettings.custom.primaryEntityTerminology`: `auto | events | orders`;
- единый resolver со склонениями в `helpers/workItemTerminology.mjs`;
- настройка применяется в web, Android, push, статистике, CSV, календаре, импорте и документах;
- DOCX-переменные: `workItemLabel`, `workItemLabelGenitive`, `workItemLabelPlural`, `workItemLabelPluralGenitive`.

PWA-переезд:

- три этапа 30-дневной кампании;
- одноразовый код входа на пять минут;
- migration shell на `/migrate`;
- перенос push-подписки без дублей;
- redirect matrix `301/308`;
- старый service worker после блокировки оставляет только migration shell.

Документы и файлы:

- каноническое поле `documents[]` у событий и клиентов;
- tenant/tariff/ownership проверки;
- приватное облачное хранение через `cloud.escalion.ru`;
- `storageKey`, SHA-256 checksum, временные signed URL и физическое удаление;
- Android/offline очередь понимает вложения событий и клиентов.

## 3. Что ещё не завершено

Смотри точный статус в `docs/ROADMAP.md`. Главные незакрытые пункты:

- `BRAND-T4`: домен, DNS и TLS работают; остаётся проверка обозначения «Ведело» в МКТУ 9, 35, 42;
- `BRAND-T5`: проверка установленной PWA закрыта по прямому указанию владельца 25.09.2026, деплой 1.26.1 и работа Google Calendar подтверждены им же; остаются платежи, внешние webhooks и не подтверждённые отдельно сценарии авторизации;
- Production-проверка 25.09.2026: 30-дневная кампания уже запущена, оба origin возвращают `phase: announcement`, `day: 10`, `daysLeft: 20`; `/sw.js` и `/service-worker.js` на обоих доменах отдают `vedelo-custom-sw-v5`. Повторно запускать кампанию или менять её дату не нужно. Позднее в тот же день владелец закрыл проверку установленной PWA; нового device-прогона агентом не было;
- Яндекс 360 для бизнеса платный; вместо него создан бесплатный внешний ящик `vedelo@inbox.ru`. Код и deploy-шаблон переключены на него, но перед production-деплоем остаётся проверить приём/отправку и применить `NEXT_PUBLIC_SUPPORT_EMAIL` в фактическом env;
- Android production QA/release;
- реальные E2E Avito и платежей; работоспособность VK, Google Calendar и Telegram Business подтверждена владельцем 25.09.2026. Локальные проверки web-сессий двух tenant завершены в 1.27.1: платежи, Avito/VK/Telegram messenger, Telegram webhook, права ответа и 24-часовое окно. Это не проверка реальной доставки сообщений и банковских уведомлений;
- завершение ухода server collections из Jotai bridge (`OPT-T9`);
- полевые Core Web Vitals публичной главной (`SEO-T9`); лабораторный Lighthouse mobile после деплоя 1.20.1: performance 96, accessibility 96, best practices 100, SEO 100, LCP 1,6 с, CLS 0,001;
- CI-проверки web (`IMP-T4`).

На 2026-09-15 `vedelo.ru` и `www.vedelo.ru` разрешаются в `5.129.192.130`, HTTPS работает, `www` перенаправляется на apex. DNS содержит подтверждения Google Search Console и Яндекс Вебмастера. VK ID web публикует callback нового домена. После деплоя 1.20.1 прошли SEO-check всех 16 публичных страниц, браузерные desktop/mobile проверки регистрации и согласия на Метрику; IndexNow принял 16 URL (`HTTP 202`). Остальные production E2E остаются обязательными.

## 4. Критические правила совместимости

Ребрендинг не означает техническое переименование всех сущностей.

Нельзя менять без отдельного migration-плана:

- `/api/events` и `/api/events/[id]`;
- `eventId`, модель/коллекцию Events;
- Android/iOS package ID `ru.escalion.vedelo` (до 15.09.2026 — `ru.escalion.artistcrm`, пакет опубликованной карточки Play);
- legacy deep-link `artistcrm://`;
- MongoDB-структуру и исторические записи;
- legacy storage-ключи `artistcrm/...` (новые приватные вложения используют `vedelo/...`, оба префикса поддерживаются Cloud);
- заголовок `X-ArtistCRM-Service-Worker`.

Основной deep link — `vedelo://`, но оба scheme должны приниматься.

PartyCRM не входит в новый репозиторий: `app/company`, `app/party`, `app/api/party` отсутствуют. В `proxy.js` и `server/productContext.js` сохранились legacy-условия; это не разрешение развивать PartyCRM здесь.

## 5. Архитектура web

Путь загрузки кабинета:

```text
/cabinet/[page]
  -> NextAuth session
  -> server/fetchProps.js (page-specific tenant payload)
  -> app/cabinet/[page]/cabinet.js
  -> Jotai Provider
  -> components/StateLoader.js
  -> TanStack Query hydration + временный Jotai bridge
  -> CONTENTS[currentPage]
```

Ключевые файлы:

- `app/cabinet/[page]/page.js` — server entry, auth, redirect, `fetchProps`;
- `app/cabinet/[page]/cabinet.js` — client shell и выбор контента;
- `server/fetchProps.js` — page-specific загрузка;
- `components/StateLoader.js` — hydration, offline replay, actions, modals, tariff/page guards;
- `layouts/content/contentsMap.js` — карта страниц;
- `state/itemsFuncGenerator.js` — legacy-compatible CRUD facade;
- `helpers/useEventsQuery.js`, `helpers/useClientsQuery.js`, `helpers/useEntityQueries.js` — query/mutation слой;
- `state/` — UI state и временный compatibility bridge.

Не подставляй фиктивный пустой `initialData` в query hooks: это может задержать реальную загрузку до истечения `staleTime`.

## 6. Auth и tenant isolation

С 1.30.1 `server/telefonipBalance.js` читает Telefon-IP `get_balance` с текущим
TELEFONIP-ключом. Dev-only GET `/api/site/phone-auth` возвращает свежий остаток
и время проверки; страница позволяет обновить его вручную. `/api/billing/renew`
проверяет баланс при каждом авторизованном запуске. При остатке ≤100 ₽ или
ошибке API отправляет Web/Expo push разработчикам, не чаще раза в 24 часа
(атомарная отметка в глобальном `telefonipBalance.lastAlertAt`). При отсутствии
доставки отметка снимается для повторной попытки. Сбой мониторинга не прерывает
продление подписок. Секрет и сырые ошибки провайдера не возвращаются/не логируются.

С 1.30.0 `Настройки сайта → Авторизация` (`/cabinet/phone-auth`, dev-only API
`/api/site/phone-auth`) сохраняет глобальный `phoneVerification.primaryMethod`.
Web/PWA start с `method: preferred` выбирает звонок или прямое SMS; старые
клиенты сохраняют call-first. `server/phoneAuthSettings.js` читает только
глобальную запись, обычный tenant POST /api/site это поле не меняет.
Без явно заданного SMS webhook используется Telefon-IP get_sms_code с текущим
TELEFONIP-ключом; вебхук остаётся совместимым override. Коды криптографические,
Telefon-IP — 4 цифры, запрос имеет timeout и безопасную ошибку. Блок ввода кода
вынесен из LoginInputs, чтобы не терять фокус при вводе. Call polling прекращается
после перехода на SMS и не снимает уже полученное подтверждение.
Production-доставка не проверена; локальный стенд использует mock Telefon-IP.

С 1.29.1 SMS fallback регистрации допускает существующего пользователя без
пароля, как start/finalize (в том числе добавление пароля VK-аккаунту).
`tests/server/phoneSms.test.cjs` проверяет отправку/ввод кода с mock-зависимостями
и изоляцию phone/flow. Это не проверка реальной доставки. Контракт и ограничения
SMS описаны в `docs/ENV_VARIABLES.md`.

В 1.27.1 `/api/billing/{tochka,yookassa}/sync` валидирует ObjectId (400) и для обычного пользователя ищет платёж одновременно по `userId` и `tenantId` (чужой — 404). Служебные admin/dev сохраняют межпользовательский доступ. `tests/web/integrationIsolationSmoke.mjs` проверяет реальные credentials-сессии на временной БД, в том числе подмену tenant/role, историю платежей, запрет чужих диалогов/привязок, секреты webhook, повторную доставку и удаление сообщений Telegram. История платежей без `limit` возвращает до 30 записей. Проверка: 15 новых HTTP-сценариев, общий серверный набор 38 passed / 2 browser skipped, 12 unit-тестов, точечный ESLint и build прошли. UI в этой итерации не менялся. Для параллельной работы `NEXT_DIST_DIR=.next-isolation` задаёт отдельную папку как сборке, так и HTTP runner; по умолчанию остаётся `.next`.

- NextAuth: `app/api/auth/[...nextauth]/_options.js`.
- Server tenant: `server/getTenantContext.js`.
- Mobile auth/session: `server/mobile/` и `/api/mobile/v1/auth/**`.
- Tenant обычно определяется как `user.tenantId || user._id`.

Для каждого защищённого endpoint:

1. получить авторизованного пользователя;
2. получить и проверить валидный tenant;
3. включить `tenantId` во все Mongo queries/updates;
4. не принимать tenant/owner из payload как доверенное значение;
5. вернуть безопасную ошибку без секретов и персональных данных;
6. добавить negative test для чужого tenant, если меняется доступ к данным.

## 7. Основная доменная сущность

С версии 1.31.0 Web/PWA сохраняет видимость прошедших `draft`: фильтр «Заявки» включён по умолчанию в «Прошедших» (также при чтении старых сохранённых настроек без `request`), быстрый фильтр «Требуют решения» объединяет их с незакрытыми подтверждёнными работами. `/api/events?scope=past` принимает `statusRequest`; старые URL без него сохраняют прежнюю выборку. Статус автоматически не меняется.
- v1.31.3: контроль заявок с прошедшей датой во «Важном» доступен всем независимо от тарифа. Ограничение 1.31.1 отменено; поле `allowPastRequests` удалено из кода и настроек тарифов. Старое значение в БД игнорируется, миграция не нужна.

`helpers/pastRequests.js` определяет прошедшую заявку по `dateEnd ?? eventDate`; без корректной даты она не считается прошедшей. `components/PastRequests.js` во «Важном» получает все draft из общего Query-кэша, показывает их независимо от задач и предлагает закрытие, отмену с причиной и перенос даты. Такие заявки исключены только из блока «Без следующего шага», напоминания сохраняются. Редактор статуса принимает `initialStatus`, загружает транзакции конкретной заявки и сохраняет данные до закрытия окна. Редактор работы ждёт получения карточки перед инициализацией полей; `focusDates` раскрывает даты в компактной форме. HTTP/browser-регрессия: `tests/web/pastRequests.integration.test.mjs` (временная MongoDB, готовая сборка; `PAST_REQUESTS_BROWSER=1` включает Playwright/Edge, `QA_SCREENSHOT_DIR` задаёт внешнюю папку снимков).

С версии 1.26.0 в Web/PWA «Важное» есть блок «Заявки без следующего шага» (`components/RequestsWithoutNextStep.js`). Он получает все draft-заявки через tenant-защищённый `/api/events?scope=drafts`, включая заявки без даты и с прошедшей датой. Заявка попадает в блок, если в `additionalEvents[]` нет невыполненной задачи с корректной датой; просроченная задача считается назначенной и не дублируется здесь. «Назначить контакт» открывает существующий редактор задач; после сохранения Query cache обновляет список. Ошибка сохраняет введённые поля в редакторе.

Публичная таблица тарифов использует `isPublicTariffFeatureAvailable` с тем же fallback `allowProposals ?? allowDocuments`, что и кабинет, и показывает Telegram Business при доступности хотя бы в одном тарифе. `TariffConditions` поясняет месячный лимит и дополнительные расходы на главной и в выборе тарифа. Цены и флаги тарифов не менялись.

Внутреннее имя — event, пользовательское — мероприятие или заказ.

Статусы:

- `draft` — заявка/черновик;
- `active` — подтверждено;
- `canceled` — отменено;
- `closed` — закрыто.

Главные файлы:

- `schemas/eventsSchema.js`, `models/Events.js`;
- `app/api/events/route.js`;
- `app/api/events/[id]/route.js`;
- `layouts/content/EventsContent.js`;
- `layouts/cards/EventCard.js`;
- `layouts/modals/modalsFunc/eventFunc.js`;
- `layouts/modals/modalsFunc/eventViewFunc.js`;
- `server/CRUD.js` — Google Calendar sync.

`additionalEvents[]` — задачи контактов/напоминания. Важные поля синхронизации: `calendarImportChecked`, `googleCalendarEventId`, `calendarSyncError`.

Компактная форма (24.09.2026, 1.24.8): `eventFunc.js` по умолчанию использует `components/CompactEventForm.js` для всех ролей. С версии 1.24.15 выбор «Классическая» / «Компактная» находится в общих настройках организации (`SiteSettings.custom.eventFormVariant`); переключателя в редакторе нет. При отсутствии настройки, в том числе у нового аккаунта, используется компактная форма; подпись выбора в настройках использует текущую терминологию заказа/мероприятия. В draft дата необязательна при компактной форме; клиент обязателен, `eventType` («Тип события») и услуги необязательны для всех статусов. Для подтверждённой работы дата по-прежнему обязательна. Выбор услуг — отдельная модалка с применением/отменой; клиент, запрос и прочие контакты объединены в раскрываемый раздел. Tenant и тарифные проверки не менялись.

С версии 1.27.22 заголовок каждого раскрываемого раздела компактной формы получает фиолетовую AI-подсветку, пока внутри остаётся хотя бы одно подсвеченное поле. Подсветка раздела исчезает вместе с подсветкой последнего вручную изменённого AI-поля и поддерживает светлую и тёмную темы.

С версии 1.24.16 меню карточки показывает «Клиент и контакты» только для классической формы. Пункт финансов в компактном режиме называется «Финансы» и раскрывает только раздел стоимости и задатка; классический режим сохраняет вкладку «Финансы и документы».

## 8. Терминология

Источник: `helpers/workItemTerminology.mjs`.

Алгоритм `auto`:

```text
onboardingActivityPreset === events -> events
другая известная специализация      -> orders
пустая/неизвестная                  -> events
```

Ручное значение всегда важнее специализации. Используй resolver для заголовков, ошибок и документов. Не заменяй строки `events`, `eventId` и API paths.

Mobile-реализация:

- `mobile/src/shared/domain/workItemTerminology.ts`;
- `mobile/src/shared/hooks/useWorkItemTerminology.ts`;
- настройка: «Ещё → Организация → Настройки»;
- endpoint: `/api/mobile/v1/settings/terminology`.

## 9. PWA и перенос origin

PWA origin-bound: service worker, storage, session и push нельзя автоматически перенести редиректом.

Основные файлы:

- `public/manifest.json`, обязательный `id: "/"`;
- `server/serviceWorkerScript.js`;
- `app/sw.js/route.js`, `app/service-worker.js/route.js`;
- `helpers/domainMigration.mjs`;
- `server/domainMigration.js`;
- `models/DomainMigrationCodes.js`;
- `components/DomainMigrationBanner.js`;
- `app/migrate/**`;
- `proxy.js`;
- `server/pushNotifications.js`;
- `docs/BRAND_AND_PWA_MIGRATION.md`.

Кампания запускается только переменной `BRAND_MIGRATION_STARTED_AT` с неизменным ISO-8601 временем во всех инстансах:

- дни 1–14 — закрываемая плашка;
- дни 15–29 — постоянная плашка со счётчиком;
- день 30+ — старый кабинет заменён migration shell.

Код переноса:

- 32 криптографических байта, наружу base64url;
- в Mongo хранится только SHA-256;
- TTL пять минут;
- привязан к user, tenant, source/target origin;
- погашается атомарно один раз;
- передаётся во fragment `#code=...`, затем URL немедленно очищается;
- новый NextAuth provider создаёт обычную сессию только на `vedelo.ru`.

Redirect matrix:

- старые публичные HTML → `301` на `vedelo.ru`;
- внешние API/webhooks → `308`;
- дни 1–29 старый кабинет/API работает;
- день 30+: кабинет → `/migrate`, деловые/auth API → `410`;
- остаются manifest, SW, assets, migration endpoints и `/api/push/unsubscribe`.

## 10. Push

- С 1.27.33 входящие сообщения Telegram/VK/Avito ведут на `/cabinet/clients?openMessenger=<clientId>`. `ClientsContent` выбирает клиента только из tenant-scoped списка, показывает его контакт в поиске и открывает существующий messenger после загрузки данных и функций модалок. Пока поиск не изменён, фильтр точный по ID; очистка снимает URL-параметр. Записи звонков сохраняют прежний переход к мероприятию.
- Web subscriptions: `PushSubscriptions.webAppOrigin = artistcrm | vedelo`.
- Старые записи без поля считаются `artistcrm`.
- Новая подписка создаётся только после разрешения пользователя.
- После успешной подписки Vedelo отключается ровно соответствующий legacy endpoint.
- На 30-й день старым подпискам отправляется одно последнее migration-уведомление, затем деловые уведомления прекращаются.
- Cron endpoint: `POST /api/push/domain-migration`, защищён `PUSH_REMINDERS_CRON_SECRET` или `CRON_SECRET`.

## 11. Документы и файлы

Каноническое поле событий и клиентов — `documents[]`. В 1.26.1 устранены оставшиеся запреты сохранения draft с документами в POST/PUT событий; редактор сохраняет приватные `storageKey`, сервер повторно ограничивает их уже принадлежащими событию ключами. Тарифная проверка учитывает также legacy `documentFiles` и массивы ссылок. Общие части:

- `schemas/documentSchema.js`;
- `helpers/entityDocuments.js`;
- `components/DocumentsEditor.js`;
- `server/entityDocumentFiles.js`;
- `server/entityDocumentRouteHandlers.js`.

Новые файлы хранят `storageKey`; legacy URL продолжают читаться. До upload/access/delete сервер проверяет tenant, тариф и принадлежность сущности. Сначала разворачивается совместимое API `cloud.escalion.ru`, затем Vedelo.

Подробный контракт: `docs/superpowers/plans/2026-09-14-work-item-client-attachments.md`.

### Web/PWA 1.27.0: независимые документы и КП

- `DocumentCreateDialog` начинает с типа документа; договор, счёт, чек, акт и КП независимы, включая `draft` и `isByContract=false`.
- Web-генерация: `/api/events/[id]/documents/generate` → `server/webDocumentGeneration.js`; проверка переменных, серверный номер, private upload, идемпотентный `requestId`. `DocumentGenerations` хранит снимок для повтора, после завершения очищает base64 шаблона. Повтор удалённого документа возвращает 410; новый запрос создаёт новый документ. Пропуски номеров при конкурентном резервировании допустимы.
- `documents[]` дополнен `number`, `documentDate`, `templateId`, `transactionId`. Чек загружается готовым файлом/ссылкой; связь с денежным поступлением необязательна и проверяется по tenant + event. POST/PATCH `/api/events/[id]/documents` сохраняют ссылки и связь чека; обычные POST/PUT событий и file-upload тоже проверяют принадлежность оплаты.
- КП создаётся и без шаблона; варианты поддерживают `manualTotal`, удаление строк/вариантов. `ProposalPageView` общий для клиента и предпросмотра. Полный применённый состав сохраняется в `event.agreedProposal` только серверным действием; при формировании DOCX его можно явно выбрать вместо текущих данных заказа.
- `appliedPackageId`/`appliedSelectionAt` отличают применённый вариант от нового выбора клиента. Применение не создаёт документы и недоступно для закрытого/отменённого заказа. Прежний dev-only rollout КП сохранён.
- Пример акта доступен по `/api/document-templates/examples/act`, бинарный ассет не добавлялся. Инструкции: `docs/DOCX_DOCUMENTS_GUIDE.md`, `docs/COMMERCIAL_PROPOSALS_GUIDE.md`.
- Android-клиент и его endpoint генерации не менялись. Web-проверки используют существующий изолированный HTTP harness с временной MongoDB и mock cloud; сценарий добавлен в `tests/server/webDocumentWorkflowSmoke.mjs`.

## 12. Mobile

- Expo/React Native в `mobile/`.
- Архитектура: `docs/MOBILE_APP_ARCHITECTURE.md`.
- API: `/api/mobile/v1/**`.
- Package ID нового приложения — `ru.escalion.vedelo`; `ru.escalion.artistcrm` сохранён только у ранее опубликованной карточки Play.
- Dev package ID: `ru.escalion.vedelo.dev`.
- Schemes: `vedelo`, `artistcrm`; dev schemes: `vedelo-dev`, `artistcrm-dev`.
- EAS project ID нового приложения: `e7d84863-fe06-4058-a9c7-c381e5d3b98a` (`@escalion/vedelo`, slug `vedelo`). Проект `@escalion/artistcrm` (`7772a8bd-ffb8-4ee9-b4d6-53019cc3994f`) остаётся у опубликованного приложения с пакетом `ru.escalion.artistcrm` — там же лежит его upload-keystore.
- Offline: локальное хранилище, очередь операций, tombstones, pull/push sync, retry/conflict presentation.
- Перед изменением API сохраняй обратную совместимость с установленными версиями Android.

Проверка:

```bash
cd mobile
npm run typecheck
npm test
npm run doctor
```

## 13. Интеграции

- Google Calendar: `app/api/google-calendar/**`, `server/googleUserCalendarClient.js`, `server/CRUD.js`.
- Public Leads/Tilda: `app/api/public/lead/**`, `docs/PUBLIC_LEADS_API.md`.
- VK: `app/api/integrations/vk/**`, `models/Vk*`, `docs/VK_GROUP_INTEGRATION_GUIDE.md`.
- Avito: `app/api/integrations/avito/**`, `models/Avito*`, `docs/AVITO_INTEGRATION_GUIDE.md`.
- Telegram Business: `app/api/integrations/telegram/**`, `server/telegramBusiness.js`, `docs/TELEGRAM_BUSINESS_INTEGRATION.md`.
- Telephony/calls: `app/api/telephony/**`, `models/Calls.js`, `docs/TELEPHONY_AI_INTEGRATION_PLAN.md`.
- Billing: `app/api/billing/**`, `server/yookassa.js`, `server/tochka.js`.
- Аналитика сервиса: `/cabinet/service-analytics` и `/api/developer/analytics`, только `dev`; вкладки «Обзор», «Деньги», «Рост». Поступления не смешиваются со списаниями и бонусами. `ServiceActivityDays` собирает дневные посещения Web/PWA для будущего удержания. Формулы, границы покрытия и проверки: `docs/SERVICE_ANALYTICS.md`.
- Основной web-провайдер пополнений и доплаты за тариф — Точка; кнопка ЮKassa в web доступна только разработчику.
- Реферальные начисления: `server/referralRewards.js`, `docs/REFERRAL_SYSTEM.md`. Retry через webhook/sync и `/api/billing/renew`; скрытые отметки `Users.referralRewardCredits` обеспечивают однократное изменение баланса и должны сохраняться после удаления бонуса. VK присваивает реферера только при создании аккаунта; Android принимает приглашение через deep link.
- Пользовательская история расчётов с сервисом находится на
  `/cabinet/billing-history`, получает безопасный cursor-paginated DTO из
  `/api/billing/history` и не смешивается с рабочими доходами/расходами из
  `Transactions`. Администратор и разработчик могут открыть тот же безопасный
  экран из меню карточки пользователя. В нём объединены история, пополнение,
  смена тарифа, удаление ручных операций/реферальных бонусов и ручное списание
  с датой и обязательной причиной. Списание выполняется сразу, без изменения
  срока тарифа; дата операции может быть в прошлом. В `Payments.createdAt` и
  `paidAt` сохраняется выбранная дата, в `recordedAt` — время внесения записи.
  Повтор запросов защищён скрытыми `Users.manualBalanceCharges` и
  `Users.paymentReversals`; их нельзя удалять вместе с записью платежа.
  Отрицательный баланс запрещён. Сериализация, права и tenant-фильтр:
  `server/paymentHistory.js`; списания: `server/manualBalanceCharge.js`.
- Для проведённых пополнений баланса и оплат тарифа `Payments.receiptUrl` хранит HTTPS-ссылку
  на чек, а `Payments.receiptNotRequired` — обратимую отметку разработчика «Чек не нужен».
  Только роль `dev` может сохранить или удалить ссылку либо изменить отметку через
  `PATCH /api/billing/receipts/[id]`; сервер проверяет пользователя, tenant и
  тип операции. Ссылка видна пользователю в «Баланс и платежи», разработчику —
  также в «Все операции». `GET /api/billing/receipts/pending-count` возвращает
  разработчику число проведённых поступлений без чека для бейджей группы
  «Настройки сайта» и пункта «Все операции». Список поддерживает фильтр
  `receipt_missing`; оба используют общий Mongo-фильтр, исключающий отмеченные операции.
- Вход разработчика в кабинет пользователя выполняется через одноразовый
  impersonation ticket. После `signIn` переход должен оставаться относительным
  (`/cabinet/eventsUpcoming`): абсолютный URL от `NEXTAUTH_URL` нельзя
  использовать, иначе legacy PWA может сменить origin до применения cookie.
- Точка использует сертификаты Минцифры; production-процесс Node должен
  стартовать с `NODE_EXTRA_CA_CERTS`, указывающим на PEM bundle из Russian
  Trusted Root CA и Russian Trusted Sub CA. Системного trust store для Node
  недостаточно; не отключать TLS-проверку.
- AI: общий AITunnel оплачивается из баланса; пользовательский ключ настраивается отдельно и не тарифицируется платформой.

OAuth и payment callbacks во время миграции должны доверять обоим разрешённым host. Cookie между доменами не переносить.

## 14. Окружение

Никогда не копируй реальные значения в документацию или логи.

Минимум:

```env
DOMAIN=http://localhost:3000
MONGODB_URI=...
MONGODB_DBNAME=artistcrm_dev
NEXTAUTH_SECRET=...
```

Полный список — `.env.example`, `.env.deploy.example`, `docs/ENV_VARIABLES.md`.

Production-критично:

- `DOMAIN=https://vedelo.ru`;
- `NEXTAUTH_URL=https://vedelo.ru`;
- `BRAND_MIGRATION_STARTED_AT` только при фактическом старте кампании;
- OAuth/payment callback обоих доменов;
- VAPID и cron secrets;
- `ESCALIONCLOUD_PASSWORD`;
- TLS до переключения трафика.

## 15. Тесты и проверка

Базовый web-набор:

```bash
npm run build
npm run lint
```

Точечные тесты:

```bash
node --test helpers/domainMigration.test.mjs helpers/workItemTerminology.test.mjs
npx eslint path/to/changed-file.js
```

Дополнительные scripts:

- `npm run test:file-import`;
- `npm run test:mobile-server`;
- `npm run test:mobile-http`;
- `npm run seo:check`;
- `npm run history:migrate`;
- `npm run proposals:migrate-tariffs`.

Историческая локальная приёмка ребрендинга: production build прошёл, 19/19 focused-тестов прошли, Android typecheck прошёл. В 1.26.3 устранены найденные 25.09.2026 замечания ESLint (52 ошибки/4 предупреждения): полный lint проходит. Убраны чтения/записи refs в render, лишние эффекты производного состояния и неиспользуемые подавления; для первоначальной HTTP-загрузки и гидратации browser storage оставлены локальные исключения с объяснениями. Проверены 41 focused-тест, production build и HTTP/browser-набор 24/24; интерфейс — 1365/390 px, light/dark.

Создание web-клиента в 1.26.3 использует `Idempotency-Key` с первой попытки и сохраняет его в offline-очереди. `server/clientCreation.js` выводит `_id` из tenant и ключа; уникальный индекс MongoDB предотвращает повторную вставку при потере ответа. Скрытый неизменяемый `Clients.webCreateFingerprint` проверяет совпадение исходного payload (иначе 409). Повтор возвращает текущего клиента без новой записи истории. Старые очереди получают ключ из `item.id` при replay; сервер не может дедуплицировать ранее выполненный запрос без ключа. Эта защита относится к POST `/api/clients`, а не ко всем операциям offline-очереди. Восемь restart/two-tab прогонов после исправления прошли.

Для значимых UI-изменений build недостаточен: проверить реальный экран, mobile viewport, console, dark theme и основное взаимодействие.

## 16. Документация по задачам

С 1.27.35 `activityHistoryCore.getTaskSemanticAction` определяет действия задач
только для update. Web/PWA `HistoryFeed` отдаёт приоритет operation=create
над старым semanticAction, учитывает текущую терминологию и показывает при
создании только новые значения. Сохранённые записи журнала не мигрируются.

С версии 1.27.34 список пользователей получает вычисляемое `lastMutationAt`
через `server/userMutationActivity.js` в SSR и GET `/api/users`. Это максимум
времени создания/изменения/удаления/объединения из `Histories` для пары
tenant + автор. `Users.lastActivityAt` остаётся временем посещения и не
используется для этой сортировки. Автоматические интеграции, чужие действия
и legacy-записи без tenant исключены; операции вне журнала не учитываются.
Карточка показывает время устройства и «Нет данных» при отсутствии истории.

- Roadmap: `docs/ROADMAP.md`.
- Production env: `docs/PRODUCTION_ENV_CHECKLIST.md`.
- PWA/домен: `docs/BRAND_AND_PWA_MIGRATION.md`.
- Android release: `docs/ANDROID_RELEASE_CHECKLIST.md`.
- Backup/restore: `docs/ARTISTCRM_BACKUP_RESTORE_RUNBOOK.md` — имя историческое, процедуры актуальны только после проверки.
- Security: `docs/ARTISTCRM_P0_SECURITY_AUDIT.md` — исторический snapshot, не заменяет новый аудит.
- Public API: `docs/PUBLIC_LEADS_API.md`.
- DOCX: `docs/DOCX_DOCUMENTS_GUIDE.md`.
- Support: `docs/SUPPORT_TICKETS.md`.
- Обучение Web/PWA (22.09.2026): `docs/LEARNING.md`; `/cabinet/learning`, каталог `helpers/learningCatalog.mjs`, персональный прогресс `LearningProgress` через `/api/learning`. Советы после рабочего обзора в «Важном» выбираются с интервалом три активных дня, прогресс изолирован по tenant/user. Отдельно от новостей и общих настроек организации.
- SEO: `docs/SEO_POST_DEPLOY.md`, `docs/SEO_MONITORING_CHECKLIST.md`.
- Финальное отделение бренда: `docs/VEDELO_FINAL_SEPARATION_CHECKLIST.md`.

Многие старые документы и имена файлов содержат ArtistCRM. Это допустимо как история. Для новых пользовательских текстов использовать «Ведело», а старое имя — только на legacy-экранах переноса или в технической совместимости.

## 17. Первый рабочий цикл нового ИИ

1. Выполнить `git status --short`; не затирать чужие изменения.
2. Прочитать `AGENTS.md`, этот документ и релевантный roadmap.
3. Найти текущую реализацию через `rg`, а не доверять только старому документу.
4. Сформулировать узкую область изменения и связанные риски tenant/PWA/mobile.
5. Внести минимальные правки.
6. Добавить или обновить focused-тесты.
7. Прогнать ESLint изменённых файлов и релевантные тесты; для релиза — build.
8. Проверить UI в браузере, если он изменился.
9. Обновить roadmap/документацию и версию только по правилам `AGENTS.md`.
10. В итоговом сообщении отделить выполненный код от внешних production-действий.

### Редактор КП: каталог и свои позиции (2026-09-25)

`components/ProposalLineEditor.js` использует tenant-scoped каталог из `useServicesQuery`. Выбор услуги копирует название, описание и цену через `proposalLineFromService`; правки меняют только снимок КП. Выбор своей позиции очищает `serviceId`, сохраняя содержимое. Удалённая услуга не уничтожает сохранённый снимок. `ProposalPageView` показывает описание позиции. Дополнительные тексты, сообщение и медиа свёрнуты. Проверка сценария и изоляции каталога добавлена в `tests/server/webDocumentWorkflowSmoke.mjs`.

Редактор КП открывается через `modalsFunc.add` стандартного стека. `EventProposalsSection` с `initialProposal` работает как содержимое отдельной модалки; `onChanged` обновляет список в родительской форме, `closeModal` закрывает редактор после публикации. Сравнение снимка включает стандартное предупреждение `setOnShowOnCloseConfirmDialog`.

В компактной форме число документов отображается в summary раздела («Документов: N»). `DocumentsEditor.showHeading=false` скрывает внутренний заголовок; внешний `LabeledContainer` в `eventFunc` показывает подпись только для классической формы.

КП выбирает услуги через `selectEventServicesFunc`; `reconcileProposalServices` сохраняет изменённые снимки, свои и недоступные позиции, добавляет новые услуги из Query cache, удаляет снятые доступные услуги. Лимит 30 позиций проверяется до изменения варианта. Общие правила UI: `docs/UI_CONVENTIONS.md`.

### Транзакции (1.27.27)

С 1.27.31 кнопки очистки связей используют красный ластик (`faEraser`) вместо метёлки.

С 1.27.32 `transactions:migrate-categories` загружает настройки через `@next/env`
с раскрытием ссылок на переменные, как Next.js. Флаг Node `--env-file` не нужен:
он оставлял ссылки в URI нераскрытыми. Диагностика выводит безопасный тип/числовой
код ошибки без секретов. Реальный dry-run прошёл: 753 legacy-записи, 0 изменений.

В 1.27.28 дата на карточке транзакции оформлена как у мероприятия: день недели + число, месяц, время. Подпись даты/срока обязательства доступна в подсказке блока. В 1.27.29 убран отступ 16 px между фильтрами и списком транзакций.

Legacy-категории исключены из web-выбора. `helpers/transactionCategory.mjs` нормализует старые коды для API, редактора и подписей. Скрипт миграции и порядок запуска: `docs/TRANSACTION_CATEGORY_MIGRATION.md`; production-миграция не выполнялась. `ClientPicker` и `EventPicker` поддерживают необязательный `onClear` (красная метёлка внутри поля). При очистке клиента транзакции снимается также связанное мероприятие с клиентом, иначе API автоматически восстановит связь.

С 1.27.37 позиции в редакторе КП показаны компактными карточками. `ProposalLineDialog` хранит локальный снимок и применяет его только по подтверждению; `ProposalLineEditor` используется внутри модалки. Удаление позиции подтверждается, общий итог пересчитывается при автоматической цене. Множественный выбор каталога сохранён. Отметка «Рекомендуем» использует общий IconCheckBox внутри доступной с клавиатуры кнопки-checkbox.

С 1.27.38 `useEventProposalsQuery` хранит общий список КП по `queryKeys.eventProposals(eventId)`. Мутации создают/обновляют снимок в кэше после отмены старых GET; публикация обновляет список до закрытия модалки. Callback в размонтированную форму больше не используется. `EventPublishedProposals` в просмотре мероприятия показывает только published-карточки; прежний canUseProposalBuilder и серверный tenant-доступ сохранены.

С 1.28.0 КП хранит `appearance: { theme, logoUrl }`. Темы classic/light/blue/dark из `helpers/proposalAppearance.mjs` используются общим `ProposalPageView` с изолированным CSS-модулем. `ProposalAppearanceEditor` меняет локальный снимок; сохранение идёт обычным PATCH. POST `/api/proposals/[id]/logo` проверяет tenant, dev-доступ, тариф, draft и принадлежность мероприятия, декодирует PNG/JPG/WebP ≤5 МБ через sharp и загружает WebP ≤640×320 в `vedelo/<tenant>/proposals/<id>/logos/<uuid>`. Внешние и чужие tenant URL не принимаются. Файл публичный, удаление из оформления не удаляет общий ресурс старых версий. Clone переносит оформление; public API возвращает нормализованный снимок, legacy использует classic.

С 1.28.1 карточки КП всегда показывают карандаш и корзину: карандаш меняет draft или клонирует другую версию; удаление разрешено только без selectedPackageId. Отзыв принятого КП запрещён. DELETE и revoke используют атомарный tenant-фильтр по отсутствующему выбору; публичное сохранение выбора использует `$where` по status=published и tenant до побочных действий, чтобы принятие не прошло после отзыва/удаления.

С 1.28.2 карточки «Задачи/События» в редакторе заказа используют одну колонку на всех ширинах. Общий блок reminders в eventFunc применяется в компактной и классической форме.

С 1.28.3 EventProposalsSection показывает LoadingSpinner и role=status, пока loading шаблонов/инвалидации или isFetching списка КП активны. При обновлении карточки остаются видимыми; подпись меняется с «Загружаем…» на «Обновляем…». Кнопка создания заблокирована на тот же период. Проверка задержанных ответов и фонового refetch добавлена в компонентные тесты.

С 1.28.4 CompactEventForm получает onEditClient из eventFunc и показывает стандартный квадратный карандаш справа внутри поля выбранного клиента. Редактирование вызывает modalsFunc.client.edit(clientId), выбор клиента остаётся отдельной кнопкой. Без клиента карандаш скрыт; для закрытого заказа заблокирован вместе с формой.

С 1.28.5 стандартное сообщение КП использует нейтральное «Предложение для вашего мероприятия можете посмотреть по ссылке: …». DEFAULT_PROPOSAL_MESSAGE и normalizeProposalMessage в proposalContent едины для новых шаблонов/снимков и серверного копирования/Telegram. Только точный прежний стандартный шаблон обновляется при формировании сообщения, пользовательские тексты сохраняются; массовой миграции БД нет.

С 1.28.6 по решению владельца DELETE КП разрешён и после выбора клиента: фильтр удаления содержит _id + tenantId, без selectedPackageId. В UI корзина доступна, удаление всегда требует подтверждения с предупреждением о выборе клиента и сохранении ранее применённых данных заказа. event.agreedProposal, услуги и сумма не удаляются. Отзыв принятого КП по-прежнему запрещён. Это заменяет ограничение удаления из 1.28.1.

С 1.28.7 EventProposalsSection управляет стандартным футером через setOnConfirmFunc/setConfirmButtonName/setDisableConfirm. «Сохранить» регистрируется только при отличии editing от savedSnapshot, успешное сохранение оставляет окно открытым. Публикация выполняется с карточки draft в списке, без сохранения из редактора.

С 1.28.8 текстовые действия карточки КП используют AppButton с семантическими вариантами. Для выбранного клиентом предложения отзыв заблокирован атрибутом disabled и проверкой action до запроса; серверный tenant-фильтр отзыва не менялся.

С 1.28.9 GET /api/proposals/statuses отдаёт только карту eventId → sent/accepted для текущего tenant и dev-доступа, без токенов и клиентских снимков. EventProposalStatus использует общий Query-кэш (без N+1 запросов на карточки), polling 30 секунд; мутации КП инвалидируют summary. proposalStatus.mjs единообразно учитывает выбор/отправку и срок; принятое имеет приоритет. EventPublishedProposals показывает ProposalStatusChip и сохраняет принятые истёкшие предложения. StatusChip получил семантические info/success на существующих цветах обеих тем.

С 1.29.0 «В Telegram» на карточке КП заменена «Отправить». EventProposalsSection получает renderedMessage через существующий GET и копирует его, затем открывает ProposalShareDialog через стандартный стек. Диалог читает текущего клиента через useClientQuery, использует proposalContactOptions и сохраняет текст при отказе Clipboard API. MAX не копирует номер поверх сообщения. Переход по внешнему контакту не отправляет сообщение и не меняет sentAt; endpoint send-telegram сохранён.

С 1.31.2 dev-only ограничение КП снято: canUseProposalBuilder принимает вычисленный тарифный доступ. Все приватные endpoints шаблонов/КП, статусов, логотипа и Telegram проверяют allowProposals; UI использует тот же getUserTariffAccess. Доступ только через действующий тариф (trial не обходит флаг), legacy allowDocuments наследуется только при отсутствующем/null allowProposals. Tenant-фильтры и публичные токенизированные ссылки сохранены. Это заменяет упоминания dev-only КП в исторических записях выше.


### Отзывы клиентов (1.32.0)

`allowClientReviews` — отдельный opt-in флаг тарифа, без наследования документов
и обхода trial. Web/PWA: `EventClientReview` в просмотре работы,
`EventClientReviewStatus` на карточке (общий Query-кэш),
`/cabinet/client-reviews`, отзывы в клиенте и непрочитанные во «Важном».
Одна `ClientReviews` запись на tenant/event содержит приглашение и атомарный
ответ. `/review/[id]#secret` передаёт секрет только в Authorization API;
в БД nonce/HMAC hash, срок 30 дней, отзыв доступа и перевыпуск. Публичный приём
проверяет живые связи, но не текущий тариф: отключение не ломает старые ссылки.
Просмотр/заметки/прочтение доступны без опции. Слияние клиентов переносит связь.
Нативного Android UI и автоматических рассылок нет; mobile access/billing DTO
дополнены флагом. Подробности: `docs/CLIENT_REVIEWS.md`.
Проверки: 12 unit, 9 HTTP/browser с изолированной MongoDB, 1365/390 px обе темы,
реальный переключатель тарифа; ESLint и build прошли. Production не менялся.

### Персональная страница отзыва (1.33.0)

Аддитивное развитие: `Настройки → Страница отзывов` (`/cabinet/review-page`)
задаёт публичное оформление — имя, специализацию, фото/логотип, короткое
обращение, акцент из палитры и обложку из готовых шаблонов — с живым
предпросмотром формы и карточки ссылки. Хранение — `SiteSettings.reviewPage`
(умолчания в схеме, миграция не нужна). API: `GET/POST /api/site/review-page`
(tenant-aware, валидация длин/палитр/ссылки, сохранение требует
`allowClientReviews`), загрузка фото `POST /api/site/review-page/logo` (sharp →
WebP ≤640, облако `vedelo/<tenant>/review-page/logo/<uuid>`, без server-fetch).
`/review/[id]` строит персональные og/twitter-метаданные с абсолютными URL из
**только явно сохранённого публичного оформления** по ID приглашения — без
имени клиента, даты, оценки, текста, состояния, сумм; без персонализации,
для invalid/revoked/истёкших ссылок и в краулере, которому недоступен
`#fragment`, — нейтральный fallback (общая OG-картинка). Секретный GET
дополнительно отдаёт нормализованное `appearance` (6 полей) для формы,
предпросмотра и благодарности; hash capability, одноразовый ответ, срок,
перевыпуск, tenant-изоляция и `noindex`/`no-referrer` не изменены.
Проверки: unit `helpers/reviewAppearance.test.mjs`, интеграционные
HTTP/browser-сценарии в `tests/web/clientReviews.integration.test.mjs`
(+tenant-negative, save/re-read, defaults, metadata без секрета, valid/branded/
revoked/expired, загрузка фото через mock облака, submit workflow), гейты
ux-ui по снятым HTML. Production не менялся.
