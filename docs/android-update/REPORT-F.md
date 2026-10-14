# Этап F — исправления серверного review

Исправлены только SEC-01, SEC-02, SEC-03, LOG-01, LOG-02 из `/home/aleksei/reports/vedelo/2026-10-11/update/review-server.json`. Финальные проверки завершены: **GREEN 163/163**, **Node B/C/E 146/146**, **ESLint 0 ошибок / 0 предупреждений**, все exit **0**, skips/cancelled **0**. Результаты отдельных прогонов не суммируются. Unresolved IDs: **нет**.

AGENTS.md, docs/AI_HANDOFF.md полностью, релевантные разделы ROADMAP и BRIEF-F прочитаны. Делегирования не было. Начальная сверка всех **2960** файлов с проверенным manifest координатора post-E не выявила расхождений. Baseline/копии baseline-files не изменялись. BRIEF-F создан координатором до запуска, входит в baseline и не относится к собственному delta. Сохранены все изменения A–E. ROADMAP, версии/dependencies/lockfiles, mobile/, schemas/models, auth/DTO/offline/sync, public capability и sanitizer не изменены. Команды commit/push/fetch/checkout/reset/stash/deploy/EAS не выполнялись; env/credentials/действующие токены не читались; node_modules только читался.

## Исправления

- **SEC-01.** Review context отклоняет любой присутствующий пустой/повреждённый/объединённый/не-Bearer Authorization до shared context, без cookie fallback и DB/upstream. Отсутствие заголовка сохраняет web-cookie; корректный mobile Bearer работает через прежнюю auth. Та же локальная строгость сохранена для общего upload и workflow КП. Public review capability не изменена.
- **SEC-02.** Общий upload принимает только реальные destinations ниже. Запрещены traversal/dot segments/backslash/кодированные и повторные разделители, неизвестные проекты/папки, чужие tenant, смешение и дубли multipart-полей. Tenant-пути строит сервер. Сохранённые КП/шаблоны и связанная работа проверяются по tenant, опция allowProposals прежняя. Legacy users/services и mobile/profile повторно проверяют активного пользователя и его tenant. Review-page доступен только через существующий специализированный endpoint.
- **SEC-03.** Весь batch проверяется до upstream. JPEG/PNG/WebP/GIF декодируются настоящим sharp, проверяется фактический формат и лимит пикселей; перекодирование удаляет metadata. Имя — UUID с расширением фактического формата. Видео проверяется по структуре контейнера: MP4 — ISO BMFF box boundaries, video brand, moov/mdat; WebM — EBML DocType=webm, Segment, Info/Tracks/Cluster. Имя UUID.mp4/webm. Исходное имя и заявленный MIME не определяют публичный формат. Generic mobile document contract сохранён, заявленные изображения/видео также проверяются.
- **LOG-01.** Server limit MP4/WebM для медиа КП/шаблонов восстановлен до **50 MiB**, совместимо с web. Android UI/40 MiB не менялся.
- **LOG-02.** Create-from-template и template preview используют allowed контактные поля из уже загруженного access.user: проверяются user ID, tenant и archive, копируются только firstName/secondName/thirdName/phone/telegram. Body не подменяет контакты. Mobile DTO не расширен. Настоящий workflow mobile projection → create → saved/template preview → publish сохраняет Telegram; действительно пустой Telegram по-прежнему блокирует публикацию переменной.

## RED → GREEN

Продуктовый код не редактировался до фактического завершения обоих RED. SHA исходников и тестов фиксировались **до очереди**, сверялись после получения lock и после выполнения. В обоих RED исходные продуктовые SHA совпадают с post-E. Прогоны ниже используют один существующий `/home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock`, открытый **read-only**, exclusive flock. Каждый имеет уникальные `.json`, `.events.jsonl`, `.log`, queued/start/finished, реальный exit/counts; после завершения журналы неизменяемые.

