# Отчёт I — local ID, remap и очистка сессии

Исполнитель изменил только A-LOCAL-ID-SESSION, A-LOCAL-ID-01 и A-LOCAL-ID-DELETE. Независимая окончательная приёмка управляющего завершена успешно; её отдельные команды, реальные результаты и SHA приведены ниже и в result.json.

База: полный controller-initial-source-sha.json (2972 пути), merged-FG (182 пути), HEAD 35f9a64c29c0b8c078a0b54149a1949069a868ed. Начальная сверка: 2972/2972 и 182/182, расхождений нет. Собственный delta рассчитан по байтам controller baseline, включая его BRIEF-I, а не по HEAD.

Обязательный RED: исходные mutations/cache/localEntityIds/outbox/database/sync и настоящий node:sqlite; реальные tokenStore и syncState. Заменены только native platform, SecureStore и сеть синтетического стенда. Actual SQL задерживается adapter seam до BEGIN/SQL, без подмены исправляемой логики и без throw-after-write. Финальный внешний RED: 11 тестов, 2 passed, 9 semantic failed. До/после него все 2972 исходных пути совпали. red-approved.json управляющего получен до первой продуктовой правки; его SHA и SHA RED приведены в result.json. Два дополнительных capture-теста сначала дали 11 passed / 2 failed после gate, затем 13 passed. Исходные 11 assertions сохранены byte-for-byte.

Одна маленькая очередь без DB/auth/network imports охватывает save/delete, local-create capture/applied/remap и clear. Epoch фиксируется до асинхронных чтений, инвалидируется сразу при clear/смене identity; уже dispatched SQL заканчивается перед успешным clear, новые записи следуют за clear. Cache/outbox helpers не захватывают очередь повторно. POST и runSync выполняются вне неё.

Save читает актуальные alias/версию внутри секции. Applied сохраняет правки, сделанные во время сети, и переводит прежние pending references на server ID. Delete по alias использует server ID и прежний delete DTO; если delete завершился во время create, applied ставит server delete, не воскрешая cache. Несинхронизированный create по-прежнему discards. Capture перечитывает реальный pending create перед отправкой; удалённый до отправки create не отправляется.

Исходный stageG не изменён. database initialization, SQLCipher, migrations и SQL удаления не изменены; pull/runSync, общий auth, DTO/schema/outbox, dependencies/версии/package ID и чужие UI scopes сохранены. Полный own diff прочитан, включая удаления. Первое размещение non-local status write внутри try возвращено к прежней границе перед окончательными проверками.

Финальный GREEN: 13/13 stageI, 43/43 адресных Jest в 11 suites (исходный stageG 3 + соседние 40), typecheck и ESLint семи полных собственных paths — exit 0. Исходники после этих проверок не редактировались. Все финальные before/after SHA совпали с tested-final-source-sha.json.

Все тяжёлые команды шли через единственный read-only fd lock test-queue.lock. Queued записывался до ожидания, started — внутри lock; exit/counts сохранялись сразу после команды. У каждого повтора отдельные неизменяемые log/JSON. Ожидание внешнего gate выполнялось foreground без lock.

Собственный delta: 8 уникальных repo paths, из них 7 проверенных source/test paths и 1 отчёт. Четыре существующих пути изменены, четыре новых (coordination, fixture, тест и отчёт). SHA отчёта учитывается отдельно от source; result.json не хеширует себя.

| Путь | Назначение |
|---|---|
| `mobile/__tests__/storage.stageI.fixture.cjs` | Новый |
| `mobile/__tests__/storage.stageI.test.cjs` | Новый |
| `mobile/src/shared/storage/database.ts` | Изменён |
| `mobile/src/shared/storage/localEntityCoordination.ts` | Новый |
| `mobile/src/shared/storage/localEntityIds.ts` | Изменён |
| `mobile/src/shared/storage/mutations.ts` | Изменён |
| `mobile/src/shared/sync/syncEngine.ts` | Изменён |
| `docs/android-update/REPORT-I.md` | Новый отчёт |

