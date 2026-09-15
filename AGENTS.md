# AGENTS.md — правила работы с проектом «Ведело»

## Язык и назначение

- Всегда отвечай пользователю на русском языке.
- «Ведело» — CRM для малого бизнеса и частных специалистов: заявки/заказы, клиенты, следующие контакты, оплаты, документы и интеграции.
- Продукт ранее назывался ArtistCRM. Старое имя сохраняется только там, где оно нужно для обратной совместимости и переходного периода.
- Перед любой содержательной работой полностью прочитай `docs/AI_HANDOFF.md`, затем релевантные разделы `docs/ROADMAP.md`.

## Источники правды

1. `docs/ROADMAP.md` — приоритеты, backlog и статусы.
2. `docs/AI_HANDOFF.md` — актуальная архитектура, ограничения и карта кода.
3. Специализированные документы в `docs/` — контракты интеграций и runbook.
4. Код и тесты — окончательная истина, если старый документ расходится с реализацией.

Статусы roadmap:

- `[ ]` — не начато;
- `[-]` — в работе;
- `[x]` — выполнено;
- `[*]` — отложено.

Если задача закрывает пункт roadmap, обнови его и добавь короткую запись в `Выполнено` или `Журнал изменений плана`. При закрытии пункта обязательно повысить версию в `package.json`: patch по умолчанию, minor для совместимого функционального блока, major только после явного подтверждения пользователя.

## Быстрый вход

Прочитай в таком порядке:

1. `docs/AI_HANDOFF.md`.
2. Актуальные части `docs/ROADMAP.md`.
3. `app/cabinet/[page]/page.js` и `app/cabinet/[page]/cabinet.js`.
4. `server/fetchProps.js` и `components/StateLoader.js`.
5. `layouts/content/contentsMap.js`, `helpers/constants.js`.
6. Для CRUD: `state/itemsFuncGenerator.js` и соответствующий `app/api/**/route.js`.

## Архитектура

- Web: Next.js App Router, React, JavaScript.
- UI: MUI для сложных контролов и Tailwind CSS для компоновки/утилит.
- Server state: TanStack Query. Jotai остаётся для UI state и временного compatibility bridge.
- Auth: NextAuth credentials/VK ID/служебные providers; защищённые серверные действия получают tenant через `server/getTenantContext.js`.
- DB: MongoDB + Mongoose (`models/`, `schemas/`).
- Mobile: активный Expo/React Native Android-клиент в `mobile/`.
- PWA: собственный service worker из `server/serviceWorkerScript.js`, доступный через `/sw.js` и `/service-worker.js`. Не предполагай наличие `next-pwa`.
- Модалки: `modalsAtom` → `layouts/modals/ModalsPortal.js` → `layouts/modals/modalsFuncGenerator.js`.

## Неизменяемые контракты ребрендинга

- Не переименовывать внутренние `/api/events`, `eventId`, модели/коллекции Events и storage-префиксы `artistcrm` только ради UI-терминологии.
- Не менять Android/iOS package ID без решения владельца. Актуальный production package — `ru.escalion.vedelo` (EAS-проект `@escalion/vedelo`, `e7d84863-fe06-4058-a9c7-c381e5d3b98a`); пакет `ru.escalion.artistcrm` остаётся только у ранее опубликованной карточки Google Play, новые сборки под ним не выпускаются.
- Основной deep-link scheme — `vedelo://`; legacy `artistcrm://` продолжает приниматься.
- Технический заголовок service worker `X-ArtistCRM-Service-Worker` сохранён намеренно.
- База может продолжать называться `artistcrm`; исторические записи не переписывать без отдельного плана миграции.
- В этом репозитории нет экранов и API PartyCRM (`app/company`, `app/party`, `app/api/party` отсутствуют). В `proxy.js`/`productContext` могут оставаться legacy-ветки совместимости. Не добавляй и не меняй PartyCRM без явной задачи.

## Терминология «Мероприятия / Заказы»

- Настройка: `SiteSettings.custom.primaryEntityTerminology` со значениями `auto`, `events`, `orders`.
- Resolver: `helpers/workItemTerminology.mjs`; React hook: `helpers/useWorkItemTerminology.js`; mobile resolver/hook находятся в `mobile/src/shared/domain` и `mobile/src/shared/hooks`.
- В `auto`: специализация `events` → «мероприятия»; другие известные специализации → «заказы»; неизвестная/пустая → «мероприятия».
- Используй формы из resolver, не собирай склонения вручную и не делай глобальный поиск-замену внутренних идентификаторов.
- Публичный общий маркетинг говорит о заказах; артистические SEO-страницы могут говорить о мероприятиях.

