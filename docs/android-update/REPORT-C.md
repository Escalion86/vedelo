# Этап В — коммерческие предложения Android

Этап В реализован полностью в согласованных границах: **PROPOSAL-01..06 закрыты**. Заключительные проверки GREEN: сервер99/99, native53/53, браузер16/16, typecheck/ESLint/scope exit0. Всего168 поведенческих тестов. Телефон и production не проверены.

Только `/home/aleksei/projects/vedelo-android-proposals-20261011`, ветка `work/android-proposals-20261011`, HEAD `35f9a64c29c0b8c078a0b54149a1949069a868ed`. Commit/push/deploy/EAS и операции переключения/перезаписи git не выполнялись. Прочитаны AGENTS.md, весь AI_HANDOFF, релевантный ROADMAP, UI_CONVENTIONS, BRIEF-C, актуальные web компоненты/routes и обязательные rich-text-media-editors/cloud/TDD инструкции. База не переобъединялась.

## Реализация и интеграция

- PROPOSAL-01: локальный визуальный rich text, исходный sanitizer и tenant cloud protocol, native multipart upload, оригинальный resolveUploadedFileUrl. Фото JPEG/PNG/WebP/GIF до 10 МБ, MP4/WebM до 40 МБ; logo PNG/JPEG/WebP до 5 МБ. Правка заголовка не переписывает richtext, legacy содержимое или медиа. Bearer отсутствует в WebView; CSP, opaque iframe, закрытые file access/cookies/popups и узкий bridge ограничивают scripts и навигацию.
- PROPOSAL-02: каталог шаблона читается напрямую из реального GET services независимо от web atom/query hydration. Loading/error/retry явные; сетевой отказ не выдаётся за пустой каталог. Снимки изменённых и удалённых услуг сохраняются.
- PROPOSAL-03: отдельная библиотека шаблонов и общий ProposalEditorScreen, unsaved preview на настоящем ProposalPageView, защита ухода. Полный draft сохраняется при ошибке; известный ID созданного шаблона предотвращает повторный POST после ошибки GET. Preview ничего не сохраняет/публикует; ошибка видима. Публичные /p и token flow не менялись.
- PROPOSAL-04: общий ProposalPackagesEditor для КП и шаблонов,6 вариантов ×30 позиций, каталог/свои позиции, recommended/manualTotal, автоматическая сумма в копейках, подтверждения удаления и Apply/Cancel модальных изменений.
- PROPOSAL-05: defaults.packages, legacy materialization, создание из шаблона/без шаблона и clone используют существующий серверный pipeline. Использованный шаблон DELETE архивирует, свежий GET материализует legacy defaults.
- PROPOSAL-06: существующие fieldHelp для секции, заголовка, срока, сообщения, текстовых блоков и recommended; у секции один собственный заголовок, документы не потеряли DOCX/вложения. Родителю не нужен дублирующий внешний заголовок.

Дополнительно реализован полный список КП работы: edit/DELETE/publish/revoke/share/copy/Telegram и повтор только последних неудачных доставок. Sent/accepted/applied следуют web-контракту. После действий перечитывается точный КП, после apply/delete — точная работа. Selected DELETE сохраняет event.agreedProposal/servicesIds/contractSum; selected revoke запрещён UI и сервером. Closed/canceled проверяются сервером и по свежему чтению работы. Приватные методы используют feature-local guard + существующий getRequestContext(req): invalid/malformed Bearer не fallback в cookie, web cookie сохраняется. Cloud повторно проверяет тариф/tenant/owner/draft/работу; server directory не принимает клиентский tenant. Сохранены allowProposals и legacy allowDocuments fallback.

**Точный export для родителя:** named `EventProposalsSection` и `EventProposalsSectionProps` из `mobile/src/features/proposals/EventProposalsSection.tsx`.

```tsx
<EventProposalsSection
  eventId={event._id}
  eventStatus={event.status} // optional: draft | active | closed | canceled
  onApplied={(freshEvent) => { /* обновить данные работы */ }}
  onChanged={() => { /* инвалидировать данные родительского экрана */ }}
/>
```

