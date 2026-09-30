# Задание C: этапы D и E

Дата: 01.10.2026. Изменения ограничены `mobile/`. M1-T10 целиком не закрывается: экранные этапы и native-приёмка остаются впереди. Общий roadmap и версии не изменены согласно границам BRIEF-C; коммита нет.

## Реализация

- `src/shared/ui/theme.ts`: пары PWA light/dark для canvas, поверхностей, toolbar, KPI, primary/secondary и pressed, заголовков/метаданных карточек, навигации/FAB, транзакций с foreground/outline/pressed-fill. Раздельные роли Notice, временных chips и `eventViewStatus`; `finished` — только представление. Синее ребро секции «Завтра» отделено от зелёного chip.
- `ThemeProvider.tsx`: `useTheme`, мемоизированные фабрики `useThemeStyles`, preference `light | dark | system`. Хранение в существующем Expo SecureStore, отдельный ключ `vedelo.ui.theme.preference.v1`, вне SQLCipher, auth/session и cache. Невалидное значение/ошибка чтения дают светлый fallback; `persistenceError` сообщает о недоступности хранилища. Позднее чтение не отменяет новый выбор, записи последовательны.
- `AppProviders.tsx` принудительно задаёт `forcedMode="light"`, даже если в SecureStore записано `dark` или ОС тёмная. Публичного переключателя нет; блокировка снимается только на AJ. Экспорт `colors` оставлен с прежней светлой палитрой для немигрированных экранов и не мутируется. Общие примитивы уже используют новую палитру.
- `components.tsx`: заголовок с clamp/count/необязательным subtitle, Surface card/toolbar/kpi (радиусы 8/0/8, рамка 1), тематические Field/Screen/SectionTitle, chips, EmptyState с иконкой 48 и CTA, ErrorNotice через Notice. Обычный Field сохраняет 48/radius12, многострочный — min-height96.
- `Notice.tsx`: success/warning/danger/info/neutral, точные тройки цветов PWA, семантическая иконка и подпись для TalkBack; danger соответствует web error.
- `CompactField.tsx`: label12/600, gap4, border2, min-height40, radius4, paddingX8, поиск, focus/error/disabled/busy. Загрузка результатов не очищает ввод и не блокирует печать.
- `FilterOverlay.tsx`: FilterControl36/radius10, Modal вне layout списка, ширина 340 или 260 с ограничением viewport/safe area, строки min-height48/font15.2, selected/disabled, Back/outside/кнопка закрытия, возврат фокуса. Выбор контролируется вызывающим экраном: можно оставлять overlay открытым для нескольких фильтров. Скрытое содержимое размонтируется.
- Button: отдельные pressed primary и secondary, onPrimary в обеих темах, disabled/loading opacity .65, блокировка повторного действия, сохранение подписи при загрузке. `selected/expanded` передаются, `disabled/busy` вычисляются по фактическому состоянию. Danger — семантическая outline-кнопка Notice, без заимствования транзакционного expense.

## Ограничения точности

Inter Tight не подключён: новых бинарных шрифтов нет. В RN 0.83 Android `ReactTypefaceUtils.parseFontWeight` принимает только 100…900 с шагом 100; контрактные веса 650/550 сохранены в токенах, системный fallback обоих — 600. Системное увеличение текста не отключается.

Dark Surface хранит оба исходных gradient stops и угол145, но пока рисуется первым stop; radial-слои canvas не рисуются. Это явное упрощение, не обещание точного совпадения с PWA. Native elevation 2/6 — приближение light/dark тени, требующее сравнения на устройстве. Публичная тёмная тема выключена, экраны остаются на light-bridge до своих этапов.

API, авторизация, tenant, storage/sync, SQLCipher/outbox, идентификаторы, deep links, EAS и чужой `notifications/index.ts` не менялись. Новых зависимостей нет; исходный изменённый `package-lock.json` сохранён.

## Стенд для native-приёмки

