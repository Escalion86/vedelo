# Этап K — исправление тестового стенда

Стенд K исправлен в разрешённых границах. Все обязательные функциональные проверки завершились с exit0: D — 156 состояний, E — 16/16, C-native — 7/7, адресные Jest — 26/26 и 9/9, MongoDB — 104/104 без пропуска. Vendor gates: 16/18 успешных, 2 отрицательных; их реальные exit сохранены. Выпуск не подтверждён.

Проверена промежуточная база `35f9a64c29c0b8c078a0b54149a1949069a868ed` с ранее объединёнными F/G. Работа выполнена Codex CLI `gpt-6.1-sol`, `workspace-write`, без снятия sandbox. Заголовок журнала запуска: `/home/aleksei/reports/vedelo/2026-10-11/update/K/codex-01.log`; сессия `01a12b4c-97af-7731-a06c-64749ffce2a5`. Коммит, push, deploy, обращения к production, чтение `.env`, изменения общих зависимостей и служб не выполнялись.

Исходные манифесты сохранены: `source-baseline.json` — 182 пути, SHA256 `288fa2178c05c7139a66310717c8be5c8240d968ed96109c2a99206ca6b0eec0`; `controller-full-baseline-01.json` — 2972 пути, SHA256 `b8a4ba9ead7ce08ceea1a642ec5acc071ea5c9416281da14eb1d182592fe97aa`. Все пути сверены до правок. Имена артефактов далее относительно `/home/aleksei/reports/vedelo/2026-10-11/update/K`, если явно не указан иной абсолютный путь.

## Сохранённые отрицательные результаты

Собственные `red-D-01`, `red-E-01`, `red-C-01` завершились с exit1: отсутствовали соответственно `getAccessToken` (`mobile/src/features/profile/uploadOnce.ts:5`), `getStoredUser` (`mobile/src/features/proposals/identity.ts:2`), JSX loader для `expo-sqlite/build/hooks.js:19`. Точные команды, время очереди/старта/завершения, журналы и SHA привязаны в `result.json`. Исторические D/E/C и final-tests не переписывались.

`red-import-01` — 25 успешных, 1 отрицательный тест из 26; первое холодное выполнение упёрлось в исходный тайм-аут 20 с. Дополнительный адресный `red-import-title-02` с исходной проверкой — 1 успешный, 1 отрицательный, 24 пропущены селектором; подтвердил несовпадение `#1c1d1f` / `#1e2939` на `ImportScreen.test.tsx:33`. `red-export-01` — 8 успешных, 1 отрицательный из 9, точное несовпадение цвета на `ExportSection.test.tsx:23`.

Ошибки собственных переносов путей и начальных вспомогательных проверок оставлены с фактическими exit1: `header-reference-01/02`, `final-D-02/03`, `gates-01`. Пакет Tailwind установлен: проблема была в разрешении пакета с полем `exports` через абсолютное имя каталога. Исправлен только путь разрешения в новой scratch-копии. `final-D-04` — exit1 до первого состояния, импорт нативного модуля ExpoApplication из настоящего uploadOnce; добавлен платформенный адаптер метаданных устройства. Эти результаты не классифицированы как дефекты продукта.

## Минимальные изменения и эталон заголовка

D получает отсутствующий экспорт `getAccessToken` и фиктивные метаданные `expo-application`/`expo-device`. E получает `getStoredUser` с тем же синтетическим пользователем, что AuthProvider. C-native разбирает `.js` как JSX и изолирует платформенные AuthProvider/tokenStore согласованными синтетическими пользователем и tenant. Настоящие экраны, identity, защитные проверки, API функций, storage/sync и DTO не переписывались.

Общий `tests/browserEvidenceK.cjs` пассивно снимает реальные PNG и DOM+CSSOM перед переходами/закрытием страниц, регистрирует источник и геометрию. Он не меняет состояние React, часы, polling или результат проверок. Фикстуры D/E/C не менялись; интегрированный граф сохранён. Копии стендов с заменой только путей описаны в отдельных манифестах с исходным и итоговым SHA и точными replacements.

