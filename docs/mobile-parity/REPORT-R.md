# Заход R — AG + AH: профиль, баланс, уведомления и поддержка

Дата: 2026-10-04. Репозиторий `/home/aleksei/projects/vedelo`, ветка `mobile-parity`.
Код реализован в пределах существующих пользовательских API. Android/device и
production-приёмка не выполнены. Работа одним агентом, без делегирования.
Коммитов, staging, push, reset и checkout не было.

## Сверка с текущими Web/PWA и API

Прочитаны AGENTS.md, AI_HANDOFF, M1-T10 ROADMAP, PLAN-CONTINUE, AG/AH и
ALIGN-дополнения MOBILE_PWA_PARITY, UI_CONVENTIONS, SUPPORT_TICKETS.
Проверены реальные источники:

- `layouts/content/ProfileContent.js`,
  `layouts/modals/modalsFunc/artistRequisitesEditorFunc.js`; mobile
  `auth/me`, `auth/sessions`, `auth/change-password`, `auth/delete-account`,
  `profile/avatar`, `profile/requisites`; нормализаторы
  `server/mobile/profile.js`, `server/mobile/artistRequisites.js`.
- `layouts/content/TariffSelectContent.js`, `BillingHistoryContent.js`,
  `components/PaymentReceiptControl.js`, `server/paymentHistory.js`,
  `app/api/billing/history/route.js`; существующий mobile billing DTO и format.
- `layouts/content/NotificationsContent.js`,
  `components/PushNotificationsSettings.js`, mobile notifications GET/PATCH,
  существующий `useExpoPushNotifications.ts` и его разрешения/отписка.
- `layouts/content/FeedbackContent.js`, `components/SupportTicketCard.js`,
  `server/supportTicketCore.js`, `server/supportTickets.js` и mobile support API.
  Сохранены лимиты: список 30, сообщения 50 на страницу, тема 160 символов,
  сообщение 5000, 5 изображений JPEG/PNG/WebP по 10 МБ. Сервер проверяет
  сигнатуры файлов; клиентская проверка не заменяет её. Ограничения создания
  10/час и ответов 60/час не менялись.

## Реализация

Профиль переведён на palette, CompactField и Notice. Сохранены ФИО, email,
WhatsApp, Viber, Telegram, VK, Instagram, телефон в заголовке, аватар,
реквизиты, пароль, устройства, отзыв сессии, выход и запрос удаления аккаунта.
Аватар 56 px. Профиль и реквизиты подтверждаются отдельным GET после записи;
отзыв устройства — повторным GET списка сессий. Несовпадение результата и
ошибка чтения не объявляются успехом. Контактные поля и реквизиты остаются
после ошибки. Пароль очищается после попытки смены и не сохраняется в новом
кэше. AuthProvider и tokenStore не редактировались: проверенные данные
публикуются через существующий completeSignIn с проверкой текущей личности.

Тариф и баланс используют palette, Notice и resolver терминологии. Формулы
`formatBalanceRunway`, серверные quotes, компенсация и округление недостающей
суммы сохранены; `format.ts` не изменён. Название DEV не включает административный
режим. Topup, смена тарифа, sync платежа и смена пароля используют
`skipRefresh: true`. После возврата из браузера оплата не объявляется проведённой:
нужна явная проверка статуса и чтение баланса. Смена тарифа подтверждается GET,
в том числе после потери POST-ответа, без повторного списания. Неопределённое
создание платежа блокирует повтор; разблокировка требует отдельного
пользовательского подтверждения после проверки истории и сама не делает POST.

Добавлена собственная история сервиса через `/billing/history` без `userId`:
категории all/tariff/topup/bonus/refund/charge, cursor pagination, deduplication,
защита от повторного/циклического курсора и поздних страниц после смены фильтра
или пользователя. Сохраняются реальные title/kind/type/status, amount/direction,
sourceTitle/methodTitle/details и occurredAt. Referral metadata отображается
через безопасные kind/details из DTO, без реконструкции скрытых полей.
Management и идентификаторы чужого аккаунта не попадают в локальную модель.
Pending/canceled/failed не имеют признака проведённого зачисления;
отсутствующая или повреждённая дата подписывается «Дата не указана».
Чек доступен только по валидному HTTPS URL без credentials/control characters,
только для просмотра. Attach, receiptNotRequired, manual debit, удаление и
административная проверка платежей не добавлены. Рабочие Transactions не затронуты.

