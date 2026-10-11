# Выбор периода Web/PWA — отчёт

Рабочая копия `/home/aleksei/projects/vedelo`. Выполнен отдельный Web/PWA-этап из `BRIEF-WEB.md`: production-компонент подключён во всех шести местах, обязательные проверки прошли. Commit/push/deploy не выполнялись. Mobile, API, схемы, timezone-конвертеры, финансовые вычисления, package/version, ROADMAP/AI_HANDOFF/UI_CONVENTIONS не изменялись этим этапом. Версия сохранена `1.35.8`. Исходные чужие изменения сохранены.

## changed_files

- `components/PeriodPicker.js` (новый production React-компонент)
- `components/PeriodPicker.module.css` (новые локальные стили)
- `helpers/webPeriodRange.mjs`, `helpers/webPeriodRange.test.mjs` (новые)
- `components/TransactionDateRangeFilter.js`
- `layouts/content/TransactionsContent.js`
- `layouts/content/HistoryContent.js`
- `layouts/content/ClientReviewsContent.js`
- `layouts/content/BillingOperationsContent.js`
- `layouts/content/ServiceAnalyticsContent.js`
- `components/GoogleCalendarImportSettings.js`
- `tests/components/periodPickerHarness.cjs` (новый)
- `tests/components/periodPicker.browser.test.cjs` (новый)
- `tests/components/periodConsumers.browser.test.cjs` (новый)
- `tests/components/historyFilters.browser.test.cjs`
- `tests/components/clientReviewsFilters.browser.test.cjs`
- `docs/period-picker/REPORT-WEB.md` (этот отчёт)

## Места и сохранённые контракты

| Потребитель | Что заменено / что сохранено |
| --- | --- |
| Транзакции | Тонкий адаптер общего контрола; `{from,to}`; исходные `filterTransactions`, расчёты, список, отметки activeDateKeys с фактическими и плановыми датами. Дополнительные «Завтра», «На выходных». Toolbar разрешает перенос на узком экране. |
| История действий | Одна пара в state; сохранены поиск, сворачивание, счётчик каждой границы, значения. `dateFrom` остаётся YYYY-MM-DD (прежний UTC-start), `dateTo` — YYYY-MM-DDT23:59:59.999 (прежний local-end). |
| Отзывы клиентов | Одна пара в state; сворачивание не очищает, счётчик/summary по обеим границам. Сохранён key списка: изменение периода атомарно пересоздаёт список на первой странице. Внутренняя нумерация существующего списка **нулевая**: первая страница `page=0`, UI показывает 1. Это не изменение API. |
| Все операции | Один `setFilters` меняет dateFrom/dateTo и page=1; остальные условия остаются. |
| Аналитика сервиса | requiredRange, UTC, maxDate=today, maxDays=366; текущий месяц до сегодня. Одно `router.replace` для обеих границ; очистка detail/historyUser/detailPage сохраняется в существующем update. Reset — исходные 30 дней. 30/90 дней сохранены как дополнительные пресеты. Сервер не менялся. |
| Google Calendar import | requiredRange, локальные даты, initialRange сегодня→+6 месяцев и reset к нему; один setPeriod. Дополнительные ближайшие 3/6 месяцев сохранены. loading/importing блокируют контрол и reset. `toRangeIso`, preview/selection, импорт и re-preview не менялись. |

Прочие реальные парные period-filter в дополнение к шести из аудита не добавлялись.

Открытые границы доступны четырём прежним фильтрам; аналитика и импорт скрывают «За всё время» и требуют обе даты. На календаре один месяц при любой ширине. Первое нажатие выбирает один день, второе — диапазон; порядок дат нормализуется. Ручной ввод проверяет строгие реальные даты. Пресеты применяются сразу, календарь/manual только после Apply. Отмена, Escape, закрытие/клик снаружи оставляют controlled value. Переключение родителем учитывается при повторном открытии. Native dialog в portal даёт top layer, удержание фокуса и отсутствие clipping внутри модалки; очистка восстанавливает исходный overflow с его CSS priority.

