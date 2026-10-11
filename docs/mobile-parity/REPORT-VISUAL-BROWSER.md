# Фактический прогон браузерного стенда визуального паритета

Созданы `tests/components/mobileVisualParity.browser.test.cjs` и соседняя фикстура `tests/components/mobileVisualParity.fixture.jsx`. Запускается настоящий React Native Web с настоящими `QuickContacts`, `MobileEventCard`, `MobileClientCard`, `AttentionScreen` и вложенным `TaskCard`; используется настоящий `ThemeProvider` с `forcedMode` и `storage={null}`. Веб-контакты — настоящий `ContactsIconsButtons` и настоящий `NovofonCallButton`, стили компилируются из текущего `app/globals.css` существующим PostCSS/Tailwind. Production, package/config, версии, roadmap и git агентом не изменялись.

Это промежуточный снимок рабочей копии: этапы 1/2 работали параллельно и обновляли компоненты во время создания стенда. Результат не является окончательной приёмкой их изменений или приёмкой Android на телефоне. По завершении этапов родителю нужно повторить команду с новой папкой артефактов.

Команда полного прогона из `/home/aleksei/projects/vedelo`:

```bash
DS_REQUIRE_BROWSER=1 \
ESBUILD_MODULE=/home/aleksei/.hermes/cache/scratch/vedelo-ui-harness/node_modules/esbuild \
RN_WEB_MODULE=/home/aleksei/.hermes/cache/scratch/vedelo-ui-harness/node_modules/react-native-web \
PLAYWRIGHT_MODULE=/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright \
QA_SCREENSHOT_DIR=/home/aleksei/.hermes/cache/scratch/vedelo-visual-browser/run-final \
node --test tests/components/mobileVisualParity.browser.test.cjs
```

При повторном запуске указать новую папку вместо `run-final`. Зависимости имеют те же значения по умолчанию. Chromium выбирается из существующего `/home/aleksei/.cache/ms-playwright`, без snap; путь можно явно задать через `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Никаких зависимостей в рабочий проект не устанавливалось. `QA_SCREENSHOT_DIR` проверяется лексически и через `realpath`: вывод за пределы scratch запрещён.

Матрица — 360/390/420 px × light/dark × контакты/карточки/заполненное «Важное»/пустой обзор/веб-контакты. Для каждой поверхности окно последовательно меняет ширину 420 → 360 → 390 → исходная; это живые изменения окна с работающим React, а не статичные HTML. Сохранены PNG и HTML, включая динамические `style.sheet.cssRules` React Native Web и встроенные настоящие TTF для воспроизведения через `file://`. Разделы «Важного» дополнительно снимаются отдельно; раскрытые контакты, допконтакты и меню задачи имеют отдельные HTML/PNG.

Источники данных и замен:

- Все клиенты/телефоны/ФИО/работы/задачи — синтетические литералы в `mobileVisualParity.fixture.jsx`; почта `synthetic@example.invalid`, имена/логины тестовые. Время фиксируется на `2026-10-08T05:00:00.000Z`, зона `Asia/Krasnoyarsk`: вчерашняя задача, сегодня, завтра, выполненная сегодня в 11:00, прошедшая заявка, заявка без шага, прошедшая активная и предстоящая работа, значимая дата.
- Query hooks, cache, router, SafeArea/Navigation context, Clipboard, SecureStore и sync заменены явно перечисленными adapters в esbuild plugin. Реальные mutation API и storage не вызываются; выполнение задачи применяет настоящий `applyTaskChangeToEvent` через настоящую бизнес-логику `performAttentionAction`, запись принимает только память фикстуры. Попытка подтверждения канала запрещает запись; ответы системного Alert в этом прогоне не выбираются.
- `Linking.openURL` и `window.open` только записывают URL; внешние браузерные запросы блокируются и учитываются. MAX по телефону проверяется с записью копирования, без открытия реального приложения.
- Expo icon-компоненты, glyphMap и TTF взяты из `mobile/node_modules/@expo/vector-icons`: MaterialCommunityIcons и FontAwesome5. Подменяется только API `expo-font` на загрузчик `FontFace`; значки не заменены текстовыми заглушками. Загрузка шрифтов ожидается перед снимками, состояния сохранены в измерениях. Веб-значки FontAwesome SVG — настоящие.
- Веб Jotai state/тариф/snackbar замещены тестовыми данными. `ClientChatButton` замещён пустым компонентом только потому, что `showChat=false`: этот UI не проверяется. Novofon разрешения выключены; проверяется настоящий прямой телефонный контроль.

Vendored gates автоматически запускаются по HTML соответствующей ширины: каждый набор `width-360`, `width-390`, `width-420` проверяется на той же ширине. Это сохраняет зафиксированную реакцию `useWindowDimensions` в статичном снимке; проверка изменения React breakpoints уже выполнена на живой странице. Копии `verify_target_size.mjs`, `verify_responsive.mjs`, `verify_overflow.mjs` побайтно сохраняются в scratch; хеши и исходные пути записаны в `gates.json`. Их логика не меняется. Только scratch-модуль Playwright перенаправляет `launch({channel:'chrome'})` на существующий executable Chromium. `--advisory` не используется, exit codes и ошибки сохраняются.

Ограничения: браузерный DOM React Native Web не является нативным Android layout/Accessibility tree. Safe-area равна нулю; системные окна Alert и Android Back, реальное приложение MAX, APK, БД, tenant isolation, production API, push и устройство не проверяются. React и ReactDOM стенда унифицированы на установленной веб-версии 19.3.0, при исходной мобильной React 19.2.0; RN Web 0.21.2. Это изоляция браузерного рендера, а не сборка Expo/RN 0.83. Полные сравнения PWA остальных экранов не выполняются: настоящий веб-рендер сравнения здесь ограничен контактами.

Результаты полного запуска и абсолютные пути артефактов добавляются после его завершения.
