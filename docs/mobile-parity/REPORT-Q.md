# Заход Q — AE + AF: Google-импорт и общий экспорт

Дата: 03.10.2026. Репозиторий `/home/aleksei/projects/vedelo`, ветка `mobile-parity`, origin `git@github.com:Escalion86/vedelo.git`. Реализация выполнена Codex CLI с явно заданной моделью `gpt-6.1-sol`, без дальнейшего делегирования. Независимую проверку выполнил родительский агент. Добавления в индекс, коммитов и публикации нет.

## Результат

AE: реализована честная секция Google-импорта с переходом в web-кабинет. Полного native-контракта подключения/выбора/статуса импорта нет; AE как нативный импорт остаётся внешней серверной зависимостью. Секция не изображает подключение, смету, прогресс или запуск и не использует подключение синхронизации вместо импорта.

AF: реализован online-экспорт трёх независимо выбираемых CSV: работы без `draft`, заявки `draft`, все транзакции. Используются полные bearer-коллекции сервера; локальная БД и фильтры статистики/списков не используются. Серверная проверка `allowStatistics` выполняется при открытии и повторно перед подготовкой файлов. File Import из P сохранён.

## Файлы

Новые исполняемые файлы:

- `mobile/src/features/import/CalendarImportSection.tsx`, `calendarImportApi.ts` — ограничение контракта и фиксированный безопасный web-переход.
- `mobile/src/features/import/ExportSection.tsx`, `ExportController.ts` — выбор, состояния, тариф, чтение, подтверждение следующего файла, защита жизненного цикла.
- `mobile/src/features/import/exportApi.ts`, `exportDatasets.ts`, `exportNative.ts` — полные GET, проверка ответа и проекция CSV-полей, web-формулы, безопасный CSV, native File/Paths/share/cleanup.
- `mobile/app/more/export.tsx` — отдельный экран `/more/export`.

Новые тесты: `CalendarImportSection.test.tsx`, `ExportSection.test.tsx`, `ExportController.test.ts`, `exportApi.test.ts`, `exportDatasets.test.ts`, `exportNative.test.ts`, `exportRoute.test.ts`; общий тестовый helper `exportFixtures.ts`. Все они находятся в `mobile/src/features/import/`.

Минимально изменены прежние файлы `ImportScreen.tsx` (импорты, кнопка перехода к экспорту вместо старого обещания, Google-секция) и `ImportScreen.test.tsx` (ожидание новых разделов). Логика controller, поля, review, apply, подтверждения расходов, polling и cleanup файлового импорта не менялись. Прежние тесты P выполняются в общем наборе.

## AE: доказательства контракта

| Часть | Текущий код | Вывод |
| --- | --- | --- |
| Статус отдельного импорта | `app/api/google-calendar/import-status/route.js`: `getTenantContext()` без `req`; читает `normalizeImportCalendarSettings(user)` | Web-сессия, отдельное `googleCalendarImport`; bearer-вариант статуса отсутствует |
| Календари импорта | `app/api/google-calendar/import-calendars/route.js`: `getTenantContext()`, `listUserImportCalendars(user)`; тариф требует календарь и ИИ | Это не mobile список календарей синхронизации |
| Выбор | `app/api/google-calendar/import-select/route.js`: web tenant, `dbUser.googleCalendarImport = ...` | Mobile select сохраняет другой объект, `user.googleCalendar` |
| Import OAuth | `app/api/google-calendar/auth-url/route.js`: `purpose=import`, `READ_SCOPE`, cookie `gc_oauth_state` | Подключение запускается в браузере с web-сессией |
| Web callback | `app/api/google-calendar/callback/route.js`: `getTenantContext()`, cookie nonce, `purpose=import`, запись `existing.googleCalendarImport` | Нельзя завершить этот flow обычным mobile auth callback |
| Mobile OAuth | `app/api/mobile/v1/integrations/google-calendar/auth-url/route.js`: `WRITE_SCOPE`, mobile state/session; `server/mobile/googleCalendarOAuth.js`: запись `user.googleCalendar`, возврат `://more/integrations` | Native OAuth предназначен для синхронизации |
| Mobile status/calendars/select | `app/api/mobile/v1/integrations/google-calendar/{route.js,calendars/route.js,select/route.js}`; `server/mobile/googleCalendar.js` | Все работают с `googleCalendar`; отдельного импортного набора endpoints нет |
| Поиск/создание событий | `app/api/events/google-import/route.js`: GET/POST через `getRequestContext(req)`, затем `normalizeImportCalendarSettings(context.user)` | Сам endpoint существует. Но `server/mobile/auth.js:toMobileUser` не переносит `googleCalendarImport`, поэтому наличие bearer-распознавания здесь не означает рабочего native flow |