Уведомления вынесены в точный маршрут `more/notifications.tsx` и новый feature.
В установленном Expo Router `sortRoutes` ставит статические маршруты раньше
динамических; существующее меню уже ведёт на `/more/notifications`.
В `more/[section].tsx` изменён только блок Notifications и добавлен его импорт;
остальные прежние секции сохранены. Системные разрешения читаются через
существующий Expo helper, регистрация вызывается только кнопкой «Включить push».
Отказ разрешения, открытие Android settings, online/offline unsubscribe,
reminderTime с шагом 15 минут и timeZone сохранены. Локальное состояние устройства
читается независимо от доступности сервера, поэтому offline-отписка остаётся
доступной. При failed/loading не подставляются часовой пояс или ноль устройств
как подтверждённые данные. Настройки проверяются GET после PATCH. Результат
теста push описывает принятие сервисом, без обещания доставки.

Поддержка получила theme/Notice, доступные категории, компактные фильтры и
карточки со статусом/меткой нового ответа, состояния загрузки/ошибки/пустого списка,
безопасные HTTPS-вложения и сохранённые пользовательские reply/read/pagination.
SupportUserAccess и запрет operator для dev сохранены до сети. Создание проверяется
GET конкретного тикета; ответ — наличием возвращённого message ID при адресном
чтении, при необходимости с обходом ранних страниц. Черновик и вложения остаются
после ошибки. Повтор блокируется до завершения NetInfo и запроса; потеря ответа
не запускает автоматический POST. После проверки доступна отдельная явная
разблокировка повтора с предупреждением о возможном дубле.

Локальный `useScreenLifetime` инвалидирует результаты при уходе и размонтировании;
экраны дополнительно разделены ключом tenant/user, а диалог — ticket ID.
Для страниц используются поколения запросов и блокировка повторных действий.
Поздние результаты не публикуют данные старого пользователя и не выполняют
переходы. Временные изображения копируются в собственные файлы; исходный
picker/gallery URI никогда не удаляется. Аватарная копия очищается в finally;
копии вложений поддержки удерживаются для черновика и очищаются после удаления,
подтверждённой отправки или размонтирования. Ошибка частичного copy также очищает
только собственный файл.

Изменение support API минимально: валидация вложений и локальный `uploadOnce`
для create/reply. Shared `api.upload` повторяет POST после 401, поэтому для этих
неидемпотентных операций и аватара добавлен отдельный транспорт без повтора.
Он сохраняет Bearer и device headers, не меняет endpoint/payload, не логирует и
не кэширует секреты. Существующий requireUserSupport остаётся перед запросом.
Shared API/auth/sync/push/storage lifecycle не изменялись.

## Файлы

Изменены существующие:

- `mobile/app/(tabs)/profile.tsx`
- `mobile/app/billing/index.tsx`
- `mobile/app/more/[section].tsx` — только Notifications и импорт
- `mobile/app/support/index.tsx`, `new.tsx`, `[id].tsx`
- `mobile/src/features/profile/ArtistRequisitesSection.tsx`
- `mobile/src/features/support/ImagePicker.tsx`, `api.ts`, `api.test.ts`, `screens.test.tsx`

Добавлены код и маршрут:

- `mobile/app/more/notifications.tsx`
- `mobile/src/features/notifications/NotificationsSection.tsx`
- `mobile/src/features/billing/PaymentHistory.tsx`, `history.ts`
- `mobile/src/features/profile/useScreenLifetime.ts`, `nativeImage.ts`,
  `presentation.ts`, `uploadOnce.ts`
- `mobile/src/features/support/pagination.ts`

Добавлены 10 наборов тестов:

- `mobile/src/features/profile/ProfileScreen.test.tsx`,
  `ArtistRequisitesSection.test.tsx`, `nativeImage.test.ts`, `uploadOnce.test.ts`
- `mobile/src/features/billing/BillingScreen.test.tsx`,
  `PaymentHistory.test.tsx`, `history.test.ts`
- `mobile/src/features/notifications/NotificationsSection.test.tsx`
- `mobile/src/features/support/ImagePicker.test.tsx`, `pagination.test.ts`

Прежние сценарии support tests сохранены; транспортная проверка обновлена на
uploadOnce, позитивный reply fixture дополнен подтверждающим GET. Дополнительно
проверены потерянный ответ, двойное нажатие, смена пользователя/фильтра,
несовпадение read-back, реквизиты/контакты/сессии/аватар, unsafe URLs,
повреждённый DTO, повтор курсора, denied permission, время/offline unsubscribe,
вложения, запрет operator и light/dark. Вложения и все внешние мутации в QA — моки.

