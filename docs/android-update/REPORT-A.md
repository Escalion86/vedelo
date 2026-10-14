# Этап А — компактный редактор, фото и состояния клиента

Статус: этап А завершён в своей области. На последних исходниках: целевой Jest 145/145 (12 suites), отдельный typecheck exit 0, RN Web 14/14 exit 0. Приёмка APK/production остаётся родителю.

База: `35f9a64c29c0b8c078a0b54149a1949069a868ed`, рабочая копия `vedelo-android-editor-20261011`. Общее чтение и аудит выполнены в первой части сессии. Документ выпуска, версии и ROADMAP ведёт родитель по BRIEF-A.

## Реализация

- **E-01:** `eventFormVariant !== 'classic'` включает компактный редактор по умолчанию. Разделы раскрываются независимо, имеют сводки и открываются при соответствующей ошибке валидации. Классические вкладки продолжают работать. Помощь i — самостоятельная кнопка слева от стрелки. Выбор услуг редактирует локальную копию: «Применить» переносит тип/услуги, «Отмена» сохраняет исходный выбор и AI-маркеры. Терминология использует переданный resolver genitive.
- **PHOTO-04:** применённые sourceText/aiWarnings сохраняются в редакторе. Только валидные реально принимаемые aiFilledFields подсвечивают поле и свёрнутый раздел. Ручная правка снимает соответствующий маркер; отмена выбора его сохраняет. После успешного сохранения и точного перечитывания маркеры и metadata очищаются. Ошибки оставляют ввод и распознанный результат; повтор применения не вызывает второй платный POST. Неизвестный clientId повторно проверяется защищённым GET до cache/upsert. Функциональный setDraft сохраняет несвязанную ручную правку во время GET.
- **TRANSFER-01:** сводка учитывает сохранённый isTransferred и colleagueId, использует существующий `getEventCardClientName`. Найденный коллега без ФИО отображается по `_id`; неизвестный — «Передано коллеге»; false-флаг исключает сводку. Постоянный тест несвязанной финансовой правки сохраняет передачу, HTML, точность дат, адрес/координаты, контакты, задачи и поддерживаемые persisted-поля.
- **CLIENTS-02:** footer MobileEventCard различает none/loading/paused/error/missing/local-missing/found. Локальный кэш читается offline; отсутствующий серверный ID получает защищённый точный GET с проверкой `_id`. Только определённый 404 становится missing. Ошибка и некорректный DTO дают повтор; найденные данные переживают фоновый сбой. Повтор/контакты не открывают карточку работы.
- После визуальной проверки исправлено обрезание длинных вариантов услуг: GeneralChoice ограничен шириной контейнера, текст переносится и использует InterTight. Геометрический RN Web RED показал right=999.5625 при parentRight=327; assertions сохранены для GREEN.
- Исправлена дополнительная регрессия: `EventAiHighlight` сохраняет один View-контейнер при снятии маркера, сохраняя смонтированное поле и ввод. Постоянный тест сначала показал потерю текста, затем прошёл.
- Сохранение ждёт getCachedEntity точного возвращённого `_id`. Ошибка перечитывания сохраняет форму; повтор использует уже созданный local ID. Отмена использует штатный guard несохранённых изменений.

## Интерфейс интеграции

`CompactEventForm.proposalsSection?: ReactNode` и `clientReviewSection?: ReactNode` находятся после документов, перед другими деталями, в этом порядке. Родитель подключает настоящие EventProposalsSection/EventClientReviewSection после появления модулей и проверки доступа. Заглушки отсутствуют.

Серверный контракт используется существующий: POST `/mobile/v1/events/ai-photo-draft` возвращает fields/sourceText/aiWarnings/aiFilledFields; GET `/mobile/v1/clients/:id` возвращает data Client или существующий 404. Неизвестная/чужая связь и несовпадающий DTO не записываются в кэш. API, схемы, auth/offline/sync, внутренние events и serializer не изменялись. Metadata подсветки не входит в persisted payload.

## Реальные проверки

Все тяжёлые проверки последовательно выполняются через `flock /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock`. Журналы и отдельные child exit codes — в `/home/aleksei/reports/vedelo/2026-10-11/update/A/`.