Поиск `googleCalendarImport`, `import-status`, `import-calendars`, `import-select`, `purpose=import` в `app/api/mobile/` и `server/mobile/` не нашёл отдельного импортного контракта. Проверены web-компонент, оба callback flow, mobile settings DTO и нормализатор импортных credentials.

Путь перехода — `https://vedelo.ru/cabinet/import`: он подтверждён `helpers/constants.js`, `layouts/content/contentsMap.js`, `ImportExportContent.js`, `ImportContent.js` и redirect в `components/GoogleCalendarImportSettings.js`. Web по умолчанию открывает Google Calendar. Секция объясняет необходимость войти в нужный аккаунт Ведело в браузере и выбрать отдельный аккаунт Google. URL фиксирован, без query, fragment, bearer, OAuth-кода или иных секретов. Открытие браузера не выдаётся за завершение импорта. Повторы заблокированы, ошибки открытия безопасны; поздние ошибки после blur/profile replacement скрываются.

## AF: источники и полнота

`GET /api/mobile/v1/statistics` используется как серверный тарифный gate. Отсутствуют year/town/status query; ответ обязан подтвердить `filters: { year: null, town: '', status: 'all' }`. Урезанный statistics DTO не используется как источник CSV: `server/mobile/statistics.js` убирает услуги, `event.servicesIds/createdAt/phone`, `client.phone`, третью часть ФИО и подробности адреса.

После успешного gate выполняются четыре GET без query-параметров:

| Источник | Bearer delegate и полный серверный GET | CSV-поля |
| --- | --- | --- |
| `/api/mobile/v1/events` | `app/api/mobile/v1/events/route.js` → `app/api/events/route.js`, default `scope=all`: `Events.find({ tenantId })`, без limit/даты/города | ID, clientId, eventDate, dateEnd, createdAt, phone, status, contractSum, servicesIds, все текстовые части адреса |
| `/api/mobile/v1/clients` | delegate → `app/api/clients/route.js`: `Clients.find({ tenantId })`, без пагинации | ID, firstName, secondName, thirdName, phone |
| `/api/mobile/v1/services` | delegate → `app/api/services/route.js`: `Services.find({ tenantId })`, без пагинации | ID и название услуги |
| `/api/mobile/v1/transactions` | delegate → `app/api/transactions/route.js`: `Transactions.find({ tenantId })`, без eventIds/clientId | ID, связи eventId/clientId, amount, type, category, date, comment |

`server/getRequestContext.js` выбирает `getMobileUser(req)` по Authorization Bearer; mobile auth сверяет живую сессию и tenant токена с текущим пользователем. Клиент не отправляет tenantId и не выбирает tenant сам. Серверные маршруты и права не изменены. Ответы проходят Zod-проекцию только полей CSV: документы, токены, служебные свойства и tenant не сохраняются в export-state. Некорректный envelope/ID/тип, повтор ID, `meta.hasMore=true` или несовпадение `totalCount` запрещают экспорт вместо выдачи частичной копии за полную.

Экспорт ещё раз проверяет сеть и заново читает тариф/все коллекции. Текущий контракт полных GET не предоставляет атомарного снимка: одновременные изменения на сервере во время четырёх чтений могут дать разные моменты данных. При добавлении пагинации API потребуется соответствующее расширение клиента; сейчас частичный ответ с метаданными отклоняется. Несинхронизированные локальные правки явно исключены. ПДн не логируются; CSV находится только во временном кэше до завершения системного окна передачи.

## Сверка CSV с web

