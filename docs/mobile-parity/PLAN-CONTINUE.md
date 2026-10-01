# План продолжения: паритет Android-приложения с мобильной PWA

Файл-хендофф для отдельного чата и для Codex. Главный источник правды по содержанию — `docs/MOBILE_PWA_PARITY.md`
(разбор отличий, дизайн-контракт §4, анатомия компонентов §5, этапы B–AK §6.2, контрактные пробелы §6.3).
Текущее состояние работ — `docs/mobile-parity/STATUS.md`. Отчёты заходов — `docs/mobile-parity/REPORT-*.md`.

## 1. Точка старта

- Репозиторий: `~/projects/ArtistCRM` (Orange Pi) / `D:\Programming\Projects\ArtistCRM` (ПК), ветка **`codex`**.
- Выполнены этапы **A–O**: `35172cd` (план), `3f1847c` (B+C), `d2e34fe` (D+E), `9210145` (F+G+H), `4965928` (I+J),
  `cbe1a15` (L+M), `52dea55` (N+O). Дальше — заходы **P…AK** по §6.2.
- Baseline проверок на момент O: `cd mobile && npm run typecheck` даёт **ровно одну** исходную ошибку —
  в неотслеживаемом чужом `mobile/src/shared/notifications/index.ts:8`; `cd mobile && npm test` —
  **56 наборов / 343 теста** зелёные. Ухудшение этих чисел = регрессия.
- Версии: `package.json` 1.20.3, `mobile/app.json` version 1.1.0 / versionCode 18 / package `ru.escalion.vedelo`.

## 2. Незыблемые границы (нарушение = откат захода)

1. **Перед началом:** `git fetch origin codex` и `git rev-list --left-right --count origin/codex...HEAD`.
   Работать от актуального среза, а не от устаревшего `origin/codex`.
2. Меняются **только файлы внутри `mobile/`** (+ `docs/`). Web-код (`app/`, `server/`, `layouts/`, `helpers/`,
   `components/`, `models/`, `schemas/`, `state/`) в этом треке не трогается вообще. Исключения возможны только
   по отдельной просьбе владельца.
3. **Не редактировать** `mobile/src/shared/storage/**` и `mobile/src/shared/sync/**`: схема SQLCipher, outbox,
   ключи кэша, `operationId`, tombstones, файловые очереди. Только использовать существующие экспорты.
   Сохранение сущностей — существующими мутациями/outbox, не прямым POST.
4. Не менять: package ID, deep-link схемы (`vedelo://`, legacy `artistcrm://`), `app.json`, `eas.json`,
   push-настройки, серверный код, мобильный API-контракт.
5. В рабочей копии есть **чужие незакоммиченные файлы** — не трогать, не коммитить, не откатывать:
   `mobile/package-lock.json` (изменён), `mobile/assets/notification-icon.png`,
   `mobile/src/shared/config/deepLink.js`, `mobile/src/shared/notifications/index.ts`,
   `app/v1/`, `app/api/events/[id]/quick-actions/`, `app/api/events/voice-transcribe/`, `app/api/push/expo/test/`,
   `helpers/deepLink.js`, `helpers/use{Services,SiteSettings,Tariffs,Users}Query.js`.
6. Коммиты — **адресные** (`git add <конкретные файлы>`), **без `git add -A`**. Один заход = один коммит
   `feat(mobile): <этапы> — <суть>`. Не пушить и не открывать PR без просьбы. Никаких `reset --hard`/`checkout --`.
7. Developer-функционал не возвращать: он вырезан в B+C, включая сетевые вызовы (см. `docs/MOBILE_PWA_PARITY.md` §7).
8. Внутренние идентификаторы `events`/`eventId` и legacy-совместимость не переименовывать ради терминологии;
   склонения брать из `helpers/workItemTerminology.mjs` / мобильного resolver.

## 3. Рабочий цикл одного захода

1. Создать бриф `docs/mobile-parity/BRIEF-<буква>.md`: цель, файлы, критерии приёмки, что нельзя трогать,
   обязательные проверки, путь отчёта `docs/mobile-parity/REPORT-<буква>.md`. Образцы — `BRIEF-E/F/G.md`.
2. Запустить Codex Astra **отвязанно**, не фоном Hermes (фон убивается вместе с сессией):