`eventId: string` обязателен; `onApplied?: (event: AppliedEvent) => void`, `onChanged?: () => void`. `AppliedEvent` — feature-own проверенный subset свежего защищённого GET: `_id`, `status?`, `servicesIds`, `contractSum?`, `agreedProposal?`, `syncVersion?`, `updatedAt?`. Секция сама читает серверный статус и имеет свой заголовок. `local-*` не делает HTTP. EventDetailScreen намеренно не менялся: включение секции выполняет родитель. Самостоятельный route `/events/[id]/proposals` уже есть; editor `/events/[id]/proposals/[proposalId]`. Шаблоны: `/more/proposal-templates`, `/more/proposal-templates/[id]`, где `new` создаёт. В DocumentsSection добавлен отдельный вход; DOCX и вложения сохранены. Общий editor: `ProposalEditorScreen({kind:'template'|'proposal',id:string,eventId?:string,initialPreview?:boolean})` из одноимённого feature-файла; общий packages editor — там же в feature.

## Реальные API и DTO

Пути ниже относительны `/api`; bearer добавляет существующий native api client, а не JS редактора.

| Метод | Route | Назначение |
|---|---|---|
| GET/POST | events/[id]/proposals | Список/создание; templateId или sourceProposalId для clone |
| GET/PATCH/DELETE | proposals/[id] | Чтение/draft edit; PATCH `{action:'publish'|'revoke'|'apply'}`; удаление |
| POST | proposals/[id]/send-telegram | `{retryFailedOnly}`; partial_delivery HTTP207 остаётся частичным результатом |
| POST | proposals/[id]/logo | native multipart file, затем GET |
| GET | proposals/statuses | Существующие статусы |
| GET/POST | proposal-templates | Список/создание |
| GET/PATCH/DELETE | proposal-templates/[id] | Чтение/редактирование/удаление либо archive использованного |
| POST (новый) | proposals/[id]/preview | Render текущего draft без записи |
| POST (новый) | proposal-templates/[id]/preview | Render шаблона; id=new разрешён для несохранённого |
| GET (новый) | proposal-templates/defaults | Настоящие server defaults/legacy materialization |
| GET | services | Каталог, с нормализацией nullable description/price |
| GET | mobile/v1/events/[id] | Существующий защищённый alias: точная работа после apply/delete и статус |
| POST | escalioncloud | multipart files + directory; proposal media scoped сервером в artistcrm/tenantId/kind/id |

DTO feature-local Zod (`api.ts`): Proposal с packages/blocksSnapshot/mediaSnapshot/messageText/appearance/status/selection/applied/sent/delivery/publicUrl/renderedMessage, ProposalTemplate с blocks/media/messageTemplate/defaults.packages/defaults.servicesIds, ProposalPackage/Line/Block/Media и AppliedEvent. Shared DTO, auth/offline и Mongo-схемы не менялись. Служебные поля/private tokens не попадают в feature DTO. Save/action сравнивают exact ID и snapshot свежего GET с mutation response; delete проверяет отсутствие в свежем списке и перечитывает работу. validUntil null теперь явно очищается в PATCH и preview, без превращения в epoch.

Новые приватные preview/defaults routes и изменения upload/auth нужны на сервере перед использованием native workflow; деплой не выполнялся.

## Зависимости и проверка

Mobile приложение осталось версии 1.1.3, root 1.35.11. Runtime react-native-webview **13.16.0** соответствует Expo SDK55 bundledNativeModules; dev esbuild **0.25.12**, react-native-web **0.21.4** только для браузерного стенда (SDK55 ~0.21.0). Изменены только собственные mobile/package.json и package-lock.json. Перед install выполнен lstat: mobile/node_modules был symlink; под flock скопирован источник, unlink выполнен только для своей ссылки. Mobile теперь частный каталог, root symlink остался без изменения. install/copy логи: private-dependencies и web-test-dependency, exit0. Новых бинарных продуктовых ассетов нет: actual InterTight fonts заморожены в generated TS как текст data-font.

Каждая тяжёлая команда проходит `/home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock` через `C/run-check.sh`; command/queued/started/finished и code фиксируются в .log/.exit. Полный Jest не запускался. Baseline typecheck повторён **до продуктовых правок**, exit0; ожидание общей очереди около 40 минут не является длительностью tsc. Все заключительные проверки завершены; точные команды, журналы, counts и exit files — в `C/result.json`.

