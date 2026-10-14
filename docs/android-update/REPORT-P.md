# Авторский цикл P — test-only

Выполнен ровно один согласованный цикл BRIEF-P. **passed=false; selfChecksPassed=false; releaseApproved=false; pending=[]**. Самостоятельного повторного запуска управляющего здесь нет.

Исходный HEAD `35f9a64c29c0b8c078a0b54149a1949069a868ed`, вход 3022 файла, SHA исходного inventory `aa60756af6441f18f3630f2109258b1c5fc38b29f23846454c69c8873a297d77`. Авторская проверка всех входных SHA: 0 mismatches. Унаследованный O — вход, не дельта P.

Изменены только четыре разрешённых test/helper пути и этот REPORT-P. У IntegrationsSection снят внешний async act вокруг синхронного render. Helper получает фактический apply invocation, определяет его границу по ссылке в реальном mock.calls, проверяет все GET нужного URL внутри окна, включая wrong signal. Отдельный initial read другого signal разрешён; read того же signal перед границей запрещён. Exact headers/token/skipAuth/skipRefresh, native AbortSignal, not-aborted и count1 сохранены.

В boundRead.stageO добавлены три регрессии: initial+apply с разными actual signals, wrong signal вместе с valid read в окне, duplicate read той же операции. Законная регрессия на старом helper воспроизвела RED (exit1, 12/13; один failure count2), до исправления helper. Новых stageP paths не понадобилось.

StageE передаёт сам actual applyCall, сохраняя прежние exact read, persisted merge, invalidation, реальную identity change и signal.aborted. Добавлены запрет setQueryData для event consumers и сравнение их cache после позднего read. Оба stageE сценария прошли до действительных assertions и во fresh, и в cached (suite 15/15). Loading/error реально повторён и прошёл в обоих финальных affected; его прежнее падение не было заранее объявлено cascade.

| Собственный запуск | actualExit | Первичные counts | Immutable record |
|---|---:|---|---|
| affected-cached | 0 | 125/125 tests; 5/5 suites; failed=0, pending=0 | `AUTHOR-affected-cached-20261012T145903106587Z-finished.json` |
| affected-fresh | 1 | 123/125 tests; 3/5 suites; failed=2, pending=0 | `AUTHOR-affected-fresh-20261012T145125391233Z-finished.json` |
| baseline-aware-eslint | 0 | см. первичный log | `AUTHOR-baseline-aware-eslint-20261012T150932829675Z-finished.json` |
| browser-E16 | 0 | 16/16 tests; fail=0, skipped=0 | `AUTHOR-browser-E16-20261012T151111584308Z-finished.json` |
| import-export-targeted | 0 | 35/35 tests; 2/2 suites; failed=0, pending=0 | `AUTHOR-import-export-targeted-20261012T150139712572Z-finished.json` |
| mobile-typecheck | 0 | см. первичный log | `AUTHOR-mobile-typecheck-20261012T150452951065Z-finished.json` |
| protected-integrity | 0 | см. первичный log | `AUTHOR-protected-integrity-20261012T151029875941Z-finished.json` |
| red-two-reads | 1 | 12/13 tests; 0/1 suites; failed=1, pending=0 | `AUTHOR-red-two-reads-20261012T145019202929Z-finished.json` |
| red-unchanged | 1 | 116/122 tests; 3/5 suites; failed=6, pending=0 | `AUTHOR-red-unchanged-20261012T144233005599Z-finished.json` |

Affected fresh не green: `единый компактный список light, длинные данные и только пользовательские запросы` — не найден label «Настроить ИИ-провайдер»; `форма сохраняет начальный status active как active через штатную локальную очередь` — исходный default5000ms timeout. Cached на тех же байтах: 125/125. Эти fresh failures оставлены unresolved; createScreen, assertions и сроки не менялись. Следующего auto-fix цикла нет.

Import/Export реально найдены в src/features/import и выполнены штатным адресным Jest: ImportScreen.test.tsx + ExportSection.test.tsx, 35/35. Все Jest запускаются с private cache и первичным JSON/outputFile, без transformer/timeout overrides. Typecheck, baseline-aware ESLint (исходные bytes на original filePath), semantic AST/raw assertions/names/matrices/timeouts и защищённые SHA выполнены отдельно; подробности в AUTHOR records.

Реальный неизменённый E16 выполнен node --test tests/components/androidStageE.browser.test.cjs с собственными STAGE_E_OUT и STAGE_M_SCRATCH. Его source SHA `61cf8d30c828f3ca7614abfba71c294701233b3052cdba53977ea33123fb6896`. Только localhost фикстуры; DOM/PNG/CSSOM/measurement/source bindings — собственные browser artifacts. Исторические raw overflow N остаются FAIL (actualExit1/1); raw vendor gates в P не повторялись и не объявляются PASS из E16. REPORT-N/O и historical evidence сохранены.

Все тяжёлые команды последовательно под существующим test-queue.lock, открытым rb/flock EX; отдельные queued/start/finished, actualExit, первичные SHA/counts. Installs, запись в root/mobile node_modules symlinks, продукт, конфиги, зависимости, версии, ROADMAP, AGENTS, skills, commit/push, release/deploy/EAS и реальные сервисы не затронуты.

После этого документа создаётся immutable final-source-inventory.json (3023 файла) и связывается с финальными тестовыми SHA; далее source не меняется. AUTHOR-own-delta содержит ровно 5 путей относительно initial P; AUTHOR-combined-delta отдельно содержит 20 путей относительно frozen product3007 (унаследованные N/O + protected BRIEF-P явно отделены). Оба diff byte-backed; exact bytes, patch/SHA и roundtrip результаты — в AUTHOR delta records. Итоговый AUTHOR-result.json / AUTHOR-report.md содержат все paths/exits/counts/SHA и unresolved. Все собственные проверки завершены, pending пуст; независимый final affected fresh/cached выполнит управляющий отдельно.
