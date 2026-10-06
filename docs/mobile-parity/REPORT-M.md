# Отчёт M — звонки и переписки, этап Y

Дата: 2026-10-03. База: `mobile-parity`, HEAD `ea39cc0`, origin `git@github.com:Escalion86/vedelo.git`. Работа выполнена в `/home/aleksei/projects/vedelo`, Исполнитель — Codex на gpt-6.1-sol, без дальнейшего делегирования; родитель выполнил независимую проверку. Без staging, commit, push и запросов к production/провайдерам.

## Реализовано

- `more/[section].tsx`: заменён только блок Calls и его импорты/хелпер. Сохранены интеграция `SettingsSection` захода K, `DocumentsSection` захода L и остальные секции. `financeComment` и изменения H/I/J/K/L не правились.
- `CallsSection`: компактные строки с телефоном, клиентом, направлением, локальной датой, длительностью и статусом; фильтры текущего PWA, loading/refresh/error/retry/подтверждённое empty. Сбой чтения клиентов показан отдельно от ошибки журнала. Светлая/тёмная тема через существующие palette/Notice/Surface/StatusChip.
- `CallDetail`: запись, транскрипт, AI-итог и распознанные поля, связи, link/decision/result/ignore/process/analyze. Чтения звонка, клиентов и работ независимы. Привязки и переходы доступны только для сохранённых записей из текущего кэша; перед действием повторно читаются звонок и связанная запись. Пустые и неполные телефоны не дают совпадения; неоднозначный номер не выбирает клиента. Телефон — предложение для ручной проверки, не идентификатор.
- Прямые действия звонка проверяют `success === true`, DTO, literal ID маршрута и GET этого звонка; ручного optimistic link нет. Создание заявки и задачи вызывает штатный `runSync`. Для задачи дополнительно проверяются ID/дата задачи в синхронизированной работе; для новой заявки — точная карточка в кэше до перехода. При сбое предлагается повторить GET/синхронизацию без нового POST.
- Комментарий и дата следующего контакта — `CompactField`, dirty/Back подтверждение. Refetch/403/поздний результат не стирают заметку или новые правки. Строгая дата `ГГГГ-ММ-ДД ЧЧ:ММ` в часовом поясе устройства проверяет существование календарного дня и времени; callback/follow_up требуют связанную сохранённую работу. POST результата содержит только результат/заметку/следующий контакт и не заменяет соседние поля звонка.
- `ConversationsList`: Avito/VK, компактные строки/статусы/непрочитанное каждого канала, локальные даты, длинные строки, обе темы. Ошибки провайдеров видны отдельно, в том числе при успешном пустом ответе второго. Invalid/local clientId/eventId не отправляет запрос «всех диалогов»; возвращённая связь должна соответствовать фильтру.
- `ConversationDetail`: направления и статусы сообщений, безопасные HTTP(S)-ссылки, проверенные ссылки клиента/работы, поле ответа, прокрутка и KeyboardAvoidingView. До GET точного диалога редактора нет. Ошибки 403/сети/`success:false`/`message.status=failed` сохраняют draft и не добавляют успешное сообщение. Перед очисткой draft нужен exact returned message ID со статусом sent/direction outgoing в GET истории этого диалога; совпадение текста не используется. Изменённый во время отправки draft сохраняется.
- Прочтение — явная кнопка `Отметить прочитанным`, без молчаливого PATCH на каждом GET. markRead/status подтверждаются GET истории точного диалога; закрытие/игнорирование требуют Alert, вернуть в работу можно существующим PATCH. Ошибки видны; refresh и повторная проверка не запускают send/PATCH и сохраняют draft.
- Ключ маршрута remount отделяет данные/draft/ссылки при смене id/provider/clientId/eventId. Общий guard чтения/действия и focus-generation игнорируют поздние ответы после blur/unmount. Подтверждения имеют отдельный номер и становятся недействительными после refresh/смены маршрута. POST/PATCH используют `skipRefresh: true`, чтобы клиентский auth-refresh не повторял действие автоматически.
- Запись открывается внешним приложением только для проверенного HTTP(S) URL без credentials; звонок — для полного проверенного номера. file/content/javascript schemes не открываются. Сырые processingError, URL и ошибки транспорта не выводятся как сообщения об ошибке.

## Файлы захода M

Изменены существующие routes:

- `mobile/app/more/[section].tsx` — только Calls и нужные импорты/хелпер;
- `mobile/app/calls/[id].tsx`;
- `mobile/app/conversations/index.tsx`;
- `mobile/app/conversations/[provider]/[id].tsx`.

Добавлены:

- `mobile/src/features/calls/{CallsSection,CallDetail}.tsx`;
- `mobile/src/features/calls/communication.ts`, `useCommunicationSession.ts`;
- `mobile/src/features/calls/{CallsSection,CallDetail}.test.tsx`, `communication.test.ts`;
- `mobile/src/features/conversations/{ConversationsList,ConversationDetail}.tsx`;
- `mobile/src/features/conversations/conversationUi.ts`;
- `mobile/src/features/conversations/{ConversationsList,ConversationDetail}.test.tsx`, `conversationUi.test.ts`;
- `docs/mobile-parity/REPORT-M.md`.