| Запуск | Exit | Результат | Журнал |
|---|---:|---|---|
| Передача RED, постоянный compactEventForm.test.ts, до правки | 1 | 10 passed / 1 failed / 11 | transfer-red.log |
| Передача GREEN, существующий display-helper | 0 | 11/11 | transfer-green.log |
| Подсветка RED, постоянный EventAiHighlight.test.tsx | 1 | 0 passed / 1 failed | highlight-red.log |
| Поведенческий RED HEAD snapshot с новыми тестами | 1 | 35 passed / 15 failed / 50; 3 failed suites | red-baseline-final.log |
| Целевой Jest, первая попытка | 1 | 142 passed / 3 failed / 145; 11 passed suites | targeted-green.log |
| Отдельный повтор createScreen без правок/ослабления | 0 | 36/36 | create-green-recheck.log |
| Целевой Jest до правки переноса | 0 | 145/145; 12/12 suites | targeted-green-final.log |
| Отдельная npm run typecheck | 0 | завершена, без ошибок | typecheck.log |
| RN Web, первая попытка | 1 | 0 проверенных сочетаний; сборка остановилась до браузера: JSX loader Expo icons | browser-attempt-1.log |
| RN Web, вторая попытка | 1 | 0 проверенных сочетаний; форма не смонтировалась, исправлен JSX transform QA runner | browser-attempt-2.log |
| RN Web, третья попытка | 1 | 0 полных сочетаний; отсутствует currentlyFocusedInput в RN Web | browser-attempt-3.log |
| RN Web, четвёртая попытка | 1 | 0 полных сочетаний; отсутствует native findNodeHandle в RN Web | browser-attempt-4.log |
| RN Web, пятая попытка | 1 | 0 полных сочетаний; консоль HTTP404 ресурса стенда | browser-attempt-5.log |
| RN Web, шестая попытка | 1 | 0 полных сочетаний; fill той же суммы не создаёт DOM change | browser-attempt-6.log |
| RN Web, седьмая попытка | 1 | 0 полных сочетаний; неполная address fixture и штатная нормализация serializer | browser-attempt-7.log |
| RN Web, восьмой запуск | 0 | 14/14, без ошибок консоли; снимок выявил обрезание услуги внутри modal | browser-attempt-8.log |
| RN Web, геометрия услуги RED | 1 | 0 полных сочетаний; right=999.5625 > parentRight=327 | browser-layout-red.log |
| Финальный Jest после переноса | 0 | 145/145, 12/12 suites | targeted-green-layout-final.log |
| Typecheck после переноса | 0 | отдельная npm run typecheck, без ошибок | typecheck-layout-final.log |
| Финальный RN Web после переноса | 0 | 14/14, точная геометрия услуги; 0 console errors/warnings, 56 снимков | browser.log |

Первая попытка целевого Jest повторила исходный 5000ms timeout initialStatus active и получила timeout cleanup с последующим unmounted component. Все случаи прошли отдельно и затем весь целевой набор прошёл 145/145 на неизменённых исходниках. Assertions и таймауты не ослаблялись. Существующие 30 секунд photoDraft.test.tsx не менялись.

Целевые 12 suites: createScreen, photoDraft, clientLoading, applyPhotoDraft, compactEventForm, EventAiHighlight, fieldHelpIntegration, EventContactsSection, EventFinanceSection, MobileEventCard, MobileClientCard, shared/domain/eventForm. Полный Jest выполняет родитель. Новые pure helpers проверяются постоянными тестами; внешний light-check не является доказательством приёмки.

Исходный parent baseline (`baseline-observed.json`): 82 tests, 80 passed / 2 исходных 5000ms timeout. Parent wrapper прерван внешним лимитом terminal 420 секунд; фактические Jest exit codes не сохранены, baseline typecheck не выполнена. Эти неизвестные показатели не заменены предполагаемыми кодами.

## RN Web и SHA

Финальная матрица прошла 14/14 после правки переноса. Состав проверки: light/dark × 360/390/420 px с высотой 800 и 480, плюс desktop 1365×900 — 14 сочетаний. Настоящие CompactEventForm/разделы/ThemeProvider, экран EventEditScreen и footer EventCardClientState. Проверяются длинные подписи, геометрия, зоны кнопок, i слева и независимость help, отмена/применение услуг, source/warnings/подсветка, непрерывный набор текста при снятии маркера, ошибка/повтор сохранения, сохранение передачи/persisted-полей, состояния клиента и classic. Ошибки и предупреждения консоли сохраняются раздельно.

Для web-preview нативные currentlyFocusedInput/findNodeHandle/setAccessibilityFocus адаптированы к DOM API. У системных шрифтов стенда отсутствует U+24D8; изолированный Noto Sans Symbols fallback загружен в scratch и применяется только к этому символу. Он не заменяет InterTight для текста и не меняет зависимости/ассеты приложения. Источник/SHA и проверка glyph coverage — browser-symbol-font.log (exit 0).