`exportDatasets.test.ts` исполняет текущий `helpers/csvExport.js:buildExportDatasets` с реальными чистыми зависимостями из репозитория и сравнивает все заголовки и строки для `events` и `orders`. Фиксированы now и fixtures с прошедшей/будущей/закрытой/отменённой работой, заявкой без даты, полным адресом, тремя частями ФИО, удалённой услугой и связью, дробными суммами, отдельными и связанными транзакциями.

- **Работы:** ID; начало/окончание; клиент; город/полный адрес; услуги; вычисленный статус; договорная сумма; доход/расход/прибыль. `draft` исключён. Статус учитывает `dateEnd ?? eventDate` и текущее время, как web.
- **Заявки:** ID; дата заявки из `createdAt` (не `requestCreatedAt`); дата работы с resolver-заголовком; клиент; телефон с web fallback `event.phone → client.phone`; город/адрес; услуги; raw `draft`; договорная сумма; «Связано с …» = «Нет», как web.
- **Транзакции:** ID; дата; raw тип/категория; сумма; клиент; название связанной работы «услуги • адрес»; комментарий. Удалённая работа даёт пустой заголовок; недоступный клиент — ID, как web. Удалённая услуга сохраняется как ID.
- Финансы точно следуют web-helper: все income/expense по `eventId`, включая обязательства. Фильтра по `paymentMethod` нет. На экране есть объяснение, что суммы не ограничены фактическими оплатами; это отличается от фактической сводки транзакций Android.
- Полная коллекция transactions включает записи с dangling `eventId`. Текущий web statistics endpoint получает только ссылки на найденные работы и unlinked записи и может исключить такие транзакции. Требование «все серверные данные» выполнено полным collection GET; финансовая формула и преобразование одной строки не менялись.
- Если конкретная запись не содержит `servicesIds`, `createdAt` заявки или доступного телефонного поля, выводится «Недоступно», а на экране — перечень соответствующих колонок. Явные null/пустой массив остаются пустыми значениями. Данные не дополняются фиктивными услугами, датой «сейчас» или телефоном. Остальные допустимые отсутствующие поля обрабатываются как web.
- CSV: UTF-8 BOM, `;`, CRLF строк; кавычки удваиваются; `;`, кавычки и переносы внутри ячейки экранируются. Переносы сохраняются (web buildCsv заменяет их пробелами). Формулы в текстовых значениях, в том числе за пробелами/управляющими символами, получают апостроф; числовые отрицательные суммы остаются числами. NaN/Infinity запрещены. Даты — `ru-RU` в часовом поясе устройства, как web в часовом поясе браузера.

## Передача и жизненный цикл

`exportNative.ts` использует установленные `File`, `Paths.cache`, `expo-crypto.randomUUID` и `expo-sharing`. Каждый файл получает отдельное имя `vedelo-<набор>-<uuid>.csv`; overwrite не включён. Коллизия имени не приводит к изменению/удалению прежнего файла. Очистка собственной копии выполняется в finally после возврата, отказа, ошибки записи/share и позднего результата; отказ физического удаления показывается явно. Пользовательские оригиналы не удаляются.

Expo Sharing возвращает void, включая закрытие окна без отправки. Поэтому итог сообщает только число окон передачи и отсутствие подтверждения отправки. Перед каждым следующим выбранным файлом нужен отдельный «Открыть»; «Остановить» и dismiss прекращают последовательность. CSV пустого набора разрешён только после подтверждённого полного чтения и содержит одни заголовки.

Controller блокирует повторное нажатие до завершения цепочки. AbortSignal/epoch защищают чтение; blur/unmount очищают данные, отменяют ожидание подтверждения и исключают новые окна/публикацию старых результатов. Profile replacement, включая другой tenant, инвалидирует старые чтения; UI скрывает данные прежнего owner уже при render. Вызванное системное окно невозможно отозвать задним числом; после его завершения копия удаляется, следующие файлы прежнего профиля не открываются. После освобождения lock новый профиль может загрузить свои данные. Остаточное предупреждение cleanup не содержит данных прежнего пользователя.

## Проверки

Все завершённые команды запускались в текущем workspace. Прерванных прогонов нет.

