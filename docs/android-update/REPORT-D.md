# Отчёт этапа Г

Готово к интеграции в границах этапа Г. Полная визуальная приёмка ограничена внешним native target и особенностью vendor overflow; APK/production не проверены. Назначенная копия: /home/aleksei/projects/vedelo-android-visual-20261011

Итог: 21 адресная suite,305/305 PASS; typecheck и ESLint exit0. Новый browser:156 состояний плюс подтверждённые адресные GREEN24 (настройки/период) и12 (биллинг), console errors0/warnings0. Исходный mobileVisualParity:30 состояний,9/9 gates PASS. Новый vendor набор:7/9 PASS,2 overflow FAIL по отсечённым элементам истории; clip-проверка12 сочетаний показывает0 видимых пересечений. Строгий native40 остаётся FAIL6/6 по внешней кнопке карты28×40. Подробные ограничения и итог в конце; весь следующий текст до итогового раздела — инкрементальный журнал работы.

Прочитаны BRIEF-D, AGENTS, AI_HANDOFF целиком, актуальные разделы ROADMAP и UI_CONVENTIONS. Изменения ограничены этапом Г. Версии, backend/auth/offline и соседние Reviews/КП не меняются.

Baseline исходников: `/home/aleksei/reports/vedelo/2026-10-11/update/D/baseline-source.json`. Целевой Jest baseline запускается до продуктовых изменений.

Ограничения: нет ADB, production-авторизация отклонена. RN Web — только стенд, не APK. Полный Jest оставлен родителю.

Поведенческие RED-тесты подготовлены отдельно: `mobile/src/features/statistics/stageD.test.tsx`, `mobile/src/features/integrations/inline.stageD.test.tsx`. Новый стенд: `tests/components/androidStageD.fixture.jsx` и `androidStageD.browser.test.cjs`; исходный mobileVisualParity не изменён. До получения RED продуктовые правки не применены. Прогоны ожидают общего flock.

Добавлен отдельный поведенческий `history/collapse.stageD.test.tsx`: настоящий `useHistory` с двумя страницами, поиск, раскрытие/сворачивание без запроса, следующий cursor. Общая очередь всё ещё занята: baseline и RED не начались, продуктовых правок нет. Статус проверен 2026-10-11T13:28:55.446799.

Baseline выполняется: PASS SettingsSections, AiUsagePanel, PeriodPicker; FAIL по таймаутам IntegrationsSection, AttentionScreen и HistoryScreen. Это промежуточный статус, exit code/counts ещё не получены. Таймауты не менялись. Журнал D/baseline.log.

- Проверка `baseline`: `bash -c cd mobile && npm test -- --runTestsByPath src/features/history/HistoryScreen.test.tsx src/features/statistics/sections.test.tsx src/features/statistics/statistics.test.ts src/features/navigation/menu.test.tsx src/features/navigation/moreRoute.test.tsx src/features/billing/BillingScreen.test.tsx src/features/integrations/IntegrationsSection.test.tsx src/features/integrations/AiUsagePanel.test.tsx src/features/settings/SettingsSections.test.tsx src/features/attention/AttentionScreen.test.tsx src/shared/ui/PeriodPicker.test.tsx src/shared/ui/pwaTypography.test.tsx`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/baseline.log`.

Первый целевой baseline: 12 suites, 4 failed / 8 passed; 241 tests, 7 failed / 234 passed; 513.042 s; exit 1. Ошибочно запущен повторный baseline под тем же именем: baseline.log частично перезаписывается. Снимок baseline-first-observed.log сохраняет наблюдённый итог, но не объявляется полным чистым журналом первого запуска. Все следующие имена уникальны. Продуктовые файлы исходные.

- Проверка `baseline`: `bash -c cd mobile && npm test -- --runTestsByPath src/features/history/HistoryScreen.test.tsx src/features/statistics/sections.test.tsx src/features/statistics/statistics.test.ts src/features/navigation/menu.test.tsx src/features/navigation/moreRoute.test.tsx src/features/billing/BillingScreen.test.tsx src/features/integrations/IntegrationsSection.test.tsx src/features/integrations/AiUsagePanel.test.tsx src/features/settings/SettingsSections.test.tsx src/features/attention/AttentionScreen.test.tsx src/shared/ui/PeriodPicker.test.tsx src/shared/ui/pwaTypography.test.tsx`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/baseline.log`.

