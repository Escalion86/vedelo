# Задание J — транзакции (T + U)

## Исходное состояние

`/home/aleksei/projects/vedelo`, `origin=git@github.com:Escalion86/vedelo.git`, ветка mobile-parity. H/I на диске не откатывать. База I: 73 набора / 465 тестов; typecheck и diff-check чистые. Коммитов/push не делать.

## Цель

Максимально приблизить список и форму Android к текущей мобильной PWA. Эталон: layouts/content/TransactionsContent.js, layouts/cards/TransactionCard.js, layouts/modals/modalsFunc/transactionFunc.js, components/TransactionDateRangeFilter.js, helpers/transactionFilters.js, transactionDateRange.js, transactionCategory.mjs, transactionObligation.js и текущая тема. Не переносить developer-функции.

## T — список

Файлы: mobile/app/(tabs)/finance.tsx; новые src/features/finance/{filters.ts,MobileTransactionCard.tsx,TransactionPeriodFilter.tsx,transactionCard.ts} и focused tests.

- Заголовок «Транзакции» + счётчик, строка «Все / Период / Фильтры» и compact add. Overlays не заменяют/не двигают список; selected, Back/outside/reset.
- Type all/income/expense/obligation; linked/unlinked по eventId или clientId, нельзя выключить оба. Период: валидные локальные границы суток, presets/календарь, черновик с явным применением и отменой. Пустые/невалидные даты исключаются только при применённом периоде.
- Карточка: левый маркер, overflow, три колонки 76 / 1fr / auto, сумма min92, дата/месяц/время/назначение; категория первична, клиент и работа отдельными строками, комментарий без дублирования title. Legacy aliases категоризации видны корректно. Обязательство — без знака и отдельно от факта.
- Sync/loading/error, связанные local IDs, большие суммы; edit/delete-confirm через существующие маршруты/мутации.
- Существующую сводку/контроль задатков/остатки сохранить как сворачиваемый вторичный блок после toolbar, по умолчанию свёрнут. Различать no data / no matches / failure.

## U — редактор

Файл mobile/app/finance/edit/[id].tsx; src/shared/domain/finance.ts — только конкретный выявленный semantic gap, без persistence.

- Компактные поля, тема и web-порядок: связи/сумма/тип/категория/метод/дата/комментарий. Типы доход/расход — соответствующие токены, обязательства отдельно.
- Вместо длинных горизонтальных полос клиентов/работ — выбор с поиском. При выбранной работе клиент согласован с ней; local refs остаются действующими. История и H-return в редактор работы сохранены.
- Ошибка/не найдено при загрузке не создают пустую редактируемую запись. Не потерять ввод при ошибке save; не записывать дважды, подтвердить выход. Сохранение только существующим saveLocalEntity, удаление deleteLocalEntity.
- Date fallback валидируется; при исполнении обязательства требуется фактическая дата. Не менять незатронутую исходную timestamp при обычной правке комментария. Non-active/missing linked entity не обходится прямым route.

## Границы и приёмка

Только mobile/** и docs/**; web/API только читаются. Не менять storage/**, sync/**, cache/outbox keys, operationId/tombstones, app.json/eas.json/push/package ID/schemes, зависимости/lock и чужие файлы. Внутренние events/eventId сохранены; терминология — resolver. Roadmap M1-T10 остаётся [-], root package не менять.

Tests: тип/период/границы/пустые даты/связи/обязательства; category aliases; карточка light/dark/длинные подписи/суммы; overlay и empty/error; сохранение формы/повторные клики/H-return/local refs/фактическая дата/запрет неактивной связи.
Обязательно: `cd mobile && npm run typecheck`, `cd mobile && npx jest --runInBand`, `git diff --check`, проверка границ новых/изменённых файлов. Реальные выводы и ограничения — docs/mobile-parity/REPORT-J.md; обновить STATUS и ROADMAP. Device/staging не доступны: не объявлять их проверенными.
