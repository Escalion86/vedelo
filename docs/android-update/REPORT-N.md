# Этап N — ограниченная совместимость штатных тестов

Этап завершён в назначенной копии `/home/aleksei/projects/vedelo-android-qa-fixes3-20261012`. **passed=false; releaseApproved=false; selfChecksPassed=false; pending=[]**. Есть один scope-blocked исходный assertion; сырые overflow gates учитываются по реальным кодам. Это авторские адресные проверки, не независимая приёмка и не выпуск.

HEAD неизменён: `35f9a64c29c0b8c078a0b54149a1949069a868ed`; ветка `work/android-qa-fixes3-20261012`. Начальный inventory3008 проверен, mismatch=[]; его SHA256 `f5c2ebc9989b4ce0249ca6d9f30b54a09821b8b94d7d61699d02a8ec1bf45829`. Own delta считается от `N/initial-source-inventory.json`, не от HEAD: **12 файлов: 4 existing setup/mocks/readiness, 7 новых test-only файлов и этот отчёт**. ImportScreen и ExportSection не правились. Остальные исходные пути, BRIEF, зависимости/симлинки, версии и конфиги защищены по SHA. Roadmap-пункты не закрывались; продукт/PartyCRM не менялись.

## Реальные проверки

| Проверка | Actual exit | Counts / результат |
|---|---:|---|
| Исходный standard35, пустой private cache | 0 | 35/35; прежний cold timing не повторился, variability |
| Исходные Integrations/create/integration.stageE | 1 | 86/90; 4 failures, 3 failed suites; отсутствующий subscribeAuthSession — infrastructure RED |
| Исходный штатный E16 | 1 | compile publishEntityReadback: 0 rendered/polling, 16 failed |
| Финальный standard35 fresh-cache | 0 | 35/35, 2/2 suites |
| Финальный standard35 cached, новый процесс | 0 | 35/35, тот же private cache |
| Финальные affected + discoverable readback | 1 | 111/112: Integrations54/54, create36/36, integration.stageE14/15, real readback7/7 |
| Финальный `node --test tests/components/androidStageE.browser.test.cjs` | 0 | 16/16 rendered scenarios; 6 map, 2 polling, 2 integration, 6 history; console0 errors/0 warnings |
| Typecheck | 0 | штатный npm run typecheck |
| Baseline-aware lint | 0 | 12 файлов, 0 errors/0 warnings; original bytes с реальными filePath/config/rules и ignore=false |
| AST + raw original contracts | 0 | 369 original assertion calls; тела/названия/матрицы/deadlines/default5s/local20s/native40 сохранены |
| Обязательный raw overflow light/dark | 1/1 | штатные E16 history snapshots360×480; честный vendor argv --widths=360, static viewport900 |
| Дополнительный matched viewport overflow | 0/0 | отдельные live snapshots360×900, не замена исходных gates |

Counts повторов не складываются. Исторические full1751/1755, cold34/35 и vendor negative evidence неизменны; их SHA проверяются отдельно. Full Jest, D156/C7, новый общий аудит и независимое review не запускались.

## Измеренный диагноз и правки

Integrations: первый синхронный render5778.08ms, первый feature dispatch только через5766ms; fixtures отвечают≈22ms после dispatch; readiness≈788ms; следующий render27.15ms. Create: исходный render12224ms; monotonic повтор15565.99ms; первая Modal interaction10420.54ms, затем cleanup ещё≈16–20s. В первой измерительной попытке resetAllMocks сбросил RN global performance.now для Integrations: null durations не использовались. Исправленный диагностический clock — настоящий node:perf_hooks.

В двух конкретных VM до исходных it/hook deadlines один раз монтируются/размонтируются только View/ScrollView/Pressable/Text/TextInput/ActivityIndicator/Switch/Modal и вызывается настоящий native findNodeHandle(null). Это readiness RN hosts/focus, без feature/providers/auth/API warmup. Измерение focus init16533.53ms подтвердило ленивую загрузку native renderer при восстановлении фокуса FieldHelp. После bootstrap первые feature renders≈50–128ms, оба исходных набора проходят без увеличения deadlines. Реальные act, RN runtime и console сохранены.

Integration/browser mocks явно названы synthetic transport/storage boundaries. Session fixture поддерживает subscribe/unsubscribe/identity notification; component storage отклоняет missing/pending/inactive state, сохраняет и перечитывает запись до publish. Production proposal identity/API/schema/operations и consumers остаются в dependency graph. Browser seams ограничены точными resolved paths, basename client не перехватывает сторонние библиотеки.

