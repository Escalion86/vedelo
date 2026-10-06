# CARD-FIX — карточки APK и общие поверхности

Дата: 2026-10-05. Ветка `mobile-parity`. Задание — [BRIEF-CARD-FIX.md](BRIEF-CARD-FIX.md). Изменения на диске, без коммита, staging и публикации. M1-T10 остаётся `[-]`, версии не повышались.

## Изменения по файлам

- `mobile/src/features/events/MobileEventCard.tsx`: сохранены колонки пустой даты/адреса/финансов/клиента с `—`/`-`; удалены «Без даты», «Адрес не указан», «Оплачено / договор» и нулевое 0/0. Положительные суммы показаны в одну строку, равные — одной суммой; закрытая работа сохраняет итог. День недели и двухзначное число находятся в одной строке, ниже месяц и время. Полоса draft оранжевая, прошедшей active серая, closed зелёная; цвета отделены от view-chip. Напоминание — компактная рамка с отдельными строками даты (с годом) и действия, дополнительный счётчик рядом. Адрес отображается и без ссылки. Сохранены меню, быстрые контакты, ошибки/очередь/блокировка загрузки; на достаточно широком экране доступны четыре быстрых канала.
- `mobile/src/features/events/eventCard.ts`: проекции денежной строки и даты/временного статуса задачи; формат адреса с реквизитами и комментарием, скрытие города по умолчанию только в подписи; полное ФИО с отчеством. Расчёт сумм и условия предупреждения о задатке не менялись.
- `mobile/app/(tabs)/events.tsx`: передача существующего `defaultTown` карточке. Навигация и API не менялись.
- `mobile/src/shared/ui/theme.ts`, `components.tsx`: фон кабинета светлой темы немного темнее (`#f3f1eb`); тёмная тема оставлена без изменений (`#100d0a`, как было); белые поверхности сохранены; отдельные токены полосы карточки и общей тени Surface. Прежние изменения темы/полей сохранены.
- `app/globals.css`: новый токен фона применяется только к светлой теме кабинета (`.cabinet-canvas`); тёмное оформление `body.theme-dark .cabinet-canvas` (радиальные градиенты и `#100d0a`) восстановлено без изменений по прямому указанию владельца; публичный фон не изменён. Общий `.card-swipe-row` использует grid и минимальную высоту по содержимому, тень размещена снаружи clipping.
- `components/CardWrapper.js`: `role='button'` и `tabIndex=0` перенесены в параметры функции: React 19 не применяет `defaultProps` функционального компонента.
- `MobileEventCard.test.tsx`, `primitives.test.tsx`, `theme.test.ts`: регрессии прочерков, денежных комбинаций, draft с/без даты и прошедшей даты, passed active, даты, напоминания/счётчика, адреса без ссылки/defaultTown, ФИО, обеих тем и общих поверхностей; прежние сценарии действий и загрузки сохранены.
- `tests/components/cardSurfaceHarness.cjs`: SSR настоящих `EventCard`, `CardWrapper`, `SwipeableCard`, `StatusChip` и компиляция настоящего `app/globals.css`. Фикстуры заменяют запросы/Jotai-данные и посторонние виджеты действий, контактов и статусов КП/отзывов. БД, Next-сервер и env-файлы не нужны.
- `tests/components/cardSurface.browser.test.cjs`: Chromium проверяет нижнюю рамку внутри clip, тень, белые поверхности, фон кабинета и фон вне кабинета, горизонтальное переполнение и фокус, 390/1365 px × light/dark. Без `PLAYWRIGHT_MODULE` явно пропускается, а не считается выполненным. Browser закрывается в `finally`, контексты — после сценариев; HTTP-сервер не запускается. Файлы по умолчанию не создаются; снимки записываются только при явном `QA_SCREENSHOT_DIR`.
- `docs/mobile-parity/STATUS.md`, `docs/ROADMAP.md`: короткие записи о результате, без закрытия M1-T10.

## Причина нижнего края

Исходный browser harness измерил на 390 px: строка списка 194 px минус `padding: 6px 8px` даёт clip 182 px, тогда как `.event-card-shell` имеет принудительные 184 px. Нижние 2 px рамки обрезались `overflow: hidden`; наружной тени у свайп-обёртки не было. Исправлена общая обёртка, без изменения содержимого/условий PWA-карточки. Browser-регрессия проверяет, что `card.bottom <= row.bottom`, включая прошедшую заявку и обычную карточку со свайпом.

## Проверки

Проверки после возобновления выполняются последовательно. Первый targeted Jest завершился exit 134 (V8 heap out of memory); сравнение целых ReactTestInstance в новой проверке даты заменено проверкой текста внутри общего контейнера и его flex-направления. Следующий прогон завершился exit 1 (53 passed / 1 failed): старое ожидание «10 000 ₽ / 30 000 ₽» актуализировано до PWA-формата «10 000 / 30 000 ₽». Прерванные извне или вручную незавершённые вызовы успешными не считаются; полный Jest не запускался после возобновления.

