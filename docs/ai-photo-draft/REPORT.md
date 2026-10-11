# Отчёт: черновик из фотографии заметки

Дата: 2026-10-08. Рабочая копия `/home/aleksei/projects/vedelo`.
Функциональность Web/PWA и Android реализована; версия web **1.35.0**
(было 1.34.4), root package-lock согласован. Mobile version **1.1.3**, app.json,
buildNumber, package ID сохранены. Коммит, push, deploy и выпуск APK/AAB не выполнялись.

## Реализация

Shared `useEventCreateMenu` показывает «Из фотографии» только при `allowAi`
в нижнем меню и desktop FAB. Отдельные file/camera inputs, локальный preview,
замена/удаление/отмена, состояния loading/disabled/error. Выбор не вызывает API.
После явного распознавания показаны sourceText и предупреждения; следующий
явный шаг переносит fields/client/aiFilledFields/aiWarnings в event.create.
Запись EVENT автоматически не производится. В native `mode=photo` открывает
PhotoDraftSection в обычном редакторе: permissions/cancel/offline/size/error,
preview/sourceText и отдельное применение. Новые связи клиентов проверяются
защищённым GET перед cache; services/client IDs проверяются по доступным данным.
Платный POST с `skipRefresh: true`; actual API client-тест подтверждает отсутствие
повтора/refresh после 401.

Заголовок центрального меню получил плотный фон темы, рамку и отступы; только
этот участок меняет оформление существующей навигации. Четыре кнопки не
перекрываются заголовком, на коротком экране меню прокручивается. Native-панель
не рестайлилась. Использованы существующие AppButton/Notice/Modal и токены.

`POST /api/events/ai-photo-draft` и mobile alias проверяют session/bearer tenant
и серверный allowAi **до чтения тела**. JSON/data URI без URL, ограниченный поток
тела, файл ≤5 MiB, ≤20 MP; MIME сверяется с сигнатурой и sharp metadata, полный
decode отвергает битые данные. SVG/анимация запрещены. EXIF rotate, strip
метаданных/GPS, JPEG ≤1600×1600. Изображение временно в памяти, без storage/logs.
Tenant из payload игнорируется, каталоги только текущего tenant, секреты и сырые
provider errors не возвращаются.

Vision OCR выполняется настоящим multimodal request, затем sourceText попадает
в вынесенный общий `server/eventAiDraft.js`. Text/voice контракт и fallback
сохранены; photo использует strict без regex-fallback при provider/JSON-ошибках.
Новый клиент может создаваться только по контакту из OCR-текста: прежний side
effect текстового ввода не расширен. DeepSeek/неизвестная vision-модель — 503
без provider/billing; отключённый ИИ — 503; unreadable — 422; provider — 502;
баланс — 402. Провайдер не подменяется. Две независимые операции:
`event_photo_ocr` и `event_draft`, через текущий billing-adapter с tenant/user,
резервом, usage settlement и возвратом при network/HTTP/empty response.
Успешная операция оплачивается даже при отсутствии читаемого текста или ошибке
следующего этапа. Ошибка JSON после успешного ответа провайдера не возвращает
стоимость выполненного запроса. Это явно описано в диалоге и README.
В billing обе операции используют существующий `feature=event_draft`, без
зависимости от новых enum или миграции. Логический OCR-этап остаётся отдельным
multimodal вызовом.

Для камеры понадобился отсутствовавший `expo-image-picker ~55.0.24` и его
`expo-image-loader`. Другие root/mobile dependencies не добавлялись; peer-флаги
существующих lock entries сохранены из исходного снимка. Нативному модулю нужна
следующая сборка владельцем. Текущий установленный APK не обновлялся.
Контракт: [README.md](README.md).

## TDD: RED перед реализацией

Все первичные failing-тесты написаны и запущены до соответствующего кода:

| Команда | Фактический результат | Exit | Лог в scratch/vedelo-photo-checks |
| --- | --- | --- | --- |
| `node --test server/aiChatCompletion.test.js helpers/aiEventDraftHints.test.mjs helpers/aiEventDraftContacts.test.mjs` | baseline 18 passed / 0 failed | 0 | baseline.log |
| `node --test tests/server/aiPhotoDraft.test.cjs` | RED 22 failed / 0 passed: отсутствует photo route | 1 | red-server.log, red-server.exit |
| `cd mobile && npm test -- --runTestsByPath src/features/events/photoDraft.test.tsx` | RED 1 suite failed: отсутствует PhotoDraftSection; assertions ещё не выполнялись | 1 | red-mobile.log, red-mobile.exit |
| browser command ниже | RED 1 failed: отсутствует photo route | 1 | red-browser.log, red-browser.exit |
| `cd mobile && npm test -- --runTestsByPath src/features/events/applyPhotoDraft.test.ts` | RED 1 suite failed: отсутствует applyPhotoDraft | 1 | red-mobile-apply.log, red-mobile-apply.exit |

После первичного GREEN набор расширен проверками billing-adapter,
реального getRequestContext с mock session/token lookup, EXIF/WebP/resize,
actual native editor/client/cache, actual skipRefresh, геометрии и состояний UI.
Дополнительные тесты не выдаются за первичный RED. При проверке совместимости
с исходной billing-схемой добавлен отдельный RED: `node --test tests/server/aiPhotoBilling.test.cjs` — 5 failed / 4 passed, exit 1 (`red-billing-compat.log/json`),
до исправления mapping logical OCR → существующий billing feature `event_draft`.

## Итоговые GREEN и команды

Каталог всех выводов и JSON с точными командами, cwd, exit и длительностью:
`/home/aleksei/.hermes/cache/scratch/vedelo-photo-checks`.

```bash
node --test tests/server/aiPhotoDraft.test.cjs tests/server/aiPhotoBilling.test.cjs \
  server/aiChatCompletion.test.js helpers/aiEventDraftHints.test.mjs \
  helpers/aiEventDraftContacts.test.mjs
```

**51 passed, 0 failed, 0 skipped, exit 0**, `green-server-final.log/json`.
Проверены denied auth/tariff без чтения тела/provider, payload tenant и чужие
client/service IDs, валидные PNG/JPEG/WebP, EXIF/resize/strip, MIME/base64/broken/
SVG/URL/oversize/pixel/body limits, OCR empty/failure, 402 на обоих этапах,
unsupported/disabled provider, no regex fallback, создание клиента из OCR
контакта и прежний text fallback. Billing-adapter: reserve→fetch→settle,
reserve→fetch→refund на network/HTTP/empty; balance/unsupported без fetch;
личный AITunnel без платформенного списания. DB/billing dependencies здесь mocks.

```bash
cd mobile
npm test -- --testTimeout=30000 --runTestsByPath \
  src/features/events/photoDraft.test.tsx src/features/events/applyPhotoDraft.test.ts \
  src/features/events/createOptions.test.ts src/features/events/voiceDraft.test.ts \
  src/features/events/createScreen.test.tsx \
  src/features/navigation/CreateWorkItemMenu.photo.test.tsx \
  src/shared/api/client.test.ts src/features/integrations/AiUsagePanel.test.tsx
npm run typecheck
```

**8 suites / 73 passed, 0 failed, exit 0**, `green-mobile-final.log/json`.
**TypeScript exit 0**, `typecheck-final.log/json`. Включены реальный native
редактор без автосохранения, чужой/новый клиент, permissions/cancel/broken/
oversize/offline/retry, menu allowAi и обе терминологии, голосовой регрессионный
набор и no-refresh после 401. Expo picker/native API/storage mocks, не device QA.

**Точечный ESLint: exit 0, ошибок/предупреждений нет**, `lint-final.log/json`.
Все изменённые web/server/test JS/CJS входят
в команду (полный argv в JSON). Mobile покрыт tsc/Jest, согласно ESLint ignore.
**`git diff --check`: exit 0**.

## Реальный браузер и UX gates