## Ключевые области кода

- Список/карточка/форма работы: `layouts/content/EventsContent.js`, `layouts/cards/EventCard.js`, `layouts/modals/modalsFunc/eventFunc.js`, `eventViewFunc.js`.
- API работы: `app/api/events/route.js`, `app/api/events/[id]/route.js`; всегда проверять create и update/delete ветки.
- Клиенты: `app/api/clients/**`, `helpers/useClientsQuery.js`, клиентские модалки и карточки.
- Статусы работы: `draft`, `active`, `canceled`, `closed`.
- Следующие контакты/напоминания: `additionalEvents[]`; бизнес-логика в `helpers/additionalEvents.js` и push-сервисах.
- Google Calendar: `server/CRUD.js`, `server/googleUserCalendarClient.js`, `app/api/google-calendar/**`, `app/api/events/google-*`.
- Документы: `components/DocumentsEditor.js`, `helpers/entityDocuments.js`, `server/entityDocumentFiles.js`, `server/entityDocumentRouteHandlers.js`, `docs/DOCX_DOCUMENTS_GUIDE.md`.
- Публичные лиды/Tilda: `app/api/public/lead/**`, `docs/PUBLIC_LEADS_API.md`.
- PWA-переезд: `helpers/domainMigration.mjs`, `server/domainMigration.js`, `components/DomainMigrationBanner.js`, `app/migrate/**`, `proxy.js`, `docs/BRAND_AND_PWA_MIGRATION.md`.
- Навигация кабинета: `layouts/content/contentsMap.js`, `helpers/constants.js`, `components/MobileBottomNav.js`.

## Tenant, безопасность и данные

- Каждый защищённый API обязан проверять сессию/tenant через `getTenantContext()` или mobile-эквивалент.
- Любой Mongo-фильтр пользовательских данных должен включать `tenantId`.
- Не доверяй `tenantId`, владельцу, служебным полям и Mongo-операторам из клиентского payload.
- Не логируй пароли, секреты, access/refresh токены, одноразовые migration-коды, персональные данные или полные webhook payload.
- Не читай и не публикуй содержимое `.env.local`; используй только `.env.example` и `.env.deploy.example` как справочник.
- Учитывай требования РФ по персональным данным.
- Для файлов повторно проверяй tenant, тариф и принадлежность события/клиента перед upload, signed URL и delete.

## UI и mobile-first

- Основные сценарии обязаны работать на узком экране.
- React-компоненты функциональные; соблюдай существующий стиль файла.
- Интерактивные элементы должны иметь понятные состояния и `cursor: pointer` в web.
- Полноразмерные предупреждения/успех/ошибки делай через `components/Notice.js`; нестандартные цветные блоки должны иметь явную dark-theme проверку.
- Базовые поля ввода строятся через `components/InputWrapper.js` и существующие контролы.
- Не создавай бинарные ассеты без явного запроса пользователя.

## Работа с git и чужими изменениями

- Репозиторий: `https://github.com/Escalion86/vedelo.git`, основная ветка `main`.
- Перед правками выполняй `git status --short`. Рабочая копия может быть грязной: сохраняй пользовательские и параллельные изменения.
- Не применяй `git reset --hard`, `git checkout --`, массовое удаление или переписывание истории без явного запроса.
- Делай минимально достаточные изменения; не проводи массовую «чистку» исторического кода вместе с продуктовой задачей.

## Проверка

Основные команды:

```bash
npm run dev
npm run build
npm run lint
cd mobile && npm run typecheck
cd mobile && npm test
```

Для точечных изменений предпочитай:

```bash
npx eslint path/to/file.js
node --test path/to/test.mjs
```

`npm run lint` может показывать исторические предупреждения; новые ошибки в изменённых файлах недопустимы. Для API/данных добавляй tenant-negative test. Для UI проверяй desktop и mobile viewport, console и реальное взаимодействие. Для PWA отдельно проверяй оба origin, service worker, manifest и push.

## Мини-чеклист завершения

- Требование реализовано полностью, а не только описано.
- Tenant isolation и авторизация проверены.
- Внутренние `events`-контракты и legacy-совместимость не сломаны.
- Mobile-first и dark theme проверены, если затронут UI.
- Тесты/ESLint/build выполнены пропорционально риску.
- Документация и roadmap синхронизированы.
- PartyCRM не затронут.
