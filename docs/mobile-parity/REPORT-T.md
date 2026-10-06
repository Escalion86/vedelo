# Заход T — AJ: выбор темы и системная строка состояния

Дата: 2026-10-04. Репозиторий `/home/aleksei/projects/vedelo`, ветка
`mobile-parity`. Реализован программный объём BRIEF-T; проверка на Android
остаётся открытой. Реализация выполнена Codex `gpt-6.1-sol` по брифу родителя;
родитель проводит независимую проверку. Коммитов, staging,
fetch/push/PR со стороны исполнителя, изменения версий и Android-конфигурации нет.

## Контекст и аудит до включения

Прочитаны AGENTS.md, полный AI_HANDOFF, Mobile Track ROADMAP,
UI_CONVENTIONS, дизайн-контракт/AJ/приёмка MOBILE_PWA_PARITY,
PLAN-CONTINUE, STATUS и REPORT-S. Приоритет прямых границ BRIEF-T соблюдён:
ROADMAP/STATUS/PLAN не редактировались. Виджет и определитель звонков не входят
в T и не реализовывались.

Все 37 маршрутов просмотрены вместе с их контролами и локальными импортами.
Граф после реализации: 208 файлов / 103 TSX, без неразрешённых локальных
импортов. Единственный legacy-import `colors` остался в `more/[section].tsx`:
его локальные Integration/IntegrationState/FilterChip/Metric недостижимы,
а используемые секции уже тематические. Этот файл не менялся. Параметры
`colors: Palette` в других файлах не принимались за legacy-import.
Достижимых неизменяемых светлых экранов не найдено; forcedMode в AppProviders
снят только после этого аудита.

Полный перечень маршрутов, оставшихся цветов, обоснование достижимости,
измерения контраста и границы проверки — [THEME-AUDIT-T.md](THEME-AUDIT-T.md).
Эталон сверялся с текущим `app/globals.css`, включая пары primary/secondary,
обе поверхности, статусы, `.mobile-bottomnav-*` и брендовые контакты.

## Реализация

- В Настройках появилась отдельная секция «Тема приложения»: «Светлая»,
  «Тёмная», «Как на устройстве». Доступные radio с checked, минимум 48 dp,
  перенос текста и выделение выбранного варианта. Выбор применяется сразу,
  даже во время чтения SecureStore и HTTP-настроек организации.
- Настройка локальна для устройства и работает без сети. Тема не использует
  API, SQLCipher, outbox или серверную терминологию. Используются прежний
  ThemeProvider, SecureStore и ключ `vedelo.ui.theme.preference.v1`.
- ThemeProvider сохраняет валидацию light/dark/system, прежний light fallback,
  защиту от позднего чтения и очередь последовательных записей. Добавлены
  явные состояния idle/saving/saved/error и защита обновлений состояния после
  размонтирования; синхронный отказ адаптера чтения также обрабатывается.
  Устаревшая запись/ошибка не меняет состояние последнего выбора.
- «Сохранено» показывается только после успешной записи последнего выбора.
  При отказе тема остаётся применённой, сохранение после перезапуска явно
  не подтверждено; есть «Повторить сохранение темы» для текущего выбора.
  Быстрые переключения разрешены и записываются в исходном порядке.
- System использует существующий useColorScheme: смена темы устройства
  меняет palette, не перезаписывая сохранённое предпочтение system.
- ThemeSystemUI задаёт светлые значки на dark и тёмные на light, в том числе
  во время auth-loading. У StatusBar нет backgroundColor/translucent.
  Фон рисуют root/Screen/навигационные scene; уже установленный expo-system-ui
  дополнительно обновляет native root. Его async-вызовы сериализованы между
  сменами темы и повторными mount; устаревшие ожидающие вызовы пропускаются,
  rejection обработан без сырых ошибок и без обновления React state.
- Исходные три эффекта RootNavigator, подписки, cleanup, маршрутизация,
  auth/referral/sync/push/database и порядок providers сохранены.
  AST-регрессия S не ослаблялась и осталась побайтно прежней.
- Точечные исправления контраста относятся к реальным потребителям: текст
  выбранной строки и календаря, метаданные выбранных элементов/исходящих
  сообщений/баланса/финансовых итогов, подписи нижней панели, числовые бейджи,
  текст пробного MAX и плюс dark FAB. Нет массовой замены hex/регулярных
  выражений. Сами брендовые фоны и финансовые маркеры сохранены.
- Все четыре собственных TextInput получают keyboardAppearance; у ранее
  неявных индикаторов работ/формы/обзора задан palette.primary. Это только
  оформление, не изменение загрузки/ввода/алгоритмов сохранения.

## Точные файлы захода

Изменены 31 существовавший файл. Пути ниже относительно репозитория:

```text
mobile/app/_layout.tsx
mobile/app/(auth)/_layout.tsx
mobile/app/(tabs)/_layout.tsx
mobile/app/(tabs)/finance.tsx
mobile/app/billing/index.tsx
mobile/app/clients/[id]/merge.tsx
mobile/app/events/[id].tsx
mobile/app/events/edit/[id].tsx
mobile/app/onboarding/index.tsx
mobile/app/support/new.tsx
mobile/src/features/attention/AttentionScreen.tsx
mobile/src/features/auth/LayoutPresentation.test.tsx
mobile/src/features/conversations/ConversationDetail.tsx
mobile/src/features/events/ClientPickerField.tsx
mobile/src/features/events/EventCalendar.tsx
mobile/src/features/integrations/GoogleCalendarForm.tsx
mobile/src/features/integrations/IntegrationRow.tsx
mobile/src/features/navigation/MenuRow.tsx
mobile/src/features/navigation/MobileBottomBar.tsx
mobile/src/features/navigation/MobileBottomBar.test.tsx
mobile/src/features/profile/ArtistRequisitesSection.tsx
mobile/src/features/settings/SettingsSection.tsx
mobile/src/shared/providers/AppProviders.tsx
mobile/src/shared/ui/CompactField.tsx
mobile/src/shared/ui/FilterOverlay.tsx
mobile/src/shared/ui/QuickContacts.tsx
mobile/src/shared/ui/QuickContacts.test.tsx
mobile/src/shared/ui/ThemeProvider.tsx
mobile/src/shared/ui/ThemeProvider.test.tsx
mobile/src/shared/ui/components.tsx
mobile/src/shared/ui/theme.ts
```

Добавлены восемь файлов:

```text
mobile/src/features/settings/ThemePreferenceSection.tsx
mobile/src/features/settings/ThemePreferenceSection.test.tsx
mobile/src/shared/ui/ThemeSystemUI.tsx
mobile/src/shared/ui/ThemeSystemUI.test.tsx
mobile/src/shared/ui/AppProvidersTheme.test.tsx
mobile/src/shared/ui/themeContrast.test.ts
docs/mobile-parity/THEME-AUDIT-T.md
docs/mobile-parity/REPORT-T.md
```

До правок сохранён SHA-256 manifest 2628 tracked/untracked файлов без `.env*`.
2597 файлов вне 31 перечисленного существовавшего файла сохранены побайтно;
удалений нет. Прежние H–S сохранены, изменения в пересекающихся файлах только
добавляют тему/представление и соответствующие assertions. ROADMAP, STATUS,
PLAN-CONTINUE, BRIEF/REPORT H–S, прежний more/[section].tsx и регрессия AST
сохранены побайтно. Контрольный manifest и служебные скрипты аудита находятся
в `/tmp`, не являются проектными артефактами.

Не менялись storage/sync/domain/types, server/API/web, конфигурации Android,
package ID/deep links, зависимости/lockfiles, версии и бинарные assets.
Tenant-проверки/авторизация/контракты Events и legacy не переустраивались.
PartyCRM и административный функционал не затронуты.

## Новые и уточнённые тесты

Четыре новых набора / 18 тестов:

- ThemePreferenceSection — 6: реальное обновление Surface/CompactField/Button,
  поздняя hydration, быстрые переключения, задержанное/неудачное сохранение
  и явный повтор, отказ чтения, выбор при pending HTTP/offline терминологии,
  system и отсутствие HTTP/cache-вызовов у локальной секции.
- ThemeSystemUI — 5: оба режима значков/фона, отсутствие устаревших свойств,
  сериализация/пропуск устаревшего выбора, rejection, unmount/remount.
- AppProvidersTheme — 2: восстановление dark/system настоящим production
  AppProviders без forcedMode, системная смена light/dark.
- themeContrast — 5: 91 текстовая пара для каждой темы с альфа-композитингом,
  плюс FAB по 3:1 и регрессия конкретных прежних неудачных сочетаний.

В прежний ThemeProvider.test добавлены 4 теста состояния сохранения,
позднего read rejection, последовательных отказов/повтора, синхронного отказа
read и unmount; существующие restart/system/невалидное значение/быстрые
записи сохранены. В двух местах deferred-тесты теперь ожидают запуск read/write
через микрозадачу перед завершением Promise.

LayoutPresentation проверяет значки и при auth-loading, и после загрузки в
обеих темах, сохраняя assertions подписок/cleanup. QuickContacts проверяет
контрастный foreground пробного MAX и прежний белый подтверждённого.
MobileBottomBar дополнительно проверяет foreground подписи и счётчика.
Регрессия S по семи эффектам/операциям и реферальный flow не редактировались.

Все проверки используют моки native/API/Storage/auth; реальных запросов,
записей SecureStore устройства, платежей и доставки сообщений не выполнялось.

## Проверки и фактический вывод

Финальные отдельные команды из `mobile/`:

```text
npm run typecheck
> vedelo-mobile@1.1.0 typecheck
> tsc --noEmit
exit 0
```

Полный прогон завершён и ожидался до фактического exit 0:

```text
npm test
> vedelo-mobile@1.1.0 test
> jest --runInBand
Test Suites: 132 passed, 132 total
Tests:       1296 passed, 1296 total
Snapshots:   0 total
Time:        400.148 s, estimated 404 s
Ran all test suites.
exit 0
```