- Проверка `browser-install`: `npm install --prefix /home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011/browser-deps --no-audit --no-fund esbuild react-native-web playwright qrcode jsqr`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/browser-install.log`.

Планируемый интерфейс интеграции с родителем: меню ведёт на точные `/more/client-reviews` и `/more/review-page`; файлы экранов Reviews/КП здесь не создаются. Dynamic fallback не должен монтировать старую заглушку вместо соседнего точного route. Подключение Reviews/КП в другие экраны оставлено родителю согласно брифу.

Контракты для реализации сверены с текущим кодом: история `/histories`, статистика `/mobile/v1/statistics`, биллинг `/mobile/v1/billing` и `/billing/history`, настройки `/mobile/v1/settings/terminology` с PUT → подтверждающий GET; текущие endpoints интеграций и `/ai/usage` без платных операций. QR — существующий анонимный `https://qr.escalion.ru/api/v1/qr/generate`, POST `type:url`, `data.url`, параметры PNG, без api.client/bearer. DTO included AI и существующие флаги тарифа сохраняются. Это описание подготовленной реализации; продуктовые изменения ещё не применены, RED ждёт очередь.

- Проверка `red`: `bash -c cd mobile && npm test -- --runTestsByPath src/features/statistics/stageD.test.tsx src/features/integrations/inline.stageD.test.tsx`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/red.log`.

RED: 2 suites failed, 15/15 tests failed, 31.815 s, exit 1. Настоящие поведенческие причины: отсутствие группы отзывов/сводки истории/графика/QR/строк тарифа/inline-контейнера; месячная недооплата ожидалась 1400, исходный расчёт дал 1500; период имеет исходную геометрию. Журнал D/red.log. Browser install exit 1 EROFS на ~/.npm cache; новый запуск использует --cache только в scratch. Продуктовые файлы ещё исходные.

Подготовлен tests/components/androidStageD.gates.cjs: неизменённые verify_target_size/verify_responsive/verify_overflow, SHA-256 исходных скриптов, отдельный лог и exit code для каждого из 3×3 прогонов. Нативный минимум 40 dp дополнительно проверяется живыми измерениями стенда. Запуск пока не выполнен.

- Проверка `red-history`: `bash -c cd mobile && npm test -- --runTestsByPath src/features/history/collapse.stageD.test.tsx`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/red-history.log`.

- Проверка `browser-install-scratch`: `npm install --prefix /home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011/browser-deps --cache /home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011/npm-cache --no-audit --no-fund esbuild react-native-web playwright qrcode jsqr`; exit 0, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/browser-install-scratch.log`.

RED истории: 1/1 failed, 31.55 s, exit 1; перед провалом реально загружены поиск и две страницы, отсутствие history-filter-toggle подтверждено. Scratch install: exit 0, 61 пакет, npm cache в scratch. Запущен браузерный baseline до продуктовых правок.

- Проверка `browser-baseline-1`: `env D_CAPTURE_BASELINE=1 node --test tests/components/androidStageD.browser.test.cjs`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/browser-baseline-1.log`.

Browser baseline 1: exit 1, esbuild сообщил два отсутствующих экспорта адаптеров (MOBILE_SETTINGS_QUERY_KEY/useMutation); рендер не начался, это инфраструктурная ошибка, не поведенческий RED. Экспорты сверены с исходниками, адаптеры исправлены.

Дополнительная сверка history/api.ts: действующий endpoint /histories (buildHistoryPath), ошибка названия в первоначальном описании/fixture исправлена. Серверный контракт не меняется.

