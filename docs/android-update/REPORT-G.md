# Этап G: lifecycle/retry Android

Дата: 11.10.2026. Рабочая копия: `/home/aleksei/projects/vedelo-android-native-fixes-20261011`. База post-E: `35f9a64c29c0b8c078a0b54149a1949069a868ed`.
Исправлены **C-SESSION-01, C-CREATE-01, A-LOCAL-ID-01** в пределах указанного lifecycle. **Unresolved IDs по заданию: []**. Проверки завершены; pending tests нет.

## Исходная проверка и границы

До содержательной работы прочитаны AGENTS.md, весь AI_HANDOFF.md, Mobile Track ROADMAP и UI_CONVENTIONS.md. Проверены только три замечания из review-native.json на актуальном post-E коде. Все 167 SHA в post-E snapshot совпали с полным начальным манифестом координатора. Его SHA: `8516f688b8f4574b8849b4e7401b7a3a65f31c6742caa6df82b2d0f77328abe0`; SHA post-E snapshot: `66c951987b8708a25a835e334f99b8b0a77204487c40254f9cb7853ae9fdcb56`.

`docs/android-update/BRIEF-G.md` — **pre-existing административный исходный файл**. Он создан до CLI, отсутствует в post-E snapshot и не изменён этапом G. SHA: `b554f41a764a4a19063119f304a534b88d9ba91e2f2e2170a36735d0c5f9ad8b`. Он указан отдельно в result.json; продуктовым изменением G не объявляется. baseline/ и baseline-all-sha256.json — вспомогательные артефакты координатора, не продуктовый delta.

Собственный полный delta — **19 файлов**: 10 продуктовых исходников, 8 тестовых файлов, REPORT-G.md. Полный список и SHA каждого файла — `/home/aleksei/reports/vedelo/2026-10-11/update/G/result.json`. Сравнение основано на post-E snapshot и полном начальном SHA-манифесте для исходников, не перечисленных в частичном snapshot; HEAD не использовался как база продуктового delta.

Не выполнялись commit/push/fetch/checkout/reset/stash/deploy/EAS, установка зависимостей, полный Jest, общий browser-каталог или APK. Другие копии не редактировались. Версии, lockfiles, package ID, ROADMAP, auth/API core, серверные маршруты и PartyCRM не менялись.

## C-SESSION-01

Экспортируемые ProposalEditorScreen, ProposalTemplatesScreen и EventProposalsSection создают внутреннее дерево с ключом `user._id + tenantId` (у секции также eventId). Поэтому маршруты, использующие эти компоненты, получают ту же identity-границу без изменения navigation/auth ядра. Смена user даже внутри того же tenant и смена tenant сбрасывают draft, список, каталог, preview, вложенные редакторы и медиа. Старое дерево размонтируется, прежние generation/alive проверки отвергают его отложенные результаты и DocumentPicker-продолжения.

В многошаговых API-операциях identity захватывается один раз, перед следующим сетевым шагом проверяется stored user. Поздний результат старой записи не начинает GET новой сессии. Смена только токена той же identity не считается сменой пользователя.

Поведенческие проверки реальных компонентов: rerender user/tenant, deferred defaults/list, DocumentPicker в основном и настоящем вложенном RichTextEditor, видимый и запоздалый preview, очистка медиа, поздний save и следующий payload нового пользователя. Native WebView заменён platform seam; настоящие редакторы, identity-граница и picker-продолжения выполняются. WebView/телефон этим не проверены.

## C-CREATE-01

Create guard устанавливается до POST синхронно; ref не очищается при blur/refocus. Два нажатия, уже открытые template buttons, «Без шаблона», clone/новая версия не запускают второй create, пока результат неизвестен. Известный readbackId сохраняется: явные кнопки восстановления вызывают **только GET точного ID**, с проверкой eventId для КП. Шаблон после failed readback больше не повторяет PATCH вместо чтения.

