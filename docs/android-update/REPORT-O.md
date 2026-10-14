# Авторский этап O — тестовый контракт Android

Рабочая копия: `/home/aleksei/projects/vedelo-android-qa-contract-20261012`.
База собственной дельты — input3017 из `O/initial-source-inventory.json`,
а не Git HEAD. Унаследованные изменения N не объявляются работой O.
BRIEF-O защищён отдельно как родительский артефакт. Product, версии,
dependencies, lockfiles, конфиги и исторические документы не менялись.

## Исходное воспроизведение и измерения

Все исходные разрешённые tests/helpers сохранены побайтно в
`/home/aleksei/reports/vedelo/2026-10-11/update/O/baseline-source`.
Неизменённый affected-набор запущен штатным `npm test -- --runTestsByPath …`
в новом частном cache: **111/112, exit 1**, SHA до/после одинаковы
`b17fee15fc21128f897fc862728b66084f8e224f13c0ab1ff90dfd1dda9b14c5`.
Первичные record/log/Jest JSON: `O/author-runs/baseline-affected`.

Входной контроллер N: affected **107/112**, import/export **35/35** fresh
и cached. Повтор O воспроизвёл только несовместимый auth-expect. Timing RED
искусственно не создавался. Полностью прочитанные evidence и извлечённые
ошибки сохранены в `O/evidence-diagnosis.json`.

Monotonic-трассы: `O/timing-diagnosis-before.json` и исходные JSONL.
В N первый light render занял 318,5 мс; fixture overview/AI ответили
за 18–23 мс, но UI readiness завершился отрицательно через 2061,1 мс.
В исходном O тот же render — 120,5 мс, readiness — 888,2 мс (успех).
Измерение отделяет ответ транспорта от готовности React-дерева; физическая
причина вариативности не установлена и не приписывается CPU.
Первый O bootstrap штатных RN hosts — 51193,3 мс вне test/hook deadlines.

В N сценарий общего draft наблюдался 5764,1 мс при test deadline 5000 мс.
Он успел продолжиться после deadline; следующий cleanup завершился только
через 7746,9 мс после последней interaction. Следующая ошибка unmounted
tree соответствует перекрытию незавершённого теста и cleanup; это диагноз
по последовательности trace, а не самостоятельное доказательство product bug.
В O timing-провалы не повторились. Введены только конечные сроки для этой
обвязки: draft test **5000 → 10000 мс**, cleanup hook **5000 → 10000 мс**.
Остальные test deadlines, async query deadlines и product timers сохранены.

## Собственная реализация

1. `integration.stageE.test.tsx`: вместо ожидания `undefined` проверяется
   один фактический exact read, точный путь и захваченный синтетический Bearer,
   exact skipAuth/skipRefresh и тот же настоящий AbortSignal, что у apply PATCH.
   Наблюдаемые mock args не нормализуются. В существующем delayed identity
   сценарии дополнительно проверяется abort этого сигнала после смены identity.
   Остальные assertions, имена, матрицы и критический порядок сохранены.
2. `mobile/__tests__/stageO/boundRead.ts` и отдельная negative suite проверяют
   wrong auth/path, missing/false mandatory options, отсутствие/дубль вызова,
   fake/foreign/aborted signal. Product identity/API/schema/operations реальны.
3. Первый integrations light/dark render обёрнут в настоящий async act;
   ожидание и прежние assertions сохранены, deadline не увеличен.
4. `createScreen.test.tsx` использует RNTL pure entry с явной эквивалентной
   библиотечной обвязкой flushMicroTasks/cleanupAsync и React act environment.
   Cleanup измеряется непосредственно и восстанавливает spies в finally.
   Один длинный draft test имеет отдельный deadline 10000 мс.
   Общий setup и package.json не изменены. Потребитель cleanup helper — только
   createScreen; strict auth helper — integration.stageE и negative suite.

## Замороженная проверка и границы результата

Этот файл записан **до** окончательных проверок; исходники после этого
заморожены. Окончательные результаты, actual exit/counts, SHA, timings и
неизменяемый авторский вывод будут находиться в
`/home/aleksei/reports/vedelo/2026-10-11/update/O/AUTHOR-REPORT-O.md`
и `author-result.json`; самостоятельной приёмки здесь нет.

Штатные адресные процессы: import/export fresh, затем cached с тем же cache;
affected/readback плюс negative suite fresh, затем cached с тем же cache;
mobile typecheck, baseline-aware lint по исходным bytes с настоящим filePath,
semantic AST comparison, all protected SHA и реальный browser E16.
Тяжёлые процессы идут последовательно под существующим read-only flock;
queued фиксируется до lock, start после lock, actualExit сразу после команды.

Собственная дельта считается от input3017; proposedCombinedDelta — от
защищённого full3007 с явным inheritedN. Оба содержат bytes и SHA; исторический
REPORT-N сохранён. Raw overflow N остаются historical FAIL; их неизменные
source bindings не заменяют новых измерений или visual approval.

M1-T7/M1-T10 этим test-only этапом не закрываются; ROADMAP и версии защищены.
EAS, deploy, release approval и контроллерский repeat/final result выполняются
отдельно управляющим. `releaseApproved=false` при любом авторском результате.
