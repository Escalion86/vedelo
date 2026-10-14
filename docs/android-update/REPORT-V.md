# V — авторский handoff: гипотеза ActivityIndicator не устранила RED

2026-10-13, назначенная копия `vedelo-mobile-native-host-final-20261013`.
Статус **BLOCKED на genuine-host probe**. Изменение bootstrap не внесено: обязательное условие устранения того же timeout не выполнено. Попыток source fix — **0**, новых regression — **0**. Повторного repair/probe-цикла нет.

## Свежие измерения до изменения исходника

| Прогон | Результат | Exit | Reply-кейс | Assertions | Первоначальная переписка | Send/loading |
| --- | --- | --- | --- | --- | --- | --- |
| Residual после существующего getter | 15/16 | 1 | 7453 мс, timeout 5000 мс | 6 из 8 | 6801,55 мс | 65,89 мс |
| Genuine ActivityIndicator mount/unmount до тестов | 15/16 | 1 | 7578 мс, тот же timeout | 6 из 8 | 6835,39 мс | 91,26 мс |

Оба прогона: 16 cases, 0 pending/todo, 0 runtime-error suites; единственный failed — исходный reply-кейс. Это диагностические cold `--no-cache` прогоны с scratch transform, **не stock GREEN-гейты**.

Существующий getter уже переносит получение RN preset ActivityIndicator в setup. В свежем residual его render-body занимал около 0,17 мс; весь синхронный send/loading-переход — 65,89 мс, без новых Babel transforms внутри этого интервала. Основная измеренная задержка находится раньше: между `findInitial.begin` и `findInitial.return`, при первоначальной загрузке переписки с Image, TextInput и Button. В этом интервале сумма Babel transforms — 5790,05 мс в residual и 5558,63 мс в probe. Среди модулей: Image.ios, Image native/asset helpers, TextInput и его native component, Button, TouchableNativeFeedback, TouchableOpacity, AnimatedView. Другие границы не исследовались и не исправлялись.

**Неопределённость:** эти наблюдения локализуют задержку в инструментированных прогонах, но не доказывают единственную причинную цепочку текущего stock RED. Исторические U 9578,57 мс first-send/loading до getter и родительские 15/16 (6202 мс, 6 assertions) сохранены отдельно; прежнюю U-причину нельзя объявить причиной текущего residual. Финальные exact-payload/input-clear assertions reply-кейса в этих RED не достигнуты. Успешный readback не подтверждён этим замером; данные исторических стадий не подменяют текущую проверку.

## Настоящий platform-only probe

Scratch setup использует React, react-test-renderer и существующий RNTL `act`, синхронный concurrent-root mount **только** `require('react-native').ActivityIndicator`, затем отдельный `act` для unmount до начала cases. Его mount — 95,10 мс, unmount — 7,85 мс. Feature consumer, запросы и prefetch в probe отсутствуют.

Identity подтверждена: normal RN export = `jest.requireActual('react-native').ActivityIndicator` = ActivityIndicator module из Jest preset; это class component. Composite type и instance constructor совпали при mount, а scenario host использовал тот же constructor. Экспорт, prototype, constructor и render-method до/после probe совпали; после unmount дерево `null`. Новая mock component/class/type не создавалась, native specs или mock implementations платформы не заменялись. Все probe-действия были до тестового deadline.

Диагностика реализована только в scratch transform: дополнительные фазовые метки в исходном reply-кейсе, React Profiler, наблюдение render-method существующего RN mockComponent; существующие API mocks обёрнуты наблюдателем, возвращающим исходный promise, для меток call/complete. На диске support-тест не менялся. Такой observer не является production-поведением. `actualDuration=0` из Profiler не используется как длительность commit; таблица показывает измеренные внешние интервалы. Класс и export-путь не подменены.

Накладные расходы observer учитываются отдельно за весь прогон: residual runtime 7,08 мс, подготовка transform 11,83 мс, дополнительный I/O 264,03 мс; probe runtime 9,21 мс, подготовка 5,65 мс, I/O 233,89 мс. Это измеренные расходы меток/записи, не полный контрфактический overhead Profiler и promise-observers. BabelTotal 109957,30 / 107505,48 мс относится ко всему cold-прогону и не является длительностью reply-кейса. Flush отмечен отдельным `V_DIAGNOSTIC_FLUSH_MS` в логах.

Два предварительных инфраструктурных сбоя сохранены: launcher ошибочно принял `--jest` за имя команды (сама команда не стартовала); первый diagnostic setup затем не разрешил относительный `react-native` из scratch (0 tests, 1 runtime-error suite). Исправлены только аргументы launcher и абсолютные пути scratch observer до единственного genuine-host probe; это не source repair и не повтор проваленного genuine-host probe.

## Остановка и гейты

Условие BRIEF-V «если probe оставляет fail, вернуть точную phase/uncertainty без нового autoedit» сработало. Bootstrap, URL/Decoder/getter, support-тест и все 3030 защищённых файлов остаются побайтно исходными. Новых JS-изменений, suite или discovery exclusions нет; package fields/versions/locks/deps/IDs/deadlines не менялись.

Stock standalone 16/16, combined affected 142, typecheck и baseline-aware lint **не запускались после failed probe**, поскольку разрешение на source fix не получено измерением; авторская последовательность остановлена на обязательном предварительном условии. Эти проверки не считаются PASS и не заменяются унаследованными U-результатами. Stock listTests до/после не запускался: новых suites нет, package и все test files сохранены по SHA. Подготовленный baseline-aware lint script лежит только в scratch и не исполнялся.

FULL и независимый review не вызывались: они принадлежат контроллеру. `apkSourceCandidateVerified=false`, `releaseApproved=false`. EAS/deploy/commit/push не выполнялись.

## Первичные свидетельства и сохранность

Report root: `/home/aleksei/reports/vedelo/2026-10-11/update/V-native-host-final`.

- `author-v1-runs/residual-boundary/{primary.json,command.log,process.json,before-source.json,after-source.json}`.
- `author-v1-runs/genuine-host-probe/{primary.json,command.log,process.json,before-source.json,after-source.json}`.
- `AUTHOR-v1-{residual,probe}-{metrics,summary}.json`, `AUTHOR-v1-{residual2,probe2}-phases.json`, соответствующие transforms.jsonl.
- `AUTHOR-v1-historical-bindings.json` содержит SHA read-only родительских primary/log/exit.
- `AUTHOR-result.json`, `AUTHOR-own.diff`, `AUTHOR-final-source-inventory.json`, `AUTHOR-source-proof.json` — окончательный handoff и точная собственная дельта.

Heavy прогоны выполнялись через существующий общий lock, открытый `rb`, с `flock EX`; queuedAt до lock, startedAt внутри lock, finishedAt и actualExit сразу после реального завершения команды. Использованы собственные уникальные cache/JSON/log пути, exclusive primary evidence, heartbeat каждые 20 секунд. Все реально запущенные команды завершились; активных дочерних процессов, созданных сервисов и pending работ нет. Историческая evidence не менялась; node_modules использовались read-only.

Единственная дельта дерева — этот новый REPORT-V.md. Все исходные 3030 SHA проверены до/после каждого законченного прогона и повторно при окончательном proof. Требуется решение контроллера о следующей ограниченной задаче на основании измеренного initial-render остатка; расширение scope в этом этапе не производилось.