Относительно базы S (128 наборов / 1274 теста) добавлены 4 набора / 22 теста.
Процесс не прерывался транспортным лимитом; stdout/stderr считывались
процессным инструментом. В полном наборе остаются прежние предупреждения
об Expo Go push и не заданном тестовом EXPO_PUBLIC_API_BASE_URL; новые
предупреждения/секреты не добавлены.

Целевые успешные прогоны:

```text
npm test -- --runTestsByPath src/shared/ui/ThemeProvider.test.tsx src/shared/ui/ThemeSystemUI.test.tsx src/features/settings/ThemePreferenceSection.test.tsx src/features/settings/SettingsSections.test.tsx
Test Suites: 4 passed, 4 total
Tests:       51 passed, 51 total
Snapshots:   0 total
Time:        27.863 s
exit 0

npm test -- --runTestsByPath src/shared/ui/themeContrast.test.ts src/shared/ui/AppProvidersTheme.test.tsx
Test Suites: 2 passed, 2 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        10.593 s
exit 0
```

Промежуточные ошибки не засчитываются как проверенный результат:
первый typecheck был ошибочно вызван из корня (exit 1: Missing script);
мобильный typecheck затем нашёл две inline-ссылки на palette без hook
(exit 2), они заменены именованными стилями фабрики. Первый целевой Jest
нашёл два deferred-теста с прежним синхронным ожиданием (2 failed / 22 passed,
exit 1); ожидание микрозадачи исправлено. Другой промежуточный вызов указал
ещё не созданные файлы/неверное имя Conversations-теста, а старые assertions
MAX ожидали белый trial-текст (4 набора failed / 2 passed, 2 теста failed /
32 passed, exit 1). Пути и assertions исправлены; полная проверка покрывает
настоящий ConversationDetail.test и остальные прежние наборы.

Контраст исправленных пар: selectionText 4,70/9,98, метаданные выбора
8,65/9,88, календарь 4,82/9,58, подпись навигации 4,66/5,43,
счётчик 4,83/4,83, пробный MAX 6,20/6,20, плюс FAB 4,66/7,59.
Полные группы и намеренные остатки приведены в THEME-AUDIT.

`git diff --check` — exit 0, вывод пуст. `git diff --cached --stat` — exit 0,
вывод пуст. Полный web build/ESLint и EAS не запускались: web не менялся,
а native-сборка прямо исключена границами захода.

## Остаётся для устройства

Android/реальный SecureStore и перезапуск, системная строка edge-to-edge,
возврат из фона при смене системной темы, insets и gesture/button navigation,
TalkBack, аппаратный Back, IME/клавиатура, 320/390 dp и увеличенный шрифт,
native Alert/picker/share/OAuth и скриншотное сравнение PWA/APK не проверены.
Цветовые пары и Jest-дерево не заменяют эту приёмку.

До окончания SecureStore hydration остаётся прежний light fallback: возможен
короткий светлый кадр при cold start с сохранённой dark. Нативная splash также
сохраняет прежний светлый фон: Android-конфигурация не менялась.
`userInterfaceStyle: automatic` уже задан в app.json и не переопределяется
app.config.js; эти файлы проверены только чтением. Тема onboarding
остаётся прежним серверным полем, независимым от локального предпочтения
устройства. Намеренные брендовые значки, pressed/disabled opacity и градиенты
требуют отдельной нативной оценки; полный доступный/визуальный паритет
не объявляется. Ограничения предыдущих H–S не закрывались.

T/AJ реализован в коде; M1-T10, M1-T7, AK и production остаются открытыми.
Родитель обновил STATUS/ROADMAP. Версии не повышались.

## Независимая проверка родителем

- `npm run typecheck` в mobile — код 0.
- Повторный полный `npm test` — код 0: **132 набора / 1296 тестов**, 438,106 с. Лог: `/home/aleksei/.hermes/cache/scratch/t-independent-jest.log`.
- `git diff --check` и проверка отсутствия staging — код 0. Ветка mobile-parity, отношение origin/HEAD — `0 0`, коммитов/push нет.
- Независимый AST-граф всех 37 маршрутов: 208 файлов / 103 TSX, неразрешённых локальных импортов нет. Единственный legacy colors — старые невызываемые локальные компоненты more/[section]; его файл сохранён. Скрипт: `/home/aleksei/.hermes/cache/scratch/t-graph-audit.cjs`.
- В контрольном снимке родителя 2628 файлов: изменены 31 разрешённый файл реализации и ROADMAP (журнал родителя); остальные 2596 совпали побайтно перед финальным обновлением документации. Защищённый domain/types.ts сохранил SHA-256 `4e1ffb0f4247991be7374ecb4333b809f356cd49c89d2163fd8f6dbc5babf57e`.
- Новые посторонние маркетинговые изображения, появившиеся в рабочей копии параллельно проверке, не входят в заход и не трогались. Приёмка Android и внешних API не заявляется выполненной.

