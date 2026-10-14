# Клиент на карточке мероприятия: загрузка и восстановление

Web/PWA, версия **1.35.7**, базовый коммит `74269df`, ветка `fix/client-loading-cards`.
Рабочая копия: `/home/aleksei/.hermes/cache/scratch/vedelo-client-loading`.

## Корневая причина

1. `server/fetchProps.js` возвращал `clients: []` как для успешного пустого
   списка, так и для страницы без загрузки клиентов или общего сбоя SSR.
   Ошибка отдельного чтения клиентов также отбрасывала уже полученные мероприятия.
2. `app/cabinet/[page]/page.js` дополнительно превращал отсутствующий список в `[]`.
3. `StateLoader` вызывает `useCabinetStateHydration` перед показом содержимого.
   Hydration безусловно записывала этот `[]` через `setQueryData` как успешный
   свежий результат и могла затереть уже существующий клиентский кэш.
4. `AppQueryProvider` задаёт `staleTime: 30_000`, отключает refetch при фокусе,
   разрешает один повтор чтения, запрещает автоматический повтор mutations.
   Свежий фиктивный `[]` блокировал первоначальный GET. Само истечение staleTime
   **не запускает запрос по таймеру** — поэтому ожидание не гарантировало исправление.
5. `useClientsQuery` превращал повреждённый успешный HTTP-ответ в `[]`.
   `EventCard` использовал только `data`, подставлял `[]` во время ожидания,
   а любой не найденный объект объявлял «Клиент не указан».
   Карточки не передают `initialData` в hook: фиктивный успех приходил именно
   из hydration, а не из параметра `useClientsQuery`.
6. `useServerSync` не перехватывает GET: его offline-очередь относится к записям.
   Восстановление общего чтения обеспечивается TanStack Query/onlineManager,
   а не повтором мутаций или ручной перезагрузкой страницы.

## Исправление и контракт

- SSR `clients: null` означает «список не получен»: пропуск загрузки или сбой.
  Массив, включая `[]`, означает успешное полное чтение.
- Ошибка чтения клиентов возвращает `null`, но сохраняет остальные SSR-данные;
  диагностическое предупреждение не содержит ответа БД или персональных данных.
- Hydration записывает клиентов в Query/Jotai только при настоящем массиве.
  Неизвестное SSR-состояние не затирает имеющийся клиентский кэш.
- Общий `queryKeys.clients()` сохранён: не добавлено запросов по ID на карточку.
  GET проверяет форму ответа, получает AbortSignal, делает не более одного
  автоматического повтора и обновляется при восстановлении сети.
- Provider и `useServerSync` не изменены. Автоматический retry мутаций остаётся `0`.
  Отдельный тест проверяет по одной попытке неуспешных POST и PUT.
- Карточка различает состояния:

| Условие | Клиентская часть карточки |
| --- | --- |
| Нет `clientId` | Прежнее настоящее пустое состояние и доступная подпись «Клиент не указан» |
| ID есть, объект ещё ждёт ответ | «Загрузка клиента…», `role=status`, `aria-busy=true` |
| Запрос приостановлен offline | «Нет сети — ждём подключения» |
| Чтение окончательно завершилось ошибкой | Компактный стандартный `Notice`, безопасный текст и кнопка «Повторить» |
| Клиент уже найден в кэше, фоновой запрос ошибся | Имя и контакты остаются видимыми |
| Успешный полный список не содержит ID | «Клиент не найден», без ложного «не указан» |

Ожидание затрагивает только клиентскую строку. Заголовок, дата, суммы и остальные
части мероприятия не заменяются скелетоном. Поздний ответ, ручной повтор и online
обновляют ту же карточку без remount. Повтор не открывает мероприятие и не
отменяет уже выполняющийся общий запрос.

Ошибка помещается в фактическую фиксированную строку списка **194 px**. Кнопка
имеет высоту не меньше 40 px и доступна с клавиатуры. Только при наличии новой
кнопки повтора оболочка получает `role=group`, чтобы не создавать вложенный
`role=button`; прежняя разметка успешной карточки сохранена.