Потерянный POST-response оставляет честное состояние «Результат создания неизвестен»: новый create заблокирован, автоматического replay и поиска своего результата по снимкам списка нет. Без точного ID автоматическое восстановление недоступно; проверка списка пользователем не снимает guard. После подтверждённого результата guard снимается, и отдельное следующее намеренное создание после refocus разрешено. API request-операции записи используют `skipRefresh:true`, исключая повтор create после refresh на 401. Серверная идемпотентность не добавлялась.

Это локальные guards текущего смонтированного route; они сохраняются при blur/focus. Перезапуск процесса/новое самостоятельное создание не заменяют серверную идемпотентность, которую выполняет другой этап. Общая гарантия дедупликации между процессами не заявляется.

## A-LOCAL-ID-01: минимальное разрешённое расширение

Настоящий SQLite-тест запускает saveLocalEntity, cache/outbox и runSync/remap; подменены только NetInfo, HTTP, file queue и native SQLite/secure-storage host. SQL исполняется реальным Node SQLite, migrations и production mutations/remap не подменены. Сценарий: сохранение → readback failure → applied sync → lookup в окне DELETE local cache → retry с новым вводом → ровно один create и update серверного ID. Проверены неизвестный local ID, очистка на смене user внутри того же tenant, clearLocalData и поздний applied после смены сессии.

Точное обоснование добавленных строк offline-области:

| Файл/строки | Зачем необходимы |
| --- | --- |
| localEntityIds.ts:1–11 | Только существующие getStoredUser/subscribeAuthSession/getDatabase; identity содержит user и tenant. Захват/проверка исключают запись старого mapping в новую сессию. |
| localEntityIds.ts:12–34 | Один listener и очередь очистки. Удаляет лишь внутренние mapping-строки при смене identity; resolver ждёт очистку, refresh той же identity ничего не удаляет. |
| localEntityIds.ts:35–43 | Точный local→server lookup по identity + entityType + local ID. Никаких догадок по названию, дате или списку. Нелокальный ID проходит без lookup. |
| localEntityIds.ts:44–57 | Аддитивная запись `{serverId}` в существующий entity_cache с namespace `__local_id_map:`. Повторно проверяет захваченную до POST identity. Новых таблиц, полей схемы, migrations или DTO нет. |
| cache.ts:2,53–64 | Существующий getCachedEntity разрешает alias до чтения и перепроверяет после него: lookup переживает удаление local cache. Явный возвращаемый тип нужен рекурсивному точному чтению. |
| mutations.ts:22–24 | Отсутствие local ID больше не означает отсутствие работы. Неизвестный ID даёт ошибку до cache/outbox записи; известный alias использует existing._id для update. Введённые values не меняются. |
| syncEngine.ts:1,81,84–94,135,141 | Identity захватывается перед sync POST и передаётся только внутреннему applied-handler. Серверная сущность сначала доступна для чтения, затем публикуется alias, затем выполняются прежние remap references/delete. Поздний applied другой сессии отвергается до новых cache/mapping записей. |
| events/edit/[id].tsx:220–224 | Readback может законно вернуть серверный ID; редактор сохраняет его для retry/навигации. При ошибке прежний draft остаётся на экране. |

Все остальные operationId/method/payload/baseValues/attachments/status/retry/conflict действия прежние. outbox.ts, database.ts, databaseMigrations.ts и wire DTO имеют неизменные protected SHA. Mapping не попадает в event lists или outbox и удаляется существующим clearLocalData вместе с cache.

## Post-E сохранён

EventOnlineSections и его identity-key, saved/online/synced guards не изменены. После apply сохраняются документы, контакты, напоминания и прочие cache-поля; меняются только возвращённые сервером поля. Query cache merging и invalidation проверены реальным интеграционным E-тестом на финальном коде. Карта 40×40 и её исходники/тесты не менялись. Dirty guards редактора сохранены; ожидание create тоже блокирует уход через существующее подтверждение.

## RED и все реальные прогоны

