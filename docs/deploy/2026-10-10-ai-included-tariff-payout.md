# Выкладка 1.35.12: ИИ по тарифу — платформа платит в пределах лимита

- Сайт: https://vedelo.ru.
- Выкладка выполнена 2026-10-10 в 03:20 (+07).
- Версия: 1.35.11 → 1.35.12.
- Сборка: `Yciq4gbGbZJ4lRK4xlz2t` → `owvw4zJasedsl6BOMBdZD`.
- Базовый Git HEAD: `45e3efe7550772561760c291e615d788dfc222d2` — не изменялся; commit/push в рамках выкладки не выполнялись (код лежит в `codex`, коммит `ca4bcc9`).

## Состав

Выложены 19 файлов:

1. `server/aiBilling.js` — резолвер тарифа, агрегация лимита месяца, покрытие в резерве и списании.
2. `schemas/aiUsageSchema.js`, `models/AiUsage.js` — флаг `coveredByTariff` и индекс для месячной агрегации.
3. `app/api/ai/usage/route.js` — `tariffIncluded` пользователю, «оплачено платформой» в developer-отчёте.
4. `helpers/fileImport.mjs`, `server/fileImportBudget.mjs`, `server/fileImportService.js` — покрытие стадий импорта файлов.
5. `layouts/content/IntegrationsContent.js`, `layouts/content/AiUsageAdminContent.js` — блок остатка лимита и метрика оплаты платформой.
6. `mobile/src/features/integrations/AiUsagePanel.tsx`, `AiUsagePanel.test.tsx` — тот же блок в Android-DTO.
7. Тесты: `server/aiBilling.tariffIncluded.test.mjs`, `server/aiBilling.integration.test.mjs`, `server/fileImport.test.mjs`, `server/fileImportBudget.integration.test.mjs`, `tests/server/loadWithAliases.cjs`.
8. `docs/AI_BILLING.md`.
9. `package.json`, `package-lock.json` — только version 1.35.11 → 1.35.12, зависимости не менялись.

Что изменилось для пользователя: пока себестоимость ИИ за календарный месяц не выбрала включённую в тариф сумму, запросы ИИ идут без списаний с баланса (и без платежей), а в `Настройки → Интеграции → ИИ-провайдер` (и в Android) видно «ИИ включён в тариф: израсходовано X из Y ₽, осталось Z ₽». Сверх лимита запросы списываются с баланса как раньше, а отказ поясняет, что лимит тарифа на месяц исчерпан. Импорт файлов резервирует баланс только на непокрытую часть сметы. В developer-отчёте появилась метрика «Оплачено платформой».

Два файла (`layouts/content/IntegrationsContent.js`, `AiUsageAdminContent.js`) содержали незакоммиченные правки продакшен-снимка: изменения внесены поверх них, прежние правки сохранены. Зависимости не менялись, установка пакетов не выполнялась.

## Проверки

- Тесты в выпуске: 42/42 (`server/aiBilling.tariffIncluded.test.mjs`, `server/aiBilling.integration.test.mjs` на отдельном standalone MongoDB, `server/fileImport.test.mjs`, `server/fileImportBudget.integration.test.mjs`, `helpers/tariffFeatures.test.mjs`, `helpers/tariffAccess.test.mjs`, `schemas/tariffsSchema.test.js`, `tests/components/tariffAiIncludedLimit.test.cjs`, `server/mobile/billing.test.js`).
- ESLint изменённых файлов: 0 ошибок; два предупреждения `Unused eslint-disable directive` — существующие в снимке строки `IntegrationsContent.js:949` и `AiUsageAdminContent.js:79`, не связаны с правкой.
- Сборка в отдельном выпуске (`npm run build -- --webpack`, heap 2048 МБ, временный swap 512 МБ): `BUILD_RESULT=0`, создан новый `BUILD_ID`; временный swap и правки `next.config.js` сняты.
- Кандидат на `127.0.0.1:3099` с `Host: vedelo.ru` и `X-Forwarded-Proto: https`: `/`, `/login`, `/register?ref=…`, `/review/invalid`, `/cabinet/history`, `/cabinet/transactions` — 200 (кабинет перенаправляет на вход), `/api/ai/usage` и `/api/histories` без сессии — 401; 25 ресурсов сверены по SHA-256.
- После переключения проверено тем же набором на публичном `https://vedelo.ru`; `GET /api/ai/usage` без сессии — 401.
- Опубликованный чанк кабинета `/_next/static/chunks/app/cabinet/%5Bpage%5D/page-873fd17e01802cb6.js` содержит `tariffIncluded`, «ИИ включён в тариф», «Оплачено платформой» и `coveredByTariff`; SHA-256 `a6e696821754a123b1c894ff46cbaa3010d8238289450d860101b1ba28748791` (совпал при независимой проверке с Orange Pi).
- `.env*` и исходный `next.config.js` сохранены и сверены по хешам; PM2 `vedelo` — online, кандидат удалён, список процессов сохранён.
- Выкладка не выполняла миграций и тестовых записей в боевой базе: интеграционные тесты используют отдельную базу `vedelo_ai_billing_test` и собственный mongod, база бюджета импорта — `codex_file_import_test_*` (создаётся и удаляется тестом). Авторизованный кабинет не проверялся: поведение оплаты подтверждено интеграционными тестами и наличием кода в опубликованном чанке. APK не собирался.

## Откат и служебные файлы

- Задание: `/home/alex/vedelo-deploy-20261010-0130`.
- Выпуск: `/home/apps/vedelo-release-20261010-0130`.
- Резервная копия версии 1.35.11: `/home/apps/vedelo-backup-20261010-0130`.
- Откат: `python3 /home/alex/vedelo-deploy-20261010-0130/activate.py rollback`.
- В задании сохранены manifest/result, журналы тестов и сборки, проверки кандидата, локального и публичного сайта.
