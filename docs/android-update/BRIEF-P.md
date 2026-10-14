# P: один корректирующий цикл тестовых ошибок O

Владелец прямо разрешил оба шага словом «Разрешаю» после уточнения. Согласование: `/home/aleksei/reports/vedelo/2026-10-11/update/owner-P-S-authorization-20261012T135534Z.json`. Разрешён один ограниченный корректирующий цикл, не новый общий аудит/бесконечный цикл. Продуктовый код Android НЕ менять. Старые отрицательные O/N evidence не переписывать.

## Рабочее место и вход

Копия `/home/aleksei/projects/vedelo-android-qa-correction-20261012`, ветка `work/android-qa-correction-20261012`, HEAD35f9a64c29c0b8c078a0b54149a1949069a868ed. Parent перенёс и сверил все3021 окончательных O файлов, добавляет protected BRIEF-P. Отчёты `/home/aleksei/reports/vedelo/2026-10-11/update/P`; scratch `/home/aleksei/.hermes/cache/scratch/vedelo-p-20261012`, profile/tmp короткие. `input-O-final-source.json` и `initial-source-inventory.json` описывают исходные байты. O — input, не собственная дельта P. Proposed combined delta отдельно от frozen full3007.

root/mobile node_modules только читаемые ссылки на частные dependencies `/home/aleksei/projects/vedelo-android-update-20261011`. Никаких installs/записи в них. Общий существующий lock `/home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock`, открыть rb/flock EX; все тяжёлые команды последовательно.

## Два подтверждённых дефекта и разрешённые пути

1. `mobile/src/features/integrations/IntegrationsSection.test.tsx`: дополнительный async act вокруг синхронного RNTL render приводит к unmounted root в light/dark. Исправь именно несовместимую тестовую обвязку, сохрани исходные assertions/матрицы. Loading/error-сценарий тоже отрицателен; не объявляй его каскадом до реального повтора.
2. `mobile/__tests__/stageO/boundRead.ts`: глобальный count1 по URL ошибочен, реальные initial и apply readback дают два GET. Строго проверь запрос именно нужной операции по её настоящему signal/границе вызовов. Не нормализуй args, не разрешай любой token/signal, не убирай проверки headers/skipAuth/skipRefresh/lifecycle. Новый helper должен отвергать лишние/неверные чтения той же операции, но не отвергать законное начальное чтение другой операции.
3. `mobile/__tests__/stageO/boundRead.stageO.test.ts`: добавь регрессию законного initial+apply readback с различными сигналами; сохрани отрицательные cases неверных существенных параметров и лишнего чтения той же операции.
4. `mobile/src/features/events/integration.stageE.test.tsx`: только необходимая привязка строгой проверки к actual applyCall.signal/окну операции; сохраняются точное чтение, persisted merge, invalidation и реальная смена identity с aborted signal и отсутствием stale cache writes.
5. Новые test-only regressions/helpers только `mobile/__tests__/stageP/`, если минимально нужны; `docs/android-update/REPORT-P.md`.

createScreen/readback/import/export/броузерные исходники и прочие существующие пути не править. Измеренные O тестовые сроки наследуются, новые вслепую не повышать. Не менять product API/auth/identity/operations/schema/cache/SQL/offline/outbox/sync, зависимости, package/lock/Jest/Babel/Expo/build конфиги, версии/ID, UI или vendor gates. Без skip/only, подавления console errors, фиктивного real readback или отключения защиты. Если необходим другой путь или продуктовый fix — stop с точным вопросом.

## Реализация и проверки

Код тестов/helpers пишет только отдельный отсоединённый Codex CLI gpt-6.1-sol в assigned копии; управляющий ставит задачу и выполняет самостоятельный repeat. Через user-unit systemd, PATH/TMPDIR явные, workspace-write sandbox, add-dir только own reports/scratch. Проверить help/начало log, не снимать sandbox.

1. Штатно воспроизвести неизменённые исходные failures O, сохранить RED/первичные JSON/actualExit/SHA. Сразу воспроизвести valid two reads отрицательным regression до исправления helper. Не выдумывать timing RED.
2. Исправить два участка минимально. Смысл всех остальных assertions, имена, матрицы и критический порядок сохраняются. Не заменять consumer/capture/API исправляемой логикой мока.
3. Получить affected fresh+cached стандартным `npm test -- --runTestsByPath src/features/integrations/IntegrationsSection.test.tsx src/features/events/createScreen.test.tsx src/features/events/integration.stageE.test.tsx src/shared/storage/readback.stageN.test.ts __tests__/stageO/boundRead.stageO.test.ts` плюс новая регрессия. Частный cache, JSON output, без transform/timeout overrides. Проверить оба исходных stageE сценария и reached lifecycle abort, не только helper unit.
4. Import+Export стандартный адресный repeat: фактические оба пути в `src/features/import/`. Typecheck из mobile, baseline-aware lint изменённых tests/helpers и AST/integrity сравнение существенных assertions/protected product.
5. Реальный E16 `node --test tests/components/androidStageE.browser.test.cjs`, собственный STAGE_E_OUT, короткий STAGE_M_SCRATCH в own scratch. Исторические raw overflow не выдавать за PASS, UI не менять. E16 неизменный источник, типы/meta proof не заменяют browser run.
6. Управляющий отдельно повторяет final affected fresh/cached на окончательных байтах, сверяет primary counts/exit, product protected SHA и точные own/proposed combined deltas. Полный промежуточный Jest/интеграцию/независимое final review/EAS не делать — это после приёмки у родителя.

Отчёты писать инкрементально: отдельные неизменные AUTHOR/CONTROLLER, result.json с passed/selfChecksPassed, releaseApproved=false, initial/final counts и SHA, controllerOwnRepeat отдельно, failedNames/unresolved, собственный byte-backed diff и combined diff, pending=[]. Не перезаписывай авторские/historical ledgers при добавлении repeat. Сохраняй actualExit каждого завершённого процесса и queued/start/finished. Нет следующего auto fix-cycle.

Без commit/push/checkout/reset/stash/deploy/EAS, реальных аккаунтов/ИИ/облака/Telegram, чтения `.env`/credentials/tokens или целиком больших logs/node_modules. Canonical/соседние копии/PartyCRM/профили/чужие skills не трогать. Завершить все свои процессы и браузеры; чужую очередь/процессы не останавливать.
