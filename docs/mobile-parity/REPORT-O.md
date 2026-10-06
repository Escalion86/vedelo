# Отчёт захода O — AA + AB

Дата: 2026-10-03. Репозиторий `/home/aleksei/projects/vedelo`, ветка `mobile-parity`.
Реализована локальная работа по `BRIEF-O.md`: статистика, собственные рефералы и история.
Это не заявление о полном паритете Android/PWA и не приёмка устройства.

## Границы и сохранность H–N

Перед правками сняты SHA-256 всех 116 прежних изменённых/новых файлов. Из них
115 сохранены побайтно; единственное разрешённое пересечение —
`mobile/app/more/[section].tsx`. В нём заменены только импорты, wiring и встроенные
секции Statistics/Referrals. Хвост от `type NotificationSettings` до конца файла
(остальные секции, helpers, стили) сравнен с исходной копией побайтно.

Web/server, mobile shared/storage/sync/api/auth/config/notifications/domain,
package/lock, app.json/eas.json, package ID и deep links не менялись.
STATUS/ROADMAP и версии не изменены: по брифу их обновляет родитель после
независимой проверки; M1-T10 остаётся в работе. Коммитов, staging, push, PR,
переключения ветки, субагентов, EAS, чтения env/credentials и обращений к production
не было. Логи/исходные хеши находятся в `~/.hermes/cache/scratch/o-*`.

## Сверка текущей PWA и контрактов

Прочитаны handoff, UI conventions, M1-T10, §§4/5, AA/AB и §6.3 плана паритета,
PLAN-CONTINUE; текущие StatisticsContent, ReferralsContent, HistoryContent,
HistoryFeed и endpoints statistics/referrals/histories. Проверены mobile re-export
routes, sanitizer `server/mobile/statistics.js`, `server/referralSummary.js`,
реальные `api`, `useAuth`, `env.apiBaseUrl` и storage exports.

- Статистика читает `/mobile/v1/statistics` с year/status/town. DTO — реальная
  проекция sanitizer: events/clients/transactions/filters. Массивы, поля, суммы,
  даты и `success:true` валидируются; echoed filters должны совпасть с запросом.
- Формулы сохранены: доходы, расходы, taxes, referral_out + organizer, net,
  margin при положительном доходе, остаток по договору с нижней границей 0,
  топ-5 расходов и прибыли работ. Независимые транзакции входят в общий итог,
  но не в финансы конкретной работы. Новый экспорт из будущего Q не подменяется
  экспортом статистики.
- Рефералы всегда читают `/mobile/v1/referrals?scope=mine`, независимо от роли.
  Используется настоящий shape `buildReferralRows`: `row.user`, rewardsTotal,
  rewardsCount, lastRewardAt, createdAt; отображается имя в порядке PWA.
  Суммы/количества сверяются со строками, дубли ID и некорректный DTO отвергаются.
  Административные группы и revenue не запрашиваются и не отображаются.
- Ссылка — `${origin}/login?mode=register&ref=<current user id>`; origin берётся
  из `env.apiBaseUrl`, без legacy-хардкода, credentials или bearer в URL.
- История — существующий bearer endpoint `/histories` и прежний cache kind
  `activityHistory`, `_id = id`, `updatedAt = occurredAt`. Схема хранилища,
  sync/outbox и auth lifecycle не менялись; сохранены известные поля server DTO.
- Для открытия работы/клиента проверяется tenant-scoped GET
  `/mobile/v1/events/<id>` / `/mobile/v1/clients/<id>`. У транзакции GET detail
  отсутствует; проверка использует существующий tenant-scoped GET
  `/mobile/v1/transactions` и точное присутствие исходного ID. Локальный tenantId
  не выдаётся за серверную авторизацию.

## Реализовано

### AA — статистика и рефералы

Отдельные feature-компоненты используют общие Surface/Notice/Button/CompactField,
FilterControl и обе палитры через useTheme. Фильтры статистики сворачиваются;
карточки, суммы, длинные имена и строки допускают перенос на узкой ширине.
Есть доступные подписи, selected/expanded/disabled/busy и стандартные touch targets.

Loading отделён от empty/error/403/retry: до подтверждённого ответа суммы не
рисуются как реальные нули. Данные связаны с текущими user/tenant/фильтром;
blur/unmount/смена профиля и фильтров инвалидируют поздние ответы. Повтор GET
отменяет прежний запрос. Native действия имеют отдельный lock до фактического
окончания promise; поздние результаты не показывают уведомления в новой сессии.