1. `cd mobile && npm run typecheck` — **exit 0**, ошибок нет.
2. `cd mobile && npm test -- --runTestsByPath src/features/events/MobileEventCard.test.tsx src/shared/ui/primitives.test.tsx src/shared/ui/theme.test.ts` — **3 набора / 54 теста passed, exit 0**, 18,862 с.
3. `npx --no-install eslint components/CardWrapper.js tests/components/cardSurfaceHarness.cjs tests/components/cardSurface.browser.test.cjs` — **exit 0**, ошибок и предупреждений нет; CSS не линтуется.
4. `PLAYWRIGHT_MODULE=/tmp/vedelo-card-fix/tools/node_modules/playwright QA_SCREENSHOT_DIR=/tmp/vedelo-card-fix TZ=Asia/Krasnoyarsk node --test tests/components/cardSurface.browser.test.cjs` — **1/1 passed, четыре сочетания viewport/theme, exit 0**, 18,976 с; console/pageerror без ошибок. Снимки обновлены итоговым прогоном. До прерывания тот же сценарий тоже завершился exit 0.
5. До прерывания: `node --test tests/components/cardSwipe.test.cjs` — **4/4, exit 0**; сценарии направления свайпа, подавления случайного клика и сохранения обычного нажатия.
6. `git diff --check` — **exit 0** после окончательной записи документации.

## Снимки и временные материалы

Просмотрены исходные `/home/aleksei/.hermes/attachments/scaled_22367.jpg` (APK) и `scaled_22368.jpg` (PWA); окончательный эталон — код `layouts/cards/EventCard.js`.

До прерывания использовался диагностический `/tmp/vedelo-card-fix/baseline.cjs`, который рендерил настоящие компоненты и CSS. В `/tmp/vedelo-card-fix` сохранены `before.html`, `baseline.html`, `before.png`, `after.png`; промежуточный `after.png` был сделан до окончательного grid-исправления и не является подтверждением финального результата. Финальные снимки постоянного harness: `cards-390-light.png`, `cards-390-dark.png`, `cards-1365-light.png`, `cards-1365-dark.png`.

Временный `python3 -m http.server 8767 --directory /tmp/vedelo-card-fix` после прерывания отсутствует: проверка TCP-порта возвращает отказ подключения (111). Итоговый browser-тест пользуется `page.setContent` и сервер не создаёт. Временный Playwright и материалы собраны внутри `/tmp/vedelo-card-fix`; отдельный npm-cache удалён. Бинарные ассеты в репозиторий не добавлялись.

## Ограничения и сохранённые контракты

- Нативная приёмка на Android/телефоне, TalkBack, фактическая геометрия текста, контакты в сторонних приложениях, release/EAS/build/deployment не выполнялись. Следующий этап — сборка и приёмка владельцем.
- Web-проверка — реальный SSR/CSS в Chromium с фикстурами, а не E2E авторизованного кабинета: меню/контакты/КП/отзывы и серверные действия не проходят через этот harness. Фокус проверен браузером; действия карточки — компонентными тестами.
- API, DTO, tenant-фильтры, offline/sync и бизнес-формулы не менялись. `splitEventTransactions` и `hasDepositPaidTransaction` по-прежнему исключают обязательства из факта оплаты; существующая проекция сумм списка, как у текущего web `EventCard`, сохранена отдельно от финансового раздела. Прежнее различие этих проекций не исправлялось в визуальной задаче.
- Общий заголовок/уведомления/аватар экрана и известные пробелы мобильных КП/отзывов/обучения не входили в CARD-FIX. M1-T10 остаётся открытым. Прежние чужие изменения в грязном дереве сохранены.

## Правка после замечания владельца (2026-10-05)

Владелец: «В тёмной теме не надо было менять». Тёмное оформление возвращено к исходному виду, светлая правка сохранена:

- `app/globals.css`: удалён тёмный токен `--cabinet-canvas-bg`; `body.theme-dark .cabinet-canvas` восстановлен дословно — оба радиальных градиента и основа `#100d0a`. Токен `--cabinet-canvas-bg` остался только для светлой темы.
- `mobile/src/shared/ui/theme.ts`: `darkPalette.canvas` возвращён к `#100d0a` (был `#0d0a08`).
- `mobile/src/shared/ui/theme.test.ts` и `tests/components/cardSurface.browser.test.cjs`: ожидания тёмного фона приведены к исходному `#100d0a`.

Проверка после правки (выполнена родителем, не исполнителем):

1. `cd mobile && npm run typecheck` — **exit 0**.
2. `npx jest --runInBand --runTestsByPath src/features/events/MobileEventCard.test.tsx src/shared/ui/primitives.test.tsx src/shared/ui/theme.test.ts` — **3 набора / 54 теста passed, exit 0**.
3. `PLAYWRIGHT_MODULE=… node --test tests/components/cardSurface.browser.test.cjs` — **1/1 passed, exit 0**.
4. Прямая проверка вычисленных стилей в Chromium на 390 px: светлая тема — `backgroundImage: none`, `rgb(243, 241, 235)`; тёмная — оба исходных `radial-gradient` (`rgba(201,168,106,0.14)`, `rgba(76,65,45,0.26)`) и основа `rgb(16, 13, 10)`. Тёмная тема совпадает с исходной.
5. `git diff --check` — чисто; staging и коммитов нет.

Проверка «нет тёмных правок» в `app/globals.css` выполнена по diff: в блоке `body.theme-dark .cabinet-canvas` изменений относительно HEAD нет. Общий `.card-swipe-row` (grid, `min-height: min-content`, тень снаружи clipping) намеренно действует в обеих темах — это исправление обрезанного нижнего края карточки, а не переоформление тёмной темы.