До продуктовых правок RED записан в lifecycle.stageG.test.tsx и remap.stageG.test.ts; SHA редакции зафиксированы в red-01.json и red-02-remap.json **перед запуском**. Все проверки сериализованы через существующий test-queue.lock, открытый read-only и `flock` его fd; writable roots не расширялись. `TMPDIR=/home/aleksei/.hermes/cache/scratch/vedelo-android-G/tmp`; PATH задавался явно runner. Каждый прогон имеет отдельные queued/start/finished, log, exit и counts. Повторы не суммируются.

Первый RED: 13 failed / 1 passed, exit1. Часть падений — подтверждённые повторные POST/PATCH, старые данные/продолжения и отсутствие skipRefresh; первая загрузка также превысила default timeout. Первый SQLite fixture получил неподходящий Expo mock UUID. Исправлен **только fixture**; отдельный RED remap дал 2/2 поведенческих падения до продуктовых изменений: local lookup возвращает null после applied, неизвестный local ID создаёт работу.

Первый GREEN: 97 passed / 5 failed, один suite не загрузился. Зафиксированы timeout/cleanup, отсутствие stored-user fixture в E и неправильное virtual-мокирование реального WebView-модуля в editor fixture. Fixture дополнены, прежние assertions сохранены. CLI runtime-limit test/cleanup увеличен с 5 до 30 секунд; это не удаление проверок поведения. Дополнительный lifecycle suite использует 5 секунд на ожидание UI. Второй GREEN — 109/109; после последней guard-правки адресный финальный GREEN — 28/28; финальный E — отдельно, ниже. Эти числа не складываются.

Первые два браузерных запуска не проверили UI: syntax error в platform mock, затем отсутствующий NavigationContext при сборке. Ошибки стенда исправлены без изменения assertions/product. Третий — четыре настоящих browser-сценария.

| Прогон | queued / start / finished UTC | exit | фактические counts | Артефакты |
| --- | --- | --- | --- | --- |
| red-01 | 2026-10-11T11:41:37Z / 2026-10-11T11:41:37Z / 2026-10-11T11:44:35Z | 1 | passed=1, failed=13, total=14 | [red-01.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/red-01.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/red-01.log) |
| red-02-remap | 2026-10-11T11:44:51Z / 2026-10-11T11:45:06Z / 2026-10-11T11:45:45Z | 1 | passed=0, failed=2, total=2 | [red-02-remap.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/red-02-remap.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/red-02-remap.log) |
| green-01 | 2026-10-11T11:47:55Z / 2026-10-11T11:47:55Z / 2026-10-11T11:51:43Z | 1 | passed=97, failed=5, total=102 | [green-01.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/green-01.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/green-01.log) |
| green-02 | 2026-10-11T11:52:27Z / 2026-10-11T11:52:27Z / 2026-10-11T11:53:52Z | 0 | passed=109, failed=0, total=109 | [green-02.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/green-02.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/green-02.log) |
| green-03-final | 2026-10-11T11:58:29Z / 2026-10-11T11:58:29Z / 2026-10-11T11:59:12Z | 0 | passed=28, failed=0, total=28 | [green-03-final.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/green-03-final.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/green-03-final.log) |
| jest-E-final | 2026-10-11T12:03:58Z / 2026-10-11T12:03:58Z / 2026-10-11T12:04:18Z | 0 | passed=15, failed=0, total=15 | [jest-E-final.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/jest-E-final.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/jest-E-final.log) |
| typecheck-01 | 2026-10-11T11:53:32Z / 2026-10-11T11:54:52Z / 2026-10-11T11:57:12Z | 0 | errors=0, warnings=0 | [typecheck-01.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/typecheck-01.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/typecheck-01.log) |
| typecheck-02-final | 2026-10-11T11:58:39Z / 2026-10-11T11:59:12Z / 2026-10-11T12:01:32Z | 0 | errors=0, warnings=0 | [typecheck-02-final.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/typecheck-02-final.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/typecheck-02-final.log) |
| eslint-01 | 2026-10-11T11:54:02Z / 2026-10-11T11:57:12Z / 2026-10-11T11:57:25Z | 0 | errors=0, warnings=0 | [eslint-01.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/eslint-01.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/eslint-01.log) |
| eslint-02-final | 2026-10-11T11:58:48Z / 2026-10-11T12:01:32Z / 2026-10-11T12:01:43Z | 0 | errors=0, warnings=0 | [eslint-02-final.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/eslint-02-final.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/eslint-02-final.log) |
| browser-01 | 2026-10-11T11:54:09Z / 2026-10-11T11:57:25Z / 2026-10-11T11:57:25Z | 1 | passed=0, failed=1, total=1, skipped=0 | [browser-01.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/browser-01.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/browser-01.log) |
| browser-02-final | 2026-10-11T11:58:55Z / 2026-10-11T12:01:43Z / 2026-10-11T12:01:48Z | 1 | passed=0, failed=4, total=4, skipped=0 | [browser-02-final.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/browser-02-final.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/browser-02-final.log) |
| browser-03 | 2026-10-11T12:02:11Z / 2026-10-11T12:02:23Z / 2026-10-11T12:03:00Z | 0 | passed=4, failed=0, total=4, skipped=0 | [browser-03.json](/home/aleksei/reports/vedelo/2026-10-11/update/G/browser-03.json) / [log](/home/aleksei/reports/vedelo/2026-10-11/update/G/browser-03.log) |