Промежуточный финальный GREEN: `server-final` **99/99 exit0**, `native-final` **52/52 exit0** (7 focused suites, включая DocumentsSection), `browser-final` **16/16 exit0**. На скриншоте замечены internal block.type в подписи; добавлен отдельный тест русских имён. После минимального исправления будут повторены native/browser/typecheck. Server код после server-final не менялся. Повтор native после последней UI-правки: `native-green-final` **53/53 exit0**. ESLint `eslint-final` **exit0**, tsc `typecheck-green-final` **exit0**. Browser повтор `browser-green-final` **15/16 exit1**:360/dark ожидание preview после click превысило30000ms. Добавлена диагностическая запись состояния страницы/скриншота при сбое; assertions и timeouts не менялись. Последующий `browser-green-retry` выполнил оба файла последовательно (`--test-concurrency=1`): **16/16 exit0**, с прежними assertions/timeouts. Причина единственного промежуточного таймаута не доказана; он сохранён как нестабильность браузерного стенда, без заявления об исправлении Android. Диагностика настроена для возможного повторного сбоя; на успешном повторе диагностических failure-файлов не возникло.

## Заключительные команды и журналы

Каждая тяжёлая команда ниже запущена через `bash /home/aleksei/reports/vedelo/2026-10-11/update/C/run-check.sh <name> <command...>`, внутри общего flock. Рабочая папка — назначенный проект. Все .log/.exit — в `C/` каталоге отчётов.

| Проверка | Фактическая команда (внутри flock) | Результат / журнал |
|---|---|---|
| Server | `node --test tests/android-proposals/routes.test.cjs tests/android-proposals/context.test.cjs tests/android-proposals/preview.test.mjs tests/android-proposals/upload.test.cjs tests/android-proposals/preview-routes.test.cjs helpers/proposalAccess.test.mjs helpers/proposalContent.test.js helpers/proposalRichText.test.mjs helpers/escalionCloudUpload.test.mjs tests/proposalAppearance.test.mjs tests/proposalStatus.test.mjs` |99/99, exit0; server-final.log/.exit |
| Native focused | `cd mobile && npm test -- --runTestsByPath src/features/proposals/api.test.ts src/features/proposals/packages.test.tsx src/features/proposals/editor.test.tsx src/features/proposals/section.test.tsx src/features/proposals/bridge.test.ts src/features/proposals/library.test.tsx src/features/documents/DocumentsSection.test.tsx` |53/53,7 suites; exit0; native-green-final.log/.exit |
| Browser | `node --test --test-concurrency=1 tests/android-proposals/editor.browser.test.cjs tests/android-proposals/native.browser.test.cjs` |16/16, exit0; browser-green-retry.log/.exit |
| Typecheck | `cd mobile && npm run typecheck` |exit0; typecheck-green-final.log/.exit |
| ESLint | `npx --no-install eslint app/api/escalioncloud/route.js 'app/api/events/[id]/proposals/route.js' 'app/api/proposal-templates/[id]/route.js' 'app/api/proposal-templates/[id]/preview/route.js' app/api/proposal-templates/defaults/route.js app/api/proposal-templates/route.js 'app/api/proposals/[id]/logo/route.js' 'app/api/proposals/[id]/route.js' 'app/api/proposals/[id]/preview/route.js' 'app/api/proposals/[id]/send-telegram/route.js' app/api/proposals/statuses/route.js server/proposalPreview.mjs server/proposalRequestContext.js` |exit0; eslint-final.log/.exit |
| Frozen renderer | `node mobile/scripts/build-proposal-local.cjs` |exit0; local-build-final-retry.log/.exit |
| Scope | `git diff --check`, branch/HEAD/version/lstat + строгий whitelist файлов |exit0; scope-complete.log/.exit |

Скриншоты20шт: richtext-{360,390,420}-{light,dark}.png, native-top-{360,390,420}-{light,dark}.png, native-{360,390,420}-{light,dark}.png, public-preview.png, native-section-dark.png. Браузерные проверки — обе темы, ширины360/390/420 и экран высотой580; no-overflow, реальные interactions, console/pageerror, safe media DOM roundtrip. Вручную просмотрены представительные360/dark и420/light, клиентский blue preview и richtext360/dark. Icons/native boundary на стенде замоканы; реальная Android графика не заявляется проверенной. `native-{width}-{theme}.png` сняты сразу после закрытия preview и могут содержать переход закрытия модалки; для стабильного начала формы используйте `native-top-*`, для клиентской страницы — `public-preview.png`.

