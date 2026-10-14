# J — lifecycle КП и verification recovery

**Итог: passed with documented limitations. Независимая приёмка завершена: [controller-acceptance-04.json](/home/aleksei/reports/vedelo/2026-10-11/update/J/controller-acceptance-04.json), passed=true.** Реальные результаты: behavior23/23, addressed proposals/G/E77/77 и9/9 suites, typecheck exit0, baseline-aware standard lint exit0, newErrors[] и standardRulesDisabled[]. Raw standard ESLint сохраняет4 inherited errors/2 warnings; browser sandbox launchfailed,0/4.

Resolved IDs: `C-SESSION-01`, `C-CREATE-01`, `C-NONIDEMPOTENT-01`, `E-APPLY-01`. Unresolved IDs: `[]`; pendingRuns: `[]`; активных verification blockers нет. Все прежние `verificationFailures` сохранены как historical recovered/superseded by controller-acceptance-04.json, с исходными exits/counts/failed logs. Counts повторных запусков не суммируются.

Та же сессия Codex CLI `01a12b04-2c4c-75f0-bbb2-7d2b7cb66320`, модель `gpt-6.1-sol`. Product пишет только автор J. В recovery **product bytes и E-исходник не менялись**. Единственная recovery-правка tests — собственный `__tests__/legacy.stageJ.transform.cjs`; отчёт обновлён отдельно.

## Четыре исправления

- C-SESSION-01: keyed UI передаёт `_id+tenant` инициатора и lifetime signal до async capture. Capture, снимок credentials, session revision и следующие сетевые шаги связаны с ожидаемой identity. Настоящий sharedclient использует bound credentials, skipAuth/skipRefresh/signal. GET/list/catalog/defaults/preview связаны с тем же lifetime. Multipart feature-local fetch сохраняет существующие file/directory/MIME/size/URL контракты без auth refresh/replay. Credentials остаются в closure, не в ledger/UI/cache/logs.
- C-CREATE-01: module-local ledger вне disposable UI разделён по identity/kind/target. Inflight owner переживает blur/remount; unknown failclosed; известный ID восстанавливается только exact GET. Подтверждённый exact readback освобождает слот для следующего нового template/КП. ID по списку не угадывается.
- C-NONIDEMPOTENT-01: per identity/proposal send guard сохраняет inflight/unknown/partial/sent. Потеря ответа и lifetime не дают повторить полный POST. Exact delivery reconciliation разрешает только retryFailedOnly=true после partial. 401 — один POST без refresh/replay.
- E-APPLY-01: confirmed PATCH + exact proposal GET + fresh event GET доставляются onApplied/cache до optional list reload. Confirmed event-read recovery выполняет только exact reads, завершает callback без нового PATCH/Telegram/write. Реальные SQLite/Query проверки сохраняют unrelated event fields. EventOnlineSections совпадает с frozen initial source; существующий cache merge не менялся.

## Test-first и исходная приёмка

До правок сверены initial-source-sha:2975/2975 и отдельно merged-FG:182/182. Реальный `red-01` завершился **до product edits**, exit1, 21 tests/1 pass/20 semantic failures всех четырёх IDs. Product/test SHA на RED закреплены в red-baseline-proof.json и red-verification.json. Permanent tests используют настоящие tokenStore/sharedclient/identity/feature API/keyed UI, без mocked capture/guard/ledger. После усиления до настоящего AuthProvider `strict-red-01` повторил те же 20 failures на SHA-verified original modules через явный optional baseline loader; default tests не зависят от scratch. `strict-green-01` дал 23/23.

Первоначальный авторский `final-regressions-01`:77/77,9/9 suites. Независимые controller-regressions-01 и -02:76/77,8/9 suites; controller-E-03:14/15. Везде E/light timeout30000ms. Эти результаты и failed logs сохранены и не переименованы в success. Controller также независимо подтвердил behavior23/23, typecheck0, standard lint baseline4 errors/2 warnings = final4 errors/2 warnings (новых ошибок нет), SHA/delta13/protected2967/merged174 и все 20 исходных exits.

В recovery прочитаны пять запрошенных компактных controller JSON. В финальном documentary-only продолжении прочитаны только четыре назначенных controller-*-04 JSON и текущие отчёты; исполняемые inputs не менялись, проверки повторно не запускались. Controller failed logs не изменялись; ссылки/sha из его результатов сохранены в result.json. Прежние авторские отчёты и manifests сохранены как pre-recovery-*; история первоначальных 20 запусков остаётся в commands.json.

## Узкое recovery: проверенная причина и QA-правка

Точное воспроизведение старого авторского argv с EXPO_PUBLIC_API_BASE_URL unset дало exit1, **75/77**: тот же E/light timeout и дополнительный client-reviews-section not found. Добавление EXPO env управляющего не требуется для воспроизведения timeout; E env уже mocked. Причина единичного client-section failure не доказана и отдельно сохранена.