```bash
export XDG_RUNTIME_DIR=/run/user/1000
systemd-run --user --unit=astra-stage-<x> --collect \
  --property=StandardOutput=file:/tmp/astra-<x>.log \
  --property=StandardError=file:/tmp/astra-<x>.log \
  /home/aleksei/.hermes/cache/scratch/astra-stage-<x>.sh   # внутри: codex exec -m gpt-6-astra -s workspace-write -c model_reasoning_effort=high
systemctl --user is-active astra-stage-<x>
```

3. После завершения — **проверить самому**: глазами по дифу, затем

```bash
cd ~/projects/ArtistCRM/mobile && npm run typecheck   # допустима ровно 1 исходная ошибка notifications/index.ts
cd ~/projects/ArtistCRM/mobile && npm test            # 56 наборов / 343 теста — не меньше
cd ~/projects/ArtistCRM && git diff --check
```

4. Закоммитить только файлы захода, добавить строку в `docs/mobile-parity/STATUS.md` (выполнено/осталось).
5. Визуальная приёмка (V) на Orange Pi недоступна — `adb`/Java нет. Отмечать как непроверенное
   и копить для приёмочного захода AK; отдельные сценарии — Maestro-flow `mobile/maestro/*.yaml` на устройстве.

## 4. Остаток: заходы по этапам §6.2

Порядок обязателен там, где есть зависимости; внутри захода этапы выполняются по порядку.