## TDD и исходные ошибки

До реализации запущен `node --test helpers/webPeriodRange.test.mjs`: **exit 1**, один failing file, `ERR_MODULE_NOT_FOUND` для нового helper. Лог: `/home/aleksei/.hermes/cache/scratch/vedelo-period-web/tdd-unit-before.log`. После реализации первый unit-прогон: **6/6, exit 0**.

Исходный точечный ESLint шести потребителей + адаптера: **exit 0**, пустой лог `eslint-baseline.log`. Первый ESLint нового кода: 0 errors / 1 warning (ref в cleanup); предупреждение исправлено сохранением opener в effect. Последующие точечные ESLint — exit 0, 0 errors / 0 warnings.

Первые браузерные прогоны зафиксированы в scratch: превышение таймаутов, неверный regex accessible name метрики и неполная Google fixture (отсутствовали флаги тарифа). Эти результаты не считаются успехом. Дополнительно обнаружены: отсутствующий excludedOptions в analytics fixture (падал настоящий экран); повторное нажатие отключённой «Далее» в тесте отзывов; оба недостатка тестов исправлены. Диагностический dump с пустым экраном не считается тестом аналитики. Визуальный просмотр настоящего screenshot нашёл светлый canvas token в dark-панели и недостаточный контраст hover конечной даты; исправления локальны CSS-модулю. verify_states также неверно трактовал color(srgb)/oklab как 0–255 RGB; локальные hover/range теперь используют стандартные secondary-токены с обычным computed RGB. Сам gate не менялся. Первые directory-gates остановились по page.goto timeout 30s на диагностическом HTML при параллельных браузерных процессах; повторная проверка итоговых снимков прошла. Ошибки промежуточных прогонов не скрыты: `responsive-all.log`, `target-all.log` и прочие диагностические логи остаются в scratch.

## Проверки

Все логи ниже находятся в `/home/aleksei/.hermes/cache/scratch/vedelo-period-web`. Успешный результат относится к финальному коду; исходные и промежуточные ошибки описаны выше.

| Проверка | Фактический результат | Лог |
| --- | --- | --- |
| Unit: новый helper + прежние transactionDateRange/transactionFilters, Asia/Krasnoyarsk | exit 0, 17/17 | `unit-krasnoyarsk.log` |
| Новый helper, UTC | exit 0, 6/6 | `unit-utc.log` |
| Новый helper, America/New_York | exit 0, 6/6 | `unit-new-york.log` |
| Итоговый последовательный browser-прогон | exit 0, 18/18, без skipped: 6 общий контрол + 8 интеграции + 4 прежние история/отзывы | `selected-final.log` |
| Точечный ESLint, 15 файлов этапа | exit 0, 0 errors / 0 warnings | `eslint-final.log` |
| `git diff --check` | exit 0, пустой вывод | `diff-check-final.log` |
| Responsive, 78 итоговых HTML × 280/390/1365px | exit 0, горизонтального переполнения нет | `responsive-final.log` |
| Target size, те же 78 HTML | exit 0, 3006 targets: ≥24×24 либо допустимое исключение gate | `target-final.log` |
| States: presets/calendar/manual, light и dark | exit 0 для каждого; 33/126/33 состояний на тему, всего 384; default/hover/focus проходят WCAG AA | `states-{presets,calendar,manual}-{light,dark}-final.log` |
| Дополнительный disabled-dark HTML: responsive/targets/states | три exit 0; все 3 ширины без overflow, 6 targets, 6 состояний проходят WCAG AA | `responsive-disabled-dark.log`, `target-disabled-dark.log`, `states-disabled-dark.log` |