- Проверка `browser-baseline-2`: `env D_CAPTURE_BASELINE=1 node --test tests/components/androidStageD.browser.test.cjs`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/browser-baseline-2.log`.

Browser baseline 2: exit 1, настоящий рендер шапки состоялся, создан первый screenshot/HTML; сохранение метрик остановилось на ошибочном имени helper metrics вместо measurements. Это ошибка инфраструктуры стенда, исправлено имя функции; не объявляется RED продукта.

На настоящем исходном кадре 360-light-header виден отсутствующий глиф ⓘ в шрифте стенда. Подготовлен отдельный helpIcon.stageD.test.tsx (две темы, Latin i в круге, 44 dp, открытие реальной подсказки) и поставлен RED через общий flock. Реализация иконки ещё не применена.

- Проверка `browser-baseline-3`: `env D_CAPTURE_BASELINE=1 node --test tests/components/androidStageD.browser.test.cjs`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/browser-baseline-3.log`.

- Проверка `red-help-icon`: `bash -c cd mobile && npm test -- --runTestsByPath src/shared/ui/helpIcon.stageD.test.tsx`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/red-help-icon.log`.

Browser baseline 3: exit 1, 11 рендеров/кадров; остановка на неподдерживаемом RN Web findNodeHandle при открытии периода. Модуль react-native в стенде теперь экспортирует настоящие RN Web компоненты с одним platform override findNodeHandle → null; Android-реализация не меняется. Фокус системного Android не подтверждён. Базовый Arial ограничен native main; веб-пары и порталы получают актуальный PWA Inter Tight. Добавлены строгие проверки header background/border/padding/text и вертикальных insets периода.

- Проверка `browser-baseline-4`: `env D_CAPTURE_BASELINE=1 node --test tests/components/androidStageD.browser.test.cjs`; exit 0, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/browser-baseline-4.log`.

Baseline `browser-baseline-4`: 90 состояний, exit 0 (6 ошибок адаптера веб-истории, позже переснята до продуктовых правок); снимки и измерения в scratch/browser-baseline. Продуктовые исходники во время прогона не менялись. Исправлены только селекторы host-узлов тестов, CORS стенда и сравнение отображаемого цвета через canvas (CSS oklch и native hex). Требования не ослаблены.

- Проверка `browser-red`: `env D_BROWSER_RED=1 node --test tests/components/androidStageD.browser.test.cjs`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/browser-red.log`.

Браузерный RED exit 1: computed font-size настоящего native-заголовка 24px вместо веб-роли 16px. baseline-4 включает 6 ошибок только веб-истории (неверный адаптер useEntityQueries); это не чистая консоль. Их исходные артефакты сохранены, исправленная веб-пара переснимается отдельно до реализации.

- Проверка `baseline-web-history`: `env D_CAPTURE_BASELINE=1 D_BASELINE_SUPPLEMENT=1 node --test tests/components/androidStageD.browser.test.cjs`; exit 0, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/baseline-web-history.log`.

Реализация применена после всех RED и исходного baseline веб-истории: 6/6 состояний веб-пары, ошибок консоли 0, исходники неизменны во время прогона. Продуктовых зависимостей нет; scratch-зависимости отдельно. Перечень файлов и native testID обновлён в result.json.

- green-new-1: exit 1, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/green-new-1.log.

Первый GREEN новых тестов: 11/18 PASS, 7 FAIL. Реальный текст совпал с требованиями, но RN matcher воспринимает строку как полное равенство; substring-проверки уточнены регулярными выражениями, полные URL/сводка — точными строками. Share проверяется после завершения копирования и разблокировки действующей кнопки. Assertions функционально сохранены, таймауты не увеличены.

- typecheck-1: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/typecheck-1.log.

- Проверка `batch-green-1`: `python3 /home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011/checks.py`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/batch-green-1.log`.

- Проверка `browser-green-1`: `node --test tests/components/androidStageD.browser.test.cjs`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/browser-green-1.log`.

