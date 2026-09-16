# Ведело: production ENV checklist

Актуально на 2026-09-15. Эталон состава переменных — `.env.deploy.example`.
Реальные секреты нельзя добавлять в репозиторий, документацию или логи.

## База и домен

```env
NODE_ENV=production
DOMAIN=https://vedelo.ru
NEXTAUTH_URL=https://vedelo.ru
NEXTAUTH_URL_INTERNAL=http://127.0.0.1:3006

MONGODB_URI=...
MONGODB_DBNAME=artistcrm
NEXTAUTH_SECRET=...
```

Имя исторической MongoDB `artistcrm` не меняется без отдельной миграции. У
Mongo-пользователя должен быть `readWrite` только на рабочую базу.

Для 30-дневного переноса старой PWA один и тот же неизменный момент задаётся на
всех инстансах:

```env
BRAND_MIGRATION_STARTED_AT=2026-10-01T00:00:00+07:00
```

Не копировать пример как фактическую дату. Сначала выполнить preflight из
`docs/BRAND_AND_PWA_MIGRATION.md`.

## Публичные реквизиты, аналитика и поддержка

```env
NEXT_PUBLIC_LEGAL_NAME=Ведело
NEXT_PUBLIC_LEGAL_INN=...
NEXT_PUBLIC_SUPPORT_EMAIL=vedelo@inbox.ru
NEXT_PUBLIC_YANDEX_METRIKA_ID=112668604
NEXT_PUBLIC_YANDEX_SITE_VERIFICATION=
```

Подтверждение Яндекс Вебмастера уже сделано DNS-записью, поэтому meta-token
необязателен. Публичный адрес переключать только после проверки приёма и отправки
тестового письма; для внешнего ящика `inbox.ru` MX домена `vedelo.ru` не нужен.

Яндекс Метрика загружается только после пользовательского выбора. Вебвизор в
инициализации счётчика 112668604 не включён.

## Оплата

```env
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=...
YOOKASSA_WEBHOOK_SECRET=...
YOOKASSA_SEND_RECEIPT=false
YOOKASSA_VAT_CODE=1

TOCHKA_API_TOKEN=...
TOCHKA_CLIENT_ID=...
TOCHKA_CUSTOMER_CODE=...
TOCHKA_MERCHANT_ID=...
TOCHKA_SEND_RECEIPT=false
TOCHKA_VAT_TYPE=none
TOCHKA_RECEIPT_CLIENT_CONTACT=phone
TOCHKA_RECEIPT_ITEM_NAME=Оплата Ведело
TOCHKA_RECEIPT_EMAIL=<существующий проверенный ящик>
NODE_EXTRA_CA_CERTS=/абсолютный/путь/tochka-russian-ca-bundle.crt
```

Если включаются чеки Точки, также проверить
`TOCHKA_TAX_SYSTEM_CODE`, `TOCHKA_PAYMENT_METHOD`, `TOCHKA_PAYMENT_OBJECT`,
`TOCHKA_MEASURE`, `TOCHKA_PAYMENT_TTL` и `TOCHKA_WEBHOOK_PUBLIC_JWK`.

Точка использует цепочку `Russian Trusted Root CA` / `Russian Trusted Sub CA`.
Оба сертификата должны находиться в одном PEM bundle. Переменную
`NODE_EXTRA_CA_CERTS` нужно передать процессу Node **до его запуска** через
PM2/systemd/start-команду: загрузка значения только из `.env` внутри уже
запущенного Next.js недостаточна. После перезапуска проверить из того же
окружения запрос `https://tls-test.tochka.com/api/`; ожидается
`{"status":"ok"}` без отключения TLS-проверки.

Штатный `deploy_timeweb.ps1` копирует каталог `certs` при локальном деплое и,
если найден `certs/tochka-russian-ca-bundle.crt`, передаёт его процессу PM2
автоматически.

Callback и webhook URL обоих провайдеров должны вести на `vedelo.ru`; URL
старого домена сохраняются на время migration campaign и отвечают `308`.