Полные фактические команды (runner выполняет argv без shell-подстановки):

`red-01`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011/mobile`:

```bash
node node_modules/jest/bin/jest.js --runInBand --no-cache --runTestsByPath src/features/proposals/lifecycle.stageG.test.tsx src/shared/storage/remap.stageG.test.ts
```

`red-02-remap`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011/mobile`:

```bash
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/shared/storage/remap.stageG.test.ts
```

`green-01`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011/mobile`:

```bash
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/features/proposals/lifecycle.stageG.test.tsx src/shared/storage/remap.stageG.test.ts src/features/proposals/editor.test.tsx src/features/proposals/section.test.tsx src/features/proposals/library.test.tsx src/features/proposals/api.test.ts src/features/events/createScreen.test.tsx src/features/events/integration.stageE.test.tsx src/shared/storage/syncQueueStorage.test.ts src/shared/sync/syncEngineState.test.ts
```

`green-02`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011/mobile`:

```bash
node node_modules/jest/bin/jest.js --runInBand --testTimeout=30000 --runTestsByPath src/features/proposals/lifecycle.stageG.test.tsx src/shared/storage/remap.stageG.test.ts src/features/proposals/editor.test.tsx src/features/proposals/section.test.tsx src/features/proposals/library.test.tsx src/features/proposals/api.test.ts src/features/events/createScreen.test.tsx src/features/events/integration.stageE.test.tsx src/shared/storage/syncQueueStorage.test.ts src/shared/sync/syncEngineState.test.ts
```

`green-03-final`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011/mobile`:

```bash
node node_modules/jest/bin/jest.js --runInBand --testTimeout=30000 --runTestsByPath src/features/proposals/lifecycle.stageG.test.tsx src/features/proposals/nested.lifecycle.stageG.test.tsx src/shared/storage/remap.stageG.test.ts src/features/proposals/section.test.tsx
```

`jest-E-final`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011/mobile`:

```bash
node node_modules/jest/bin/jest.js --runInBand --testTimeout=30000 --runTestsByPath src/features/events/integration.stageE.test.tsx
```

`typecheck-01`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011/mobile`:

```bash
node node_modules/typescript/bin/tsc --noEmit
```

`typecheck-02-final`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011/mobile`:

```bash
node node_modules/typescript/bin/tsc --noEmit
```