| Заход | Этапы | Что делается | Критерий приёмки (сверх T) |
|---|---|---|---|
| **H** | P + Q | Вкладки редактора: «Клиент и контакты», «Финансы и Документы». Файлы: новые `src/features/events/EventContactsSection.tsx`, `EventFinanceSection.tsx`, `app/events/edit/[id].tsx`, `app/events/[id]/documents.tsx`, при необходимости только согласованный projection в `src/shared/domain/eventForm.ts` | Выбор/создание клиента, доп. контакты и комментарии, задача и выполненные; договор, задаток и срок, комментарий, связанные транзакции, переход к документам. Переключение вкладок сохраняет draft; несохранённое не теряется при открытии файлов; local ID — через существующую очередь. Предложения (коммерческие) — контрактная зависимость, не эмулировать. |
| **I** | R + S | Клиенты: список и карточка/форма. Файлы: `app/(tabs)/clients.tsx`, новые `src/features/clients/MobileClientCard.tsx`, `clientList.ts` + тест; `app/clients/[id]/index.tsx`, `clients/edit/[id].tsx`, `clients/[id]/merge.tsx`, `clients/[id]/documents.tsx` | Поиск, группы, сортировка/счётчики, карточка по §5.2; разные CTA «создать»/«сбросить»; длинное ФИО, 5 контактов, пустой поиск, offline local client. Merge — только online с preview/подтверждением. |
| **J** | T + U | Транзакции: список и редактор. Файлы: `app/(tabs)/finance.tsx`, новые `src/features/finance/MobileTransactionCard.tsx`, `filters.ts` + тесты; `app/finance/edit/[id].tsx` | Заголовок «Транзакции», фильтры тип/период/связи, трёхколоночная карточка; **обязательства не входят в факт**. Согласованные поля и состояния, клиент/работа, метод оплаты, фактическая дата при исполнении обязательства. `src/shared/domain/finance.ts` — только при реально выявленном gap. |
| **K** | V + W | Услуги; Списки и общие настройки. Файлы: `src/features/services/ServicesSection.tsx`, `app/services/edit/[id].tsx`, `service-groups/edit/[id].tsx`; `src/features/lists/ListsSection.tsx`, `app/more/[section].tsx`, новый `src/features/settings/SettingsSection.tsx` | Меню «Мои услуги», единые карточки/формы/empty, группы и «Без группы» не сломаны; создание услуги с local group и offline-удаление группы без потери услуги. **W:** терминология/города/типы — как сейчас; timezone/длительность/передача записываются только после подтверждённой поддержки существующим bearer-API (сейчас узкий PUT умеет только `primaryEntityTerminology`, см. §6.3) — иначе это документированный пробел, а не локальная настройка. |
| **L** | X | Документы: иерархия шаблонов и вложений, `app/more/[section].tsx` (Documents), `more/documents/template/[id].tsx`, `events/[id]/documents.tsx`, `clients/[id]/documents.tsx` | Native picker/share сохранены, единая тема, upload progress и понятный retry, канонический `documents[]`; чужой entity/file ID и недоступный тариф отсекаются. |
| **M** | Y | Звонки и переписки: `app/more/[section].tsx` (Calls), `calls/[id].tsx`, `conversations/index.tsx`, `conversations/[provider]/[id].tsx` | Компактные строки/заголовки, единые состояния; запись/транскрипт/результат звонка, привязки и ответы сохранены; ответ после 403/сети не считается отправленным. |
| **N** | Z | Интеграции: `src/features/integrations/IntegrationsSection.tsx`, `ManagedIntegrationsSection.tsx`, `TelegramSection.tsx` — только при готовом контракте | Список пользовательских провайдеров, без admin UI; подключение/пауза/отключение не меняет семантику; секреты не кэшируются. Telegram-ветка — условна (§6.3). |
| **O** | AA + AB | Статистика/рефералы и История: `app/more/[section].tsx` (Statistics/Referrals), новые `src/features/statistics/StatisticsSection.tsx`, `src/features/referrals/ReferralsSection.tsx`; `app/history.tsx`, `src/features/history/filter.ts` + тест | Visual hierarchy/filters/theme без изменения финансовых формул; пользовательская ссылка и CSV на месте; developer revenue не появляется. История: компактные фильтры, раскрытие diff, подпись последней offline-копии, чужая/отсутствующая сущность не открывается. |
| **P** | AC + AD | Импорт из файла: загрузка/возобновление и проверка/применение. Новые `app/more/import.tsx`, `src/features/import/{ImportScreen,UploadStep,ReviewStep,ApplyStep,fileImportApi}.tsx/ts` | **Сначала прочитать контракт** (`server/fileImportService.js`, `app/api/events/file-import/**`, `docs/` про импорт) и ограничения файла/стоимости; пока шаг применения не готов — никакой кнопки фиктивного «завершить». Просмотр/коррекция распознанных записей, повтор job без дублей, штатный pull после завершения. |
| **Q** | AE + AF | Google-импорт и общий экспорт: `src/features/import/{CalendarImportSection,calendarImportApi,ExportSection,exportDatasets}.ts(x)` | Синхронизация Google не выдаётся за отдельный import-flow; до UI сверить import-auth/calendars/select/status и возврат native (web callback = внешняя зависимость, не имитировать); bearer не в URL. Экспорт: три набора, все данные без текущих фильтров, тариф `allowStatistics`, CSV с экранированием и cleanup; сверить payload с `buildExportDatasets`, недостающие колонки не выдумывать. |
| **R** | AG + AH | Профиль и тариф; Уведомления и support presentation. Файлы: `app/(tabs)/profile.tsx`, `app/billing/index.tsx`, новые `src/features/profile/ArtistRequisitesSection.tsx`, `src/features/billing/format.ts`; `app/more/[section].tsx` (Notifications), `app/support/index.tsx`, `new.tsx`, `[id].tsx`, `src/features/support/ImagePicker.tsx` | Контакты/реквизиты/аватар/сессии и выбор тарифа/баланс сохранены; названия DEV-тарифа не трактуются как admin UI; без реальной оплаты в QA. Разрешения Expo и online-поддержка остаются; удалённый operator-код (C) не возвращать. |
| **S** | AI | Auth/onboarding/sync — только presentation: `app/(auth)/login.tsx`, `app/onboarding/index.tsx`, `app/sync/index.tsx`, `app/_layout.tsx` | Тёмная тема и контраст проходят, поля/клавиатура/Back работают, sync diagnostics/retry/conflict доступны. **Не трогать** auth/sync lifecycle-эффекты. |
| **T** | AJ | Включить выбор light/dark и theme-aware StatusBar: `src/shared/ui/ThemeProvider.tsx`, `theme.ts`, `src/features/settings/SettingsSection.tsx`, `app/_layout.tsx` | Все пользовательские экраны используют palette; hardcoded-цвета проверены по роли, без массовых regex-замен. Непереведённые экраны блокируют объявление тёмного паритета. |
| **U** | AK | Интеграционный приёмочный заход: одна согласованная **EAS preview-сборка**, один основной тестовый девайс, сквозной сценарий из `docs/MOBILE_PWA_PARITY.md` §8.4; Maestro-flows `mobile/maestro/*` | Фиксация build ID/версии/остатков. Дополнительные устройства — повтор захода, а не матрица за одну сессию. Пункт roadmap `M1-T7` автоматически не закрывать. |

