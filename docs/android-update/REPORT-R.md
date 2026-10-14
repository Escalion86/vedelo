# R — минимальная тестовая инициализация Expo

AUTHOR в выделенной рабочей копии завершает единственную правку из BRIEF-R: раннее разрешение настоящих Expo lazy globals URL/TextDecoder через штатный jest.setupFilesAfterEnv. Bootstrap создаёт URL и выполняет декодирование пустого Uint8Array до test/findBy deadlines. Другие globals и feature modules не прогреваются.

Маленькая регрессия снимает дескрипторы при загрузке тестового файла и проверяет отсутствие getter, settled constructor, Expo builtin marker, точное совпадение с настоящими Expo exports и реальное URL/UTF-8 поведение. Semantic RED до подключения bootstrap сохранён отдельно; первая попытка с нераспознаваемым Jest расширением .test.cjs не является RED.

Входные 3024 regular nonsymlink файла сверены с controller inventory. Замороженный Q-вход — 3023 файла, исключая новый BRIEF-R; Q stock primary fresh 89/90 exit 1 и cached 90/90 exit 0 проверены по малым command metadata и primary JSON. Использованы только разрешённые phase excerpts; гигантские AUTHOR-result/trace Q не читались.

Область изменения: только поле mobile/package.json jest.setupFilesAfterEnv, новый bootstrap, одна регрессия и этот отчёт. Остальные package fields/версии, исходные tests/assertions/deadlines и runtime защищены. Roadmap-пункты этим тестовым исправлением не закрываются. Бинарные ассеты, установки, dependency/config/transform изменения, production/платные запросы и EAS не выполняются.

Документ полностью записан до freeze и единственного финального FULL. Таблица ниже задаёт уникальные первичные артефакты проверок; наличие запланированного пути не означает PASS. Окончательные actual exits/counts, нерешённые ошибки и итоговая целостность публикуются исключительно во внешних AUTHOR-result.json и AUTHOR-report.md.

| AUTHOR-проверка | Первичный артефакт |
|---|---|
| red | `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/red-semantic-a7345972/primary.json` |
| affected-fresh | `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/affected-fresh-05114813/primary.json` |
| affected-cached | `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/affected-cached-492b277c/primary.json` |
| typecheck | `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/typecheck-6f103fc6/stdout.log` |
| lint-config | `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/lint-config-3d9b74ac/stdout.log` |
| lint | `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/lint-1b115aab/primary.json` |
| E16 | `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/E16-b87ddc71/stdout.log` |
| full | `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/full-526f918d/primary.json` |

Affected — штатные IntegrationsSection/createScreen/integration.stageE/readback.stageN/boundRead.stageO (125 исходных тестов) плюс регрессия; сначала пустой частный cache, затем его повторное использование. Оба исходных stageE lifecycle/readback case должны выполнить assertions. Timeout CLI overrides и test overrides отсутствуют.

Typecheck — mobile npm run typecheck. ESLint — действующий eslint.config.mjs, только два новых test-only файла, с --no-ignore и отдельным --print-config для доказательства реальной проверки вместо ignored-file PASS. Неизменённый E16 запускается из корня node --test tests/components/androidStageE.browser.test.cjs; исходный SHA-256 61cf8d30c828f3ca7614abfba71c294701233b3052cdba53977ea33123fb6896.

Все тяжёлые команды используют существующий test-queue.lock, открытый rb, flock EX; queued/start/finished JSON и фактический exit сохраняются отдельно без перезаписи. Liveness записывается не реже одного раза в 30 секунд. Логи, browser artifacts, STAGE_E_OUT и короткий STAGE_M_SCRATCH находятся в собственных разрешённых reports/scratch.

Freeze/integrity: `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/final-source-inventory.json`, `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/final-source-proof.json`, `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/final-source-delta.patch`. FULL до/после inventory: `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/full-526f918d/before-source-inventory.json` и `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/full-526f918d/after-source-inventory.json`. После начала FULL исходники, включая этот файл, не редактируются.

Итог AUTHOR: `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/AUTHOR-result.json`, `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/AUTHOR-report.md`, `/home/aleksei/reports/vedelo/2026-10-11/update/R-finish-mobile/AUTHOR-20261012T200155Z-2dec8d9c/ready-for-controller.json`. Final result содержит pending=[] и releaseApproved=false; AUTHOR не выдаёт собственные проверки за независимые controller checks.

Controller после AUTHOR отдельно выполняет affected fresh на final SHA и узкий независимый code/spec review bootstrap. При посторонней ошибке AUTHOR раскрывает реальный blocker и собирает единственный FULL без расширения scope и нового repair cycle. APK/release решает parent после controller gates.
