# Нативный выбор периода — отчёт

Этап BRIEF-MOBILE, 2026-10-09. Реализация и обязательные локальные проверки завершены. Commit/push/deploy/APK не выполнялись.

## До реализации

Новый настоящий RNTL-тест `mobile/src/shared/ui/PeriodPicker.test.tsx` создан до компонента.
`npm --prefix mobile test -- --runTestsByPath src/shared/ui/PeriodPicker.test.tsx` — **exit 1**, 1 failed suite, 0 executed tests: `Cannot find module './PeriodPicker'`. Лог: `/tmp/vedelo-period-red.log`.

Бриф сообщает успешный исходный typecheck. Дополнительный typecheck запущен уже после добавления красного теста: это не чистый baseline. Исходные связанные Jest-тесты запускаются до изменений потребителей.

Исходный focused Jest: **exit 1**, 5 suites (4 passed / 1 failed), 82 tests (81 passed / 1 failed). Падение до реализации потребителей: `история light, diff и compact filters на токенах темы` — ожидание `Изменение 1` не успело завершиться. Остальные тесты истории, финансов, domain filters/API прошли. Лог `/tmp/vedelo-period-baseline.log`.

Первый прогон общего компонента: **exit 1**, 30 tests (28 passed / 2 failed). Причины тестовых запросов: пресет «Сегодня» совпал с текстом закрытого поля (нужен scope модальной панели), декоративная точка намеренно скрыта от accessibility (нужен `includeHiddenElements`). Запросы исправлены; доступность активного дня проверяется на самой кнопке через hint.

`adb devices` — **exit 0**, список устройств пуст. Реальный Android, TalkBack, аппаратная клавиатура, системная клавиатура и визуальная геометрия на устройстве не проверены.

## changed_files

- `mobile/src/shared/ui/PeriodPicker.tsx` — общий контрол React Native.
- `mobile/src/shared/ui/periodPickerDates.ts` — строгая календарная валидация, локальные пресеты и подписи (без сериализации timestamp).
- `mobile/src/shared/ui/PeriodPicker.test.tsx`, `periodPickerDates.test.ts` — настоящие RNTL и чистые calendar helper тесты.
- `mobile/src/features/finance/TransactionPeriodFilter.tsx`, `TransactionPeriodFilter.test.tsx` — thin adapter и интеграционные проверки.
- `mobile/app/history.tsx` — общий период и атомарное состояние двух границ.
- `mobile/src/features/finance/FinanceScreen.test.tsx`, `mobile/src/features/history/HistoryScreen.test.tsx` — регрессии реальных экранов/фильтрации.
- `docs/period-picker/REPORT-MOBILE.md` — этот отчёт.

## Сохранённые контракты

Финансы: прежние props `range/onChange/activeDates`, `{from,to}` YYYY-MM-DD. Данные, `selectTransactions`, расчёт activeDates, признаки типа/связи, обязательства, empty/offline и экран не изменены. Контекстные «Завтра» и «На выходных» применяются сразу; выходные вычисляются прежним `nextWeekend`. Открытые границы и включённый конец дня по-прежнему обрабатывает domain helper.

История: обе даты хранятся одним объектом, `onChange` применяет его за один state update; downstream поля `dateFrom/dateTo`, `dateRangeError`, `useHistory`, collapse/reset/fixed route сохранены. Прежние UTC-start + local-end и API serialization не менялись. Черновик с ошибкой оставляет прежний список/запрос, а не отправляет некорректный фильтр.

Tenant/API/auth/offline cache/очереди/routes/deep links не менялись. Связанные history-тесты сохраняют проверки foreign/missing entity, 403, смены tenant/user и поздних ответов. Shared theme/components/CompactField/FilterOverlay, web-файлы, версии/package/configs/roadmap/handoff не менялись в этом этапе.

## Паритет и границы проверки

Песочная подпись `palette.generalText`, поле на `palette.surface/border`, календарь и шеврон, круглый сброс; стандартные Button/CompactField/typography. Пресеты → отдельный календарный шаг → ручной ввод по запросу; при ручном вводе календарь скрыт, селекторов месяца/года нет. Presets применяются сразу; draft apply атомарный; cancel/назад/внешнее закрытие/Android `Modal.onRequestClose` не применяют draft. Одна дата допустима, пустые границы допустимы, конец включён. Selected дни имеют ✓, active дни — точку и доступный hint «Есть транзакции».

Нативная панель центрируется с safe-area и ограничением viewport, ScrollView содержит Apply/Cancel, KeyboardAvoidingView учитывает клавиатуру. Структурная RNTL-проверка 280×360 подтверждает ограничения и наличие controls внутри scroll; это не измерение Yoga/layout и не визуальная приёмка на телефоне. Цвета двух тем проверяются по реальным palette-токенам. Скриншоты Android/фактическая клавиатура/TalkBack не проверены: `adb devices` не обнаружил устройство. WebView, зависимости и бинарные ассеты не добавлялись.