Реальные phase probes установили:

| Проба | Первый sync render | Proposal requests на выходе render | Результат |
|---|---:|---:|---|
| recovery-E-probe-01, frozen final product | 46935 ms | 0 | 14/15, light timeout |
| recovery-E-baseline-probe-01, SHA-verified original four modules | 41067 ms | 0 | 14/15, тот же light timeout |
| recovery-E-cold-probe-02, light-only | 45056 ms | 0 | 0/1,14 skipped; 149 cold native/platform modules |
| recovery-E-preflight-probe-01 | 1167 ms | 0 | 15/15; native initialization 28871 ms до scenarios |

Baseline probe заменяет только read-only входы четырёх original modules при transpile под исходными filenames; repo не переписывается. Proof SHA — recovery-baseline-proof-01.json. 149 впервые загруженных внутри render модулей относятся к native/style/animated/Expo bootstrap; это конкретная baseline limitation, а не исключённый тест. Данные, phases, source/log SHA и предел вывода сохранены в recovery-diagnosis-01.json.

Native preflight в собственном QA adapter устранил testTimeout30000: отдельный E на repo fixture дал15/15. Но полный recovery-final-regressions-02 дал76/77: E/light уже падал на прежнем findByText('Принятое КП') с loading snapshot. Async-act probe полного набора показал **0 proposal requests до act,3 после act**, затем прежняя title assertion прошла; весь набор77/77. В adapter добавлен только `await act(async()=>{})` между существующим review readiness check и неизменной proposal title assertion. Assertions и оба timeout не менялись.

Cached E recovery-E-cached-02 дал15/15, но использовал старый compiled fixture без preflight — это **не доказательство нового QA output**. Cache hash/marker сверка и локальный Jest fallback key показали отсутствие adapter implementation в cache key. Добавлен getCacheKey: Babel key + SHA adapter bytes. Финальный cached E создал новый compiled fixture с реальными native preflight и async act; это подтверждено recovery-cache-final-proof-04.json. Старый cache не удалялся. Две первоначально неудачные artifact-inspection проверки искали await в коде, который Babel понизил до yield/asyncToGenerator; ошибки инспекции сохранены отдельно, корректная проверка использует фактический compiled form.

## Финальные авторские проверки на recovery bytes

| Запуск | Actual exit | Реальный результат |
|---|---:|---|
| recovery-final-regressions-04: exact author argv,no-cache,synthetic EXPO env | 0 | 77/77,9/9 suites; E/light и все остальные E/G pass |
| recovery-final-E-cached-04: ordinary cache,тот же controller cache directory | 0 | 15/15; новый compiled QA output проверен |
| recovery-final-behavior-04: actual AuthProvider/tokenStore/client/API/keyed UI + SQLite/Query | 0 | 23/23 |
| recovery-types-04: cd mobile && npm run typecheck | 0 | TypeScript без ошибок |
| recovery-standard-eslint-04:12 own source/test paths,--no-ignore,**без отключения правил** | 1 | Те же 4 inherited errors/2 warnings; новых ошибок нет |

Standard lint:3 react-hooks/refs +1 set-state-in-effect в неизменном Editor,2 exhaustive-deps warnings. Baseline/финальный standard сравнил controller, recovery повторил те же findings; новый CJS adapter lint-clean. Это не обещание exit0 полного standard lint. Первоначальный авторский lint с двумя legacy overrides остаётся только историческим запуском. initial-eslint-01 ignored-file run не считается lint proof.

Все тяжёлые checks через существующий read-only fd9 общего lock: `exec 9<lock`, затем `flock -x 9`; queued до, start внутри. У каждого уникальные неизменяемые log/queued/start/exit/transport JSON, actual exit сохранён сразу. Очередь реально ожидалась, без обхода; pending к завершению нет. Точные argv/env/exits/counts каждого запуска — commands.json/result.json. Counts повторов не суммируются. Все failed logs, включая initial green/cache/regression failures и recovery failures, сохранены. red-02/red-03 — historical GREEN controls на изменённом product, не semantic RED.

## Собственный delta и hashes

**13 unique paths =5 product+7 tests/fixtures+1 REPORT.** Сравнение от frozen initial-source-sha/merged-FG, не HEAD. Защищённые2967 initial paths и174 merged-FG paths совпали before/after; violations[]. Унаследованный git delta отделён; diff+exact untracked own set согласован. Recovery-only delta относительно controller bytes: QA adapter и этот REPORT. Full original own diff, удалённые правила и recovery fixture diff прочитаны.