`header-reference-03` — exit0. Настоящий PWA `layouts/CabinetHeader.js` и нативный PageHeader загружены с `app/globals.css`, ThemeProvider и реальными токенами темы. В светлой теме RGBA обоих заголовков `(30,41,57,255)`, в тёмной `(226,232,240,255)`, роли 16px/24px/600; обе шапки 64px, одинаковы фон, нижняя граница и отступ 12px. Реальные PNG/DOM+CSSOM, SHA исходников и CSS SHA находятся в `header-03/`. Различие сериализации CSS oklch/rgb нормализовано canvas в RGBA. После сверки изменены ровно два ожидания цвета заголовка `.text` → `.headerTitleColor`; остальные проверки цвета сохранены.

Программная AST-сверка `assertions-final-01.json` содержит исходные и итоговые вызовы: D — 35, E — 34, C — 11, Import — 62, Export — 21; всего 163. Все 80 браузерных вызовов `assert`/`check` неизменны; все циклы матриц и имена сцен совпадают; изменены только два разрешённых ожидания. Сохранились native40 и все 16 сценариев E, включая 2 polling с тремя настоящими наблюдателями хуков статуса в каждой теме и измерением 0/30/60 секунд.

## Изолированный MongoDB

Официальный ARM64 архив MongoDB 8.0.32 получен из `https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu2404-8.0.32.tgz` через ту же очередь. Публичный эталон владельца: `controller-mongo-reference-01.json`; официальный каталог: [архив MongoDB Community](https://www.mongodb.com/try/download/community-edition/releases/archive). Архив — 99 388 444 байта, SHA256 `8cca3993520a7f189790264ee57fb5d55a91094fb4be5f06bbbaf67c974d273f`; бинарь SHA256 `20dd9faca924b267843b3b80d662a4bf0ebe07de4b6462df6503e662af5de5fa`. Частный путь `/home/aleksei/.hermes/cache/scratch/vedelo-android-K/mongo-01/mongod`, версия 8.0.32, aarch64/ubuntu2404, проверка версии exit0. Извлечён только обычный `bin/mongod`, системной установки нет.

До запуска прочитан существующий `server/mobile/syncMongo.integration.test.js`: временный собственный dbpath, динамический свободный TCP port, bind127.0.0.1, завершение только собственного процесса, удаление собственной базы в finally. Адаптер дополнительно запрещает порта 27017 и dbpath вне scratch. `mobile-server-mongo-01` сохранил exit1, 99pass/1fail/0skip. `mongo-diagnostic-01` показал причину: mongod пытался удалить `/tmp/mongodb-37497.sock`, файловая система только для чтения; фатальная ошибка 40486, `src/mongo/transport/asio/asio_transport_layer.cpp:1068`. Это не несовместимость ARM64. Официальный `--help` (`mongo-help-01`, exit0) подтвердил `--nounixsocket`; новый частный адаптер добавляет только этот параметр, TCP integration test не меняется.

## Границы вывода

Все тяжёлые команды, браузеры, скачивание/распаковка MongoDB и vendor gates проходят один `test-queue.lock`, открытый `rb`: queued записывается до flock, start после получения lock, finished/exit после реального завершения. У каждого повтора уникальные JSON/log; незавершённым процессам завершение не приписывалось.

RN Web и Jest не доказывают поведение на физическом Android, IME/TalkBack или безопасность настоящей авторизации. Пользователи/tenant синтетические. Vendor проверяет сохранённый DOM/CSSOM; raw overflow отдельно от отсечения предками и досягаемости прокруткой. Дополнительный replay истории на 360/390/420, обе темы, высота 480 (`reachability-01-results.json`) показывает достижимость всех фильтров через прокрутку; это статическое воспроизведение, а не новая React-проверка.

Общая сборка/полный Jest и финальное объединение H/I/J/K принадлежат координатору. Версия и общий roadmap не менялись: K ограничен тестовым стендом, продуктовые задачи не закрывались.

## Завершённые матрицы и доказательства

| Проверка | JSON записи / журнал | Exit | Фактическое покрытие |
|---|---|---:|---|
| final-D-05 | `final-D-05.json` / `final-D-05.log` | 0 | 1/1 тест Node; 72 основных + 84 дочерних = 156 состояний; 0 ошибок/предупреждений консоли и отрицательных UX-проверок; изменений исходников 0 |
| final-E-02 | `final-E-02.json` / `final-E-02.log` | 0 | 16/16: 14 базовых + 2 polling; SHA 73 исходников; 0 ошибок/предупреждений консоли |
| final-C-02 | `final-C-02.json` / `final-C-02.log` | 0 | 7/7; 21 дополнительный снимок PNG/DOM, SHA 27 исходников |
| final-import-01 | `final-import-01.json` / `final-import-01.log` | 0 | 26/26; настоящие маршрут/PageHeader, обе темы |
| final-export-01 | `final-export-01.json` / `final-export-01.log` | 0 | 9/9; настоящие маршрут/PageHeader, обе темы |
| controller-jest-01 | `controller-jest-01.json` / `controller-jest-01.log` | 0 | независимый повтор контроллера: 35/35, 2/2 набора |
| mobile-server-mongo-02 | `mobile-server-mongo-02.json` / `mobile-server-mongo-02.log` | 0 | 104/104, 0 отрицательных, 0 пропущенных; 100 верхнеуровневых тестов + 4 дочерних Mongo |
| gates-02 | `gates-02.json` / `gates-02.log` | 1 | 16/18 успешных vendor-проверок |
| reachability-01 | `reachability-01.json` / `reachability-01.log` | 0 | 6/6 состояний статического воспроизведения E; все фильтры достижимы |

D: `/home/aleksei/reports/vedelo/2026-10-11/update/K/final05/D/browser-artifacts/measurements.json`. Полный стенд прошёл без обрыва: дополнительная матрица с перехватом продуктовых проверок не понадобилась. E: `final02/E/measurements.json`; C: `final02/C/evidence/manifest.json`. В E оба polling-сценария получили 3 запроса к 60 с, 4 после инвалидации и 5 после фокуса с устаревшими данными; наблюдатели не подменены. Привязки всех исходников и замен путей: `final05-adaptations.json`, `final02-adaptations.json`, манифесты D/E/C/header. `execution-bindings-01.json` дополнительно сверяет SHA финальных исходников/копий с замороженными адаптациями: 6/6 совпали.

Манифест `/home/aleksei/reports/vedelo/2026-10-11/update/K/artifact-manifest-01.json`: 478 записей, 216 PNG, 211 HTML; SHA256 `db347cb6185a2578bdfde3c039db098d78b2bff071962f4720d4bfae94c06a6d`. Каждая запись содержит точный абсолютный путь, SHA и размер. JSON включает измерения/привязки исходников. PNG D light-header, E light-map/dark-history и C dark-editor просмотрены; light/dark и действия проверены настоящими стендами. Существующий сериализатор D нормализует вложенные button и отмечает неактивный фон открытого диалога для статических gates; его исходная логика не менялась.

## Vendor, clipping и оставшиеся ограничения

Все 18 запусков используют неизменённые `/home/aleksei/projects/ux-ui-agent-skills/scripts/verify_target_size.mjs`, `verify_responsive.mjs`, `verify_overflow.mjs`, `DS_REQUIRE_BROWSER=1`, `--widths=360`. Vendor target использует собственный исходный порог 24 px; независимый исходная браузерная проверка native40 сохранён и прошёл. Gates относятся к шести новым DOM/CSSOM: D/header, E/history, C/editor, light/dark. Точные snapshot/vendor SHA, команды и времена всех18 записей находятся в `vendor-summary-02.json` и `vendor-*-02.json`. Скрипты не менялись.

Отрицательная проверка `vendor-E-light-verify_overflow-02`: exit1; snapshot `/home/aleksei/reports/vedelo/2026-10-11/update/K/final02/E/360-light-history.html`, SHA `6522db5f274be0376a672ce4661975f8d896af8b49a5954508d3e10e6e572315`; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/K/vendor-E-light-verify_overflow-02.log`.

Отрицательная проверка `vendor-E-dark-verify_overflow-02`: exit1; snapshot `/home/aleksei/reports/vedelo/2026-10-11/update/K/final02/E/360-dark-history.html`, SHA `834d06dc39743f0be69824a6579511c5a381a61fb75d6134c2e9846b27f86cf7`; журнал `/home/aleksei/reports/vedelo/2026-10-11/update/K/vendor-E-dark-verify_overflow-02.log`.

Измеренные оставшиеся ограничения и их классификация: `/home/aleksei/reports/vedelo/2026-10-11/update/K/blockers-01.json`. Отрицательные vendor результаты не переименованы в успешные. Видимое пересечение фильтров с лентой E равно 0 во всех 6 сочетаниях 360/390/420 × light/dark в настоящем React-прогоне; горизонтальный документ не шире viewport. Статический replay отдельно пересекает исходные прямоугольники с отсекающими предками и viewport, затем проверяет scrollIntoView каждого фильтра. Vendor использует свою исходную высоту viewport; live E и первое статическое воспроизведение проверяют короткий экран 480px, что ограничивает прямое сравнение. Продуктовые изменения для устранения геометрии не выполнялись.

Дополнительный `vendor-clip-02` завершился с exit0: две темы, ровно 360×900 как vendor. Raw overlap 100%, видимая площадь пересечения 0, период после прокрутки достижим в обеих темах. Измерения `/home/aleksei/reports/vedelo/2026-10-11/update/K/vendor-clip-02/measurements.json`; четыре новых PNG до/после и их SHA — `vendor-clip-02/artifacts.json`. Это статическое воспроизведение исходного настоящего DOM/CSSOM, не новый React-сценарий. Источники: `mobile/app/history.tsx:39` (отсечение в ScrollView), `:41` (лента), `mobile/src/shared/ui/PeriodPicker.tsx:67` (кнопка), `mobile/src/features/history/HistoryRow.tsx:51` (строка). Доказанных новых продуктовых ошибок нет; две vendor-проверки остаются отрицательными.

Фактический финальный запуск MongoDB: bind127.0.0.1, port34483, dbpath `/home/aleksei/.hermes/cache/scratch/vedelo-android-K/tmp/artistcrm-mobile-sync-AUcBvY`. `mongo-runtime-02.json`, `mongo-teardown-02.json` фиксируют запуск и завершение: порт закрыт, dbpath удалён, PID отсутствует в пространстве PID проверки. PID сам по себе не доказывает идентичность процесса между пространствами PID; TCP/dbpath проверены отдельно. Для координатора повторяемый безопасный частный адаптер: `/home/aleksei/.hermes/cache/scratch/vedelo-android-K/mongod-private-final.py`; официальный бинарь остаётся частным файлом в scratch. Для существующего теста необходимо задать `TMPDIR=/home/aleksei/.hermes/cache/scratch/vedelo-android-K/t` и запускать через общий lock. Адаптер проверяет аргументы существующего изолированного теста и добавляет `--nounixsocket`; каждый запуск записывает в новый уникальный JSON.

## Итоговые изменения и независимая проверка

Изменены ровно 7 путей: 6 тестовых файлов/адаптеров и этот отчёт.

| Тестовый путь | Итоговый SHA256 |
|---|---|
| `tests/components/androidStageD.browser.test.cjs` | `97e79ae7eccabc001a0f30a22978209633cfc2cc31ff73db981836da7cbb9948` |
| `tests/components/androidStageE.browser.test.cjs` | `27f9d3b0576d0e45066f0939b259e206621eeac63f5e1fcf9040e55f6ab5c73a` |
| `tests/android-proposals/native.browser.test.cjs` | `ccbe3705c67162ac4af16cdf8cd2814d39d0b15891dc01786503f35fa9258c31` |
| `tests/browserEvidenceK.cjs` | `f094d737bdff6a1b57fb4fa0dc59082ff7db8cbecfad3bffb9a91842584970d2` |
| `mobile/src/features/import/ImportScreen.test.tsx` | `453c1c98e173c704fbcfb7982ba54f89f54e1fc0a6c027057fbcfd57ec8c85d1` |
| `mobile/src/features/import/ExportSection.test.tsx` | `081434fa49a451a5f737ee7cb45f45e373db16e96c6352519805bcb82838389d` |

Седьмой путь — `docs/android-update/REPORT-K.md`; собственный SHA отчёта указан в `result.json`, чтобы избежать самоссылочного хеша. `final-source-verification-02.json` содержит SHA до/после всех 7 путей и полный набор защищённых SHA: 2967 файлов полного baseline неизменны; 179 защищённых путей merged baseline неизменны. `full-test-delta-02.diff` содержит полные изменения относительно сохранённых оригиналов, включая новые адаптер/отчёт. Независимое финальное ревью без изменений файлов: `independent-review-final-01.json`; начальное `independent-review-01.json` не переписано.

Полный реестр новых команд, включая прежние собственные exit1, приведён ниже. Абсолютный каталог записей/журналов — `/home/aleksei/reports/vedelo/2026-10-11/update/K`; точные argv/cwd/queued/start/finished/exit и SHA каждой записи/журнала включены в `result.json`.

| Запись JSON | Exit | SHA256 журнала |
|---|---:|---|
| `red-D-01.json` | 1 | `a8c41e7b5f287dccee0305d49389a5b6963012792b6c1b0913eb51afb37e1d70` |
| `red-E-01.json` | 1 | `a5b1203e9dcd192781f81024aff9c3b81ad12f77ffa87ae3d14862a999c4b427` |
| `red-C-01.json` | 1 | `ca936332d4bbe20868eabbe7354df6984b0bafd41b32b9e8bd81bd9fa685d653` |
| `red-import-01.json` | 1 | `4b63f54b223bae2141f6018d60e587a71c4054105198f4f5a8baadb7b1394571` |
| `red-export-01.json` | 1 | `c713c47cf1e65878302067738be911109414def63e0edff93d4545927e11ca8e` |
| `mongo-download-01.json` | 0 | `fba387218a39505fd8e5da76d3a0cdae3242aa1c5d29e15449f4cceb435aebe1` |
| `header-reference-01.json` | 1 | `8a9c7f1b06e7d73688965f94f4dc04693acd741fab9cb6be3a598854b738c36e` |
| `final-D-02.json` | 1 | `7db42a3974e87db256d720255191e20536538c0b45ee86d455c883140eb203fa` |
| `final-E-02.json` | 0 | `beb02ac06f83d8881aea2177eff888fc23e78b81b15df41a1decca390c540a10` |
| `final-C-02.json` | 0 | `78ff69e9340ab85c96030d307e56aadda1e73c0c148ba2653618c5cb7453a159` |
| `red-import-title-02.json` | 1 | `3a68813ea892418d207a91ffa23c3cd8078a8bac1b62b4061eaedd635d290977` |
| `mobile-server-mongo-01.json` | 1 | `2a846c43161bb0ca087b76e65d6d3e2c014cee3e77a0f73f85cf84d770965d2f` |
| `final-D-03.json` | 1 | `aadd97566c04b29b33dd3937c7766f2ed9b321a0e0af61bb033f4ccd9cc425bf` |
| `header-reference-02.json` | 1 | `a95b6aa5746c1834cb65db025901d3f8dca7914fa3490c7566b4c99d71a8c751` |
| `gates-01.json` | 1 | `905387f0fa3d7114353d3e9f97af1e513b68d787162186112f673f49721c7bd2` |
| `reachability-01.json` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `mongo-diagnostic-01.json` | 1 | `1c02021f197f4c9c460e22f82e632bcc638c5550b960c79ad24c4b9663d5a180` |
| `final-D-04.json` | 1 | `da06b7cb57d35cf4100da12145a1e72ae52c5a840fcce4333dc4099284e221ed` |
| `header-reference-03.json` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `mongo-help-01.json` | 0 | `1dd52726ee05679070b84e38efbe52586988f87a2b76e31cde83911ff0fca11c` |
| `final-D-05.json` | 0 | `ee5333b9724f20134d1a515c460ae08df2a551f68b03ef9b438d10be46592b41` |
| `mobile-server-mongo-02.json` | 0 | `ed696b973746293babd4a5734d47714f20dc7ab6a860bd82c216cf25198aba28` |
| `final-import-01.json` | 0 | `80d27753bdd86d1b0955dfaca3ad82c0b7cb744adc7be3e9843b09314d5c4071` |
| `final-export-01.json` | 0 | `ac0273c3260662d118443acae44a23c9d604e61efb112e1a89626a660bd4fd3e` |
| `controller-jest-01.json` | 0 | `3cf6fcaaf650ab6e9c73b2ec41427a37bccee8d2747b1a8d29ae95eb0f0eabf2` |
| `gates-02.json` | 1 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `controller-provenance-01.json` | 0 | `ec1fc4bf41f57c254b3ec2d88ef6a76a6f60f406eabfd3aba2cf2a2d9705f7f4` |
| `vendor-D-light-verify_target_size-02.json` | 0 | `943ed7ad0e894a84dccdb83ecfdf491f75c06ad88da6d1a5254d8c12b8e4999d` |
| `vendor-D-light-verify_responsive-02.json` | 0 | `5cb610384b7b6b1673d2a813e6a6e4679599ca954f840b1f5d4fc4f73ee3f7aa` |
| `vendor-D-light-verify_overflow-02.json` | 0 | `b09f2d647ec5ea1aedfec4e3320c9d068e23023f04f9ace08cffb98c0566b57e` |
| `vendor-E-light-verify_target_size-02.json` | 0 | `a332740140bcd49ddb2a094d1fa83d998c5f624de0b4427ded425bc46a3f8784` |
| `vendor-E-light-verify_responsive-02.json` | 0 | `5cb610384b7b6b1673d2a813e6a6e4679599ca954f840b1f5d4fc4f73ee3f7aa` |
| `vendor-E-light-verify_overflow-02.json` | 1 | `56faea1c6c2ca259f32cb9554b4f687e05d0ae54aa15c6a4b1f5d0d64f13ff33` |
| `vendor-C-light-verify_target_size-02.json` | 0 | `e26cee3cdce40661c9e5a21fe6de8e73f17adf74f25f87495fcf915f0a464b79` |
| `vendor-C-light-verify_responsive-02.json` | 0 | `5cb610384b7b6b1673d2a813e6a6e4679599ca954f840b1f5d4fc4f73ee3f7aa` |
| `vendor-C-light-verify_overflow-02.json` | 0 | `b09f2d647ec5ea1aedfec4e3320c9d068e23023f04f9ace08cffb98c0566b57e` |
| `vendor-D-dark-verify_target_size-02.json` | 0 | `943ed7ad0e894a84dccdb83ecfdf491f75c06ad88da6d1a5254d8c12b8e4999d` |
| `vendor-D-dark-verify_responsive-02.json` | 0 | `5cb610384b7b6b1673d2a813e6a6e4679599ca954f840b1f5d4fc4f73ee3f7aa` |
| `vendor-D-dark-verify_overflow-02.json` | 0 | `b09f2d647ec5ea1aedfec4e3320c9d068e23023f04f9ace08cffb98c0566b57e` |
| `vendor-E-dark-verify_target_size-02.json` | 0 | `a332740140bcd49ddb2a094d1fa83d998c5f624de0b4427ded425bc46a3f8784` |
| `vendor-E-dark-verify_responsive-02.json` | 0 | `5cb610384b7b6b1673d2a813e6a6e4679599ca954f840b1f5d4fc4f73ee3f7aa` |
| `vendor-E-dark-verify_overflow-02.json` | 1 | `fe49e3c49aff5f81657ba492cd117fd5f464804d4878391b8255523d4ecbb0db` |
| `vendor-C-dark-verify_target_size-02.json` | 0 | `e26cee3cdce40661c9e5a21fe6de8e73f17adf74f25f87495fcf915f0a464b79` |
| `vendor-C-dark-verify_responsive-02.json` | 0 | `5cb610384b7b6b1673d2a813e6a6e4679599ca954f840b1f5d4fc4f73ee3f7aa` |
| `vendor-C-dark-verify_overflow-02.json` | 0 | `b09f2d647ec5ea1aedfec4e3320c9d068e23023f04f9ace08cffb98c0566b57e` |
| `vendor-clip-02.json` | 0 | `2b9b33eaa1382de4b5b05e8b1a3632f1450ac156f0b8c1d65e635e5fbd612665` |

Машиночитаемый итог: `/home/aleksei/reports/vedelo/2026-10-11/update/K/result.json`. У всех назначенных команд есть фактический finished/exit; queued/pending не оставлены. Выпуск, commit, push и deploy запрещены и не выполнялись.
