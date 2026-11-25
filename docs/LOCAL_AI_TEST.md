# Проверка локального ИИ

Локальный ИИ доступен владельцу пространства с ролью `dev`. В Web/PWA откройте «Интеграции → ИИ-провайдер», выберите «Локальный (тест)», включите локальный ИИ и сохраните параметры. Переключатель «Распознавать аудио локально» отдельно включает STT. Общая пауза интеграции распространяется и на локальный ИИ.

| Поле | Значение для домашнего узла |
| --- | --- |
| Базовый URL чата | `http://127.0.0.1:18010/v1` |
| Локальная модель | Идентификатор из «Проверить подключение» для загруженной Qwen3-4B-Instruct-2507-Q4_K_M |
| URL распознавания аудио | `http://127.0.0.1:18011/v1/audio/transcriptions` |
| Таймаут | 1000–120000 мс. При пустом поле используются серверные значения, по умолчанию 20 с для чата и 30 с для STT. |

Кнопка «Проверить подключение» работает с введённым адресом до сохранения. Она запрашивает `/models` с бюджетом 5 с и показывает идентификатор модели, задержку или сообщение об ошибке. Чат, STT и голосовая карточка обращаются к loopback интерфейсу сервера Ведело через настроенный владельцем туннель. Сервер принимает адреса `127.0.0.1` и `[::1]` по HTTP или HTTPS и запрещает перенаправления.

## Что изменилось

| Файлы | Изменение |
| --- | --- |
| `layouts/content/IntegrationsContent.js`, `components/LocalAiSettings.js` | Выбор тестового провайдера для dev-владельца, включение, форма и проверка подключения. |
| `server/aiSettings.js`, `server/localAiAccess.js`, `app/api/ai/settings/route.js` | Роль проверяется у владельца tenant и текущего пользователя. PATCH сохраняет локальные параметры в `SiteSettings.custom`. Выбор локального ИИ хранится отдельно от прежних облачных настроек. Ключ `localAiKey` принимается при записи и остаётся на сервере. |
| `app/api/ai/local-test/route.js` | Dev-only `POST` проверяет список моделей через `GET /models`. Сетевая ошибка возвращает `{ "success": false, "error": "…" }`. |
| `helpers/siteSettingsCustom.mjs`, `server/fetchProps.js`, `app/api/site/route.js`, Avito, VK, Telegram и Android | Приватные поля исключены из общего API настроек, ответов интеграций и данных страницы. Общий API отклоняет запись локальных полей. Серверные обновления Avito, VK и Telegram пишут только свои поля, поэтому сохраняют параллельное обновление локального ИИ. |
| `server/localAiProvider.mjs`, `server/aiChatCompletion.js`, `server/callTranscription.js` | Общая проверка адреса и таймаута. Чат и STT используют локальный узел после явного включения и выбора. При сбое запрос переходит на настроенный облачный резерв. Пауза размыкателя фиксируется один раз для каждой серии сбоев чата или STT в процессе. Диагностика указывает фактического провайдера. |
| Серверные сценарии черновика и редактирования, телефония, фото и импорты | Вызовы передают контекст текущего пользователя. Фоновая телефония проверяет владельца tenant. Фото и предоплачиваемый импорт используют облачный режим с прежней тарификацией. |
| `app/api/events/voice-card/route.js` | Экспериментальный `POST` принимает `multipart/form-data` с `audio` до 25 МБ и необязательным `today` в формате `ГГГГ-ММ-ДД`. Доступен dev-владельцу с тарифом ИИ при включённом локальном ИИ. Ответ содержит `provider: "local"` и `fields`, пропущенные поля представлены как `null`. Для адреса берётся `localAiVoiceCardUrl`, затем `LOCAL_AI_VOICE_CARD_URL`, затем `http://127.0.0.1:18012`. |
| `.env.example`, `.env.deploy.example`, `docs/LOCAL_AI_NODE.md` | Параметры окружения описаны как серверные значения по умолчанию. |

## Проверки 25 ноября 2026

Серверные тесты запущены в PowerShell из корня проекта с заглушками провайдеров и временной standalone MongoDB для регрессий редактирования и Google-импорта.

```powershell
$env:AI_EDIT_TEST_MONGOD = 'C:/Program Files/MongoDB/Server/6.0/bin/mongod.exe'
$env:GOOGLE_IMPORT_TEST_MONGOD = $env:AI_EDIT_TEST_MONGOD
node --test --test-reporter=spec `
  server/aiChatCompletion.test.js server/callTranscription.test.mjs server/callAiAnalysis.test.js `
  tests/server/localAiProvider.test.mjs tests/server/localAiSettings.test.cjs tests/server/localAiVoiceCard.test.cjs `
  tests/server/aiAssistant.test.cjs tests/server/aiPhotoDraft.test.cjs tests/server/aiPhotoBilling.test.cjs `
  tests/server/aiEdit.test.cjs tests/server/googleImportParity.test.cjs tests/server/telegramQuestionnaireAi.test.cjs
```