## Завершённые проверки

Команды выполнялись отдельно из `mobile/`, без объединения typecheck и Jest:

```text
npm run typecheck
exit 0, ошибок нет

npx jest --runInBand
Test Suites: 123 passed, 123 total
Tests:       1213 passed, 1213 total
Snapshots:   0 total
Time:        440.791 s
exit 0
```

`git diff --check` из корня — exit 0. Полный прогон завершён, не прерван.
База из BRIEF-R: 113 наборов / 1146 тестов; добавлены 10 наборов / 67 тестов.
В полном наборе остаются предупреждения о не заданном EXPO_PUBLIC_API_BASE_URL
в mock-среде и ограничениях Expo Go; failures нет.
Предварительные ошибки focused fixtures и неподдерживаемого chip tone исправлены;
неуспешные вызовы команд из корня не засчитывались в проверку mobile.

Перед правками сохранены SHA-256 2602 исходных файлов в памяти инструмента.
2591 файл вне правок R сохранён побайтно; 11 изменённых существующих файлов
входят в разрешённую область. Прежние H–Q, включая ROADMAP/STATUS/PLAN,
shared domain/types, package/lockfiles и compatibility contracts сохранены.
Origin — vedelo.git; существующие origin/mobile-parity и HEAD: 0/0.
Отдельные файловые логи, пробы, скриншоты и бинарные ассеты не создавались.

## Оставшиеся различия и границы приёмки

1. **ОГРНИП:** действующий mobile serializer и PATCH принудительно очищают его
   для self_employed. Клиент сохраняет скрытый черновик при переключении статуса,
   в том числе после сохранения, до выхода с экрана, и явно предупреждает об
   очистке сервером. Сохранить это значение между открытиями без изменения
   backend-контракта невозможно. Web-форма сохраняет скрытое значение иначе;
   этот пробел AG требует отдельной серверной задачи.
2. **Профиль:** в native остаются три поля ФИО и один аватар; текущая web-форма
   использует единый ФИО и список фотографий. Телефон отображается, но его
   изменение не поддерживается mobile auth/me PATCH. Полного pixel-perfect
   совпадения и расширения этого контракта данный заход не заявляет.
3. **Неопределённый POST:** для topup/support нет подтверждённого клиентского
   idempotency/recovery key в текущем контракте. Запрос не повторяется
   автоматически; проверка истории и осознанный ручной повтор остаются
   ответственностью пользователя. Текстовый черновик поддержки не записывается
   в новый постоянный store и не обещает восстановление после process death.
4. **Push и поддержка:** read-back подтверждает серверную запись/настройку,
   а не доставку сообщения, push или банковское зачисление на устройство.
   Существующее ограничение поддержки для dev осталось; operator backend
   не менялся и не выдаётся за пользовательский доступ.
5. **Внешняя QA:** Android/adb/Java, native picker на устройстве, cold start,
   возврат из браузера, системные permissions, font scale и реальные размеры
   320/390 px не проверены. Component render не является Android-приёмкой.
   Реальные HTTP двух tenant, реальные платежи/списания, тикеты/сообщения,
   receipt hosts и push не запускались. Web build/ESLint не выполнялись:
   Web/server/API в этом заходе не менялись.

M1-T10 не закрыт. Исполнитель не менял ROADMAP/STATUS/PLAN и версии согласно BRIEF-R.
Родитель обновил ROADMAP/STATUS после независимой проверки. PartyCRM не затронут.

## Независимая проверка родителем

- `npm run typecheck`: код завершения 0.
- Первый полный Jest-вызов прерван транспортным лимитом 420 секунд и не засчитан.
- Повторный `npx jest --runInBand`: код завершения 0; 123 набора / 1213 тестов, 383,392 с. Лог: `/home/aleksei/.hermes/cache/scratch/r-independent-jest.log`.
- Снимок родителя до захода: 2601 файл. Изменены только 11 разрешённых существующих файлов; остальные 2590 сохранены побайтно. Это отдельный снимок от контрольного набора исполнителя.
- Проверены ключи разделения пользователей, пользовательский DTO истории без management/userId и транспорт поддержки без автоматического повторного POST. Внешняя приёмка остаётся незавершённой, как указано выше.
