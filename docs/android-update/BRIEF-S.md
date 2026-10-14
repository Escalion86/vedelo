# S: совместимое API на актуальной базе, только локальная подготовка

Владелец сказал «Разрешаю» на подготовку совместимого серверного изменения на свежей базе и локальную проверку старого/нового клиента. Реальная выкладка, перезапуск, install/build/cleanup/mount/swap на рабочем сервере НЕ разрешены. Согласование `/home/aleksei/reports/vedelo/2026-10-11/update/owner-P-S-authorization-20261012T135534Z.json`.

## Рабочая копия и точно реконструированный вход

- Assigned `/home/aleksei/projects/vedelo-api-compatible-20261012`, ветка `work/android-api-compatible-20261012`, committed HEAD45e3efe7550772561760c291e615d788dfc222d2. Origin свежо fetch codex в этой отдельной копии; не менять canonical.
- ВАЖНО: committed дерево имеет package1.34.0. Canonical working tree имеет1.35.11 и161 dirty source путей. Рабочий сервер имеет1.35.19 и119 dirty source путей. Одного HEAD недостаточно, canonical working overlay нельзя считать production.
- Parent создал clean committed seed2744 файлов и наложил ТОЧНЫЕ119 dirty code-файлов фактического рабочего сервера, без `.env`/credentials/remote writes. Package теперь1.35.19; все32 runtime/support SHA совпали со свежим read-only SSH. Наложение — исходная база, не собственная дельта S.
- Доказательства: `committed-base-source-inventory.json`, `production-fresh-read-only.json`, `production-source-overlay.json`, `canonical-safe-metadata.json` в `/home/aleksei/reports/vedelo/2026-10-11/update/S`. Base64 transfer хранится в own scratch, не выводить его целиком.
- До code writer управляющий проверяет достаточность входа: dirty source вне уже captured roots/нужные assets/alias closure не должны потеряться. Можно адресно read-only сверить дополнительные актуальные code/asset пути, при необходимости точно копировать только их в S и сформировать финальный полный baseline inventory ДО реализации. Нельзя молча заменять свежую базу старым frozen3007 или утверждать compiled provenance.
- Отчёты `/home/aleksei/reports/vedelo/2026-10-11/update/S`; scratch `/home/aleksei/.hermes/cache/scratch/vedelo-s-20261012` с коротким TMPDIR. Этот BRIEF-S родительский защищённый файл, baseline учитывает его отдельно.

## Что требуется перенести совместимо

Исходное адресное API сравнение: `/update/server-compatibility-standard-release/input.json`, `result.json`, `REPORT.md`. Donor с уже принятыми Android API изменениями `/home/aleksei/projects/vedelo-android-update-20261011`, old local1.35.11, frozen218/full3007. Донор только читать; прежний server PASS относится к нему, не новой базе.

Основная область — selected24 runtime пути из input.json:
- reviews/statuses/review-page и logo routes;
- events/[id]/proposals, proposals/[id]/route/logo/send-telegram/statuses;
- proposal-templates routes, defaults и оба preview;
- escalioncloud upload;
- server/clientReviews.js, mobile/billing.js/statistics.js;
- новые proposalPreview.mjs/proposalRequestContext.js/validatedUploadFiles.js/videoContainerValidation.js.

Не копируй все24 файла поверх новой базы. Сначала сопоставь актуальные исходные функции/контракты с donor и сохрани новые веб-изменения; внедри лишь отсутствующие совместимые Android возможности и необходимые security guards. Разный SHA не означает автоматически broken endpoint.

Mobile callers использовать как контракт из donor, не переносить mobile код в S. Shared client вызывает обычные `/api/proposals`, `/client-reviews`, `/proposal-templates` с bearer; не придумывай mobile aliases. Defaults GET и оба preview POST обязательны. Сохраняются cookie web auth и mobile bearer, tenant/tariff ownership, old upload paths, безопасные DTO, apply/readback, optional additive billing rates/flags и statistics фильтры/isTransferred.

## Разрешённая область и защита новой базы

