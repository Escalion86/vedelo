# Отчёт N — этап Z: пользовательские интеграции Android

Дата: 2026-10-03. Рабочая ветка: `mobile-parity`; origin — `git@github.com:Escalion86/vedelo.git`.

## Область и сохранение предыдущих заходов

Изменения ограничены `mobile/src/features/integrations/**` и этим отчётом. Wiring в `mobile/app/more/[section].tsx` уже использует `IntegrationsSection`, правки не понадобились. Web/server/API/models, общие DTO, storage/sync, auth/push, package/lock/app.json/eas.json, другие разделы не изменены. Коммитов, staging, push, PR, переключения ветки и субагентов не было. Персональные env/credential-файлы не читались; запросы к production/реальным провайдерам и EAS-сборки не выполнялись.

Перед правками сохранены SHA-256 всех 101 существовавших изменённых/новых файлов. Промежуточная сверка: **0 изменений** в этих файлах, включая H–M. Итоговая сверка приводится вместе с проверками ниже. `git fetch origin mobile-parity` завершился с exit 255: sandbox запрещает запись `.git/FETCH_HEAD` (read-only). По имеющемуся remote-tracking ref `git rev-list --left-right --count origin/mobile-parity...HEAD` — `0 0`; свежесть удалённой ветки через fetch не подтверждена.

## Фактические файлы N

Изменены:

- `mobile/src/features/integrations/IntegrationsSection.tsx` — единый список и адресные формы, независимые overview/AI состояния, guards устаревшего overview.
- `mobile/src/features/integrations/ManagedIntegrationsSection.tsx` — Novofon, пользовательский ИИ, API-ключи, одноразовые секреты и подтверждения.
- `mobile/src/features/integrations/AiUsagePanel.tsx` — тема, безопасная проверка личного DTO, пауза/отсутствие настройки, ошибка и повтор загрузки.
- `mobile/src/features/integrations/AiUsagePanel.test.tsx` — сохранены прежние сценарии; fixtures приведены к фактическому server DTO, добавлены отрицательные проверки. Проверка вывода сырой сетевой ошибки заменена проверкой безопасного текста и отсутствия сырой ошибки. В ожидания запросов добавлен `skipRefresh: true`.

Добавлены:

- `CredentialIntegrationForm.tsx` — Avito/VK, исходные реквизиты, проверка и отключение.
- `GoogleCalendarForm.tsx` — OAuth, выбор календаря, пауза, напоминания, обе настройки событий и отключение.
- `IntegrationRow.tsx` — компактная строка с переносами и доступным раскрытием.
- `IntegrationFormState.tsx` — состояния загрузки/ошибки/повтора/результата на общих компонентах.
- `TelegramSection.tsx` — безопасное read-only состояние и ограничение управления.
- `integrationContract.ts` — локальные проверки и безопасная проекция ответов; не изменение общего DTO/API.
- `useIntegrationSession.ts` — lifetime формы, синхронный общий operation guard, адресный read-back, GET-only повтор.
- `integrationContract.test.ts`, `IntegrationsSection.test.tsx` — focused unit/component регрессии.

Все новые файлы из списка находятся в `mobile/src/features/integrations/`. Использованы существующие `Surface`, `Button`, `Field`, `Notice`, `StatusChip`, `useTheme`/`useThemeStyles` и токены обеих тем. Новых бинарных ассетов нет.

## Сверка PWA и серверных контрактов

Эталон: текущие `layouts/content/IntegrationsContent.js` и `components/GoogleCalendarSettings.js`. Проверены маршруты `app/api/mobile/v1/integrations/**`, сериализаторы `server/mobile/providerIntegrations.js`, `server/mobile/googleCalendar.js`, OAuth callback/state и нормализаторы календаря. Это статическая сверка кода и mock-тесты, не staging/device приёмка.