`src/shared/ui/preview.tsx` — отдельная development entry, не подключённая к Expo Router и production. Она использует `ThemeProvider storage={null}`: переключение light/dark на стенде ничего не сохраняет. Есть длинные подписи, поиск, загрузка, disabled, все Notice/chips, Surface-варианты, multiline Field, CTA и overlay обоих размеров. Координата первой карточки выводится на ней.

На машине с Android SDK/подключённым устройством в отдельной копии проекта с установленными зависимостями временно назначить `main` этого стенда, затем запустить существующий development build:

```bash
cd mobile
node -e 'const fs = require("fs"); const p = JSON.parse(fs.readFileSync("package.json", "utf8")); p.main = "src/shared/ui/preview.tsx"; fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n")'
npm run dev -- --clear
```

После проверки вернуть в этой отдельной копии `main: "expo-router/entry"`. В текущем checkout `package.json` не изменялся. Стенд не требует реальных учётных данных, БД или сети API.

Матрица V (пока **не выполнена**):

1. Light/dark, логические ширины 320/360/390 и широкое окно; обычный/увеличенный системный текст. Сравнить цвета и геометрию с PWA на одинаковых данных, особенно шрифт, тени и упрощённые градиенты.
2. Открыть фильтры340/260, проверить неизменность y первой карточки, прокрутку длинного списка, выбор и запрет disabled, safe areas, outside и аппаратный/жестовый Back. После закрытия фокус должен вернуться на trigger.
3. TalkBack: объявляются смысл Notice, подписи chips, выбранность и раскрытость фильтров, disabled/busy. Закрытое overlay недоступно, его открытие изолирует фокус; декоративные иконки не дублируют подписи.
4. Ввести текст в поиск/форму, показать клавиатуру, включить загрузку, сменить тему: ввод остаётся. Повторное нажатие «Сохранить» при загрузке не увеличивает счётчик действий. Проверить CTA сброса.
5. Проверить системную кнопочную/жестовую навигацию, реальные зоны касания, JS/native console и logcat. Затем smoke одного существующего экрана со светлым AppProviders.

В текущей среде `adb` отсутствует; native-сборка, установка, снимки и TalkBack не запускались. Jest проверяет поведение компонентов и расчёт ограничений размеров, но не подтверждает фактическую координату карточки/фокус/внешний вид на Android. Этапы готовы кодом после автопроверок, визуальная приёмка V остаётся открытой.

## Автопроверки

Команды выполнены 01.10.2026:

```text
cd mobile && npm run typecheck
> tsc --noEmit
src/shared/notifications/index.ts(8,35): error TS2322
NotificationBehavior: missing shouldShowBanner, shouldShowList
```

Exit 2: ровно одна исходная ошибка, подтверждённая также до изменений. Новых ошибок нет; чужой notifications-файл не исправлялся.

```text
cd mobile && npm test
Test Suites: 41 passed, 41 total
Tests:       193 passed, 193 total
Snapshots:   0 total
Time:        55.091 s
```

Exit 0. В том числе 35 новых focused-проверок палитр/provider/примитивов. `moreScreen.test.tsx` прошёл в полном наборе, отдельный повтор не требовался. Существующее предупреждение expo-notifications о недоступности remote push в Expo Go осталось; новых предупреждений компонентов нет. На промежуточных прогонах исправлены только новые тесты: актуальные matchers RNTL, запрос скрытых декоративных элементов и синхронный вызов события Back, без повышения таймаутов и изменений старых тестов.

```text
cd /home/aleksei/projects/ArtistCRM && git diff --check
# нет вывода; exit 0
```

Новые неотслеживаемые файлы этого задания также отдельно проверены на ошибки пробелов. Все изменения этого задания — `mobile/src/shared/ui/*`, подключение `mobile/src/shared/providers/AppProviders.tsx` и данный отчёт. Чужие исходные/параллельные файлы сохранены.