Разрешены selected24 runtime файлы, их тесты в server/mobile/tests и минимально доказанно необходимые transitive helpers/alias adapters. Управляющий ДО edits перечисляет конкретный dependency closure и необходимые исключения в `SCOPE-S.json`; unrelated UI/модели/БД/PWA/new web features/версии/dependencies/lockfiles/configs защищены. Если нужен дополнительный product файл — он должен иметь прямую объяснённую зависимость к selected24 и быть явно выделен, не общей чисткой. Если это меняет schema/DB/auth contract/новые бизнес-возможности, stop с вопросом вместо расширения scope.

Запрещено менять canonical `/home/aleksei/projects/vedelo`, donor/другие копии/PartyCRM/профили/чужие skills. Не rollback/reset/stash и не overwrite1.35.19 старой1.35.11. Не commit/push/EAS/store, не менять package/signing ID. Только assigned S local writes.

## Реальная проверяемая работа

Код product/tests пишет только отдельный отсоединённый Codex CLI gpt-6.1-sol в S, workspace-write sandbox, собственные отчёты/scratch и явные PATH/TMPDIR. Управляющий до writer фиксирует actual working baseline, а после — собственную дельту и независимый repeat команд.

1. Прочесть AGENTS/AI_HANDOFF и адресные Android API договорённости. Подтвердить current baseline/source overlay, closure, Node/Next/lock compatibility. Не повторять общий аудит всех экранов.
2. Добавить маленькие реальные RED для отсутствующих defaults/preview/bearer и required guards на актуальной базе. Без фиктивных экспортов/ошибок импортов вместо behavioral RED.
3. Совместимо внедрить недостающее на этой базе, сохранив текущие web cookie behavior и новые веб-поля. Не добавлять runtime ffmpeg/ffprobe или иной dependency.
4. Штатные targeted old/new-client проверки: cookie/bearer, чужой tenant и tariff denial, templates defaults/preview, proposals save/readback/apply, reviews/review-page/status map, upload/logo destination validation, billing additive fields и statistics filter echo. DB/HTTP использовать только изолированные localhost fixtures; cloud/ИИ/Telegram mock на внешней границе, ни одного реального paid/user write.
5. Baseline-aware syntax/lint и закрытый dependency graph. Локальная staging сборка разрешена только в S на OrangePi, с отдельным output/cache и без `.env`/реальных credentials/remote services. Synthetic build-time configuration честно помечать staging-only: такой artifact нельзя автоматически использовать как production build. Если штатный build требует недоступный обязательный env — реальный blocker, не fabricated success. Никаких app builds на VPS.
6. Node dependencies либо частное `npm ci` в S с собственным npm cache под queue, либо доказанно совместимая private копия. Не `cp -al`/не записи через чужой symlink; dependency/lock versions не менять. Начальный S node_modules отсутствует. Сеть package manager допускается только для необходимых dependencies, не user services. На ограниченном хосте все npm installs/builds/tests через общий existing `/home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock` rb/flockEX; P параллельно использует ту же очередь.
7. Управляющий повторяет адресные финальные проверки на последних SHA, сверяет unchanged source outside scope и сохранность web behavior, exact own byte-backed delta. Independent final review и production deploy у родителя; не делать ещё один auto repair цикл.

## Только чтение на рабочем сервере

SSH alex@5.129.192.130:/home/apps/vedelo разрешён лишь для source/metadata/hashes. Без `.env`, tokens, credentials, process env, private data/backup archives. Не import/init приложение/PM2 CLI, который может поднять daemon. Без restart/install/build/mount/swap/cleanup/DB или HTTP mutations. Публичные read-only GET/HEAD без auth не доказывают authorized DTO. Сохранённый source/build не означает, что текущий PID исполняет этот код; compiled provenance остаётся отдельной границей.

## Артефакты и готовность

Записывать инкрементально: baseline source inventory/scope/closure, неизменяемые records RED/GREEN/source hashes, авторский отчёт и отдельный контроллерский отчёт, final inventory, own delta/patch/bytes, local build record при действительном завершении, OLD/NEW compatibility matrix. `result.json`: passed/selfChecksPassed, sourceBaselineIdentity, preservedWebChanges, real commands/counts/actualExit, buildCompleted/buildStagingOnly, serverDeploymentReadyForReview, releaseApproved=false, deploymentPerformed=false, unresolved, pending=[]. Не выдавать test mocks или успешный код CLI за completed build/production compatibility. Завершить own localhost services/DB/fixtures и user-units; чужие процессы/lock не трогать.