## Существующие API и граница доступа

Ни один endpoint или DTO не изменён.

| Операция | Используемый контракт |
| --- | --- |
| Журнал | GET `/api/mobile/v1/calls?limit=80&status=<all/new/ready/linked/ignored/failed>` → delegated GET `/api/calls`, `{success,data: Call[]}` |
| Просмотр/read-back | GET `/api/mobile/v1/calls/{id}` → GET `/api/calls/{id}`, `{success,data: Call}` |
| Привязка | POST `/api/mobile/v1/calls/{id}/link`, `{clientId?,eventId?}` → POST `/api/calls/{id}/link` |
| Решение | POST `/api/mobile/v1/calls/{id}/decision`, `{decision: create_event/no_event}` → POST `/api/calls/{id}/decision`, `data.call`, `data.event` для create_event |
| Результат | POST `/api/mobile/v1/calls/{id}/result`, `{result,note,nextContactAt}` → `handleMobileCallResult`, `data.call`, `data.event`, `data.task` для следующего контакта |
| Игнорирование/ИИ | POST `/api/mobile/v1/calls/{id}/ignore`, `/process-recording`, `/analyze` → соответствующие `/api/calls/{id}/...`, `data: Call` |
| Список диалогов | GET `/api/mobile/v1/conversations/{avito\|vk}?clientId=...&eventId=...` → соответствующий GET `/api/integrations/{provider}/conversations` |
| История/read-back | GET `/api/mobile/v1/conversations/{provider}/{id}/messages` → delegated GET messages, `data.conversation`, `data.messages` |
| Ответ | POST того же messages, `{text}` → delegated POST; оба текущих handlers trim/slice до **4000**; `data.message` с `_id,direction,text,sentAt,status` |
| Прочтение/статус | PATCH `/api/mobile/v1/conversations/{provider}/{id}`, `{markRead:true}` или `{status:open/closed/ignored}` → delegated PATCH, `data: Conversation` |

Calls используют `requireTelephonyTariffAccess(req)` (`allowTelephony`); process/analyze — `requireAiTariffAccess(req)` (`allowAi` дополнительно). Avito/VK — `requireTenantIntegrationAccess(provider,req)` с `allowAvitoIntegration`/`allowVkIntegration`. Все эти проверки читают `getRequestContext(req)`, который поддерживает mobile bearer и его tenant. В просмотренных запросах звонков/диалогов/сообщений есть tenant-фильтры. Глобальная operator/admin выдача здесь не обнаружена; UI не понижает роль и не обходит права. Это статическая сверка реализации, не реальная tenant/tariff-приёмка.

`serializeMobileConversationMessage` не возвращает conversationId/provider/tenantId/attachments. Обязательных выдуманных полей не добавлено: принадлежность отправленного сообщения проверяется через историю **точного** диалога и exact ID. `sent` означает отправлено/принято каналом, а не доставлено/прочитано клиентом.

## Контрактные и UX-ограничения

- Журнал — последние 80 звонков; диалоги — до 100 каждого провайдера; история — до 300 сообщений, сервер сортирует по возрастанию времени. В длинном диалоге новый ID может оказаться вне выдачи: UI честно оставляет результат неподтверждённым и не повторяет POST.
- Telegram Business и общий unread summary не добавлены; сообщений на «Важном» и управления интеграциями нет.
- Медиа-вложения отбрасываются текущим sanitizer; native воспроизведение/preview медиа в диалогах не эмулируется. Запись звонка открывается внешним приложением; встроенный PWA AudioPlayer не переносился. Новые бинарные ассеты не создавались.
- process/analyze/decision/задачи не имеют подтверждённого безопасного retry/idempotency API. После первой попытки повторные платные операции/создание задачи/заявки заблокированы в текущем просмотре, включая сетевую неопределённость. Проверка повторяет только GET/runSync. Это защита UI, не серверная идемпотентность: новое открытие экрана/перезапуск приложения не гарантирует дедупликацию.
- При потерянном ответе send без возвращённого ID невозможно доказать отправку по DTO. Текст остаётся, сообщение не считается успешным; требуется проверить историю перед явной повторной отправкой. Автоматического resend нет. Draft хранится только в памяти, без незашифрованной persistent storage.
- Ручной web-редактор телефона/транскрипта и ручное добавление звонка не добавлялись: сохранялся существующий native набор действий, указанный в BRIEF-M. Выбор работы для привязки ограничен первыми пятью подходящими сохранёнными записями, как в исходном экране. Полный отдельный picker не относится к этому заходу.
- Проверка состояния перед POST и подтверждение после него уменьшают риск устаревшего действия, но не заменяют атомарный серверный compare-and-set. API/права в этом заходе менять запрещено.

## Независимая проверка родителя

Первый фоновый запуск родительских проверок был прекращён при закрытии запуска (`termination_source=agent_close`, exit -15) и не учитывается как успешный. Затем команда `npm run typecheck && npx jest --runInBand && git diff --check` выполнена в переднем плане до фактического завершения: **92 набора / 713 тестов прошли**, 185,828 с; проверка типов и пробелов без ошибок, итоговый exit 0.