Browser GREEN-1 остановился: отсутствующий TextInput.State.currentlyFocusedInput в RN Web; только адаптер платформы дополнен document.activeElement. Измерен продуктовый дефект: шапка с Button48 имела высоту65; paddingBottom7 обеспечивает64 без уменьшения target. После изменения shared компонента адресные UI-тесты и typecheck будут повторены. В новых тарифных тестах найден нестабильный mock useScreenLifetime, запускавший повторные чтения; ссылка функции стабилизирована, таймаут5с сохранён.

- green-targeted-2: exit 1, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/green-targeted-2.log.

- typecheck-2: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/typecheck-2.log.

- Проверка `batch-green-2`: `python3 /home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011/checks2.py`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/batch-green-2.log`.

## Реализованные пункты и границы проверки

- HISTORY-01: наружные поиск/счётчик/сводка/reset; отдельные ScrollView фильтров и списка; раскрытие сохраняет поиск, страницы и cursor.
- STATS-01/02: предупреждение об обязательствах, положительные доходы по draft/предстоящим active; недооплата с clamp положительной оплаты; настоящий месячный график и обе подсказки. Формула скопирована из действующего helpers/buildStatisticsChartData.js с типами; стенд сравнивает фактические результаты обеих реализаций.
- AI-05/06: 12 отдельных возможностей текущего и выбираемого тарифа, реальные FieldHelp; included сумма зависит от allowAi. Оценки 150/300 ₽ соответствуют текущим fallback rates веба; DTO mobile не передаёт динамические rates. Панель сохраняет tariffIncluded, usedRub/remainingRub и отсутствие платных действий.
- MENU-01/02: актуальный пользовательский порядок, независимое раскрытие групп; точные routes отзывов без заглушек. Подключение соседних экранов — родитель.
- REGISTER-02: QR нового /register?ref, общий URL для показанного текста/copy/share, анонимный существующий сервис; abort по смене профиля/ссылки, ошибка и повтор без удаления ссылки.
- VISUAL-01/04/06 в границах Г: InterTight в текстах принадлежащих экранов, компактный общий PageHeader, горизонтальная summary «Важного», период с безопасными отступами. Events/ListHeader и нижние вкладки соседнего этапа сохранены.
- Интеграции: существующие формы Google/Avito/VK/Novofon/ИИ/API/Telegram внутри выбранной строки. Статусы, ограничения, auth и секреты не менялись.
- Настройки: добавлены testID; действующая PUT → точный GET и сохранение draft при ошибке сохранены, проверяются действиями стенда.

Изменённые shared токены: headerTitleColor (#1e2939 / #e2e8f0), periodBackground (#fffefa / #3b2f1d), periodForeground (#1c1d1f / #f1e7d4), overlayBackdrop (rgba(28,29,31,0.4) / rgba(241,231,212,0.4)). PageHeader:64dp, title16/24/600, count12/16/600, InterTight; FilterControl40; menu/help/period44. Button48 сохранён.

Новое поведение проверяется настоящими компонентами, синтетическими DTO и явными адаптерами платформы/данных. Это не проверка native клавиатуры, TalkBack, системного фокуса или production.

В старом sections.test.tsx ровно три /login?mode=register заменены на /register. Из устаревшего запрета /5%|QR|Выручка/ убран только QR, поскольку появился реальный QR; запреты ложных финансовых подписей сохранены. Новая проверка included подсказки требует сумму в теле полного предложения, а не только заголовке.

- Проверка `browser-green-2`: `node --test tests/components/androidStageD.browser.test.cjs`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/browser-green-2.log`.

Browser GREEN-2: exit1, 156 состояний, console errors0/warnings0, source changes0. Настоящий внешний дефект: адресный link MobileEventCard28×40 на всех шести сочетаниях; events модуль запрещён к изменению в Г. Отсутствующий checked у radio настроек воспроизводится новым native RED; сохранение самого draft уже работало. Проверка периода использовала неверный ожидаемый формат текста; заменена точным сравнением полного доступного диапазона (семантика сохранена).

