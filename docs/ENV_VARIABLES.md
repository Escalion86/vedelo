# Ведело ENV

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