Полная история RED/GREEN и промежуточных setup failures сохраняется в `result.json.checks`, включая прежние ненулевые exits: они не являются финальными GREEN. Assertions/timeouts не ослаблялись. После последней продуктовой правки повторены native и typecheck; браузер повторён после диагностической правки теста. Сервер после своего GREEN не менялся. Новых продуктовых правок после этих GREEN нет.

## TDD: реальные RED, исправления и GREEN

Все журналы находятся в `/home/aleksei/reports/vedelo/2026-10-11/update/C/`. Существенные циклы:

| RED log (exit1) | Ожидаемый провал | Исправление / подтверждение |
|---|---|---|
| upload-red (8:1 pass/7 fail) | Tenant/owner/tariff/MIME | upload-green 8/8 exit0; последующие усиления в финальном прогоне |
| context-red (4/4 fail) | Отсутствие feature-local auth guard | Контекст реализован; server-green контекст проходит |
| preview-red (3/3 fail) | Отсутствие rendered preview builder | Builder использует оригинальные helpers; далее private preview tests |
| corrected-red (routes31:30 pass/1 fail; native30:27 fail/3 pass) | Logo bearer и отсутствующие native exports | Auth logo + native workflow/editor реализованы |
| section-bridge-red (10/10 fail) | Отсутствие секции/узкого bridge | Секция и bridge реализованы |
| extensions-red (server12 fail; native17:7 fail/10 pass) | Preview/defaults/library/API | Server extensions-green12/12; native повторяется финально |
| expiry-red (34:33 pass/1 fail) | PATCH null превращался в epoch | Явное очищение даты |
| server-green (47:46 pass/1 fail) | Новый filename-only cloud URL без tenant | Исходный resolveUploadedFileUrl применяется к server directory |
| upload-filename-red (10:9 pass/1 fail) | Malformed Authorization fallback | Локальный upload guard |
| preview-clear-red (4:3 pass/1 fail) | null не очищал expiry preview | Object.hasOwn для input.validUntil |
| catalogue-red (1 fail/5 skipped) | Каталог при сетевом отказе оставался доступным | Явное loading/error состояние и retry |
| workflow-red (3 fail/22 skipped) | Свежий closed-status/старые delivery failures/readEvent | Exact event read, актуальный status и latest delivery map |
| bridge-editability-red (1 fail/3 pass) | Нет булевого setEditable | Блокировка visual editor при операции |
| mutation-red (3 fail/16 skipped) | Action ID/snapshot mismatch, raw legacy archive | Exact сравнение и materialized archive read-back |
| labels-red (1 fail/6 skipped) | UI показывал cover/intro/packages вместо русских подписей | Имена как в web-editor; fallback медиа Фото/Видео/Ссылка на видео |
| typecheck-final (exit2) | TS17001: дублирован maxLength обложки | Дубликат удалён; финальный tsc повторён |
| browser-corrected-red (16:6 pass/10 fail) | Readonly/форматирование visual bold терялось sanitizer | Канонизация b/i/strike в strong/em/s перед исходным sanitizer; allowlist не ослаблен |

Setup failures не выдаются за ожидаемый RED: api/ui первые прогоны имели0tests из-за cross-realm missing-module Error; routes-red два logo mocks node:crypto; API mock response queue очищалась clearAllMocks вместо mockReset; multipart JSDOM FormData заменён настоящим RN FormData. Browser-green имел setup Chrome ARM64 path/stand SafeArea; часть browser-corrected-red выявила JSX classic/React undefined в замороженном renderer. Сборка/стенд исправлены на automatic JSX и правильный react package alias. local-build-final-retry exit0. Промежуточные native UI 18/20 выявили двойную подпись и cold5000ms timeout; UI подпись исправлена, native-ui-retry **17/17 exit0**. Documents light case ранее имел5000ms timeout; финальный повтор включён, timeout/assertions не изменены.

## Android testID

- `event-proposals-section`
- `proposal-add-package`
- `proposal-apply-${item._id}`
- `proposal-card-${item._id}`
- `proposal-catalog-${item.id}`
- `proposal-client-preview`
- `proposal-create`
- `proposal-custom-${item.id}`
- `proposal-delete-${item._id}`
- `proposal-edit-${item._id}`
- `proposal-edit-${item.id}-${index}`
- `proposal-preview`
- `proposal-publish-${item._id}`
- `proposal-remove-${item.id}-${index}`
- `proposal-remove-package-${item.id}`
- `proposal-revoke-${item._id}`
- `proposal-richtext`
- `proposal-richtext-image`
- `proposal-richtext-video`
- `proposal-save`
- `proposal-share-${item._id}`
- `proposal-template-${item._id}`
- `proposal-template-create`
- `proposal-templates-entry`