- green-final-3: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/green-final-3.log.

- typecheck-final-3: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/typecheck-final-3.log.

- Проверка `batch-green-3`: `python3 /home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011/checks3.py`; exit 0, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/batch-green-3.log`.

Итоговый повтор native GREEN: 10 suites, 120/120 PASS, exit0 (green-final-3.log/green-final-native.json), отдельный typecheck-final-3 exit0. После дополнительного radio RED будут повторены настройки и typecheck; браузерный адресный settings/period прогон повторяет все assertions этих поверхностей на шести сочетаниях. Полная строгая проверка native40 сохраняется в default сценарии и остаётся FAIL из-за запрещённой соседней карточки.

- Проверка `red-settings-radio`: `bash -c cd mobile && npm test -- --runTestsByPath src/features/settings/SettingsSections.test.tsx --testNamePattern="Г: radio"`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/red-settings-radio.log`.

Radio RED: exit1, один новый тест failed (27 существующих пропущены адресным pattern), ожидалось checked=true, фактически undefined. После этого добавлен checked рядом с сохранённым selected; product edit только SettingsSection. GREEN проверит весь SettingsSections (28 тестов), typecheck и браузер settings/period (24 кадра).

## Новые реальные native testID

- `mobile/app/history.tsx`: `history-filter-count`, `history-filter-scroll`, `history-filter-summary`, `history-filter-toggle`, `history-list-scroll`, `history-reset`.
- `mobile/src/features/integrations/AiUsagePanel.tsx`: `ai-usage-estimate`, `ai-usage-panel`.
- `mobile/src/features/integrations/IntegrationsSection.tsx`: `integration-inline-${provider}`.
- `mobile/src/features/navigation/MenuSheet.tsx`: `menu-group-${group.title}`, `menu-item-${item.href}`.
- `mobile/src/features/referrals/ReferralsSection.tsx`: `referral-link`.
- `mobile/src/features/settings/SettingsSection.tsx`: `settings-terminology`, `settings-terminology-${value}`, `settings-terminology-save`.
- `mobile/src/features/settings/ThemePreferenceSection.tsx`: `settings-theme`, `settings-theme-${value}`.
- `mobile/src/features/statistics/StatisticsSection.tsx`: `statistics-obligations`, `statistics-received-upcoming`.
- `mobile/src/shared/ui/FieldHelp.tsx`: `field-help-icon`.
- `mobile/src/shared/ui/components.tsx`: `page-header`.
- `mobile/src/features/billing/TariffFeatures.tsx`: `${marker}ai-estimate-${tariff._id}`, `${marker}tariff-feature-${tariff._id}-${key}`, `${marker}tariff-features-${tariff._id}`.
- `mobile/src/features/referrals/ReferralQr.tsx`: `referral-qr`, `referral-qr-image`.
- `mobile/src/features/statistics/MonthlyProfitChart.tsx`: `statistics-expected-caption`, `statistics-left-${month.monthKey}`, `statistics-month-${month.monthKey}`, `statistics-month-details`, `statistics-month-scroll`, `statistics-monthly-chart`, `statistics-profit-${month.monthKey}`.

## Изменённые и новые файлы