| Прогон | Exit | Фактические counts | Журнал |
|---|---:|---|---|
| red-01 | 1 | tests=152, suites=0, pass=52, fail=100, cancelled=0, skipped=0, todo=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/F/red-01.log` |
| red-02 | 1 | tests=159, suites=0, pass=54, fail=105, cancelled=0, skipped=0, todo=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/F/red-02.log` |
| green-01 | 0 | tests=159, suites=0, pass=159, fail=0, cancelled=0, skipped=0, todo=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/F/green-01.log` |
| green-final | 0 | tests=163, suites=0, pass=163, fail=0, cancelled=0, skipped=0, todo=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/F/green-final.log` |
| node-bce-final | 0 | tests=146, suites=0, pass=146, fail=0, cancelled=0, skipped=0, todo=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/F/node-bce-final.log` |
| eslint-final | 0 | errorCount=0, warningCount=0, fatalErrorCount=0 | `/home/aleksei/reports/vedelo/2026-10-11/update/F/eslint-final.log` |

Подтверждённые RED-02 по IDs (только tests с соответствующим ID в имени; вспомогательные проверки отдельно):

| ID | Passed | Failed |
|---|---:|---:|
| LOG-01 | 2 | 2 |
| LOG-02 | 4 | 11 |
| SEC-01 | 23 | 30 |
| SEC-02 | 20 | 24 |
| SEC-03 | 1 | 37 |

Все RED failures — поведенческие assertions: доступ с cookie/запуск auth boundary при недопустимом заголовке, передача запрещённого directory, загрузка поддельного/повреждённого медиа и исходного имени, отказ 45/50 MiB, пустой Telegram/отказ publish при заполненном профиле. Не было module/not-found/fixture infrastructure failures. Отдельные контроли web и generic mobile documents проходили ещё в RED.

Замоканы только I/O/DB/auth boundary. Настоящие getRequestContext/reviewContext, mobile auth projection, profile resolver, routes, buildProposalSnapshot/buildProposalVariables, renderers, preview, unknown-variable/publish logic и sanitizer исполняются. Sharp настоящий. FFmpeg используется только в тестах для настоящих MP4/WebM (без добавления dependencies); 45/50 MiB — реальные bytes с корректным MP4 free box, без подмены size. Новая news-fixture после RED исправлена на уровне DB boundary: наличие новости определяется owner, наличие заказа — event. Исправляемая логика не мокалась. Старые C-fixtures используют настоящую PNG вместо строки fixture, настоящий валидатор и настоящий profile resolver с auth/DB boundary; assertions не ослаблены.

Точный argv каждого прогона записан в его JSON и в `F/result.json`. Адресный Node-набор включает исходные B reviews/HTTP-local contract/appearance/tariff tests, C routes/context/preview/upload/content/rich-text/access/appearance/status tests, E billing routes и stageE DTO. Полный build/Jest/browser и общий аудит не запускались.

## Upload destination allowlist

Поиск ограничен реальными вызовами helpers/cloudinary, InputImages, NewsRichTextEditor/newsFunc, EventProposalsSection/ProposalRichTextEditor, ProposalTemplateEditor, native proposals API и серверными mobile files/avatar wrappers.

| Вход | Серверное назначение и проверки |
|---|---|
| `artistcrm/users`, legacy `project=artistcrm,folder=users` | `artistcrm/users`; свой активный пользователь/tenant, декодируемые изображения ≤10 MiB. Shared legacy public папка сохранена для прежних URL/ответов. |
| `artistcrm/services`, legacy `project=artistcrm,folder=services` | `artistcrm/services`; свой активный пользователь/tenant, декодируемые изображения ≤10 MiB. Существующая tenant CRUD-привязка услуг не изменена. |
| `artistcrm/news/<ObjectId\|draft>` | Тот же server-built путь; только dev, существующая глобальная новость для ID, изображения ≤10 MiB. |
| `[artistcrm/]proposals/<ObjectId>` | `artistcrm/<authenticated tenant>/proposals/<ObjectId>`; allowProposals, свой draft и связанная tenant-scoped работа; изображения ≤10 MiB, MP4/WebM ≤50 MiB. |
| `[artistcrm/]proposal-templates/<ObjectId\|draft\|UUID>` | `artistcrm/<authenticated tenant>/proposal-templates/<ID>`; allowProposals, свой сохранённый шаблон; разрешены реальные temporary draft/UUID; изображения ≤10 MiB, MP4/WebM ≤50 MiB. |
| `artistcrm/<authenticated tenant>/mobile` | Server-built путь своего tenant; активный пользователь, один generic файл ≤5 MiB; image/video MIME проходят проверку. |
| `artistcrm/<authenticated tenant>/mobile/profile` | Server-built путь своего tenant; активный пользователь, одно декодируемое изображение ≤5 MiB. |

Legacy project/folder разрешены только когда дают один из этих allowlisted путей. `review-page` с любым префиксом запрещён общему upload; `/api/site/review-page/logo` остался прежним защищённым путём (tariff/tenant/sharp). Private documents, support tickets и proposal logo используют свои специализированные handlers, их контракт не менялся.

## SHA продуктовых файлов финальных проверок

Эти текущие SHA отдельно записаны в `testedProductFilesSha256` и `testedProductSha256ByCheck` result.json; каждый должен совпадать с SHA до очереди и после реального GREEN/Node/ESLint. Программная manifest-проверка сверяет это условие и весь собственный delta с baseline.

| Файл | SHA-256 |
|---|---|
| `app/api/escalioncloud/route.js` | `18ff2e821553924ad133dd9451e98baad0cca94ccf24348cbc150caaa96bacb9` |
| `app/api/events/[id]/proposals/route.js` | `5a97d872b0bc1ec053be8d7aceaa5e039b708b48d5100144d6b569608792244d` |
| `app/api/proposal-templates/[id]/preview/route.js` | `5a114ce4efede494de1e4370c2636cf84ca7d7592d5749b1c6dcaa58c9352208` |
| `server/clientReviews.js` | `b4a7e044256ed2d53e6c3b1b1767c9659983c5e385b7b3a43920cfe15af1071e` |
| `server/proposalRequestContext.js` | `16b9c1e139e14d139979ee5d66df17229654c6564c77f52a84b680236d03dbe4` |
| `server/validatedUploadFiles.js` | `02bece3f8c01758a9c65338f2a5d60d79b042bab3355a3f49837003eb1eb84f0` |

## Артефакты и ограничения

Полный собственный delta относительно **post-E, не HEAD**: **14 файлов** (6 продуктовых, 7 тестовых, этот отчёт). `fileCount/files/sha256`, исходные SHA, команды/exit/counts, защищённые файлы, unresolved IDs, allowlist и SHA реально проверенного продукта: `/home/aleksei/reports/vedelo/2026-10-11/update/F/result.json`. BRIEF-F исключён из delta. Программные проверки `manifest-build` / `manifest-verify` идут через тот же read-only lock; подтверждение и реальный exit находятся в отдельных JSON/log/events. Pending tests: **нет**.

Не тестировались реальное cloud.escalion.ru, его filesystem/Content-Type/Content-Disposition, production Web/PWA и действующие сессии, настоящая MongoDB/production tariffs, реальная облачная передача и доставка, APK/устройство/EAS/release. Проверка видео подтверждает допустимый контейнер, не декодирование кодеков. B HTTP-набор — изолированный localhost harness с синтетическими данными и mock DB/auth/cloud, не production auth. Проверка Android UI и полного production build не входит в F.