| Проверенный own source/test path | Финальный SHA-256 |
|---|---|
| `mobile/src/features/proposals/EventProposalsSection.tsx` | `41041b026deb62e410c9f2a8bbc83fcc6f71354f7cf27ebe912227c512fb28a0` |
| `mobile/src/features/proposals/ProposalEditorScreen.tsx` | `f9124ebf40737a092346a3acf53a9cf29fcb1469ea8288cda339b437a4825502` |
| `mobile/src/features/proposals/__tests__/cache.stageJ.test.cjs` | `0552270411343dd35ab21aaa95814f910114f2139a8339ccd63ddfbf34eed8d5` |
| `mobile/src/features/proposals/__tests__/legacy.stageJ.transform.cjs` | `ba71b5043020e71c0116e28a0e8bd8330c6211068f127b75da73f2f150610676` |
| `mobile/src/features/proposals/__tests__/lifecycle.stageJ.test.cjs` | `253777cc8dcf240cb016c6cc918439662084e2b4c5a1059fbc373043aade10de` |
| `mobile/src/features/proposals/api.test.ts` | `210c5390cd841cd16e7bcbfa2de72d838974bba0fbda5cb55966854a50577b8b` |
| `mobile/src/features/proposals/api.ts` | `c89f6328aeff50be1b2619cd6a04f4b2162f89cca46c064ff464c2272fdf7183` |
| `mobile/src/features/proposals/editor.test.tsx` | `5b0bc805e919484bafeb8fc0aeb40c20c27d31efff7aa2d1132db9cce8daccd9` |
| `mobile/src/features/proposals/identity.ts` | `fac3306f83c7bc5e8771b71fc2f08c77b28a65f8a181a9821e151f8ddbe825f9` |
| `mobile/src/features/proposals/lifecycle.stageG.test.tsx` | `f9ad99408d7d5e6569bc22cbb3227311b34b5e672ee4fc992984ce3d840f07df` |
| `mobile/src/features/proposals/operations.ts` | `f8e2991f11ef8b46d9c4eccf01e2fc4d15360b7d38551c27c027fa3fddda59cb` |
| `mobile/src/features/proposals/section.test.tsx` | `162818dc49ed56b1f6290ed67313b55e1ffaa5d7d21f4ccd235c96ae50a57808` |

13-й путь — docs/android-update/REPORT-J.md; его SHA находится в final-delta.json/result.json. Full patch и review proof — own-delta.patch/delta-review.json; final tested-byte mapping — verified-final-bytes.json; полный protected before/after — protected-hashes.json. Reports являются артефактами, их SHA не выдаётся за executable test input.

Shared auth/client/storage/sync/schema/DTO/wire/build/deps/versions/package IDs, соседние scopes и каноническая копия автором J не менялись. Git fetch/commit/push/checkout/reset/stash, deploy/EAS, real accounts/Telegram/production не использовались; node_modules read-only. Roadmap/version не менялись по узкому запрету BRIEF-J.

## Документированные ограничения и независимая приёмка

- **Independent acceptance passed.** Обязательный E/light/full-addressed gate реально прошёл в controller-acceptance-04.json. [Controller artifact review](/home/aleksei/reports/vedelo/2026-10-11/update/J/controller-artifact-review-04.json) подтвердил34/34 unique author runs, log/exit/count/hash/snapshot mismatches[],12 executable SHA и13 own paths, protected2967/merged174 без нарушений. [Cached output proof](/home/aleksei/reports/vedelo/2026-10-11/update/J/controller-cache-output-proof-04.json) независимо подтвердил настоящие compiled native preflight и async act; первый regex inspection mismatch сохранён. Финальная документарная запись меняет только REPORT и назначенные manifests; REPORT SHA пересчитан отдельно после последней записи и не считается tested executable input.
- Baseline limitation: cold native/platform initialization внутри первого scenario потребляла41–47s при deadline30s. Конкретный baseline probe и его failure сохранены; assertion не исключена, QA bootstrap вынесен в fixture initialization.
- Единичный client-section failure при exact-author replay не имеет доказанной причины; финальный независимый full E/addressed прошёл77/77, причина исторического failure остаётся недоказанной и его история сохранена.
- Raw standard ESLint сохраняет4 inherited errors/2 warnings,без новых ошибок. [Независимое baseline-aware сравнение](/home/aleksei/reports/vedelo/2026-10-11/update/J/controller-lint-findings-04.json) passed, exit0; standardRulesDisabled[]. Это не clean-standard-lint статус.
- Browser sandbox launchfailed: Chromium sandboxing failed,0/4 J browser scenarios выполнено. Обход/расширение roots/отключение sandbox не применялись; browser156/full Jest/build не запускались. Native interaction tests не подтверждают реальные viewport/dark/native hardware visuals.
- Ledger имеет process lifetime между disposable UI instances,не cross-process/server idempotency.