```bash
ESBUILD_MODULE=/home/aleksei/.hermes/cache/scratch/modal-browser-tools/node_modules/esbuild \
PLAYWRIGHT_MODULE=/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright \
node --test tests/components/aiPhotoDraft.browser.test.cjs
```

**1 passed, 0 failed, 0 skipped, exit 0**, `green-browser.log/json`.
Стенд использует настоящие MobileBottomNav, desktop CreateEventFab, shared hook,
PhotoDraftModal, Modal, AppButton, Notice, Jotai, TanStack Query, resolver,
CompactEventForm/Input и обработанные global CSS. Контекстные внешние hooks/
навигация/сессия/БД и provider подменены. Реальный локальный HTTP передаёт запрос
в настоящий server handler. Это проверка HTTP/проводки/безопасности/UX,
**не доказательство точности OCR и не полный NextAuth E2E с MongoDB**.
Тестовое изображение — настоящий PNG, в памяти растеризована отдельная печатная
заметка «Клиент Анна. Шоу 15 октября. Гонорар 50000 рублей.»; скриншот владельца
не использовался как распознанная бумажная заметка.

8 сочетаний: 390/1365 px × light/dark × заказ/мероприятие; отдельный короткий
экран 390×360. Загрузка/preview без POST, неверный файл, capture input, loading/
disabled, HTTP ошибка и ручной повтор, просмотр sourceText, перенос в реальную
форму с metadata и клиентом, hidden photo при denied tariff. **16 HTTP попыток
распознавания, 0 POST /api/events**, pageerror отсутствует.
Сохранено **32 полноэкранных HTML/CSSOM и 32 PNG**, плюс **28 scope HTML**,
`browser/metrics.json`, `browser/geometry.json`. Scopes получены из фактического
DOM: новое меню (4 снимка), диалог/error/result (24), с темой и CSSOM. В scope
меню положение переведено в локальный flow для standalone проверки; исходные
геометрия/скриншоты проверяются отдельно. Соседний desktop FAB заголовок не
рестайлился и не входит в gate scope нового центрального меню.

| Измерение на настоящем меню | Light | Dark |
| --- | --- | --- |
| Computed heading background | rgb(243,241,235), alpha=1 | rgb(59,47,29), alpha=1 |
| Computed text | rgb(28,29,31) | rgb(241,231,212) |
| Contrast | **14.935:1** | **10.632:1** |
| Border / height | 1 px / 38 px | 1 px / 38 px |
| Heading width (заказ / мероприятие) | 141.30 / 203.13 px | 141.30 / 203.13 px |

Дополнительная геометрия по полным HTML/CSSOM снимкам в 390×740 и 390×280,
обе темы: **4 states passed**, все четыре targets ≥44 px, заголовок не
перекрывает первую кнопку; последнее действие достигается прокруткой.
`geometry.log/json`, exit 0.

```bash
DS_REQUIRE_BROWSER=1 node /home/aleksei/projects/ux-ui-agent-skills/scripts/measure_render.mjs \
  /home/aleksei/.hermes/cache/scratch/vedelo-photo-checks/gates/*.html
DS_REQUIRE_BROWSER=1 node /home/aleksei/projects/ux-ui-agent-skills/scripts/verify_responsive.mjs \
  /home/aleksei/.hermes/cache/scratch/vedelo-photo-checks/gates --widths=390,1365
DS_REQUIRE_BROWSER=1 node /home/aleksei/projects/ux-ui-agent-skills/scripts/verify_target_size.mjs \
  /home/aleksei/.hermes/cache/scratch/vedelo-photo-checks/gates --widths=390,1365
```

Все **exit 0 без skip**: measure_render — все видимые текстовые элементы
28 HTML соответствуют WCAG AA; responsive — 28 HTML без horizontal overflow;
target_size — **320 targets** в двух ширинах проходят ≥24×24/разрешённые исключения.
Логи: `gate-measure-files`, `gate-responsive`, `gate-target` (`.log/.json`).
Первый неправильный вызов measure_render с каталогом вместо списка файлов
проверил directory listing; его exit 0 **не принят** как UX-проверка.

## Промежуточные результаты и ограничения

