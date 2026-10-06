# Задание M — звонки и переписки (этап Y)

## База и границы

Только `/home/aleksei/projects/vedelo`, origin `git@github.com:Escalion86/vedelo.git`, ветка `mobile-parity`, HEAD ea39cc0, fetch родителем выполнен, расхождение 0/0. H/I/J/K/L уже реализованы на диске без коммитов, сохранить. Текущая проверенная база: **86 наборов / 608 тестов**, typecheck чист.

Прочитать AGENTS.md, AI_HANDOFF.md полностью, релевантные ROADMAP/UI_CONVENTIONS/MOBILE_PWA_PARITY (Y, дизайн-контракт и ограничения), PLAN-CONTINUE/STATUS. Эталон — текущие мобильные PWA-экраны и контракты этого репозитория, а не исторические отчёты. Русский язык. Только модель gpt-6.1-sol, не делегировать дальше, не менять модель.

Менять mobile UI/тесты и REPORT-M.md. Родитель обновит STATUS/ROADMAP. Не делать staging/commit/push/PR, git add -A/reset --hard/checkout --. Не менять web/API/server/models/схемы, mobile DTO, storage/**, sync/**, auth/push lifecycle, зависимости/lock/package/app.json/eas.json/deep links. Не читать env/секреты; не запрашивать production/провайдеров. Не возвращать developer/admin UI. Сохранить чужие и предыдущие изменения, особенно financeComment в shared/domain/types.ts, интеграцию SettingsSection/DocumentsSection в more/[section].tsx.

## Файлы и эталон

- mobile/app/more/[section].tsx: только Calls и нужные импорты; вынести в src/features/calls/CallsSection.tsx.
- mobile/app/calls/[id].tsx; допускаются новые src/features/calls/* компоненты/хелперы/тесты.
- mobile/app/conversations/index.tsx, conversations/[provider]/[id].tsx; новые src/features/conversations/*.
- Читать layouts/content/CallsContent.js и фактические компоненты просмотра звонков/мессенджера (найти определение/вызовы), пользовательские условия/фильтры/права.
- Читать mobile/v1/calls и delegated /api/calls actions, server/mobile/calls.js/callResult.js; mobile/v1/conversations wrappers, delegated integrations/{avito,vk}/conversations endpoints и server/mobile/conversations.js; существующие DTO, api errors/client, cache exports, UI primitives/theme/compact fields и компоненты предыдущих заходов.

## Приёмка

1. Компактные строки звонков и диалогов по актуальной PWA, заголовки/статусы/направление/локальная дата/длительность, обе темы, длинные имена/текст. Осмысленные loading/refresh/error/empty/retry; начальное чтение не показывает «нет звонков/сообщений». Partial failure Avito/VK виден отдельно: успешный пустой ответ одного провайдера не маскирует ошибку другого. Не делать выдуманного глобального unread=0 и не добавлять Telegram Business без API.
2. Focus reload, отмена/игнорирование поздних ответов route/unmount, guard повторного чтения/мутации и устаревшего подтверждения. Смена clientId/eventId/provider/id не оставляет чужую предыдущую историю, draft и ссылки на новом экране. Каждый success/data проверяется; id в ответе должен соответствовать literal route, provider только avito/vk. IDs не «исправлять», лишь валидировать/безопасно кодировать. Неверный provider не должен посылать запрос.
3. Звонок: запись/транскрипт/AI-итог/распознанные поля, связанный клиент/работа, текущие link/decision/result/ignore/process/analyze сохранены. Разделить ошибки call/clients/events при независимом чтении; сбой вспомогательного кэша не выдаётся за отсутствие самого звонка и не включает действия с непроверенными ссылками.
4. Не сопоставлять пустые телефоны друг с другом и не трактовать нечёткую нормализацию как идентификатор. Клиент/работа — только из текущего tenant-кэша; local ID нельзя отправлять прямому server action. Не делать optimistic ручной привязки при неуспехе/неподтверждённом результате; прямую мутацию подтверждать GET точного звонка до сообщения об успехе/навигации. Неправильный call/event/client ID, success:false, 403 и сетевой сбой оставляют безопасное состояние.
5. После decision create_event/задачи штатный runSync обязателен, но не скрывать его сбой и не переходить к несуществующей карточке. Повторное чтение/синхронизация не должны повторять неидемпотентный POST. Повторная тарифицируемая process/analyze операция защищена guard; применять только реально подтверждённую семантику retry API, не выдумывать ключи идемпотентности.
6. Результат звонка — CompactField, сохранение заметки при отказе и позднем refetch, dirty/back подтверждение по текущему образцу. Следующий контакт — строгая календарная дата/время в локальном часовом поясе, без автонормализации 31 февраля; callback/follow_up требуют связанной сохранённой работы. Сохранение результата не теряет соседние поля, заметка не очищается после 403. Телефон и URL записи открываются только после безопасной проверки; не произвольные file/content/javascript schemes. Не показывать сырые processingError/URL/секреты как UI-ошибку.
7. Диалог: направления сообщений/статусы/ссылки/поле ответа по PWA, CompactField, клавиатура и scroll, длинные слова, обе темы. Редактор не доступен до успешной проверки именно этой conversation. Предел текста брать из действующего API (не предполагать 4000 для всех). HTTP 200 с success:false или message.status=failed не считается отправленным. Ответ должен иметь подтверждённые ID/принадлежность/direction/status по реально существующему DTO; не вводить обязательные поля, которых sanitizer не возвращает.
8. Ответ: guard двойного нажатия; при 403/сети/failed ответ не добавлять как успешный и draft сохранять. Если пользователь изменил draft во время отправки, не стирать новый текст после успеха старого. Не повторять автоматически неидемпотентный POST и не объявлять «доставлено» по одному «принято/отправлено»; по возможности read-back сообщений подтверждает exact returned ID, не придуманное совпадение текста. Не хранить текст/секреты в незашифрованном persistent storage; dirty/back предупреждение допустимо.
9. markRead/status: ошибки не погашать незаметно, read-back точного диалога перед утверждением успеха; GET messages не должен автоматически включать очередной POST send. Read-back/refresh не затирают draft. Закрыть/игнорировать требуют явного подтверждения, вернуть в работу по API. Ссылки на клиента/работу подтверждать по текущему кэшу, чужая/отсутствующая запись не открывается.
10. Установить фактическую границу доступа: mobile conversations делегирует Avito/VK endpoints. Если user-scoped права недостаточны — честный отказ и отчёт, не обходить права и не рисовать успешный пустой раздел. Не добавлять developer-only integration management и сообщения на «Важном».

## Проверки и отчёт

Добавить focused tests списка звонков/просмотра/диалогов и domain helpers: обе темы/длинные данные, начальная загрузка/пусто/ошибка/retry, partial provider errors, stale route/unmount/старое confirm, пустые телефоны/invalid date/local IDs/несовпадение ответа, 403/success:false/failed отправка, guard двойных действий, сохранение нового draft во время старого send/refetch, markRead/status failure, read-back без повторного POST, link/create/результат/sync failure. Native/server mocks — не реальная доставка или tenant/tariff-приёмка.

Реально выполнить `cd mobile && npm run typecheck && npx jest --runInBand`, затем `git diff --check`, дождаться окончания. Логи только ~/.hermes/cache/scratch (TMPDIR), не в repo или /tmp. В отчёте точные числа/exit и файлы. Root ESLint игнорирует mobile; web build не нужен без web-изменений. Android/EAS/native/staging-приёмку не выдумывать.

Сохранить docs/mobile-parity/REPORT-M.md: сделано, exact существующие API, контрактные/UX ограничения, фактические проверки, непроверенные сценарии. M1-T10 не закрывать и версию не менять. Финальное сообщение кратко по-русски.