Матрица общего контрола: light/dark × 280×740, 390×844, 390×640, 1365×900; по четыре снимка field/presets/calendar/manual. Шесть реальных потребителей: обе темы × 280×740, 390×640, 1365×900. В browser-тестах дополнительно проверены console/pageerror, реальные клики, геометрия mobile reset 44×44 и desktop oval, initial presets-only, отдельные календарь/manual, apply/cancel/reset, открытые границы/один день, leap/invalid/incomplete/reversed input, ограничения min/maxDate и 366/367 дней, UTC, внешний controlled update, disabled, activeDates, Escape/Tab/Shift+Tab/focus и вложенная настоящая Modal.

Интеграционные тесты проверяют фактический результат списка транзакций и фильтрации истории/отзывов, атомарные границы и возврат первой страницы отзывов/операций, единственное обновление URL/API аналитики с очисткой detail/historyUser/detailPage, локальные ISO границы Google, preview selection, блокировку loading/importing и re-preview после импорта. Дополнительно прежние тесты истории/отзывов отдельно прошли 4/4 (`old-browser-verified.log`), интеграционный набор отдельно — 8/8 (`consumers-verified.log`).

Команды unit:

```bash
TZ=Asia/Krasnoyarsk node --test helpers/webPeriodRange.test.mjs helpers/transactionDateRange.test.mjs helpers/transactionFilters.test.mjs
TZ=UTC node --test helpers/webPeriodRange.test.mjs
TZ=America/New_York node --test helpers/webPeriodRange.test.mjs
```

Окружение и команда итогового browser-прогона:

```bash
export ESBUILD_MODULE=/home/aleksei/.hermes/cache/scratch/vedelo-ui-harness/node_modules/esbuild
export PLAYWRIGHT_MODULE=/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/aleksei/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome
export TMPDIR=/home/aleksei/.hermes/cache/scratch
export PERIOD_GLOBAL_CSS=/home/aleksei/.hermes/cache/scratch/vedelo-period-web/globals-cache.css
node --test --test-concurrency=1 tests/components/periodPicker.browser.test.cjs tests/components/periodConsumers.browser.test.cjs tests/components/historyFilters.browser.test.cjs tests/components/clientReviewsFilters.browser.test.cjs
```

`globals-cache.css` — результат настоящей компиляции production globals через Tailwind/PostCSS, сохранённый первым прогоном. Без `PERIOD_GLOBAL_CSS` стенд заново компилирует globals. CSS-module компилируется из текущего source при сборке каждой fixture. Повторное использование страницы внутри матрицы и последовательный запуск файлов устранили перегрузку одновременными Chromium/esbuild-процессами; проверки взаимодействия и всех размеров сохранены.

Точечные проверки:

```bash
node node_modules/eslint/bin/eslint.js components/PeriodPicker.js components/TransactionDateRangeFilter.js components/GoogleCalendarImportSettings.js layouts/content/TransactionsContent.js layouts/content/HistoryContent.js layouts/content/ClientReviewsContent.js layouts/content/BillingOperationsContent.js layouts/content/ServiceAnalyticsContent.js helpers/webPeriodRange.mjs helpers/webPeriodRange.test.mjs tests/components/periodPickerHarness.cjs tests/components/periodPicker.browser.test.cjs tests/components/periodConsumers.browser.test.cjs tests/components/historyFilters.browser.test.cjs tests/components/clientReviewsFilters.browser.test.cjs
git diff --check
```

UX-gates выполнялись с обязательным браузером, оригинальные скрипты не менялись:

```bash
DS_REQUIRE_BROWSER=1 node /home/aleksei/projects/ux-ui-agent-skills/scripts/verify_responsive.mjs /home/aleksei/.hermes/cache/scratch/vedelo-period-web/gate-inputs --widths=280,390,1365
DS_REQUIRE_BROWSER=1 node /home/aleksei/projects/ux-ui-agent-skills/scripts/verify_target_size.mjs /home/aleksei/.hermes/cache/scratch/vedelo-period-web/gate-inputs --widths=280,390,1365
```