## VK ID и Google Calendar

```env
VK_AUTH_ENABLED=true
VK_ID_APP_ID=...
VK_ID_CLIENT_SECRET=...
VK_ID_REDIRECT_URI=https://vedelo.ru/api/vk-id/callback
NEXT_PUBLIC_VK_ID_SCOPE=phone email

GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://vedelo.ru/api/google-calendar/callback
```

Production endpoint `/api/global/auth/vk-status` должен возвращать
`allowVkAuth: true` и callback на `vedelo.ru`, но не секрет. Для Android
отдельно заполняются поля нового package `ru.escalion.vedelo` в кабинете VK ID.

## Телефон, push и cron

```env
TELEFONIP=...
TELEFONIP_API_BASE_URL=https://api.telefon-ip.ru
PHONE_SMS_SEND_WEBHOOK=

BILLING_CRON_SECRET=...
PUSH_REMINDERS_CRON_SECRET=...
CRON_SECRET=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:<существующий проверенный ящик>
```

Cron напоминаний запускается каждые 15 минут. Worker файлового AI-импорта
вызывает `POST /api/events/file-import/worker` каждую минуту с Bearer
`CRON_SECRET`.

## Файлы, Telegram и AI

```env
ESCALIONCLOUD_PASSWORD=...
TELEGRAM_TOKEN=...
TELEGRAM_PROXY_URL=

AITUNNEL_KEY=...
AITUNNEL_CALL_ANALYSIS_MODEL=gpt-4o-mini
AITUNNEL_TRANSCRIPTION_MODEL=whisper-1

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

`AITUNNEL_KEY` — сервисный режим с оплатой из баланса. Пользовательские ключи
остаются tenant-aware в настройках. `OPENAI_*` — только developer fallback.
Секреты интеграций нельзя отправлять mobile-клиенту или писать в offline-кэш.

После изменений cloud API сначала разворачивается совместимый
`cloud.escalion.ru`, затем Ведело.

## SMTP

Для системной отправки через созданный ящик Mail.ru:

```env
SMTP_HOST=smtp.mail.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=vedelo@inbox.ru
SMTP_PASSWORD=<отдельный пароль для внешнего приложения>
MAIL_FROM=Ведело <vedelo@inbox.ru>
```

Обычный пароль ящика не использовать. До создания отдельного пароля приложения и
проверки SMTP эти переменные не задавать.

## Что удалить из production ENV

```text
LOGIN
PASSWORD
SECRET
NEXTAUTH_SITE
DEEPSEEK_KEY
PARTYCRM_AUTH_SECRET
PARTYCRM_BOOTSTRAP_SECRET
PARTYCRM_YOOKASSA_WEBHOOK_SECRET
NODE_TLS_REJECT_UNAUTHORIZED
PARTYCRM_DOMAIN
PARTYCRM_MONGODB_URI
PARTYCRM_MONGODB_DBNAME
```

В этом deployment нет PartyCRM. `NOVOFON_WEBHOOK_SECRET`, глобальные
`AI_ANALYSIS_PROVIDER`, `AI_TRANSCRIPTION_PROVIDER` и пользовательские AI-ключи
тоже не добавляются без отдельного developer-сценария.

## Проверка после деплоя

1. `https://vedelo.ru`, `/privacy`, `/terms`, `/personal-data-consent`,
   `/account-deletion`, `/robots.txt` и `/sitemap.xml` отвечают `200`.
2. До согласия нет запроса к `mc.yandex.ru`; после согласия загружается только
   счётчик `112668604`; после отказа новые запросы не отправляются.
3. VK ID показывает callback `https://vedelo.ru/api/vk-id/callback` и разделяет
   вход/регистрацию; новая регистрация требует три отдельных отметки.
4. Проверены Google OAuth, платежи, webhooks, push и оба origin по
   `docs/BRAND_AND_PWA_MIGRATION.md`.
5. В логах нет токенов, кодов подтверждения, полных webhook payload и
   персональных данных.