Ветка и origin проверены: mobile-parity / git@github.com:Escalion86/vedelo.git. Проверка защищённых web/API/storage/sync/package-файлов не обнаружила изменений относительно HEAD. В shared/domain/types.ts сохраняется прежняя незакоммиченная строка financeComment; SHA-256 совпал с зафиксированным перед заходом M значением, то есть DTO этим заходом не изменён. Staging пуст. Родитель синхронизировал STATUS и ROADMAP, не закрывая M1-T10 и не повышая версию.

Отличие UX: исходный native экран автоматически отмечал диалог прочитанным после GET; реализация M требует явной кнопки. Это не полное совпадение поведения с PWA и остаётся пунктом приёмки, а не исправлением отсутствующего API.

## Проверки исполнителя

Финальная команда реально выполнена из `mobile/` и завершена:

```bash
TMPDIR=/home/aleksei/.hermes/cache/scratch npm run typecheck > /home/aleksei/.hermes/cache/scratch/vedelo-M-typecheck-verified.log 2>&1 && TMPDIR=/home/aleksei/.hermes/cache/scratch npx jest --runInBand > /home/aleksei/.hermes/cache/scratch/vedelo-M-jest-verified.log 2>&1
```

| Проверка | Фактический результат | Exit | Лог в scratch |
| --- | --- | --- | --- |
| `npm run typecheck` | `tsc --noEmit`, без ошибок | 0 | `vedelo-M-typecheck-verified.log` |
| `npx jest --runInBand` | **92 набора / 713 тестов**, все passed; 0 snapshots; 228.981 s | 0 | `vedelo-M-jest-verified.log` |
| Карточки звонка/диалога после исправлений | 2 набора / 47 тестов, все passed | 0 | `vedelo-M-detail-final.log` |
| Helpers в UTC | 1 набор / 32 теста, все passed | 0 | `vedelo-M-date-UTC.log` |
| Helpers в Asia/Krasnoyarsk | 1 набор / 32 теста, все passed | 0 | `vedelo-M-date-Krasnoyarsk.log` |
| `git diff --check` | Нет вывода, whitespace ошибок нет | 0 | Проверено непосредственно инструментом после записи отчёта |

По сравнению с проверенной базой H/I/J/K/L (86/608) добавлено **6 наборов / 105 тестов**. Исходные тесты не редактировались. В полном логе сохранилось предупреждение существующего `src/services/notifications.test.ts` об ограничении push в Expo Go; это не failure и не проверка Expo push на устройстве. Логи находятся в `/home/aleksei/.hermes/cache/scratch`, не в repo или `/tmp`.

Новые focused suites: `communication.test.ts`, `CallsSection.test.tsx`, `CallDetail.test.tsx`, `conversationUi.test.ts`, `ConversationsList.test.tsx`, `ConversationDetail.test.tsx`. Сценарии: обе темы/длинные данные; initial/empty/error/retry; partial provider failure; literal IDs и неверные responses; local IDs/пустые телефоны/invalid date/unsafe URL; 403/сеть/success:false/failed; double guards; новый draft при старом send/result; read-back без повторного POST; markRead/status; stale route/unmount/confirm; link/decision/task и sync failure.

Первый focused прогон: 6 наборов, 96 тестов — 91 passed / 5 failed, exit 1. Пять failures относились к отсутствовавшему ожиданию React `act` перед проверкой повторного чтения; ожидания исправлены без увеличения timeout. Повтор карточки: 1 набор / 19 тестов, все passed, exit 0. Затем добавлены дополнительные регрессии и усилена проверка DTO/синхронизированной задачи.

Первый полный прогон после расширения: typecheck exit 0; Jest — 92 набора, 712 тестов, 710 passed / 2 failed, exit 1. Обе ошибки были в новых tests: общая изменяемая фикстура работы сохраняла задачу между тестами; поиск текста клиента находил одновременно header и кнопку. Исправлено новым объектом фикстуры для каждого теста и поиском кнопки по роли. Добавлена регрессия несохранённой даты/устаревшего Back. Повтор обеих карточек — 2 набора / 47 тестов, все passed, exit 0 (`vedelo-M-detail-final.log`).

Дополнительный реальный прогон `communication.test.ts`: `TZ=UTC` и `TZ=Asia/Krasnoyarsk`, по 1 набору / 32 теста passed, оба exit 0; логи `vedelo-M-date-UTC.log`, `vedelo-M-date-Krasnoyarsk.log`.

Native/server mocks не являются реальной доставкой, tenant/tariff или визуальной приёмкой на устройстве. `adb` и `java` в PATH не найдены; Android/EAS/Maestro/staging/production, клавиатура/TalkBack/внешний проигрыватель и реальная доставка не проверялись. Root ESLint игнорирует mobile, web build не запускался. Исполнитель STATUS/ROADMAP не изменял; затем родитель добавил итог M. Версии не менялись; M1-T10 не закрыт.