**Отложено по контракту:** этап **K** (сообщения на «Важном») блокирован — нужен user-scoped API переписок и
staging-проверка двух tenant, иначе «0 сообщений» будет враньём (§6.3, Telegram Business).

## 5. Внешние зависимости, которые нельзя закрыть кодом Android

- **EAS-сборка и устройство.** Визуальная приёмка и Maestro-прогоны требуют preview-сборки (`eas build -p android
  --profile preview`) и телефона. На Orange Pi `adb`/Java нет. Перед первой сборкой поднять `mobile/app.json`
  `version`/`android.versionCode` (сейчас 1.1.0 / 18) — иначе Play/EAS не примет повторную сборку.
- **Серверные узкие API** для W (timezone/длительность/передача), Z (Telegram Business), Q (import-auth/calendar),
  AI/AH при необходимости — это задачи web-трека, не Android. Если их нет, функция остаётся честно незакрытой.
- **Root `node_modules` на Orange Pi** не установлены (`npm ci` не проходит: package-lock.json рассинхронизирован
  с package.json — `npm install` писать lockfile нельзя). Поэтому в этом треке проверки = `typecheck` + `jest` в
  `mobile/`; web-ESLint/сборка — на ПК.

## 6. Что нужно от владельца

1. Разовое подтверждение: продолжать заходы подряд (H → I → J → …) или останавливаться после каждого на просмотр.
2. Момент для первой preview-сборки: предлагается после захода **H** (редактор) — тогда на устройстве уже
   связный сценарий «Важное → работы → карточка → просмотр → редактирование».
3. Решение по найденному расхождению: `layouts/cards/ClientCard.js` передаёт `forceTelegram={false}` — на карточках
   клиентов красного Telegram по номеру нет, хотя в просмотре клиента он есть (то же, что исправлено на карточке
   пользователя). Включать ли — отдельное решение, потому что у клиентов там ещё и подтверждающий диалог (`showChat`).
4. Решение по модальным сегментам списка работ (`docs/mockups/events-segment-switch.html`) — подключать или нет.

## 7. Критерий завершения всего трека

- Все пользовательские разделы PWA имеют паритет по структуре и состояниям; developer-функционал отсутствует.
- `cd mobile && npm run typecheck` — только исходная чужая ошибка; `npm test` — все наборы зелёные.
- Тёмная тема включена и объявлена только после перевода всех пользовательских экранов.
- Приёмочный заход AK выполнен на одной согласованной сборке; остатки зафиксированы.
- Документы синхронизированы: `docs/MOBILE_PWA_PARITY.md`, `docs/mobile-parity/STATUS.md`, `docs/ROADMAP.md`
  (пункт `M1-T10`), версия в `package.json` поднята при закрытии пункта roadmap.

## 8. Промпт для Codex (шаблон)

```
Прочитай AGENTS.md, docs/MOBILE_PWA_PARITY.md (§4, §5, §6.1, §6.2, §6.3), docs/mobile-parity/PLAN-CONTINUE.md
и docs/mobile-parity/BRIEF-<X>.md. Выполни задание <X> (этапы <список>) целиком.
Работай на русском языке. Меняй только файлы внутри mobile/ и docs/. Не редактируй mobile/src/shared/storage/**
и mobile/src/shared/sync/**, не трогай web-код, app.json, eas.json, package ID, push-настройки и чужие
незакоммиченные файлы. Сохраняй сущности существующими мутациями/outbox, не прямым POST.
Обязательно прогони: cd mobile && npm run typecheck и cd mobile && npm test — и приведи вывод.
Коммит не делай. Отчёт — docs/mobile-parity/REPORT-<X>.md. Финальное сообщение — 12–20 строк.
```

Первый практический заход — **H (P+Q)**: бриф `BRIEF-H.md` составить по образцу `BRIEF-G.md`; в нём особо
указать, что каркас трёх вкладок и `EventGeneralSection` уже существуют, а новые секции наследуют общий draft.