- `mobile/app/billing/index.tsx`
- `mobile/app/history.tsx`
- `mobile/src/features/attention/AttentionPresentation.tsx`
- `mobile/src/features/attention/AttentionScreen.test.tsx`
- `mobile/src/features/attention/AttentionScreen.tsx`
- `mobile/src/features/billing/PaymentHistory.tsx`
- `mobile/src/features/billing/types.ts`
- `mobile/src/features/history/HistoryRow.tsx`
- `mobile/src/features/integrations/AiUsagePanel.tsx`
- `mobile/src/features/integrations/CredentialIntegrationForm.tsx`
- `mobile/src/features/integrations/GoogleCalendarForm.tsx`
- `mobile/src/features/integrations/IntegrationRow.tsx`
- `mobile/src/features/integrations/IntegrationsSection.tsx`
- `mobile/src/features/integrations/ManagedIntegrationsSection.tsx`
- `mobile/src/features/integrations/TelegramSection.tsx`
- `mobile/src/features/navigation/MenuRow.tsx`
- `mobile/src/features/navigation/MenuSheet.tsx`
- `mobile/src/features/navigation/menu.test.tsx`
- `mobile/src/features/navigation/menu.ts`
- `mobile/src/features/navigation/moreRoute.test.tsx`
- `mobile/src/features/referrals/ReferralsSection.tsx`
- `mobile/src/features/settings/SettingsSection.tsx`
- `mobile/src/features/settings/SettingsSections.test.tsx`
- `mobile/src/features/settings/ThemePreferenceSection.tsx`
- `mobile/src/features/statistics/StatisticsSection.tsx`
- `mobile/src/features/statistics/sections.test.tsx`
- `mobile/src/features/statistics/statistics.ts`
- `mobile/src/shared/ui/FieldHelp.tsx`
- `mobile/src/shared/ui/FilterOverlay.tsx`
- `mobile/src/shared/ui/PeriodPicker.test.tsx`
- `mobile/src/shared/ui/PeriodPicker.tsx`
- `mobile/src/shared/ui/components.tsx`
- `mobile/src/shared/ui/primitives.test.tsx`
- `mobile/src/shared/ui/theme.ts`
- `docs/android-update/REPORT-D.md`
- `mobile/src/features/billing/TariffFeatures.tsx`
- `mobile/src/features/billing/aiEstimate.ts`
- `mobile/src/features/history/collapse.stageD.test.tsx`
- `mobile/src/features/integrations/inline.stageD.test.tsx`
- `mobile/src/features/referrals/ReferralQr.tsx`
- `mobile/src/features/statistics/MonthlyProfitChart.tsx`
- `mobile/src/features/statistics/monthlyStatistics.ts`
- `mobile/src/features/statistics/stageD.test.tsx`
- `mobile/src/shared/ui/helpIcon.stageD.test.tsx`
- `tests/components/androidStageD.browser.test.cjs`
- `tests/components/androidStageD.fixture.jsx`
- `tests/components/androidStageD.gates.cjs`

- green-settings-final: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/green-settings-final.log.

- typecheck-settings-final: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/typecheck-settings-final.log.

- browser-settings-period-final: exit 1, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/browser-settings-period-final.log.

- public-qr: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/public-qr.log.

Settings GREEN28/28 и typecheck exit0. Адресный browser settings/period: 24 кадра, exit1 только из-за отсутствия DOM aria-checked (6 раз), period assertions уже PASS. Проверено по реальному createDOMProps RN Web0.21: accessibilityState не отображается, поддерживается прямой aria-checked. RN SDK55 также объявляет этот alias в ViewAccessibility. Добавлен настоящий aria-checked в SettingsSection рядом с native checked/selected; адаптер UI не подменяется. Требуется последний адресный повтор. Анонимный реальный QR POST:200,image/png,3335 байт, декодирование совпало с синтетическим адресом; public-qr exit0.

- ux-gates-1: exit 1, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/ux-gates-1.log.

UX gates-1: 6/9 PASS (target24 и responsive на всех ширинах), overflow3 FAIL. Исходный vendor vis проверяет только собственный rect/style, не учитывает clip предков ScrollView; точные видимые области будут измерены отдельно. Обнаружен также дефект статического экспорта: отсутствие meta charset вызывает mojibake при file://. Добавлена UTF-8 метадата в новый стенд и экспорт gate; никаких UI/контрольных assertions не скрыто и vendor алгоритмы не изменены.

Измеренные значения на всех шести сочетаниях: PageHeader высота64/отступ12/нижняя граница1; title16px/24px/600; summary Важного40px с overflow-x:auto; на экране истории480px фильтры109px и список80px, не пересекаются видимыми контейнерами. Период: x0/y36/высота428/нижняя граница464 (insets24/16), ширина360/390/420; радиусы18px сверху и0 снизу. Светлый фон rgb(255,254,250), тёмный rgb(59,47,29), совпали с реальным вебом. Данные computed style/rect сохранены отдельно D/geometry-summary.json; полные измерения и PNG/HTML в scratch/browser-artifacts.