Дополнительный typecheck после создания красного теста, до реализации: **exit 2**, TS2307 (компонент отсутствует). Не считается чистым baseline.
Промежуточный shared прогон: **exit 1**, 2 suites (1 failed / 1 passed), 32 tests (2 failed / 30 passed); он стартовал до уточнения тестовых запросов. Финальный прогон запущен после исправления этих запросов.

Промежуточный интеграционный прогон остановлен **exit 130**, после повторного таймаута первого history-теста и успешных 3 тестов thin adapter; он дублировал итоговый focused прогон. Параллельный промежуточный typecheck также остановлен для последовательной итоговой проверки. Нагрузка нескольких тяжёлых Node-процессов в этой среде оказалась неудачной; незавершённые прогоны не засчитываются как успешные.

Первый итоговый focused прогон: **exit 1**, 8 suites (7 passed / 1 failed), 119 tests (118 passed / 1 failed), 341.96 s. Все реальные history/finance и adapter/domain/API проверки прошли; единственное падение — matcher `toHaveAccessibilityState` отсутствует в установленной RNTL. Заменён на проверку реального `accessibilityState` через поддерживаемый `toHaveProp`; UI не заглушается. Лог `/tmp/vedelo-period-focused-final.log`.

Перед заключительным прогоном уточнена видимая отметка выбранного пресета: стандартный primary Button и ✓ с прежним доступным именем. Перезапуск с `TZ=Asia/Krasnoyarsk` до этого уточнения остановлен (exit 130), чтобы заключительные проверки читали зафиксированную версию файлов.

## Заключительные проверки

`TZ=Asia/Krasnoyarsk npm --prefix mobile test -- --runTestsByPath src/shared/ui/PeriodPicker.test.tsx src/shared/ui/periodPickerDates.test.ts src/features/finance/TransactionPeriodFilter.test.tsx src/features/finance/FinanceScreen.test.tsx src/features/history/HistoryScreen.test.tsx src/features/history/filter.test.ts src/features/history/api.test.ts src/features/finance/filters.test.ts` — **exit 0**, **8 suites / 119 tests passed**, 281.557 s. Без skipped и snapshots. Лог `/tmp/vedelo-period-focused-green.log`.

Покрытие: общий контрол (30 тестов), UI calendar helpers, adapter финансов, реальные FinanceScreen/HistoryScreen, прежние history API/filters и finance filters. Общий контрол/потребители/Button/CompactField/FilterOverlay/theme/domain/useHistory настоящие. Заглушки только API/cache/auth/router/native bridges и источники данных; компонент PeriodPicker не заглушается. Первый focused прогон с прежним default TZ также проверил все потребительские наборы (118 passed, единственная ошибка matcher указана выше); заключительный прогон дополнительно проверяет Asia/Krasnoyarsk.

Проверка типов выполняется последовательно после green Jest. Во время ожидания среда сильно загружена: `free -m` / `/proc/loadavg` показали RAM 7678 MiB (доступно 819 MiB), swap 3839 MiB (использовано 3837 MiB), load average 40.92 / 28.16 / 18.63. Проверка cgroup-файлов недоступна, диагностическая команда exit 1 из-за отсутствия этих файлов. Результат незавершённого typecheck не засчитывается.


`npm --prefix mobile run typecheck` — **exit 0**, весь mobile-проект, без новых ошибок и без изменения TypeScript/build конфигурации. Лог `/tmp/vedelo-period-typecheck-final.log`.

`git diff --check` — **exit 0** (повторён после завершения отчёта).

Полный Jest не запускался: проверены все изменённые сценарии и связанные history/finance domain/API наборы; focused прогон занимает почти пять минут в перегруженной среде. `financeEditReturn.test.tsx` (возврат из редактора транзакции) и остальные несвязанные наборы не запускались, эти сценарии/маршруты не менялись. Web build/браузерная приёмка/web-контрол не входят в нативный этап; APK/deploy запрещены брифом и не выполнялись.

## Итог и blockers

Код этапа готов к независимой проверке родителем, обязательные локальные проверки зелёные. Открытых локальных blockers нет. Непроверенные внешние условия: реальный Android/системная клавиатура/визуальная геометрия и TalkBack (нет устройства), реальные HTTP/production и самостоятельная общая приёмка web/native родителем. Нагрузка среды замедлила проверки, но заключительные Jest/typecheck завершились успешно. Версии и roadmap не менялись по явному ограничению брифа; чужие изменения сохранены.