Новый штатно discoverable `mobile/src/shared/storage/readback.stageN.test.ts` импортирует настоящие cache/database/schema/mutations/outbox/coordination, tokenStore/proposal identity/API/operations. Подменяются только Expo SQL/SecureStore/filesystem/UUID/network platform seams; SQLite выполняет реальные SQL/migrations. Семь сценариев проверяют committed merge/re-read, schema-negative, save-before-readback/outbox rejection, draining clear/no late publish, readback-before-save, identity change в pre-capture await и missing/inactive rejection. Queue/epoch/merge не мокируются. Первый новый прогон5/7 имел две infrastructure TypeError из-за ошибочного имени event вместо readEvent; сохранён exit1, исправлено только новое тестовое тело.

## Не закрытый путь

`mobile/src/features/events/integration.stageE.test.tsx:78`: original `expect(mockRequest).toHaveBeenCalledWith('/mobile/v1/events/e', undefined)` несовместим с настоящим bound API, который передаёт headers/signal/skipAuth/skipRefresh. Этот original assertion/body/deadline не изменён. Не нормализовались наблюдаемые mockRequest args и не заменялся real identity/API ради GREEN. По правилу scope этот путь остановлен; следующие assertions этого it после точки падения не засчитываются выполненными.

Final affected log также сохраняет **3 React not-wrapped-in-act console.error** от настоящего notifyManager timer; они не подавлены. Suite14/15 не является GREEN. Положительная приёмка не выдана.

## Browser, overflow и живые артефакты

Source graph и SHA сохранены **до listen**; реальные PNG/DOM/CSSOM/measurements захвачены до page/browser teardown. В обеих polling-сценах подтверждены client isServer=false, visible tab, настоящий QueryObserver, staggered mounts,3 probe ticks и3 bulk requests за60s, invalidation и stale focus. Native40 assertions исходные и выполнены.

Штатные history scenarios используют реальный viewport360/390/420×480. Дополнительный compact probe360×900×light/dark имеет совпадающие live dimensions,0 видимых filter/list пересечений; все5 controls доступны после реальной прокрутки. DOM не подрезался ради raw PASS; CSSOM переносится полностью. Исходные raw gates и live clipping/scroll — отдельные результаты. Gate при --widths=360 создаёт static viewport900 и не выполняет React useWindowDimensions повторно. Дополнительные raw exits0 на live900 не переименовывают исторические или обязательные nonzero в PASS.

## Артефакты и повтор

Evidence: `/home/aleksei/reports/vedelo/2026-10-11/update/N`; scratch: `/home/aleksei/.hermes/cache/scratch/vedelo-r4-n`.

- `result.json`, `command-ledger.json`: каждый уникальный command/log/json, queued до flock, start внутри rb/flock-x, actualExit сразу после команды.
- `initial-source-inventory.json`, `author-before/`, `final-source-inventory.json`, `integrity-final.json`, `source-graph-final.json`: before/final SHA и protected source proof.
- `own-delta.patch`, `own-delta.json`, `delta-roundtrip.json`: exact binary delta с new files, forward/reverse восстановление bytes в scratch.
- `final-source-contract.json`, `assertion-ledger.json`: original semantic AST и полные raw it bodies/assertions/matrices/deadlines.
- `runs/20-final-source-standard35-cold/`, `runs/21-final-source-standard35-cached/`, `runs/16-final-affected-focus/`, `runs/18-final-source-E16/`: первичные финальные outputs.
- `runs/19-raw-vendor-light/`, `runs/19-raw-vendor-dark/`, `vendor-final-bindings.json`: неизменённые vendor scripts/argv и actual exits.
- `final-lint-result.json`: оригинальные bytes, реальные absolute filePath/config/rules и сравнение без ignored-file warnings.
- `qa-teardown.json`, `historical-final-integrity.json`: завершение собственных QA/закрытые localhost-порты и неизменность старых доказательств.

Точные повторяемые команды и окружение управляющего сохранены в `/home/aleksei/reports/vedelo/2026-10-11/update/N/controller-repeat.sh`. Запуск: `bash /home/aleksei/reports/vedelo/2026-10-11/update/N/controller-repeat.sh`. Скрипт сначала сверяет все final SHA и затем выполняет те же standard targeted команды через общий lock с новыми exclusive outputs/caches. Это контроллерский повтор, **не независимая приёмка**. Node spawn/listen EPERM здесь не возникал; fallback не использовался.

Все дочерние QA завершены; общий lock не освобождался за чужие процессы. CLI unit `vedelo-stage-n-20261012-0548`, session `01a12ea8-5e7b-7a61-8587-53f8595156b1`; итоговый exit самого CLI фиксирует управляющий после final. Никаких fetch/commit/push/stash/reset/checkout/install/dependency/config/version/product/deploy/EAS действий. Физический Android, реальные аккаунты/production authorization, encryption/device IME/TalkBack не проверялись.