| Прогон | Exit | Counts | Результат и лог |
|---|---:|---|---|
| 20261011T125740-red-all-79e557e9 | 1 | tests=1, pass=0, fail=1, cancelled=0, skipped=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T125740-red-all-79e557e9.log`; одноимённый `.result.json` |
| 20261011T125954-red-diagnose-89972816 | 1 | tests=11, pass=1, fail=10, cancelled=0, skipped=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T125954-red-diagnose-89972816.log`; одноимённый `.result.json` |
| 20261011T130400-red-final-04c92ab6 | 1 | tests=11, pass=2, fail=9, cancelled=0, skipped=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T130400-red-final-04c92ab6.log`; одноимённый `.result.json` |
| 20261011T130523-red-gate-final-b4cf7825 | 1 | tests=11, pass=2, fail=9, cancelled=0, skipped=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T130523-red-gate-final-b4cf7825.log`; одноимённый `.result.json` |
| 20261011T131040-green-first-864942aa | 0 | tests=11, pass=11, fail=0, cancelled=0, skipped=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T131040-green-first-864942aa.log`; одноимённый `.result.json` |
| 20261011T131800-capture-red-dd68e544 | 1 | tests=13, pass=11, fail=2, cancelled=0, skipped=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T131800-capture-red-dd68e544.log`; одноимённый `.result.json` |
| 20261011T131807-controller-capture-review-e882490f | 1 | Не тестовая команда | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T131807-controller-capture-review-e882490f.log`; одноимённый `.result.json` |
| 20261011T131957-replay-races-2634ac8e | 0 | tests=13, pass=13, fail=0, cancelled=0, skipped=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T131957-replay-races-2634ac8e.log`; одноимённый `.result.json` |
| 20261011T132145-replay-stageG-e656652d | 0 | numTotalTests=3, numPassedTests=3, numFailedTests=0, numPendingTests=0, numTotalTestSuites=1, numPassedTestSuites=1, numFailedTestSuites=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T132145-replay-stageG-e656652d.log`; одноимённый `.result.json` |
| 20261011T132230-replay-neighbors-9eed00d6 | 0 | numTotalTests=40, numPassedTests=40, numFailedTests=0, numPendingTests=0, numTotalTestSuites=10, numPassedTestSuites=10, numFailedTestSuites=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T132230-replay-neighbors-9eed00d6.log`; одноимённый `.result.json` |
| 20261011T132327-replay-types-930e0262 | 0 | Не тестовая команда | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T132327-replay-types-930e0262.log`; одноимённый `.result.json` |
| 20261011T132636-replay-eslint-9e9115b4 | 1 | Не тестовая команда | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T132636-replay-eslint-9e9115b4.log`; одноимённый `.result.json` |
| 20261011T133640-final-races-d48dbe79 | 0 | tests=13, pass=13, fail=0, cancelled=0, skipped=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T133640-final-races-d48dbe79.log`; одноимённый `.result.json` |
| 20261011T133704-final-focused-ab705b0b | 0 | numTotalTests=43, numPassedTests=43, numFailedTests=0, numPendingTests=0, numTotalTestSuites=11, numPassedTestSuites=11, numFailedTestSuites=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T133704-final-focused-ab705b0b.log`; одноимённый `.result.json` |
| 20261011T133759-final-types-415b8347 | 0 | Не тестовая команда | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T133759-final-types-415b8347.log`; одноимённый `.result.json` |
| 20261011T134143-final-eslint-aa4d76e0 | 0 | Не тестовая команда | `/home/aleksei/reports/vedelo/2026-10-11/update/I/20261011T134143-final-eslint-aa4d76e0.log`; одноимённый `.result.json` |

Строка `controller-capture-review` — отдельная промежуточная read-only проба управляющего на ещё исправляемой редакции, а не команда исполнителя и не окончательная приёмка. Она независимо подтвердила устаревший payload capture; окончательные stageI тесты этого сценария зелёные. В result.json указан actor каждой команды; эта проба не суммируется с собственными counts.

Первый node --test запуск вернул общий file-level failure без подробностей сценариев и не засчитан как semantic RED. Диагностический прямой node:test запуск содержал один fixture failure (обязательный operation_id вложения); он исправлен до внешнего gate, каждый повтор сохранён. Успех и итоговые counts берутся только из финальных прогонов, повторы не суммируются.

Ограничения: node:sqlite и synthetic SQLCipher availability seam не являются проверкой Android SQLCipher/устройства. HTTP backend и реальные аккаунты не запускались; network seam проверяет реальные client storage transitions. Общий pull/auth/encryption не менялся и не подвергался новому аудиту. Полный Jest/browser/build/EAS/deploy/облако, git fetch/checkout/reset/stash/commit/push не выполнялись. .env/credentials не читались, node_modules symlinks использовались только для чтения/исполнения. Версии и roadmap вне этого узкого брифа не менялись.

Exact replay: `bash /home/aleksei/.hermes/cache/scratch/vedelo-android-I/final-replay.sh`; одиночные команды — `replay.sh {races|stageG|neighbors|types|eslint}`. Все команды, cwd, logs, exits/counts, SHA и protected evidence доступны в result.json и runner artifacts.

## Независимая окончательная приёмка управляющего

Выполнен отдельный отвязанный `vedelo-android-I-controller-final-01.service`, actual exit 0. Управляющий не писал продуктовый код; полные собственные product diff, новые fixture/tests и отчёт прочитаны независимо, включая удалённые строки. Репозиторий не коммитился, HEAD остался прежним.

Артефакты: `/home/aleksei/reports/vedelo/2026-10-11/update/I/controller-final-20261011T133918-926633e9/summary.json`. Каждая команда имеет уникальные `.queued.json`, `.started.json`, `.result.json`, `.log`, before/after SHA; общий lock открывался O_RDONLY. Полные argv/cwd/actual exit/counts и SHA журналов сохранены в этих результатах и в `result.json.independentAcceptance.commands`.

| Независимая команда | Exit | Actual counts |
|---|---:|---|
| `01-races`: постоянные SQL stageI interleavings | 0 | 13 tests / 13 pass / 0 fail / 0 cancelled / 0 skipped |
| `02-capture-independent`: отдельная scratch-проба stale capture payload | 0 | Проверены реальные cache/server/outbox после конкурентного save; не суммируется с tests |
| `03-stageG`: неизменённый исходный remap suite | 0 | 3/3 tests, 1/1 suite |
| `04-neighbors`: storage/outbox/sync/auth-clear/local references/API | 0 | 40/40 tests, 10/10 suites |
| `05-typecheck`: `npm run typecheck` | 0 | Ошибок типов нет; не тестовый count |
| `06-eslint`: семь собственных source/test paths, JSON output | 0 | 7 files, 0 errors, 0 warnings, 0 fatal errors |

Counts Jest сверены с реальным числом assertionResults/testResults, а не только со сводкой. SHA каждого журнала и final before/after source snapshots перепроверены. Все семь source/test SHA совпали с собственными финальными прогонами Codex и с независимой приёмкой; только отчёт дополнен после проверок, его итоговый SHA обновлён отдельно.

Полный delta относительно merged-FG/controller baseline: ровно 8 уникальных путей, missing/extra/duplicates отсутствуют; все 2968 неизменяемых baseline SHA совпадают. Независимо подтверждена байтовая неизменность database initialization/SQLCipher/migrations/SQL удаления после нормализации разрешённой wrapper-границы, sync DTO/saveConflicts/pull/runSync/conflict/failed/general catch, outbox.ts, общего auth и остальных защищённых контрактов. Cache.ts и исходный stageG также не изменены.

Настоящие тесты подтвердили отсутствие reentrant deadlock, обе очередности save/delete/remap, отсутствие old server/alias/outbox rows после успешного clear, ожидание clear уже dispatched SQL и сохранность новых данных сессии. Mutation queue не удерживается во время POST/runSync. Разрешены только заявленные три A-ID: `unresolvedIDs: []`. Ограничения устройства/SQLCipher/HTTP и запрет полного Jest/browser/deploy/EAS/commit сохраняются.