| Проверка | Реальный результат |
| --- | --- |
| `cd mobile && npm run typecheck` | Завершено с exit 0, TypeScript без ошибок |
| `cd mobile && npx jest --runInBand` | **113 suites passed / 1146 tests passed**, 331.923 с, exit 0 |
| CSV parity, `TZ=UTC npx jest --runInBand src/features/import/exportDatasets.test.ts` | **1 набор / 19 тестов**, 6.245 с, exit 0 |
| CSV parity, `TZ=Asia/Krasnoyarsk ...` | **1 набор / 19 тестов**, 6.101 с, exit 0 |
| `git diff --check` | Exit 0, ошибок пробелов нет |

База брифа: 106 наборов / 1075 тестов. Добавлены **7 наборов / 71 тест**. Покрыты сравнение строк/заголовков с реальным web-helper для обеих терминологий; все три и отдельные наборы; missing поля; BOM/экранирование/переносы/formula injection/дробные и отрицательные числа/даты; полнота/no filters/partial meta; тариф 401/403, ошибки, сеть, loading/empty; повторные нажатия; отмена следующего файла; success/error/cancel/partial create/коллизия/cleanup failure; поздние чтения/share/подтверждения после blur/unmount/profile replacement; отсутствие secret URL/native import imitation; установленный matcher `/more/export`, `/more/import`, legacy `/more/lists`.

Первый точечный прогон: 6 наборов прошли, 2 упали (94 passed / 3 failed): в тесте UI был неоднозначный поиск фразы «Нужен тариф», а тесты браузерного перехода не очищали счётчик mock-вызовов. Исправлены тестовые ожидания/изоляция; завершённый повтор двух наборов — **14/14**, затем весь финальный набор — **1146/1146**. Ошибки первого прогона не скрыты и не засчитаны как успешная проверка.

Контрольный SHA-256 снимок до работы содержал 2584 прежних файла. Из них изменены только разрешённые `ImportScreen.tsx` и `ImportScreen.test.tsx`; **2582 остальных сохранены побайтно**, включая все предыдущие H–P изменения вне этих двух файлов. В разрешённых существующих файлах сохранена вся логика P, изменено только размещение/ожидание новых разделов. Дополнительно проверены новые файлы на пробельные ошибки. Индекс git не менялся, staging/коммиты/push не выполнялись.

## Независимая проверка родителем

- Проверка типов: exit 0.
- Полный Jest: 113 наборов / 1146 тестов, 254.887 с, exit 0. Журнал: `/home/aleksei/.hermes/cache/scratch/q-independent-jest.log`.
- CSV-сверка с текущим веб-кодом: по 19 тестов, UTC и Asia/Krasnoyarsk, оба прогона exit 0.
- Контрольный снимок родителя: 2583 прежних файла; изменены только разрешённые ImportScreen.tsx и ImportScreen.test.tsx; 2581 файл сохранён побайтно. Счётчик снимка исполнителя выше относится к его собственному снимку, не к родительскому.
- Серверные маршруты, защищённый DTO и соседние экраны не изменены. Индекс чист относительно начала захода, коммитов и публикации нет.

## Оставшиеся ограничения

- Полный native Google import-auth/status/calendar/select/callback требует отдельной задачи серверного трека. Web-переход не закрывает этот пробел.
- Android/EAS/adb/Java, системный browser OAuth, настоящее FileProvider/share/cancel, размеры 320/390 px и увеличенный шрифт на устройстве не проверены. Рендеры React Native компонентов в обеих темах и matcher Expo Router — компонентные проверки, без заявления о device/UI-приёмке.
- Реальный HTTP двух tenant, реальная БД с ПДн, OAuth-провайдер и платные запуски импорта не использовались. Tenant/auth проверены чтением существующего кода и mock-тестами отрицательных состояний/смены пользователя; это не серверная интеграционная приёмка.
- Очень большие полные коллекции читаются в память, как текущие exhaustive GET; streaming/атомарный snapshot не входят в неизменяемый текущий API.
- ОС/получатель могут сохранять переданную копию. Экспортёр удаляет только собственные временные файлы; при отказе удаления в кэше показывает предупреждение.
- Web/server/API/shared types/auth/sync/storage, зависимости, версии, package IDs и schemes не менялись; `STATUS.md`, `ROADMAP.md`, `PLAN-CONTINUE.md` оставлены родителю. M1-T10 не закрывается.
