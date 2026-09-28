# Ведело ENV

## Мониторинг баланса Telefon-IP (1.30.1)

Использует существующий `TELEFONIP` и необязательный `TELEFONIP_API_BASE_URL`.
Контракт: [get_balance](https://docs.telefon-ip.ru/reference/api-reference/vspomogatelnye-funkcii),
GET `/api/v1/authcalls/{token}/get_balance/`, `success: true`, `data.balance`.
Таймаут — 15 секунд, API-ключ и сырые ошибки не выводятся.

Проверка запускается существующим `POST /api/billing/renew` с
`x-cron-secret: BILLING_CRON_SECRET`, отдельный cron не нужен. При балансе ≤100 ₽
или ошибке API Web/PWA/Expo push получают активные разработчики с включёнными
push-подписками. Общий лимит — одно предупреждение за 24 часа, отметка хранится
атомарно в глобальных SiteSettings. Если ни одному устройству push не отправлен,
следующий запуск повторит попытку. Без ключа проверка пропускается.
В ответе cron `data.telefonip` содержит только статус и число уведомлённых
tenant; сумма доступна только developer-only `/api/site/phone-auth`.
На странице «Настройки сайта → Авторизация» баланс загружается при открытии
и по кнопке «Обновить баланс»; эти просмотры push не отправляют.

## Обязательные переменные

```env
NODE_ENV=development|production
DOMAIN=http://localhost:3000
MONGODB_URI=...
MONGODB_DBNAME=artistcrm_dev
NEXTAUTH_SECRET=...
```

Имя БД `artistcrm`/`artistcrm_dev` является сохранённым техническим идентификатором и не меняется только из-за ребрендинга.

## Нужны только если включен соответствующий функционал

- Город при первом входе: `GEOIP_CITY_DB_PATH` (абсолютный путь к локальной City MMDB) и `GEOIP_TRUST_PROXY=true` только за доверенным reverse proxy, перезаписывающим `X-Real-IP`. Без настройки автоподстановка отключена; инструкция: `docs/ONBOARDING_GEOIP.md`.
- Google Calendar: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
- Биллинг YooKassa: `YOOKASSA_*`
- Биллинг Точка: `TOCHKA_*`
- Push и cron: `BILLING_CRON_SECRET`, `PUSH_REMINDERS_CRON_SECRET`, `VAPID_*`
- 30-дневный перенос PWA: `BRAND_MIGRATION_STARTED_AT`; до фактического старта кампании оставлять пустым, затем использовать один неизменный ISO-8601 момент на всех инстансах.
- VK ID: `VK_*`, `NEXT_PUBLIC_VK_*`
- Изолированные auth/integration tests: server-only overrides `VK_ID_BASE_URL`, `AVITO_API_BASE_URL`, `VK_API_BASE_URL`; в production оставлять незаданными, чтобы использовать официальные upstream.
- Изолированные Google integration tests: `GOOGLE_OAUTH_AUTH_URL`, `GOOGLE_OAUTH_TOKEN_URL`, `GOOGLE_CALENDAR_API_BASE_URL`; в production не задавать.
- Подтверждение телефона: `TELEFONIP`, `TELEFONIP_API_BASE_URL`, `PHONE_SMS_SEND_WEBHOOK`
- Generic telephony webhook: `TELEPHONY_WEBHOOK_SECRET`, только если используется глобальный generic endpoint
- Telegram: `TELEGRAM_TOKEN`, только если используется legacy-отправка сообщений через общего Telegram bot.
- Telegram Business: `TELEGRAM_PROXY_URL` — необязательный HTTP(S) или SOCKS5-прокси только для исходящих запросов Ведело к `api.telegram.org`, например `http://user:password@proxy.example:3128` или `socks5://user:password@proxy.example:1080`. Значение хранится только в server environment и не возвращается в браузер.
- Общий ИИ Ведело с оплатой из баланса: `AITUNNEL_KEY`; модели можно переопределить через `AITUNNEL_CALL_ANALYSIS_MODEL` и `AITUNNEL_TRANSCRIPTION_MODEL`
- Облачные файлы: `ESCALIONCLOUD_PASSWORD`

`AITUNNEL_KEY` в production является общим серверным ключом Ведело. Он никогда не возвращается клиенту: фактическая стоимость запроса берётся из `usage.cost_rub`, умножается на developer-коэффициент и списывается из существующего баланса пользователя. Пользователь по-прежнему может сохранить собственный AITunnel key в `Настройки -> Интеграции`; такие запросы не тарифицируются платформой. DeepSeek доступен только developer-роли.

## Подтверждение телефона: звонок или СМС

С 1.30.0 `TELEFONIP` используется и для звонков, и для прямой отправки СМС
через `get_sms_code`. Отдельный ключ не нужен. Код — четыре криптографически
случайные цифры. Проверяются HTTP-статус, `success` и совпадение кода в ответе;
код и ключ не возвращаются клиенту и не записываются в лог отправки СМС.
Документация: https://docs.telefon-ip.ru/reference/api-reference/sms-code-avtorizaciya-sms
Подпись в тексте СМС согласовывается с Telefon-IP. Реальная отправка зависит
от доступности услуги и баланса аккаунта; наличие ключа не подтверждает доставку.

`Настройки сайта → Авторизация` доступны только разработчику вне impersonation.
Выбор сохраняется глобально в `SiteSettings` с `tenantId: null`, поле
`phoneVerification.primaryMethod` (`call` по умолчанию или `sms`). Секреты
остаются в env. Web/PWA передаёт `method: preferred` в start; при выборе SMS
предварительный звонок не нужен. Старые Android-клиенты без этого параметра
сохраняют прежний call-first контракт; отправка СМС fallback также работает
через Telefon-IP. Вход с паролем и VK ID не меняются.

Для альтернативного адаптера можно явно задать `PHONE_SMS_SEND_WEBHOOK`.
Он имеет приоритет над Telefon-IP: сервер делает POST JSON
`{ phone, code, flow }`, где phone — 11 цифр с префиксом 7, flow — register
или recovery. Адаптер должен передать код SMS-провайдеру и вернуть HTTP 2xx
только при принятии отправки; при ошибке — non-2xx. Тело ответа сейчас не
анализируется, поэтому URL произвольного SMS API без адаптации не подходит.

В production без webhook и `TELEFONIP` возвращается `SMS_PROVIDER_NOT_CONFIGURED` (503).
В development без обоих провайдеров используется тестовый код, реального SMS нет.
В режиме звонка кнопка SMS появляется через 60 секунд после успешного start.
Повторная отправка ограничена cooldown, числом отправок и rate limit по IP.
HTTP 2xx от webhook подтверждает приём запроса, но не доставку на телефон.
После деплоя проверить СМС на согласованном тестовом номере владельца.

## Legacy и неиспользуемые переменные

PartyCRM не входит в этот репозиторий, поэтому здесь не нужны:

```env
PARTYCRM_DOMAIN
PARTYCRM_MONGODB_URI
PARTYCRM_MONGODB_DBNAME
PARTYCRM_AUTH_SECRET
PARTYCRM_BOOTSTRAP_SECRET
PARTYCRM_YOOKASSA_WEBHOOK_SECRET
```

Также можно убрать legacy-переменные, если везде используете нормальный `NEXTAUTH_SECRET`:

```env
LOGIN
PASSWORD
SECRET
NEXTAUTH_SITE
```

Неиспользуемые глобальные fallback-переменные можно убрать, если они не нужны для developer-сценариев:

```env
NOVOFON_WEBHOOK_SECRET
AI_ANALYSIS_PROVIDER
AI_TRANSCRIPTION_PROVIDER
DEEPSEEK_API_KEY
DEEPSEEK_CALL_ANALYSIS_MODEL
OPENAI_CALL_ANALYSIS_MODEL
OPENAI_TRANSCRIPTION_MODEL
```

## Примечание

- Шаблоны лежат в `.env.example` и `.env.deploy.example`.
- Реальные `.env.local` и `.env.deploy` не должны храниться в git.