| Провайдер | Поддержанный контракт и реализация N |
| --- | --- |
| Google Calendar | Dedicated GET/PATCH/DELETE, auth-url GET, calendars GET, select POST. Callback требует точный текущий scheme, host `more`, path `/integrations`, единственный `gc_connected=1`, без fragment/credentials/лишних параметров. Auth URL проверяется как официальный HTTPS OAuth Google. Callback сам по себе не подтверждает подключение: нужен GET с `connected=true` и `enabled=true`. Cancel/dismiss не дают success. Выбор проверяет конкретный calendarId. Пауза, popup/email-напоминания и обе настройки отменённых/переданных событий подтверждаются повторным GET. |
| Avito/VK | Dedicated GET; POST проверяет и подключает, PATCH проверяет текущее подключение, DELETE удаляет реквизиты. Неподдержанных переключателей `enabled` нет. Подтверждение связано с текущим провайдером; read-back проверяет исходные accountId/clientId и состояние. `webhook_manual` Avito явно требует ручной настройки, не называется полностью работающим подключением. |
| Novofon | POST подключения/ротации выдаёт новый webhook secret/URL; повторная ротация требует подтверждения. PATCH паузы сервер не поддерживает, такого действия нет. DELETE и dedicated GET сохранены. Read-back проверяет состояние, но GET не отдаёт fingerprint webhook: точную смену секрета доказывает POST receipt, а не наличие configured в GET. |
| ИИ Ведело/AITunnel | Реальное состояние берётся из dedicated GET `/mobile/v1/integrations/ai`: overview использует legacy `aitunnelEnabled` и намеренно не используется для вывода enabled/configured. POST выбора/ключа, PATCH моделей/паузы, DELETE пользовательских ключей сохранены. Внутреннее `artistcrm` — существующий provider ID; UI говорит «ИИ Ведело». Неизвестный/legacy provider не подменяется платформой без явного выбора. Личные баланс/пороги/история — только GET `/ai/usage`, без admin/settings/coefficient/operator-запросов даже при dev capability. Eligibility баланса не выдаётся за включённую интеграцию. |
| Входящие заявки API | POST создания, PATCH конкретного keyId/глобального приёма, DELETE конкретного keyId/всех ключей. Выпущенный ключ определяется из POST receipt по новому ID, исходному имени и lastFour; GET должен содержать этот ID. Произвольный новый элемент списка не подтверждает выпуск. Неоднозначный/неполный receipt остаётся неподтверждённым, валидный выданный секрет сохраняется в открытой форме. |
| Telegram Business | Общий status GET даёт безопасный summary. В mobile `[provider]` whitelist Telegram отсутствует. Web status/connect через `requireTenantIntegrationAccess('telegram', req)` используют bearer-aware `getRequestContext`; disconnect вызывает только `getTenantContext()` без req. Полного bearer-контура управления нет: реализован только просмотр summary, без Telegram mutation-запросов и фиктивных кнопок. Отсутствующий summary — «Статус неизвестен», `bot_ready` — «Бот настроен». |

## Результат и безопасность состояния

- Initial loading/error/retry отделены от запроса открытой формы. Ошибка списка календарей не ломает список и других провайдеров; неполный/невалидный DTO и `success:false` не становятся «Не подключено» или успехом.
- Один общий синхронный guard защищает мутации и повторные тапки до React render. Запрос закрытой формы удерживает guard до фактического ответа; новая форма не запускает конкурентную мутацию. Каждая форма имеет собственный lifetime/epoch: late GET/POST/read-back/clipboard/OAuth не обновляет другую форму после закрытия, смены провайдера, blur или unmount.
- Успех сообщает только проверенный ответ и адресный read-back. Ошибка повторного чтения/несовпадение даёт «Результат не подтверждён», повтор выполняет только GET. При потере ответа POST не повторяется автоматически. Мутации используют существующий API client с `skipRefresh: true`, исключая скрытый повтор write после 401 refresh.
- Введённые секреты очищаются при попытке запроса, закрытии, смене формы/ИИ-провайдера и blur. Выданный один раз секрет остаётся до явного закрытия/ухода с экрана, включая ошибку read-back или некорректные метаданные receipt. До закрытия секрета повторный выпуск заблокирован.
- Секреты не попадают в SQLite, SecureStore, Query cache, логи или тексты ошибок; state содержит только безопасные проекции и временное значение открытой формы. Clipboard rejection/`false` ловится, «Скопировано» при отказе не показывается. Идентификаторы/токены передаются в исходном виде: вместо trim/strip/truncate — явная валидация.
- Серверная авторизация/tenant-фильтры не менялись. В component tests есть отрицательные 403/недоступный тариф; реальное разделение двух tenant не заявляется без staging. Семантика прочтения переписки и файлы M не менялись.

## Намеренные ограничения и непроверенное