- original-browser-regression: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/original-browser-regression.log.

- eslint-harness: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/eslint-harness.log.

- Проверка `final-validation-batch`: `python3 /home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011/checks-final.py`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/final-validation-batch.log`.

Исходный mobileVisualParity: exit0, 30 состояний, 9/9 vendor UX gates PASS, failures0, source changes0. Каждый исходный экран также показал console errors0/escaped0/overlaps0 и успешные действия. Логи/JSON скопированы в D/original-browser; PNG/HTML сохранены scratch/original-browser-regression. ESLint новых трёх файлов стенда: exit0.

- green-settings-alias: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/green-settings-alias.log.

## Сравнение измерений до и после

Baseline-green-geometry.json содержит обе темы и три ширины. Размеры ниже получены в настоящем браузере; шапка здесь — вариант с длинным названием, подсказкой, счётчиком и кнопкой действия.

| Ширина / тема | Высота шапки до → после | Высота summary до → после | Ширина периода до → после |
|---|---:|---:|---:|
| 360 / светлая | 127.61 → 64 | 132 → 40 | 336 → 360 |
| 360 / тёмная | 127.61 → 64 | 132 → 40 | 336 → 360 |
| 390 / светлая | 127.61 → 64 | 132 → 40 | 340 → 390 |
| 390 / тёмная | 127.61 → 64 | 132 → 40 | 340 → 390 |
| 420 / светлая | 102.41 → 64 | 86 → 40 | 340 → 420 |
| 420 / тёмная | 102.41 → 64 | 86 → 40 | 340 → 420 |

Первый заголовок native: computed font-size24px до и16px после (реальный веб16px). Фильтр истории: высота36px до и40px после; период-trigger40px до и44px после. Это сравнение геометрии, а не доказательство Android font rasterization.

- typecheck-alias: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/typecheck-alias.log.

- browser-settings-period-alias: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/browser-settings-period-alias.log.

- Проверка `alias-final-batch`: `python3 /home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011/checks-alias.py`; exit 0, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/alias-final-batch.log`.

- green-all-targeted-final: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/green-all-targeted-final.log.

Процесс ожидания completion-batch (session27996) вернул143, без вывода. Дочерний green-all-targeted-final.log после этого продолжает обновляться; завершение каждого subprocess и его фактический code фиксируются отдельно checks-completion.py. Данный launcher не объявляется GREEN. Проверено16:37; ещё ожидаются итоговые записи.

- history-clipping: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/history-clipping.log.

Финальный адресный Jest:21 suites,305/305 PASS,131.997s,exit0 (не полный Jest). History clipping:12 сочетаний480/900px ×360/390/420 ×2темы,painted overlaps0,exit0. На360/390 и на коротком420 raw overlaps1, но оба прямоугольника не пересекаются в реально видимой области. Прогон после exit143 launcher продолжился, коды дочерних subprocess записаны checks-completion.py; vendor UTF-8 gates ещё выполняются.

- ux-gates-utf8: exit 1, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/ux-gates-utf8.log.

UTF-8 overflow повтор дополнительно выявил дефект экспорта модального состояния: background input биллинга оставался активным (фоновые buttons уже экспортировались disabled). В живом RN Web dialog перехватывает ввод; изменения только в snapshot(): input/select/textarea вне dialog тоже сохраняют неактивное состояние. Сам UI и vendor assertions не меняются. Требуется адресный настоящий billing render на6 сочетаниях и повтор gates после него. Предыдущие FAIL/логи сохранены.

- eslint-harness-final: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/eslint-harness-final.log.

