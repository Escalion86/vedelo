# Визуальный паритет — отчёт этапа 1

Дата: 08.10.2026. Основание: `BRIEF-VISUAL-1.md`, текущие веб-компоненты и пользовательские снимки `scaled_22482.jpg` / `scaled_22483.jpg`. Аудит появился во время работы; начала реализации он не блокировал. При расхождении описания и реализации использовался текущий веб-код.

## Выполнено

- `mobile/src/shared/ui/QuickContacts.tsx`: узнаваемые телефон, WhatsApp, Viber, Telegram, VK, Instagram и почта из уже установленного FontAwesome5; MAX — белый текст на плашке 20 px. Внешняя цель нажатия 40 × 40, внутренняя плитка PWA 32 × 32, радиус 8, рамка, фон и небольшая тень. Подтверждённые и пробные контакты окрашены как в веб-коде; пробный MAX использует `red-500`, прочие пробные символы — `red-400`. Приоритет обозначен нижней границей 3 px и доступной подписью. Остаток открывается отдельной нейтральной кнопкой. Количество видимых кнопок зависит от доступной ширины; во вложенной области без явно переданного бюджета учитывается фактический `onLayout`, а не только ширина экрана; произвольный лимит четырёх каналов в карточке работы и двух в карточке клиента убран.
- `mobile/src/shared/ui/theme.ts`: добавлены отдельные роли для контактов, шапки, результата закрытой работы, отключённых push и подложки выбранной вкладки. Значения взяты из текущего веб-кода; legacy `colors` не изменён. Подложка выбранной вкладки — ограниченное нативное дополнение по прямому требованию брифа: у текущего `.mobile-bottomnav-item.active` в веб-коде задан только цвет, отдельного фона нет.
- `mobile/src/features/events/MobileEventCard.tsx`: любой источник, включая Cigam, использует нейтральную капсулу с рамкой, в тёмной теме именно `status.neutral`. Исправлены внутренние отступы, футер, размеры даты/денег, одна строка адреса, форма «Заявка» и «Обязательство», капсула положительного/нулевого/отрицательного итога. Минимум обычной карточки 184 px, прошедшей заявки — 248 px; фиксированной высоты нет, чтобы сохранить рост содержимого. Полное имя доступно через accessibilityLabel. Сохранены пустые проекции, статусы, оплата/договор, напоминания, дополнительные контакты, карта и действия.
- `mobile/app/(tabs)/events.tsx` и новый `mobile/src/shared/ui/ListHeader.tsx`: единая компактная шапка «Предстоящие/Прошедшие + форма plural текущего resolver», высота от 64 px, заголовок 16 px, счётчик 12 px в той же строке. Отдельный подзаголовок убран. Убрана также наследуемая верхняя пустая полоса Screen перед шапкой. Аватар/инициал открывает существующий профиль. Колокольчик PWA открывает новости платформы; такого нативного экрана нет, поэтому кнопка-заглушка и новый API не добавлялись.
- `mobile/src/features/clients/MobileClientCard.tsx`: адаптивные контакты, порядок имени как в вебе, компактный padding 10,4 px и минимум 178 px, обычный минимум 190 px, круг отключённых push 28 px, мобильная подпись счётчика «События». Свайпы, меню, удаление и навигация сохранены.
- `mobile/src/features/navigation/MobileBottomBar.tsx`: выбранный значок имеет видимую подложку с радиусом 8. Силуэты внимания, календаря и клиента приближены к PWA. FAB, safe area, бейдж, подменю, закрытие и переходы сохранены.

Открытие URL, нормализация/копирование MAX, подтверждение/отказ/«Не знаю», существующая мутация и invalidation клиентов сохранены. Контактные действия не открывают карточку. Алгоритмы offline, API, DTO, авторизация и доступ к данным не изменялись.

## Изменённые тесты

Регрессии: `QuickContacts.test.tsx`, `theme.test.ts`, `themeContrast.test.ts`, `MobileEventCard.test.tsx`, `EventsScreen.test.tsx`, `MobileBottomBar.test.tsx`; новый `MobileClientCard.test.tsx`.