```text
✔ transcription bounds local and cloud requests and reports who answered (73.7363ms)
✔ PATCH и local-test закрыты для обычного аккаунта, impersonation, архива и сменённой роли владельца (2373.8132ms)
✔ PATCH владельца сохраняет локальный выбор и адреса отдельно от облачных провайдеров (43.2147ms)
✔ local-test проверяет /models без редиректа и возвращает ошибку недоступного сервиса без 500 (45.6829ms)
✔ общие настройки удаляют localAi* из ответа, блокируют прямую запись и сохраняют закрытые поля в БД (51.3259ms)
ℹ tests 101
ℹ suites 0
ℹ pass 101
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 18897.2333
```

Регрессии смежных интеграций запущены отдельной командой.

```powershell
node --test tests/server/localAiSettings.test.cjs tests/server/mobileTelegram.test.cjs `
  tests/server/telegramQuestionnaireRoutes.test.cjs tests/server/clientAvitoContact.test.cjs `
  server/mobile/providerIntegrations.test.js
```

```text
ℹ tests 30
ℹ pass 30
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 2434.661
```

Точечный `npx --no-install eslint` по файлам изменения завершился без диагностик с кодом 0. `git diff --check` завершился с кодом 0.

Временный стенд собрал реальный `IntegrationsContent` через esbuild и Tailwind, подменил HTTP-ответы и запустил Playwright в Chromium Headless Shell. У `dev` проверены ввод параметров, проверка чернового URL, сообщение об ошибке, валидация таймаута, сохранение после перезагрузки, пауза и переход между провайдерами. У обычного пользователя отсутствовали локальные поля и запрос к защищённым настройкам. Во всех восьми сценариях проверены консоль и горизонтальное переполнение.

```text
PASS dev 390px light
PASS dev 390px dark
PASS dev 1365px light
PASS dev 1365px dark
PASS user 390px light
PASS user 390px dark
PASS user 1365px light
PASS user 1365px dark
```

HTTP-проверку запустил на настоящем Next dev с временной MongoDB, подписанными тестовыми сессиями и двумя HTTP-заглушками на loopback. В проверке участвовали dev-владелец, обычный владелец и сотрудник пространства разработчика.

```powershell
$env:LOCAL_AI_SMOKE_NEXT_MODE = 'dev'
$env:NEXT_DIST_DIR = '.next-http-smoke-retry'
node --test '.next-local-ai-source/local-ai-http-smoke.cjs'
```

```text
dev: PATCH/GET 200, GET /v1/models via local-test 200 with model and latency
non-dev owner and same-tenant member: settings/test/site mutation 403, /api/site 200 without local data
voice/draft: dev local, other accounts AITunnel; voice-card dev 200, non-dev 403
offline local: local-test 200 false, 4/4 voice and 4/4 draft requests use AITunnel, one fallback log per provider kind
✔ development HTTP smoke for Local AI and tenant isolation (24880.0444ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 26030.6864
```

Production-сборка выполнена из корня рабочей копии с синтетическим окружением. Временный `skip-next-env.cjs` перенаправил загрузку env-файлов Next.js в пустой каталог. Результат записан в отдельный `NEXT_DIST_DIR`.

```powershell
$env:NODE_OPTIONS = '--require=D:/Programming/Projects/vedelo/.next-local-ai-source/skip-next-env.cjs'
$env:MONGODB_URI = 'mongodb://127.0.0.1:27099/vedelo_local_ai_qa'
$env:NEXTAUTH_SECRET = 'synthetic-local-ai-build-only'
$env:DOMAIN = 'http://127.0.0.1:3018'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:NEXT_DIST_DIR = '.next-local-ai-root-check'
$env:RAYON_NUM_THREADS = '4'
npm run build -- --webpack
```

```text
> vedelo@1.48.2 build
> next build --webpack
▲ Next.js 16.3.5 (webpack)
✓ Compiled successfully in 2.8min
  Finished TypeScript in 21ms ...
✓ Generating static pages using 15 workers (220/220) in 15.5s
  Finalizing page optimization ...
  Collecting build traces ...
├ ƒ /api/ai/local-test
├ ƒ /api/ai/settings
├ ƒ /api/events/voice-card
```

Сборка вернула код 0, файл `BUILD_ID` и все три маршрута присутствуют в артефакте.

## Что проверить владельцу

Откройте обратный туннель на loopback интерфейсе VPS, проверьте модель из формы, продиктуйте черновик заказа и сравните извлечённые поля с записью. Повторите ввод с выключенным туннелем и проверьте фактического облачного провайдера в ответе. Для проверки размыкателя нужны три последовательных сбоя одного вида. Остановка чат-сервиса и STT проверяется отдельно.

Проверка `/models` подтверждает доступность чата. Качество ответов Qwen, распознавание GigaAM и работа голосовой карточки проверяются отдельными запросами. Для резерва нужны действующие настройки облачного провайдера. Для ИИ Ведело действуют условия оплаты из баланса. Голосовая карточка пока доступна через API. Приложение сохраняет заказ только по штатному сценарию. Проксирующий сервер может иметь меньший лимит тела запроса, чем ограничение маршрута.

Живая приёмка домашнего узла через обратный SSH-туннель, выкладка и изменение боевого окружения остаются за владельцем.
