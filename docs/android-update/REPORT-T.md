# REPORT-T — первичный API author cycle

Один API author cycle T завершён. Runtime-правки: selected24; package.json 1.35.19, lock, схемы, конфиги, mobile/UI, roadmap и существующие тесты автором не менялись.

До runtime-правок выполнены реальные RED: AUTHOR-red-api (4 поведенческие ячейки failed; Node tests 5/5 failed) и AUTHOR-red-guards (5 ячеек failed; Node tests 6/6 failed). Причины: bearer 401 вместо 200, отсутствующие preview POST 404 вместо 200, malformed Authorization с cookie 200 вместо 401. Это не import/syntax/dependency RED; успешный preflight3 подтвердил реальные cookie/legacy/v1 auth на исходной базе. SHA до правок и неизменность журналов подтверждены AUTHOR-red-validation.json.

Добавлены tenant/tariff-aware defaults GET и оба приватных preview POST, без сохранения preview. КП/отзывы/logo получают настоящий bearer/cookie request context с запретом malformed Authorization fallback. Upload сохраняет установленные destinations и ограничивает tenant/ownership/tariff, multipart ambiguity, размер, MIME, декодирование изображений и контейнеры MP4/WebM. Billing аддитивно возвращает публичные агрегированные rates; текущие flags и aiIncludedRubPerMonth сохранены. Statistics сохраняет echo filters и добавляет isTransferred. Нулевой validUntil в draft PATCH поддержан совместимо. Существующие Telegram partial_delivery/retry обработчики не подменялись.

Проверки на final runtime:

| Проверка | Actual exit | Counts |
|---|---:|---|
| AUTHOR-green-api-final2 | 0 | {"tests": 31, "pass": 31, "fail": 0, "cancelled": 0, "skipped": 0, "todo": 0} |
| AUTHOR-original-tests | 0 | {"tests": 61, "pass": 61, "fail": 0, "cancelled": 0, "skipped": 0, "todo": 0} |
| AUTHOR-lint-import-final | 0 | см. детали/лог |
| AUTHOR-build | 0 | см. детали/лог |
| AUTHOR-billing-post | 0 | {"tests": 4, "pass": 4, "fail": 0, "cancelled": 0, "skipped": 0, "todo": 0} |

Матрица: 33 executed ячейки; {'passed': 33}. Old/new/web проверяют caller URL/payload/DTO через настоящие handlers, request context, auth, Mongoose и изолированную MongoDB. Проверены preview/defaults, create/save/readback/apply и actual event, templates/services/statuses, reviews/notes/filters/review-page/logo, upload destinations/MIME/body/container, wrong event owner/cross-tenant/tariff, billing GET+POST/rates/flags, statistics filters/isTransferred и Telegram partial delivery/readback/retry. Все данные synthetic; PNG формируется в памяти, видео testsrc2 читаются read-only и сверяются с SHA donor manifest.

Транспорт тестов — localhost HTTP bridge с настоящими Next request async stores, а не запущенный Next HTTP server: browser/proxy/UI и APK не проверялись. Outbound cloud — настоящий localhost HTTP mock; Telegram — mock только undici HTTP fetch. Auth, validation, DTO/serializers, handlers и DB не mocked.

Штатный build: npm run build, Next 16.2.6/Turbopack, actual exit=0, completed=True, BUILD_ID='9jdaZizmw_ixooG0xOT27'. Output/cache .next-author-t-staging; staging only, не production artifact. Полный synthetic environment, argv Mongod и npm — AUTHOR-build-environment.json; фактически произведённые manifests/SHA — AUTHOR-build-artifacts.json. Mongo bind127.0.0.1, random private port !=27017, own dbpath, --nounixsocket. Никаких .env/credentials/production сервисов.

Первичные evidence расположены в /home/aleksei/reports/vedelo/2026-10-11/update/T-api-lock-retry. Каждый heavy command использовал rb/flockEX existing test-queue.lock, exclusive queued/started/exit.json и full.log. Старые intermediate failures сохранены: preflight127 (PATH), preflight2 (неполный Next request store), green-api-1 (неуникальный synthetic publicId), lint-import (пробел в новом тесте). Они исправлены; не выдаются за behavioral RED или final GREEN.

Контроллеру: точные argv, times, actual exit/counts/log SHA и source-record links собраны в AUTHOR-result.json. Fixtures — server/mobile/tests/apiCycleFixture.cjs; окончательные tests — apiCycle.test.cjs и billingPost.test.cjs. Чистый PATH/TMPDIR — в build environment и author-run.py; API tests получают AUTHOR_PHASE=green и уникальный AUTHOR_RUN (существующие wx evidence не перезаписывать). Для независимого build запустить штатный npm run build под общей очередью с новым own output/dbpath/port; synthetic env взять из AUTHOR-build-environment.json. Build runner — own scratch/build-local.py; он держит Mongo до окончания npm и проверяет PID/port после остановки.

Невыполненное: нет обязательных author-проверок с неуспешным exit. Independent final review, controller repeat, интеграция и release approval сюда не входят; автор не выдаёт self-check за независимую приёмку. releaseApproved=false, productionWritesPerformed=false, commit/push/deploy/EAS/restarts=false, pending=[].