## Непроверенные границы

Нет ADB, production auth, EAS/реального телефона. Проверка Chromium/RN Web — только стенд с mock HTTP/Expo/native boundary и нулевыми safe-area insets. Реальная Android клавиатура/IME, системные отступы, hardware Back, нативный WebView и picker/file playback, реальные cloud/Telegram/Share и production API остаются для QA владельца. Настоящее UI и публичный renderer используются в стенде; media DOM/URL сохраняются, сетевой media playback в стенде отключён. Это не приёмка на телефоне или production. Полный Jest намеренно оставлен родителю.

## Точный список собственных файлов

BRIEF-C.md был исходным untracked входом и не изменялся; он не включён в список собственных изменений. AGENTS/AI_HANDOFF/ROADMAP/версии/.easignore, shared DTO/auth/offline/Mongo/public token/EventDetail/menu/UI не затронуты.

- `app/api/escalioncloud/route.js`
- `app/api/events/[id]/proposals/route.js`
- `app/api/proposal-templates/[id]/preview/route.js`
- `app/api/proposal-templates/[id]/route.js`
- `app/api/proposal-templates/defaults/route.js`
- `app/api/proposal-templates/route.js`
- `app/api/proposals/[id]/logo/route.js`
- `app/api/proposals/[id]/preview/route.js`
- `app/api/proposals/[id]/route.js`
- `app/api/proposals/[id]/send-telegram/route.js`
- `app/api/proposals/statuses/route.js`
- `docs/android-update/REPORT-C.md`
- `mobile/app/events/[id]/proposals/[proposalId].tsx`
- `mobile/app/events/[id]/proposals/index.tsx`
- `mobile/app/more/proposal-templates/[id].tsx`
- `mobile/app/more/proposal-templates/index.tsx`
- `mobile/package-lock.json`
- `mobile/package.json`
- `mobile/scripts/build-proposal-local.cjs`
- `mobile/src/features/documents/DocumentsSection.test.tsx`
- `mobile/src/features/documents/DocumentsSection.tsx`
- `mobile/src/features/proposals/EventProposalsSection.tsx`
- `mobile/src/features/proposals/LocalWebView.tsx`
- `mobile/src/features/proposals/ProposalEditorScreen.tsx`
- `mobile/src/features/proposals/ProposalPackagesEditor.tsx`
- `mobile/src/features/proposals/ProposalPreview.tsx`
- `mobile/src/features/proposals/ProposalTemplatesScreen.tsx`
- `mobile/src/features/proposals/RichTextEditor.tsx`
- `mobile/src/features/proposals/api.test.ts`
- `mobile/src/features/proposals/api.ts`
- `mobile/src/features/proposals/bridge.test.ts`
- `mobile/src/features/proposals/bridge.ts`
- `mobile/src/features/proposals/editor.test.tsx`
- `mobile/src/features/proposals/library.test.tsx`
- `mobile/src/features/proposals/limits.ts`
- `mobile/src/features/proposals/localAssets.generated.ts`
- `mobile/src/features/proposals/localDocument.ts`
- `mobile/src/features/proposals/packages.test.tsx`
- `mobile/src/features/proposals/runtime/editor.js`
- `mobile/src/features/proposals/runtime/preview.jsx`
- `mobile/src/features/proposals/section.test.tsx`
- `mobile/src/features/proposals/uploadUrl.generated.ts`
- `server/proposalPreview.mjs`
- `server/proposalRequestContext.js`
- `tests/android-proposals/context.test.cjs`
- `tests/android-proposals/editor.browser.test.cjs`
- `tests/android-proposals/native.browser.test.cjs`
- `tests/android-proposals/native.fixture-api.ts`
- `tests/android-proposals/native.fixture.tsx`
- `tests/android-proposals/preview-routes.test.cjs`
- `tests/android-proposals/preview.test.mjs`
- `tests/android-proposals/routes.test.cjs`
- `tests/android-proposals/upload.test.cjs`