## RED до исправления

На исходном чистом дереве выполнены:

```bash
node --test tests/components/clientLoadingSsr.test.cjs
```

После исправления только загрузчика тестовых модулей: **4 failed / 0 passed**.
Ожидаемые провалы: SSR и page normalizer возвращали `[]` вместо `null`.
В тесте ошибки отдельного чтения использовалась реальная `fetchProps` с
подменёнными моделями, а не подменённая логика загрузки.

Браузерный тест `--test-name-pattern='задержанный список'` на исходном коде:
**1 failed / 0 passed**, ожидание клиентского `role=status` завершилось timeout.
Стенд воспроизводит порядок StateLoader: сначала настоящая hydration, затем
монтируются карточки. Фиктивный свежий `[]` подавлял GET и выдавал ложное отсутствие.

## Повторная проверка и GREEN

Команды выполняются из рабочей копии. Для браузерного стенда нужны esbuild,
Playwright и axe-core. На этом стенде вспомогательные пакеты установлены отдельно:

```bash
npm install --prefix .qa-tools --no-package-lock --ignore-scripts --no-audit --no-fund esbuild axe-core

ESBUILD_MODULE="$PWD/.qa-tools/node_modules/esbuild" \
PLAYWRIGHT_MODULE=/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/aleksei/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome \
QA_SCREENSHOT_DIR="$PWD/.qa-output/client-loading" \
node --test tests/components/clientLoading.browser.test.cjs
```

**10 passed / 0 failed / 0 skipped.** Проверены задержанный ответ, единственный
общий GET для нескольких карточек, ограниченный автоматический повтор,
окончательная ошибка и ручной повтор, повреждённый HTTP 200, offline-пауза,
восстановление после ошибки, сохранение клиента из кэша при фоновой ошибке и
неполной SSR hydration, отсутствие ID, ненайденный ID после успеха и отсутствие
автоматических повторов POST/PUT. DOM-узел карточки сохраняется.

Настоящие `AppQueryProvider`, TanStack Query, `useCabinetStateHydration`,
`useClientsQuery`, `apiJson`, `EventCard`, `Notice`, `AppButton` и глобальный CSS
не подменены. Подменены только связанные с другим функционалом виджеты/атомы;
ответы сети контролирует Playwright. SSR-тесты не обращаются к реальной БД.

```bash
node --test tests/components/clientLoadingSsr.test.cjs \
  helpers/cabinetStateHydration.test.mjs \
  tests/components/eventCardOpen.test.cjs \
  tests/components/attentionLoading.test.cjs \
  tests/components/eventViewLoading.test.cjs \
  tests/components/additionalEventContacts.test.cjs \
  tests/components/preferredContactChannel.test.cjs

npx eslint 'app/cabinet/[page]/page.js' \
  helpers/useCabinetStateHydration.js helpers/useClientsQuery.js \
  layouts/cards/EventCard.js server/fetchProps.js \
  tests/components/clientLoadingHarness.cjs \
  tests/components/clientLoading.browser.test.cjs \
  tests/components/clientLoadingSsr.test.cjs

git diff --check
```

**16 passed / 0 failed / 0 skipped** в SSR/соседнем наборе; ESLint и diff-check —
exit `0`. Дополнительно `PLAYWRIGHT_MODULE=/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright node --test tests/components/cardSurface.browser.test.cjs` — **1 passed / 0 failed / 0 skipped**: прежние края, поверхности и фокус карточек в обеих темах и ширинах сохранены. Преднамеренный сбой БД выводит ожидаемую серверную диагностику;
ошибок JavaScript приложения в браузере нет. Диагностика намеренных HTTP 503
учитывается отдельно, а не объявляется ошибкой приложения.

### UI-проверка

390 и 1365 px, светлая и тёмная темы; загрузка, ошибка, клавиатурный повтор,
успех, границы кнопки внутри карточки, отсутствие горизонтального переполнения.
Встроенный axe WCAG A/AA: нет нарушений во всех четырёх сочетаниях.
Измеренный контраст новых текстов:

| Текст | Светлая | Тёмная |
| --- | --- | --- |
| Загрузка клиента | 4.83:1 | 7.27:1 |
| Ошибка | 5.91:1 | 11.41:1 |
| Повторить | 16.66:1 | 14.41:1 |

Снимки содержат настоящие стили, включая правила, вставленные через CSSOM.
Дополнительно запущены vendored-гейты:

```bash
KIT=/home/aleksei/projects/ux-ui-agent-skills/scripts
HTML="$PWD/.qa-output/client-loading"
DS_REQUIRE_BROWSER=1 node "$KIT/axe_audit.mjs" "$HTML/client-error-390-light.html"
DS_REQUIRE_BROWSER=1 node "$KIT/axe_audit.mjs" "$HTML/client-error-390-dark.html"
DS_REQUIRE_BROWSER=1 node "$KIT/verify_target_size.mjs" "$HTML/client-error-390-light.html"
DS_REQUIRE_BROWSER=1 node "$KIT/verify_responsive.mjs" "$HTML/client-error-390-light.html"
DS_REQUIRE_BROWSER=1 node "$KIT/verify_responsive.mjs" "$HTML/client-error-390-dark.html"
DS_REQUIRE_BROWSER=1 node "$KIT/measure_render.mjs" "$HTML/client-error-390-light.html" "$HTML/client-error-390-dark.html"
```

axe — **0 violations** в обеих темах; target-size — OK; responsive — OK на
280/320/414 px в обеих темах. Полный `measure_render` — **exit 1**: существующий
текст скрытого свайп-действия «Изменить» имеет 3.19:1 (четыре карточки в каждой
теме). Этот гейт учитывает закрытый `aria-hidden`-слой; сами SwipeableCard и CSS
не менялись. Новые тексты проверены отдельно вычисленными стилями и проходят.
Это замечание не скрыто и не исправляется попутно.

## Файлы и ограничения

Изменены:
- `server/fetchProps.js`;
- `app/cabinet/[page]/page.js`;
- `helpers/useCabinetStateHydration.js`;
- `helpers/useClientsQuery.js`;
- `layouts/cards/EventCard.js`;
- `package.json`, `package-lock.json` — `npm version patch --no-git-tag-version`;
- `docs/ROADMAP.md` и этот документ.

Добавлены три файла в `tests/components`: `clientLoadingHarness.cjs`,
`clientLoading.browser.test.cjs`, `clientLoadingSsr.test.cjs`.

Последняя проверка `NEXT_TELEMETRY_DISABLED=1 npm run build`: production-код
скомпилирован за 4.0 минуты, TypeScript-этап завершён. **Полная сборка не прошла**:
сбор данных `/api/events/ai-draft` остановлен отсутствующим `MONGODB_URI`.
В этой копии нет env-файлов и доступного `mongod`; реальные базы и секреты не
использовались. Для полного build/HTTP E2E нужен отдельный безопасный Mongo-стенд.
Браузерная production-сборка компонентного стенда прошла, но не заменяет этот шаг.

Не проверены: боевой API/БД, production-сайт, service worker установленной PWA
и реальное переключение сети на телефоне. Браузерная проверка доставляет
`offline/online` события настоящему onlineManager; это не device-прогон.
Android/PartyCRM не менялись. Исправление сохранено отдельным локальным коммитом
в ветке `fix/client-loading-cards`; push и deploy не выполнялись. Родительский
агент независимо повторил 16 SSR/соседних и 10 браузерных тестов — все прошли,
точечный ESLint и `git diff --check` завершились с кодом 0.

Локальные артефакты: `.qa-output/client-loading/` — `browser-green.log`,
`focused-green.log`, `eslint.log`, `build.log`, `ui-gates.log`,
`full-contrast.log`, HTML-снимки и изображения. `.qa-tools/` содержит только
вспомогательные тестовые зависимости. Эти каталоги не предназначены для коммита;
установленные пакеты основного `node_modules` не переустанавливались.
