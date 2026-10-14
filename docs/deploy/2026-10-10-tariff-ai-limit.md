# Выкладка 1.35.11: сумма включённого ИИ в настройках тарифа

- Сайт: https://vedelo.ru.
- Выкладка выполнена 2026-10-10 в 00:25 (+07).
- Версия: 1.35.10 → 1.35.11.
- Сборка: `AgqHT0ryQt73sTgZX9gtk` → `Yciq4gbGbZJ4lRK4xlz2t`.
- Базовый Git HEAD: `45e3efe7550772561760c291e615d788dfc222d2` — не изменялся; commit/push в рамках выкладки не выполнялись.

## Состав

Выложены ровно шестнадцать файлов:

1. `schemas/tariffsSchema.js`, `schemas/tariffsSchema.test.js`.
2. `helpers/constants.js`, `helpers/tariffFeatures.js`, `helpers/tariffFeatures.test.mjs`.
3. `layouts/modals/modalsFunc/tariffFunc.js`, `layouts/cards/TariffCard.js`, `layouts/content/TariffSelectContent.js`.
4. `server/mobile/billing.js`, `mobile/src/features/billing/format.ts`, `mobile/src/features/billing/format.test.ts`, `mobile/src/features/billing/types.ts`.
5. `tests/components/tariffAiIncludedLimit.test.cjs`.
6. `docs/AI_BILLING.md`.
7. `package.json`, `package-lock.json` — только version 1.35.10 → 1.35.11, зависимости не менялись.

В настройках тарифа (`Настройки → Тарифы`) под флагом «ИИ-возможности» появилось поле «ИИ включён на сумму (₽/мес)» (шаг 100 ₽): сумма себестоимости ИИ в месяц, которую берёт на себя сервис. Значение пишется в `Tariffs.aiIncludedRubPerMonth`; `0` — ИИ не включён и запросы оплачиваются с баланса пользователя. Снятие флага «ИИ-возможности» обнуляет сумму. Включённая сумма показывается в карточке тарифа и в списке выбора тарифа («ИИ-возможности (включено до 500 ₽ в месяц)»), в Android — в списке возможностей тарифа.

Списание за запросы ИИ не изменялось: доступ по-прежнему гейтится `allowAi`, а стоимость уходит на `Users.balance` (`server/aiBilling.js`). Перенос оплаты на платформу в пределах лимита — следующий шаг пункта E3-T27.

Два файла (`helpers/constants.js`, `layouts/modals/modalsFunc/tariffFunc.js`) уже содержали незакоммиченные правки продакшен-снимка (справка полей и отзывы клиентов): изменение внесено поверх них, прежние правки сохранены. Остальные источники (2373 файла из манифеста) не переносились и сверены по хешам после переключения.

## Проверки

- Серверные тесты в выпуске: 22/22 (`schemas/tariffsSchema.test.js`, `helpers/tariffFeatures.test.mjs`, `helpers/tariffAccess.test.mjs`, `tests/components/tariffAiIncludedLimit.test.cjs`, `server/mobile/billing.test.js`), ESLint изменённых файлов — без ошибок.
- Сборка в отдельном выпуске (`npm run build -- --webpack`, heap 2048 МБ, временный swap 512 МБ): `BUILD_RESULT=0`, `BUILD_ID` создан; временный swap и правки `next.config.js` удалены.
- Новый выпуск проверен кандидатом на `127.0.0.1:3099` с заголовками `Host: vedelo.ru` и `X-Forwarded-Proto: https`, затем переключён процесс `vedelo`.
- Публикация прогонов: `/`, `/login`, `/register?ref=…`, `/review/invalid`, `/cabinet/history`, `/cabinet/transactions` — 200 (кабинет перенаправляет на вход); `/api/histories`, `/api/transactions` без сессии — 401.
- Опубликованный чанк кабинета `/_next/static/chunks/app/cabinet/%5Bpage%5D/page-71cf42d11834cbc2.js` содержит `aiIncludedRubPerMonth` и подпись «ИИ включён на сумму (₽/мес)».
- CSS-ресурсы из HTML опубликованы: `292b59f1f0b1d047.css`, `4636d022df21465c.css` — 200 с сервера и независимо с Orange Pi.
- SHA-256 чанка кабинета: `b173da567ce12a38326c8a8d1d73d0e7debf1ada132a85f1f85ea434eea4e449` (совпадает с файлом в активной сборке).
- `.env*` и исходный `next.config.js` сохранены и сверены по хешам; PM2 `vedelo` — online, кандидат удалён, список процессов сохранён.
- Миграций и тестовых записей выкладка не выполняла. Проверка публикации кода не является проверкой авторизованного кабинета: поле тарифа подтверждено компонентным тестом и наличием в опубликованном чанке. APK не собирался.

## Откат и служебные файлы

- Задание: `/home/alex/vedelo-deploy-20261010-0012`.
- Выпуск: `/home/apps/vedelo-release-20261010-0012`.
- Резервная копия версии 1.35.10: `/home/apps/vedelo-backup-20261010-0012`.
- Откат: `python3 /home/alex/vedelo-deploy-20261010-0012/activate.py rollback`.
- В задании сохранены manifest/result, журналы тестов и сборки, проверки кандидата, локального и публичного сайта. Перед сборкой удалены устаревшие выпуски и резервные копии от 2026-10-08 (освобождено ~0,5 ГБ), действующая резервная копия от 2026-10-09 20:29 и цепочка отката сохранены.