Data/platform seams на стенде — явные QA fixtures (кэш/локальная запись/Photo onApply/navigation/native APIs). Обращение к настоящему API запрещено внутри стенда. Сетевой lifecycle клиента отдельно проверен настоящим QueryClient в Jest с контролируемыми API/cache seams. Браузер не доказывает реальные серверные/Android операции.

Стенды перемещены из собственных `/tmp/vedelo-a-{red,browser}` в `/home/aleksei/.hermes/cache/scratch/vedelo-a-qa/{red,browser}`. TMPDIR, bundle и Chromium profile находятся внутри своей QA-папки; доказательства — в A/browser. Новых зависимостей приложения и npm-установок нет; только отдельный symbol font для QA-preview в scratch. Отдельные QA-зависимости читаются через ссылку на audit deps: esbuild 0.25.12, react-native-web 0.21.2, React/React DOM 19.3.0. Native Jest использует существующий React 19.2.0. Канонические node_modules не менялись.

`source-hashes-prechecks.json` содержит SHA исходников HEAD snapshot и source для передачи GREEN/подсветки RED. Ключевые snapshot реализации сверены с git HEAD. `source-hashes-green.json` содержит SHA всех mobile TS/TSX/JS source для целевого Jest/typecheck. `browser-source-hashes-attempt-{1,2,3,4,5,6,7,8,9}.json` фиксирует source и собственные QA scripts каждого браузерного запуска. source-hashes-layout-final.json и browser-source-hashes-layout-final.json фиксируют исходники после правки переноса, runner и QA symbol font. Отменённые прежние ожидания не засчитываются; чужие lock/процессы не трогались.

Финальные browser/result.json и 56 снимков `{theme}-{width}-{height}-{collapsed,expanded,picker,photo}.png` лежат в A/browser. Проверены визуально light 390×480, dark 360×480 (source/AI/error), dark 420×480 (picker) и перенос услуги на 360 px. Исходники после финального прогона совпали со всеми SHA source-hashes-layout-final.json: source-hashes-verified-final.json содержит нулевой diff. artifact-hashes-final.json фиксирует bundle, runner, font, browser result и снимки. До правки preserved screenshot picker-layout-red.png и отдельный browser-layout-red.log.

Закрыты IDs PHOTO-04, TRANSFER-01, CLIENTS-02, E-01 в пределах реализации и обязательной QA этапа А.

Новые native testID: event-compact-{client,services,dates,location,finance,tasks,documents,details,status}, их -toggle/-ai, ai-field-{field}, event-service-picker, event-photo-source, cancel-event, event-client-{none,loading,paused,error,missing,local-missing,found}, event-client-retry. Они требуют последующей APK-проверки родителя.

## Ограничения

Все обязательные проверки А завершены. Нет ADB/устройства; не проверены нативные системные отступы/клавиатура/камера, APK и production. Production-авторизация и платный AI не выполнялись; EAS не запускался. Версии/ROADMAP и выпуск принадлежат родителю.

## Изменённые и новые файлы

- `mobile/app/events/edit/[id].tsx`
- `mobile/src/features/events/EventContactsSection.tsx`
- `mobile/src/features/events/EventFinanceSection.tsx`
- `mobile/src/features/events/EventGeneralSection.tsx`
- `mobile/src/features/events/MobileEventCard.test.tsx`
- `mobile/src/features/events/MobileEventCard.tsx`
- `mobile/src/features/events/PhotoDraftSection.tsx`
- `mobile/src/features/events/applyPhotoDraft.ts`
- `mobile/src/features/events/createScreen.test.tsx`
- `mobile/src/features/events/photoDraft.test.tsx`
- `mobile/src/features/events/CompactEventForm.tsx`
- `mobile/src/features/events/CompactEventSection.tsx`
- `mobile/src/features/events/EventAiHighlight.tsx`
- `mobile/src/features/events/EventCardClient.tsx`
- `mobile/src/features/events/clientLoading.test.tsx`
- `mobile/src/features/events/compactEventForm.ts`
- `docs/android-update/REPORT-A.md`
- `mobile/src/features/events/compactEventForm.test.ts`
- `mobile/src/features/events/applyPhotoDraft.test.ts`
- `mobile/src/features/events/EventAiHighlight.test.tsx`