Сохранены и не скрываются: первый native GREEN имел ошибки моков/ожидания
слишком общего текста (исправлены); lint-first — 1 ошибка имени переменной
`module` в тестовом loader (исправлено); typecheck-first — неверный palette key,
позднее typecheck — tuple spread в тестовом mock (исправлены). Параллельный
Jest GREEN: 3 timeout failures при 5 сек; финальный прогон с 30 сек — 73/73.
Первый browser GREEN подтвердил действия, но computed dark heading был
недостаточно контрастен; исправлен локально, финальный контраст проверяется assert.
`npm install` первоначально получил EROFS стандартного npm cache; установка
прошла с cache в scratch. Неудачная попытка root install прервана, root
зависимости не изменились. Первый запуск build стартовал до создания node_modules
symlink в копии: `next: not found`, exit 127. Это ошибка порядка запуска стенда.

### Production build

Предыдущая локальная сборка не подтверждена. Последующая серверная сборка и временное ограничение 1.35.1 описываются отдельно в ROLLOUT.md.

Реальный AI/AITunnel/OpenAI/DeepSeek, рукописная OCR-точность, фото с телефона,
физическая Android-камера/permissions, установленная PWA, production, живой
MongoDB и фактическое списание денег **не проверялись**. Ключи не читались,
реальные БД не менялись. Никакой skipped не назван passed. Новая библиотека
native должна войти в следующую отдельную сборку владельцем.

## Сохранение чужих изменений

Исходный manifest: `/home/aleksei/.hermes/cache/scratch/vedelo-photo-baseline/manifest.json`.
Сверены 2788 исходных файлов: 20 ожидаемо изменены, 2768 сохранены с прежним SHA-256, удалённых файлов 0. Новых файлов задачи 16. Результат — `preservation-final.json`.
Точечные дополнения в уже грязных файлах сохраняют предыдущие правки; существующие
mobile lock entries сохранены побайтно по значениям, добавлены только image-picker/
loader и root dependency. Android app.json и остальные исходные файлы вне списка
не менялись. PartyCRM/auth/offline ядро/схемы/инфраструктура не затронуты.

## Точный список файлов этой задачи

- `app/api/events/ai-draft/route.js`
- `app/api/events/ai-photo-draft/route.js`
- `app/api/mobile/v1/events/ai-photo-draft/route.js`
- `app/globals.css`
- `components/MobileBottomNav.js`
- `components/PhotoDraftModal.js`
- `docs/AI_HANDOFF.md`
- `docs/ROADMAP.md`
- `docs/ai-photo-draft/README.md`
- `docs/ai-photo-draft/REPORT.md`
- `helpers/useEventCreateMenu.js`
- `layouts/content/AiUsageAdminContent.js`
- `layouts/content/IntegrationsContent.js`
- `mobile/app/events/edit/[id].tsx`
- `mobile/package-lock.json`
- `mobile/package.json`
- `mobile/src/features/events/PhotoDraftSection.tsx`
- `mobile/src/features/events/applyPhotoDraft.test.ts`
- `mobile/src/features/events/applyPhotoDraft.ts`
- `mobile/src/features/events/createOptions.ts`
- `mobile/src/features/events/createScreen.test.tsx`
- `mobile/src/features/events/photoDraft.test.tsx`
- `mobile/src/features/integrations/AiUsagePanel.tsx`
- `mobile/src/features/navigation/CreateWorkItemMenu.photo.test.tsx`
- `mobile/src/features/navigation/CreateWorkItemMenu.tsx`
- `mobile/src/shared/api/client.test.ts`
- `package-lock.json`
- `package.json`
- `schemas/aiUsageSchema.js`
- `server/aiChatCompletion.js`
- `server/aiPhotoDraft.js`
- `server/eventAiDraft.js`
- `tests/components/aiPhotoDraft.browser.test.cjs`
- `tests/fixtures/aiPhotoHarness.cjs`
- `tests/server/aiPhotoBilling.test.cjs`
- `tests/server/aiPhotoDraft.test.cjs`