- Проверка `completion-batch`: `python3 /home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011/checks-completion.py`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/completion-batch.log`.

- browser-billing-final: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/browser-billing-final.log.

- ux-gates-modal: exit 1, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/ux-gates-modal.log.

- eslint-modal-final: exit 0, журнал /home/aleksei/reports/vedelo/2026-10-11/update/D/eslint-modal-final.log.

- Проверка `modal-verification-batch`: `python3 /home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011/checks-modal.py`; exit 1, журнал `/home/aleksei/reports/vedelo/2026-10-11/update/D/modal-verification-batch.log`.

## Итог приёмки

Итоговый целевой Jest: 21 suites, 305/305 PASS, exit0. Это адресный набор этапа Г, не полный Jest. Последний typecheck-alias exit0. Radio-настройки отдельно28/28 PASS. Browser settings/period:24 состояния, exit0, errors0, warnings0, source changes0. Исходный mobileVisualParity:30 состояний,9/9 gates PASS,exit0. ESLint стенда exit0. Реальный анонимный QR:HTTP200,PNG3335 байт, декодирован точный синтетический URL.

Новый полный browser прогон сохранил156 состояний и console errors0/warnings0. Его exit1 сохранён: settings и period после него подтверждены отдельным GREEN24; биллинг и экспорт modal state — отдельным GREEN12; внешний target карты28×40 остаётся FAIL6/6. Совокупные последние измерения в D/browser-effective-measurements.json являются объединением фаз, а не поддельным полным GREEN. Нативный порог40 не ослаблен.

UX gates после исправления UTF-8: 7/9 PASS, 2/9 FAIL. Сами vendor скрипты и assertions не изменены. Отдельная проверка истории: 12 сочетаний480/900px ×360/390/420 ×2темы, видимых пересечений0; реальные raw/clip rects в D/history-clipping.json. При FAIL overflow нельзя объявить весь gate зелёным: учитываем конкретное инструментальное ограничение.

Функциональные IDs закрыты в области Г: HISTORY-01, STATS-01, STATS-02, AI-05, AI-06, MENU-01, MENU-02, REGISTER-02. VISUAL-01/04/06 выполнены по принадлежащим Г ролям и измерены; не объявляются окончательно принятыми на Android.

Оставшиеся ограничения:

- Нет ADB и production-авторизации: APK/боевые сценарии не проверены
- Полный Jest и интеграция Reviews/КП — родитель
- Оценки ИИ по текущим fallback helpers/aiIncludedEstimate.mjs: mobile DTO не передаёт динамические rates
- Mobile statistics DTO не передаёт isTransferred: отдельные счётчики переданных работ невозможно заполнить
- Строгий native40 gate: ссылка карты28×40 в запрещённом MobileEventCard; исправление соседнего этапа/родителя
- Общий vendor overflow не учитывает clip предков; история отдельно измерена при480/900px без видимых пересечений. Сам gate остаётся FAIL, не ослаблен
- VISUAL-01/04/06: результаты только для принадлежащих Г UI-ролей; rasterization APK, TalkBack, клавиатура, ListHeader/events и нижние вкладки требуют общей приёмки

Никаких commit/push/deploy/EAS, изменений версий/package/lockfile/backend/auth/offline/соседних Reviews/КП. Канонические node_modules остались симлинками, установки только scratch. Изменение matrix/ROADMAP/версий и общий выпуск — родитель. Для меню родитель добавляет exact routes /more/client-reviews и /more/review-page; заглушек нет. Оба исходных файла mobileVisualParity побайтово совпадают с baseline. Финальный список файлов и все команды/реальные коды содержатся в result.json.

Итоговая граничная проверка: HEAD35f9a64c29c0b8c078a0b54149a1949069a868ed сохранён; git diff --check exit0; protectedDiff пуст. Изменено34 существующих файла, создано13 новых (включая отчёт), всего47; исходный пользовательский BRIEF-D не включён в изменения. Сводные реальные источники отличаются от полного browser только новым harness и SettingsSection (последняя подтверждена адресно). Полный перечень/тестовые команды/журналы/коды/нативные маркеры/границы: D/result.json.