Совместимость моков FontAwesome5: `ClientsScreen.test.tsx`, `ClientDetailScreen.test.tsx`, `EventDetailScreen.test.tsx`, `EventContactsSection.test.tsx`, `createScreen.test.tsx`, `fieldHelpIntegration.test.tsx`, `AttentionScreen.test.tsx`, `ClosingNavigation.test.tsx`. В последнем также добавлен тестовый AuthProvider-мок для нового рабочего аватара шапки и форма `plural` в мок терминологии. Production-веток ради Jest нет. Правки тестов «Важного» ограничены моками зависимостей; production AttentionScreen/TaskCard в этом этапе не редактировались.

## Проверки и доказательства

Все логи и вспомогательный стенд: `/home/aleksei/.hermes/cache/scratch/vedelo-visual-1-checks/`. Исходники затрагиваемых существующих файлов перед собственными правками сохранены в `before/`; пользовательские изменения сохранены.

Сначала добавлены регрессии и выполнены красные прогоны, затем реализация:

```bash
cd /home/aleksei/projects/vedelo/mobile
npm test -- --runTestsByPath src/shared/ui/QuickContacts.test.tsx src/shared/ui/theme.test.ts src/features/events/MobileEventCard.test.tsx src/features/events/EventsScreen.test.tsx src/features/navigation/MobileBottomBar.test.tsx
```

`red.log`:

```text
Test Suites: 5 failed, 5 total
Tests:       17 failed, 61 passed, 78 total
```

Дополнительные регрессии до соответствующих правок:

```bash
npm test -- --runTestsByPath src/features/clients/MobileClientCard.test.tsx
npm test -- --runTestsByPath src/features/events/MobileEventCard.test.tsx -t 'типографика PWA'
npm test -- --runTestsByPath src/shared/ui/themeContrast.test.ts
```

`red-client-extra.log`: 5 failed / 5 total; `red-card-extra.log`: 2 failed / 31 skipped / 33 total; `red-contrast.log`: 2 failed / 5 passed / 7 total. Падения выявляли нужные расхождения представления. Пропуски в проверке типографики — результат явного фильтра `-t`.

Первый и повторный зелёные прогоны сохранены в `green.log` и `green-retry.log`. Обнаруженные ошибки тестового стенда исправлены в тестах: явно задан viewport 390 вместо Jest-умолчания 750, MAX ищется как контактная кнопка без неоднозначности с надписью на значке, фон модального окна ищется с `includeHiddenElements`, поскольку он намеренно `accessible={false}`.

Финальные обязательные команды из корня репозитория:

```bash
npm --prefix mobile test -- --runTestsByPath src/shared/ui/QuickContacts.test.tsx src/shared/ui/theme.test.ts src/shared/ui/themeContrast.test.ts src/features/events/MobileEventCard.test.tsx src/features/events/EventsScreen.test.tsx src/features/navigation/MobileBottomBar.test.tsx src/features/clients/MobileClientCard.test.tsx src/features/clients/ClientsScreen.test.tsx
npm --prefix mobile run typecheck
git diff --check
```

`green-final.log`, код завершения 0:

```text
Test Suites: 8 passed, 8 total
Tests:       101 passed, 101 total
Snapshots:   0 total
Time:        274.253 s
```

Первый `typecheck.log` завершился с кодом 0. Промежуточный `typecheck-final.log` остановлен перед дополнительным исправлением вложенной ширины. После последней правки `typecheck-complete.log` завершился с кодом 0, без диагностик:

```text
> vedelo-mobile@1.1.2 typecheck
> tsc --noEmit
``` `git diff --check` завершился с кодом 0, без вывода.

Дополнительно проверены экраны-потребители и исправленные моки:

```bash
npm --prefix mobile test -- --testTimeout=30000 --runTestsByPath src/features/clients/ClientDetailScreen.test.tsx src/features/events/EventDetailScreen.test.tsx src/features/events/EventContactsSection.test.tsx src/features/events/createScreen.test.tsx src/features/events/fieldHelpIntegration.test.tsx src/features/attention/AttentionScreen.test.tsx src/features/attention/ClosingNavigation.test.tsx
```

`consumers.log`, код завершения 0:

```text
Test Suites: 7 passed, 7 total
Tests:       83 passed, 83 total
Snapshots:   0 total
Time:        391.578 s
```

Таймаут поднят только аргументом запуска из-за нагрузки параллельных проверок, конфигурация Jest не менялась.

Дополнительно после основного зелёного прогона проверена вложенная область шириной 240 px при экране 390 px:

```bash
npm --prefix mobile test -- --runTestsByPath src/shared/ui/QuickContacts.test.tsx -t 'вложенная узкая область'
```

`red-nested-width.log`: 1 failed / 19 skipped / 20 total; ожидаемый предел 6 кнопок, фактически было 8. После этого общий ряд получил измерение контейнера. Повторена указанная выше команда восьми точечных наборов, `green-complete.log`, код завершения 0:

```text
Test Suites: 8 passed, 8 total
Tests:       102 passed, 102 total
Snapshots:   0 total
Time:        149.002 s
```

После удаления наследуемого верхнего padding дополнительно выполнено:

```bash
npm --prefix mobile test -- --runTestsByPath src/features/events/EventsScreen.test.tsx -t 'единая шапка'
```

`header-final.log`: 2 passed / 4 skipped / 6 total, код 0. Пропуски — результат фильтра `-t`; все шесть тестов экрана уже прошли в полном точечном наборе.

Проверка включает светлую/тёмную темы, ширины 320/390/414, восемь каналов, приоритет, URL без открытия работы, MAX со ссылкой и номером, ошибку копирования, сохранение отказа и invalidation, дополнительные контакты, все бизнес-статусы, пустые значения, частичную оплату, прошедшую заявку и три знака финансового итога. Белая надпись пробного MAX повторяет PWA: отдельно проверяется контраст не ниже 3:1; общий порог 4,5:1 для прочих текстовых пар сохранён.

Дополнительный полный `npm test -- --silent` начал выполняться на параллельно изменявшемся дереве. Он остановлен, чтобы снизить нехватку памяти во время обязательных проверок. В нём прошли карточка работы, ClosingNavigation и нижняя панель, но новый тест параллельного этапа «Важное» превысил таймаут 5000 ms. `full-jest.log` не является доказательством успешного полного Jest; тот же тест «Важного» прошёл в дополнительном наборе `consumers.log` с таймаутом 30 секунд; production-файлы этапа 2 ради него не менялись.

## Визуальная проверка и ограничения

В scratch подготовлен браузерный стенд `visual.cjs`, который подключает реальные изменённые компоненты, палитры и установленные иконные шрифты, заменяя нативные примитивы DOM-адаптером. Он проверяет обе темы при 320/390/414/1024 px, отсутствие горизонтального переполнения, раскрытие каналов, переход VK без открытия карточки и переход аватара в профиль. Снимки `preview-<ширина>-<тема>.png` используются для проверки внешнего вида. Команда:

```bash
node /home/aleksei/.hermes/cache/scratch/vedelo-visual-1-checks/visual.cjs
```

`visual-complete.log` / `visual-result.json`: 8 сочетаний прошли, для каждого `overflow: false`, `errors: []` (pageerror и console.error), код завершения 0. Снимки светлой и тёмной тем просмотрены. Это вспомогательная проверка компоновки, цветов и значков, а не React Native/Android-приёмка.

`adb devices` не обнаружил устройств. Проверка установленного APK на телефоне, нативного системного масштабирования текста, внешних приложений/Clipboard и жестов остаётся отдельной приёмкой владельца. В этапе 1 бинарные шрифты и логотип 2ГИС не добавлялись: бриф запрещает новые бинарные ресурсы. Параллельная работа подключила общий токен `typography.fontFamily`; новая шапка использует этот готовый токен без создания собственных ресурсов; карта сохраняет рабочий переход и установленный векторный значок. Новости платформы, переписки, отзывы и КП не переносились; это вне этапа 1. AttentionScreen/TaskCard и остальной этап 2 остаются за отдельной работой.

С моей стороны коммитов, push, EAS-сборок и правок версии/сборочной конфигурации, веб-компонентов, ROADMAP и AGENTS нет. Параллельные изменения в этих и других файлах не откатывались и не включены в перечень собственного результата этапа 1.
