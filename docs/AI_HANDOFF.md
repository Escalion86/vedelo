# AI Handoff: «Ведело»

Актуально на 2026-09-15. Этот документ — быстрый технический контекст для нового разработчика или ИИ. Перед работой также обязательно прочитать корневой `AGENTS.md` и релевантные части `docs/ROADMAP.md`.

## 1. Идентичность проекта

- Продукт: **«Ведело»**.
- Предыдущее название: **ArtistCRM**.
- Назначение: CRM для малого бизнеса и частных специалистов.
- Основной домен: `https://vedelo.ru`.
- Legacy-домен: `https://artistcrm.ru`.
- GitHub: `https://github.com/Escalion86/vedelo.git`.
- Локальная папка владельца: `D:\Programming\Projects\vedelo`.
- Основная ветка: `main`.
- На момент обновления handoff: web `1.20.6`, Android `1.1.0`.

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
- Яндекс Метрика переведена на счётчик `112668604`, загружается после выбора
  пользователя и работает без Webvisor/noscript-пикселя;
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
- `BRAND-T5`: device QA уже установленной PWA и production E2E OAuth, платежей, webhooks, push и редиректов;
- 30-дневная кампания ещё не запущена: на `artistcrm.ru` остаётся старая сборка с service worker `artistcrm-custom-sw-v3`, без `/api/domain-migration/status`; сначала на legacy-origin нужно развернуть ту же migration-capable сборку, что и на `vedelo.ru`, и только затем задать единый `BRAND_MIGRATION_STARTED_AT`;
- Яндекс 360 для бизнеса платный; вместо него создан бесплатный внешний ящик `vedelo@inbox.ru`. Код и deploy-шаблон переключены на него, но перед production-деплоем остаётся проверить приём/отправку и применить `NEXT_PUBLIC_SUPPORT_EMAIL` в фактическом env;
- Android production QA/release;
- реальные E2E интеграций Avito, VK и Telegram Business;
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

- Web subscriptions: `PushSubscriptions.webAppOrigin = artistcrm | vedelo`.
- Старые записи без поля считаются `artistcrm`.
- Новая подписка создаётся только после разрешения пользователя.
- После успешной подписки Vedelo отключается ровно соответствующий legacy endpoint.
- На 30-й день старым подпискам отправляется одно последнее migration-уведомление, затем деловые уведомления прекращаются.
- Cron endpoint: `POST /api/push/domain-migration`, защищён `PUSH_REMINDERS_CRON_SECRET` или `CRON_SECRET`.

## 11. Документы и файлы

Каноническое поле событий и клиентов — `documents[]`. Общие части:

- `schemas/documentSchema.js`;
- `helpers/entityDocuments.js`;
- `components/DocumentsEditor.js`;
- `server/entityDocumentFiles.js`;
- `server/entityDocumentRouteHandlers.js`.

Новые файлы хранят `storageKey`; legacy URL продолжают читаться. До upload/access/delete сервер проверяет tenant, тариф и принадлежность сущности. Сначала разворачивается совместимое API `cloud.escalion.ru`, затем Vedelo.

Подробный контракт: `docs/superpowers/plans/2026-09-14-work-item-client-attachments.md`.

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

Последняя локальная приёмка ребрендинга: production build прошёл, 19/19 focused-тестов прошли, Android typecheck прошёл. Исторически полный ESLint показывал одно предупреждение hook dependency в `layouts/modals/modalsFunc/clientMessengerFunc.js`; не считать его разрешением добавлять новые warnings.

Для значимых UI-изменений build недостаточен: проверить реальный экран, mobile viewport, console, dark theme и основное взаимодействие.

## 16. Документация по задачам

- Roadmap: `docs/ROADMAP.md`.
- Production env: `docs/PRODUCTION_ENV_CHECKLIST.md`.
- PWA/домен: `docs/BRAND_AND_PWA_MIGRATION.md`.
- Android release: `docs/ANDROID_RELEASE_CHECKLIST.md`.
- Backup/restore: `docs/ARTISTCRM_BACKUP_RESTORE_RUNBOOK.md` — имя историческое, процедуры актуальны только после проверки.
- Security: `docs/ARTISTCRM_P0_SECURITY_AUDIT.md` — исторический snapshot, не заменяет новый аудит.
- Public API: `docs/PUBLIC_LEADS_API.md`.
- DOCX: `docs/DOCX_DOCUMENTS_GUIDE.md`.
- Support: `docs/SUPPORT_TICKETS.md`.
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
