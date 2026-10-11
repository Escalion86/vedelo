# Независимая приёмка и исправления выбора периода

2026-10-09, `/home/aleksei/projects/vedelo`, ветка `codex`, версия **1.35.9**. Работа локальная: commit/push/deploy/APK не выполнялись. По свежему `git fetch origin main`: 0 коммитов позади, 52 впереди. Отчёты первоначальных этапов: `REPORT-WEB.md`, `REPORT-MOBILE.md`; их результаты не подменяют повторные прогоны ниже.

## Исправлено

- Веб-поле использует существующий `bg-white` с настоящим тёмным override, рамку 2px и радиус 4px, как InputWrapper. Скопированных цветов и новых глобальных токенов нет.
- В поле произвольного периода теперь краткая подпись: `1–9 окт. 2026`, `29 сент. – 2 окт. 2026`, `31.12.2025 – 02.01.2026`. Открытые границы и один день сохранены; названия готовых периодов остаются прежними. На узком экране подпись переносится вместо ellipsis. Полные доступные подписи и summary сохранены.
- В нативном компоненте тот же краткий формат; второй клик по более раннему дню сортирует границы и завершает выбор, как в вебе. Неверный ручной порядок остаётся ошибкой.
- Нативные calendar keys сохраняют четыре цифры года и реальные годы 0001–9999, как веб. Создание дат через setFullYear исключает особое поведение конструктора Date для 0–99; навигация/сетка используют ту же функцию.
- Настоящий стек модалок проверен отдельно. Escape верхнего диалога сохраняет родителя и блокировку прокрутки; удаление родителя снимает оба окна и восстанавливает исходные overflow/приоритеты. Менять механизм блокировки не понадобилось.
- Несуществующий CSS-токен первоначальный этап заменил на `text-danger`; дополнительный RED-тест обнаружил контраст ошибки только 1.68:1 на тёмной панели. Ошибка переведена на настоящий `Notice` тона `error`, с готовой палитрой обеих тем. GREEN подтверждает не менее 4.5:1 в обеих темах; неверный диапазон нельзя применить.

## Файлы этой доработки

- `components/PeriodPicker.js`, `components/PeriodPicker.module.css`.
- `helpers/webPeriodRange.mjs`, `helpers/webPeriodRange.test.mjs`.
- `mobile/src/shared/ui/PeriodPicker.tsx`, `PeriodPicker.test.tsx`, `periodPickerDates.ts`, `periodPickerDates.test.ts`.
- `tests/components/periodPickerReview.browser.test.cjs`.
- `docs/period-picker/REVIEW-PENDING.md`, этот отчёт, `docs/ROADMAP.md`.
- `package.json`, `package-lock.json`: patch 1.35.8 → 1.35.9.

Прежние чужие правки сохранены. Сравнение полных git-diff блоков с исходным срезом этого захода подтвердило отсутствие изменений `app/globals.css`, `layouts/modals/Modal.js`, `layouts/modals/ModalsPortal.js`. Исходный срез: `/home/aleksei/.hermes/cache/scratch/vedelo-period-fix-baseline.patch`.

## Фактические проверки родителя

| Проверка | Результат |
|---|---|
| Новый браузерный тест до фикса | 2 ошибки: фон/толщина рамки отличаются от InputWrapper, краткой подписи нет; 2 исходно успешных сценария (обратный веб-клик и настоящий стек) |
| Новый браузерный набор после окончательного фикса | 5/5; вместе с общим контролом, потребителями и модалками 20/20, exit 0 (`vedelo-period-review-error-green.log`); отдельный RED-тест контраста до Notice упал с 1.68:1 |
| Существующие браузерные наборы общего контрола, всех шести потребителей, истории и отзывов | 18/18, exit 0, без skipped/cancelled; последовательно |
| Helpers: webPeriodRange + transactionDateRange + transactionFilters, Asia/Krasnoyarsk | 18/18, exit 0; старое предупреждение MODULE_TYPELESS_PACKAGE_JSON остаётся |
| webPeriodRange в UTC / America/New_York | по 7/7, оба exit 0 |
| Нативные тесты до фикса | подтвердили отсутствующие краткие подписи, иное обратное нажатие и несовпадение поддерживаемых лет |
| Нативный контрол, calendar helpers, настоящие экраны финансов/истории, адаптер и domain/API | 8 наборов, 131/131, exit 0 |
| Весь mobile typecheck | exit 0 |
| ESLint 16 новых/затронутых веб-файлов | exit 0, без ошибок/предупреждений |
| git diff --check | exit 0 |
| Responsive 12 новых HTML на 280/390/1365px | exit 0 |
| Target size этих 12 HTML | exit 0 |
| States: presets/calendar/manual × light/dark | шесть exit 0, контраст default/hover/focus проходит AA |
| Окончательный повтор истории и отзывов | 4/4, exit 0; вместе с 20 сценариями финального browser-прогона 24/24 без skipped/cancelled |
| Ошибка ручного диапазона: responsive/targets/states × light/dark | все шесть exit 0, тексты и кнопки не обрезаны; визуально осмотрен review-error-dark.png |