CSV использует Expo File/Sharing: UTF-8/BOM, кириллицу, `;`, удвоение кавычек и
сохранение CR/LF внутри quoted cell. Терминология работы берётся из resolver;
`eventId` и внутренние пути сохранены. Экспорт заблокирован при loading/ошибке,
403, невалидном DTO и до ответа на выбранный фильтр. Файлы получают уникальные
имена и удаляются в finally после успеха, отказа/отмены share и ошибки create/write.
Ошибка cleanup не заменяет исходную ошибку и не оставляет UI-lock.

Ссылка реферала выделяется вручную, копируется с обработкой false/rejection,
передаётся через имеющийся React Native Share. Отмена share не объявляется
успешной отправкой. Собственные строки включают регистрацию, сумму, количество
и дату последнего начисления; пустой набор и отказ доступа различаются.

### AB — история

Компактный поиск и раскрываемые фильтры; выбор типа, операции, источника, автора,
диапазона. Добавлены Avito, VK, телефония и file_import, как в PWA. Фильтры работают
также в истории карточки. При смене params фиксированный type/id вычисляется
заново; неполный/невалидный адрес не выполняет общий запрос. ID/type проверяются
без trim/нормализации токена; payload не может задать произвольный URL перехода.

Даты проверяются по календарю, включая високосные годы, порядок диапазона и
недопустимые ISO rollover часы/минуты/секунды. Исправлены dateFrom/dateTo в local
filter. Сохранена семантика текущей PWA: date-only начало — UTC, конец —
23:59:59.999 по времени устройства. В API передаются однозначные ISO instants,
локальный фильтр использует те же границы. Эта асимметрия явно подписана в UI.

Diff раскрывается по нажатию; создание имеет приоритет над старым semanticAction
и показывает только новые значения, update — «Было/Стало». Значения статусов,
денег, дат, массивов и объектов имеют читаемые подписи; пустой diff различается.

Reload/loadMore защищены epoch/abort и single-flight: прежняя страница не
смешивается с новым фильтром/профилем, дубли удаляются между/внутри страниц,
непродвигающийся cursor отвергается. Ошибка страницы сохраняет список и cursor;
retry повторяет страницу. HTTP 401/403 очищает видимые строки, запрещает переходы
и не превращается в успешный offline cache. Invalid success/meta/shape не
кэшируется. Ошибки NetInfo/read/write cache обработаны, загрузка завершается;
сырой текст ошибок с секретами/PII не выводится.

История из памяти подписана как последняя сохранённая, неполная офлайн-копия,
без выдуманной даты синхронизации. Сбой сохранения после успешного GET оставляет
актуальные строки с предупреждением. History-cache операции сериализуются внутри
feature: если сессия инвалидирована во время SQLite write, его строки удаляются
до следующего cache read; ошибки очистки не разрешают читать потенциально stale rows.

`entityExists` — только условие отображения действия. Перед переходом выполняется
новая проверка NetInfo и серверной доступности. Missing/foreign/deleted/invalid
entity, offline, 403 и позднее подтверждение прежней сессии не дают route.

## Изменённые файлы

- `mobile/app/more/[section].tsx` — выделение/wiring двух секций.
- `mobile/app/history.tsx` — экран/фильтры/состояния истории.
- `mobile/src/features/statistics/StatisticsSection.tsx`, `statistics.ts`,
  `exportCsv.ts`, `useSectionData.ts`; тесты `statistics.test.ts`,
  `exportCsv.test.ts`, `sections.test.tsx`.
- `mobile/src/features/referrals/ReferralsSection.tsx`, `referrals.ts`,
  `referrals.test.ts`.
- `mobile/src/features/history/api.ts`, `filter.ts`, `types.ts`, `useHistory.ts`,
  `HistoryRow.tsx`; тесты `filter.test.ts`, `api.test.ts`, `HistoryScreen.test.tsx`.
- `docs/mobile-parity/REPORT-O.md`.

## Проверки

Все перечисленные ниже процессы дождались фактического завершения:

| Проверка | Результат | Exit |
|---|---|---|
| `cd mobile && npm run typecheck && npx jest --runInBand` | TypeScript без ошибок; **100 наборов / 917 тестов passed**, 0 failed, 0 snapshots; Jest 280.417 s | **0** |
| `TZ=UTC npx jest --runInBand src/features/history/filter.test.ts src/features/history/api.test.ts` | **2 набора / 49 тестов passed** | **0** |
| `TZ=Asia/Krasnoyarsk npx jest --runInBand src/features/history/filter.test.ts src/features/history/api.test.ts` | **2 набора / 49 тестов passed** | **0** |
| `npx jest --runInBand src/features/statistics/sections.test.tsx` после последней правки подписи на `terms.plural` | **1 набор / 15 тестов passed** | **0** |
| Повторный `npm run typecheck` после последней правки и всех тестов | Без ошибок | **0** |
| `git diff --check` | Без ошибок/вывода | **0** |
| Проверка SHA-256 H–N и сравнение остальных секций more | **115/115 файлов вне пересечения сохранены**, остаток more совпадает побайтно | **0** |

Полный набор вырос с исходных **94 / 799** до **100 / 917** без удаления прежних
тестов. Новый regression coverage включает формулы/empty/нулевой доход/независимые
транзакции, CSV/BOM/quotes/CR-LF/cleanup, mine DTO/ссылку/clipboard/share,
loading/empty/403/invalid DTO/сеть/retry, обе темы, фильтры/профиль/blur/unmount,
историю date boundaries/fixed route/diff/pagination/dedup/cache и запреты перехода
на missing/foreign/deleted/offline/stale entity proof.

Промежуточный history UI прогон выявил тестовую гонку (переключение профиля до
фактического начала HTTP) и cold-render timeout 5 секунд. Тест ждёт начала запроса,
локальный timeout UI-набора увеличен до 20 секунд; повторные и полный прогоны
зелёные. Были обычные предупреждения Expo из существующих notification-тестов;
они не означают проверку native push на устройстве.

Логи: `o-final-typecheck.log`, `o-final-jest.log`, `o-final-utc.log`,
`o-final-krasnoyarsk.log`, `o-last-statistics-ui.log`, `o-last-typecheck.log`
в `~/.hermes/cache/scratch/`.

## Независимая проверка родителем

- Повторная проверка типов: exit 0.
- Полный Jest: **100 наборов / 917 тестов**, exit 0; журнал `~/.hermes/cache/scratch/o-independent-jest.log`, 252.521 s.
- UTC и Asia/Krasnoyarsk: по **2 набора / 49 тестов**, exit 0.
- Собственный контрольный снимок: **2540 файлов вне разрешённой области совпадают побайтно**; хвост more от NotificationSettings совпадает с копией перед O. Diff-check чистый, индекс пуст.
- Первый объединённый независимый вызов проверки типов и Jest прерван лимитом инструментального ожидания 420 секунд: он не засчитан. Повтор выполнен раздельными завершившимися командами.
- STATUS/ROADMAP обновлены после проверки; M1-T10 остаётся в работе, версия не повышалась.

## Ограничения и непроверенное

1. Mobile statistics sanitizer не передаёт paymentMethod: нельзя подтвердить
   исключение `obligation`. Суммы сохранены по текущему mobile-контракту;
   ограничение видно в UI. Расширенные графики/календарные агрегаты и
   services-проекция PWA не изобретались; CSV остаётся выбранной статистикой,
   а общий полный экспорт — отдельный заход Q.
2. Bearer-контракт собственного списка рефералов подтверждён; процент настроек,
   QR и отдельный native экран истории начислений не подтверждены этим заходом.
   Процент и QR не выдуманы, кнопка фиктивной истории не добавлена. Это остаётся
   отличием от PWA, включая будущую работу с billing-history в заходе R.
3. Авторы истории выбираются из загруженных страниц, как в прежнем Android;
   полного справочника авторов PWA `useUsersQuery` не добавлено. Кэш может быть
   частичным и очищенным при смене сессии. Новой даты последнего sync/cache save
   существующее хранилище не даёт — она не придумана.
4. Проверка транзакции требует чтения tenant-списка, поскольку GET detail
   отсутствует. Проверка существования отражает момент серверного ответа;
   последующее удаление другим клиентом остаётся обычной гонкой данных.
5. Cleanup ошибок файлов безопасно не маскирует исходную ошибку. Если ОС запрещает
   delete, файл остаётся во временном cache до его штатной очистки; успешное
   физическое удаление в таком случае не заявляется.
6. Устройство, аппаратный Back, TalkBack, клавиатура/увеличенный шрифт, native
   picker/share, реальные два tenant и серверные HTTP E2E не проверены.
   Проверки навигационных отказов — mocks реальных tenant-scoped API,
   без имитации авторизации по локальному tenantId. EAS/production не запускались.
   HTML browser gates к нативному render неприменимы; компонентные light/dark
   проверки не заменяют визуальную Android-приёмку узкого экрана.