- Telegram — только read-only до появления полного согласованного bearer-контракта. Это не завершённый Telegram-паритет.
- Google: сохранены и расширены предусмотренные брифом native сценарии. Массовая синхронизация, редактор состава данных/titleMode и цветов из текущей PWA не перенесены в N; API поддерживает часть настроек, но массового native сценария этот заход не реализует. Ограничение показано в форме. Выбор календаря/пауза не выдается за массовую отправку всех работ.
- Avito/VK mobile DTO не даёт webhook URL/secret для полного копирования/инструкции PWA; произвольные web/site-settings запросы ради их извлечения не добавлены. `webhook_manual` требует отдельной настройки.
- GET Novofon и GET ИИ не возвращают fingerprint секретов: по чтению невозможно подтвердить конкретный заменённый ключ после потери POST receipt. Приложение не придумывает такой факт и не перевыпускает автоматически.
- Нет устройства: не проверены визуальный native render/фактические touch targets, Android Back, клавиатура, TalkBack, возвращение реального OAuth, настоящие провайдеры/webhooks, реальные tenant/тарифы/доставка. Component render обеих тем и длинных данных — проверка стилей/логики, не Android visual QA. HTML-browser gates к native render неприменимы.
- M1-T10 остаётся в работе; версия не повышается. STATUS/ROADMAP оставлены для родительской независимой проверки согласно BRIEF-N.

## Независимая проверка родителя

После завершения Codex родитель выполнил в переднем плане `cd mobile && npm run typecheck && npx jest --runInBand && git diff --check` до фактического завершения: **94 набора / 799 тестов прошли**, 233,859 с, итоговый exit 0. Ошибок типов и пробелов нет. Существующее предупреждение Expo Go про push не является ошибкой или приёмкой устройства.

Родитель независимо пересчитал SHA-256 всех 101 файлов из `vedelo-N-before.json`: до обновления документации различий нет. Защищённые web/API/models/storage/sync/package/config-файлы не изменены; индекс пуст; DTO types.ts сохранил хеш, снятый перед заходом. Родитель выполнил успешный `git fetch origin mobile-parity` перед делегированием; расхождение с HEAD — 0/0, поэтому sandbox-ошибка fetch исполнителя не означает непроверенную исходную базу.

STATUS и ROADMAP синхронизированы родителем после независимого прогона. M1-T10 не закрыт, версия не повышалась, коммитов и публикации нет. Ограничения Telegram, расширенных Google-сценариев, webhook-инструкций и реальной приёмки остаются открытыми.

## Проверки исполнителя

Проверки выполняются из рабочей копии с сохранёнными H–M, без реальных provider-запросов. Логи находятся только в `/home/aleksei/.hermes/cache/scratch/`.

| Команда | Фактический результат | Лог |
| --- | --- | --- |
| `cd mobile && npm run typecheck` | Финальный прогон завершён, exit **0**, ошибок TypeScript нет | `vedelo-N-typecheck-final.log` |
| `cd mobile && npx jest --runInBand src/features/integrations` | Завершён, exit **0**, **3/3 набора, 95/95 тестов**, 56,699 с | `vedelo-N-focused-final.log` |
| `cd mobile && npx jest --runInBand` | Прогон фактически завершён, exit **0**, **94/94 набора, 799/799 тестов**, 244,423 с; нет failed/skipped suites/tests | `vedelo-N-jest-full.log` |
| `git diff --check` | exit **0**, вывода/ошибок нет | `vedelo-N-diff-check.log` |

Focused покрывает обе темы и длинные данные, loading/error/retry/partial failure, invalid DTO/`success:false`, 403/сеть, OAuth exact URL/cancel/error/server confirmation, выбор календаря/паузы/напоминания/отключения, подтверждение конкретных действий и read-back отказ/несовпадение, double taps, stale responses/смену провайдера/blur/unmount, одноразовый секрет при ошибке read-back/метаданных, Clipboard rejection/false, конкретный API key ID, отсутствие admin/Telegram mutations.

Первичные прогоны использовались для исправления: начальный typecheck (exit 2) обнаружил названия токенов старой палитры, focused (exit 1) — неполные старые fixtures и синхронизацию новых отрицательных ожиданий React после async GET. Проверки не удалялись: async события/повторы теперь корректно ожидаются через `act`; assertions и проверки количества мутаций сохранены. Эти незелёные прогоны не учитываются как итоговая приёмка.

Сверка границ перед финальным полным прогоном: **101/101** прежних изменённых/новых файлов сохранены byte-for-byte, **0** изменений вне разрешённого scope N. После фактического завершения полного Jest выполнена повторная сверка: **101/101** исходных файлов по-прежнему совпадают с сохранёнными SHA-256; **0** изменений в H–M, **0** файлов N вне разрешённой области. Финальный `git diff --check` выполнен после записи отчёта. STATUS/ROADMAP, включая их прежние изменения, не редактировались.

Полный набор включает регрессии прежних H–M и новые N: относительно базы 92 набора / 713 тестов добавлено 2 набора и 86 тестов. Существующие Expo warnings в общем прогоне не являются подтверждением работы push/нативных модулей на устройстве. ESLint web, web build, Android build/Maestro и staging HTTP в этом ограниченном native заходе не запускались.