`verify_states.mjs` запущен отдельно для `presets-390-640-light.html`, `calendar-390-640-light.html`, `manual-390-640-light.html` и соответствующих dark HTML с `--dark`; каждый вызов с `DS_REQUIRE_BROWSER=1` и абсолютным путём к скрипту/HTML. Дополнительный снимок проверен следующими командами; вместе directory и дополнительная проверка покрывают все 79 HTML (3012 targets):

```bash
DS_REQUIRE_BROWSER=1 node /home/aleksei/projects/ux-ui-agent-skills/scripts/verify_responsive.mjs /home/aleksei/.hermes/cache/scratch/vedelo-period-web/disabled-390-dark.html --widths=280,390,1365
DS_REQUIRE_BROWSER=1 node /home/aleksei/projects/ux-ui-agent-skills/scripts/verify_target_size.mjs /home/aleksei/.hermes/cache/scratch/vedelo-period-web/disabled-390-dark.html --widths=280,390,1365
DS_REQUIRE_BROWSER=1 node /home/aleksei/projects/ux-ui-agent-skills/scripts/verify_states.mjs /home/aleksei/.hermes/cache/scratch/vedelo-period-web/disabled-390-dark.html --dark
```

Полная сборка не запускалась по brief.

## Артефакты и границы

Полный перечень **79 пар screenshot+HTML с абсолютными путями**: [artifacts.json](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/artifacts.json). `gate-inputs` содержит 78 финальных снимков; дополнительно снятый disabled-dark проверен отдельно. Диагностические HTML с пустым экраном в manifest и gate-inputs не включены.

Примеры итоговых артефактов (в каждой ссылке абсолютный путь):

| Состояние | Screenshot | HTML |
| --- | --- | --- |
| Поле / mobile light | [PNG](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/field-390-640-light.png) | [HTML](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/field-390-640-light.html) |
| Готовые периоды / mobile light | [PNG](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/presets-390-640-light.png) | [HTML](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/presets-390-640-light.html) |
| Календарь / mobile dark | [PNG](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/calendar-390-640-dark.png) | [HTML](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/calendar-390-640-dark.html) |
| Ручной ввод / 280px | [PNG](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/manual-280-740-light.png) | [HTML](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/manual-280-740-light.html) |
| Транзакции | [PNG](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-transactions-390-640-light.png) | [HTML](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-transactions-390-640-light.html) |
| История | [PNG](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-history-390-640-light.png) | [HTML](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-history-390-640-light.html) |
| Отзывы | [PNG](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-reviews-390-640-light.png) | [HTML](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-reviews-390-640-light.html) |
| Все операции | [PNG](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-billing-390-640-light.png) | [HTML](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-billing-390-640-light.html) |
| Аналитика | [PNG](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-analytics-390-640-light.png) | [HTML](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-analytics-390-640-light.html) |
| Google import | [PNG](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-google-390-640-light.png) | [HTML](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/consumer-google-390-640-light.html) |
| Вложенная Modal | [PNG](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/nested-modal-390-light.png) | [HTML](/home/aleksei/.hermes/cache/scratch/vedelo-period-web/nested-modal-390-light.html) |

Артефакты пишутся только в scratch, плюс прежние каталоги `/home/aleksei/.hermes/cache/scratch/vedelo-history-filters` и `/home/aleksei/.hermes/cache/scratch/vedelo-client-reviews-filters` (старые expanded/collapsed/selected сценарии и metrics.json). Стенд рендерит production-компоненты, настоящий `app/globals.css` через Tailwind/PostCSS и CSS modules через esbuild. Внешние stores/API и Next navigation — изолированные test seams; карточки/списки/модалка реальные. Фикстуры не являются подтверждением живой доставки Google/ответов БД.

Не проверялись production, установленные PWA/реальный телефон, backend/tenant E2E и полная Next.js-сборка. Доступ к данным не изменён. Mobile проверки не запускались. APK не собирался. Бинарные ассеты в репозиторий не добавлялись.