`eslint-01`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011`:

```bash
node node_modules/eslint/bin/eslint.js --no-config-lookup --config /home/aleksei/.hermes/cache/scratch/vedelo-android-G/mobile-eslint.cjs mobile/src/features/proposals/ProposalEditorScreen.tsx mobile/src/features/proposals/ProposalTemplatesScreen.tsx mobile/src/features/proposals/EventProposalsSection.tsx mobile/src/features/proposals/api.ts mobile/src/features/proposals/identity.ts mobile/src/shared/storage/localEntityIds.ts mobile/src/shared/storage/cache.ts mobile/src/shared/storage/mutations.ts mobile/src/shared/sync/syncEngine.ts 'mobile/app/events/edit/[id].tsx' mobile/src/features/proposals/lifecycle.stageG.test.tsx mobile/src/shared/storage/remap.stageG.test.ts mobile/src/features/proposals/editor.test.tsx mobile/src/features/proposals/section.test.tsx mobile/src/features/proposals/library.test.tsx mobile/src/features/proposals/api.test.ts mobile/src/features/events/integration.stageE.test.tsx
```

`eslint-02-final`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011`:

```bash
node node_modules/eslint/bin/eslint.js --no-config-lookup --config /home/aleksei/.hermes/cache/scratch/vedelo-android-G/mobile-eslint.cjs mobile/src/features/proposals/ProposalEditorScreen.tsx mobile/src/features/proposals/ProposalTemplatesScreen.tsx mobile/src/features/proposals/EventProposalsSection.tsx mobile/src/features/proposals/api.ts mobile/src/features/proposals/identity.ts mobile/src/shared/storage/localEntityIds.ts mobile/src/shared/storage/cache.ts mobile/src/shared/storage/mutations.ts mobile/src/shared/sync/syncEngine.ts 'mobile/app/events/edit/[id].tsx' mobile/src/features/proposals/lifecycle.stageG.test.tsx mobile/src/features/proposals/nested.lifecycle.stageG.test.tsx mobile/src/shared/storage/remap.stageG.test.ts mobile/src/features/proposals/editor.test.tsx mobile/src/features/proposals/section.test.tsx mobile/src/features/proposals/library.test.tsx mobile/src/features/proposals/api.test.ts mobile/src/features/events/integration.stageE.test.tsx
```

`browser-01`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011`:

```bash
node --test --test-concurrency=1 /home/aleksei/.hermes/cache/scratch/vedelo-android-G/ui-guards.browser.cjs
```

`browser-02-final`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011`:

```bash
node --test --test-concurrency=1 /home/aleksei/.hermes/cache/scratch/vedelo-android-G/ui-guards.browser.cjs
```

`browser-03`; cwd `/home/aleksei/projects/vedelo-android-native-fixes-20261011`:

```bash
node --test --test-concurrency=1 /home/aleksei/.hermes/cache/scratch/vedelo-android-G/ui-guards.browser.cjs
```

## Финальная проверяемая редакция и ограничения

Полный собственный `files/fileCount/sha256`, before/after SHA, финальные source SHA с указанием проверившего прогона, все command/exit/counts и **186 protected hashes** находятся в result.json. Все protected hashes совпадают с post-E/начальным манифестом. После успешных прогонов продуктовые исходники не менялись.

Короткий браузер: четыре сочетания 390/1365 px × light/dark, только create/identity UI guards. Проверены реальные disabled кнопки открытого выбора, один POST, сохранённый ввод шаблона, очищенный draft новой identity, отсутствие горизонтального overflow и console/page errors. Измерения: `/home/aleksei/reports/vedelo/2026-10-11/update/G/browser/measurements.json`; восемь снимков в `/home/aleksei/reports/vedelo/2026-10-11/update/G/browser`. Снимки 390 dark section и 390 light template также осмотрены. Shared React Query E-тест пишет act-warning из EventReviewContent/UserSections; он не скрывался. Node SQLite сообщает experimental warning. Ошибок браузерной console/page нет.

APK, Android WebView, реальный телефон, production и перезапуск приложения не проверялись. RN Web — только проверка этих UI guards. Серверная cross-process идемпотентность вне этапа G. **Unresolved IDs внутри заданных трёх замечаний: []**; указанные внешние ограничения остаются открытыми.