### Измерения стиля

Computed styles поля и настоящего InputWrapper совпадают:

- Светлая тема: рамка 2px, radius 4px, фон rgb(255,255,255), цвет рамки lab(85.1236 -0.612259 -3.7138).
- Тёмная тема: рамка 2px, radius 4px, фон rgb(20,17,13), цвет рамки rgb(72,64,52).

JSON измерений: `/home/aleksei/.hermes/cache/scratch/vedelo-period-web/review-computed-styles.json`.
Осмотрены новые снимки `review-month-390-light.png` и `review-years-280-dark.png`: оба конца/годы видны, текст и шеврон не перекрываются, сброс отдельно от рамки.

## Сборка

Изолированная сборка `NEXT_DIST_DIR=.next-period-review NODE_OPTIONS=--max-old-space-size=4096 npm run build -- --webpack` завершена: **exit 0**, BUILD_ID создан, сгенерированы 187/187 статических страниц. Работающая `.next`, dev и production не менялись. Окончательный юнит после доработки контраста `vedelo-period-review-build-final`: inactive/dead, ExecMainStatus=0; в логе `BUILD_RESULT=0`. Предшествующий `build-qa` тоже проходил, но финальный прогон проверяет актуальную версию компонента.

Первый foreground-прогон прерван ограничением инструмента 420 секунд. Первый отвязанный прогон успешно скомпилировался, но завершился exit 1 на сборе данных `/api/events/ai-draft`: отсутствовал MONGODB_URI. Это не успешная сборка. Для повторной проверки запущена настоящая отдельная временная MongoDB (`mongo:7`, только loopback, случайный порт, отдельная база `vedelo_period_review`), подтверждён ping. Заданы явные локальные DOMAIN/NEXTAUTH_URL и временный случайный секрет без вывода его значения. Рабочие env/данные не читались. Предупреждение Next о deprecated Edge Runtime остаётся; сборке не препятствует.

Итоговый лог: `/home/aleksei/.hermes/cache/scratch/vedelo-period-review-build-final.log`. Временный контейнер удалён, отсутствие проверено через docker ps -a; результаты сборки остаются в игнорируемой `.next-period-review`.

## Логи и границы

Логи: `/home/aleksei/.hermes/cache/scratch/vedelo-period-review-{green-browser,regression-browser,native-final,typecheck,responsive,targets}.log`; state-логи отдельно `vedelo-period-review-states-<этап>-<тема>.log`. Первый неуспешный отвязанный build: `vedelo-period-review-build-detached.log`; после контрастной доработки окончательный build прошёл в `vedelo-period-review-build-final`, лог `vedelo-period-review-build-final.log`.

В первом браузерном запуске после восстановления контекста esbuild в scratch уже отсутствовал; восстановлен только esbuild в scratch, зависимости проекта не менялись. Один повторный regression-запуск без трёх обязательных env стенда не стартовал; повтор с явно заданными ESBUILD_MODULE/PLAYWRIGHT_MODULE/CHROMIUM прошёл 18/18. Эти ошибки запуска не считаются успешными тестами.

Браузерный стенд использует настоящие React-компоненты, глобальные стили и CSS-модули, с тестовыми внешними stores/API/router. Это не боевые ответы БД/Google, не установленная PWA и не Android-устройство. Нативные Jest/typecheck не доказывают реальную клавиатуру, TalkBack и геометрию на телефоне. Production и APK не менялись.
