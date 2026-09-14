# Ведело

«Ведело» — CRM для малого бизнеса и частных специалистов. Продукт помогает вести заявки и заказы, клиентов, следующие контакты, оплаты, документы, календарь и входящие обращения из интеграций.

До ребрендинга продукт назывался ArtistCRM. Основной домен — `vedelo.ru`; `artistcrm.ru` используется как legacy-origin во время безопасного переноса установленной PWA.

## Состояние проекта

- Web: `1.20.0`.
- Android: `1.1.0`.
- Основной Git-репозиторий: `https://github.com/Escalion86/vedelo.git`.
- Основная ветка: `main`.
- Внутренние контракты `/api/events`, `eventId`, package ID и исторические storage-префиксы сохранены для совместимости.

Актуальные приоритеты и статус релиза находятся в `docs/ROADMAP.md`. Краткая передача контекста для разработчика или ИИ — в `docs/AI_HANDOFF.md`.

## Технологии

- Next.js App Router + React.
- MongoDB + Mongoose.
- NextAuth.
- TanStack Query + Jotai.
- MUI + Tailwind CSS.
- Собственный PWA service worker.
- Expo + React Native для Android-клиента.

## Быстрый старт

```powershell
npm install
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

В `.env.local` минимум нужны `DOMAIN`, `MONGODB_URI`, `MONGODB_DBNAME` и `NEXTAUTH_SECRET`. Не коммитьте реальные секреты.

Откройте `http://localhost:3000`.

## Основные команды

```bash
npm run dev
npm run build
npm run lint
npm run test:mobile-server
```

Mobile:

```bash
cd mobile
npm install
npm run start
npm run typecheck
npm test
```

## Структура

- `app/` — страницы и API Next.js.
- `components/` — переиспользуемые компоненты.
- `layouts/` — крупные экраны, карточки и модалки.
- `helpers/` — клиентская и доменная логика.
- `server/` — серверные сервисы и интеграции.
- `models/`, `schemas/` — MongoDB/Mongoose.
- `state/` — Jotai и compatibility bridge.
- `mobile/` — Expo/React Native клиент.
- `docs/` — roadmap, runbook и контракты.

## Документация

- `AGENTS.md` — обязательные правила для ИИ и разработчиков.
- `docs/AI_HANDOFF.md` — архитектура и актуальная передача контекста.
- `docs/ROADMAP.md` — единый рабочий план.
- `docs/BRAND_AND_PWA_MIGRATION.md` — перенос ArtistCRM → «Ведело».
- `docs/ENV_VARIABLES.md` — окружение.
- `docs/MOBILE_APP_ARCHITECTURE.md` — Android/mobile.
- `docs/PUBLIC_LEADS_API.md` — входящие лиды и Tilda.
- `docs/DOCX_DOCUMENTS_GUIDE.md` — DOCX-шаблоны.

## Production

Production-настройки берутся из `.env.deploy.example`. До переключения трафика обязательно пройти `docs/BRAND_AND_PWA_MIGRATION.md` и `docs/PRODUCTION_ENV_CHECKLIST.md`, включая TLS, callbacks OAuth/платежей, webhooks, push и проверку установленной PWA на реальных устройствах.
