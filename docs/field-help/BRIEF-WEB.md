# Внедрение согласованных подсказок в веб-кабинет

## Цель и источники

Добавить 91 новую подсказку и обновить 3 существующие, не меняя сценарии работы. Все 94 записи уже утверждены владельцем; повторного согласования текста не требуется.

Источники: `APPROVED.json` — неизменённый оригинал; `MATRIX.json` — явные смысловые ключи, реальные файлы/якоря и отдельные места классической и компактной формы; `helpers/fieldHelp.json` — готовый каталог для импорта. Прочитать `AGENTS.md`, `docs/AI_HANDOFF.md`, релевантные разделы `docs/ROADMAP.md`, `docs/UI_CONVENTIONS.md`. Код имеет приоритет перед историческими документами.

Каталог импортировать как JSON через существующий псевдоним `@helpers/fieldHelp.json`, обращаться по ключам вида `event.contractSum`. Не копировать тексты в компоненты. Никаких сетевых запросов за подсказками. `node scripts/generateFieldHelp.mjs --check` проверяет обе платформенные копии.

## Конкретные целевые файлы

Перечень всех 94 привязок с точными якорями находится в `MATRIX.json` (`webFieldEvidence`, `webClassic`, `webCompact`). Обязательные группы:

- Редактор работы: `layouts/modals/modalsFunc/eventFunc.js`, `components/CompactEventForm.js`, `components/CompactEventSection.js`, `components/OtherContactsPicker.js`, `components/ValuePicker/EventStatusPicker.js`, `components/ServiceMultiSelect.js`, `layouts/modals/modalsFunc/eventAdditionalEventEditorModal.js`, `layouts/modals/modalsFunc/eventStatusEditFunc.js`.
- Клиенты: `layouts/modals/modalsFunc/clientFunc.js`, `layouts/modals/modalsFunc/clientContactMergeFunc.js`.
- Транзакции: `layouts/modals/modalsFunc/transactionFunc.js`.
- Каталог и адрес: `layouts/modals/modalsFunc/serviceFunc.js`, `layouts/modals/modalsFunc/addressEditorFunc.js`, `components/AddressPicker.js`.
- Документы/КП: `layouts/content/DocumentsContent.js`, `layouts/modals/modalsFunc/artistRequisitesEditorFunc.js`, `components/DocumentCreateDialog.js`, `components/EventProposalsSection.js`, `components/ProposalPackagesEditor.js`, `components/ProposalTemplateEditor.js`.
- Обзор/статистика/отзывы/настройки: `components/RequestsWithoutNextStep.js`, `components/PastRequests.js`, `layouts/content/StatisticsContent.js`, `components/EventClientReview.js`, `components/ClientReviewCard.js`, `layouts/content/SettingsContent.js`, `layouts/content/BillingHistoryContent.js`. `helpers/getStatisticsMonthDetails.js` — источник формул, не место рендера подсказки.
- Интеграции/импорт/push: `layouts/content/IntegrationsContent.js`, `components/GoogleCalendarSettings.js`, `components/GoogleCalendarImportSettings.js`, `components/FileImportSettings.js`, `components/PushNotificationsSettings.js`.
- Служебные страницы: `layouts/modals/modalsFunc/tariffFunc.js`, `layouts/content/AiUsageAdminContent.js`, `layouts/content/RegistrationTrialSettingsContent.js`, `components/ManualBalanceChargeForm.js`, `components/PaymentReceiptControl.js`. Сохранить текущие права доступа; не показывать пользователю админ-подсказки.

Допускается минимальное пробрасывание необязательного `help` в перечисленных обёртках. Источники контракта: `components/FieldHelp.js`, `components/InputWrapper.js`, `components/LabeledContainer.js`, `components/Input.js`, `components/Textarea.js`, `components/ComboBox.js`. Не переписывать общее поведение этих компонентов.

## Обе формы — отдельные места приёмки

`eventFunc.js` собирает общий объект `fields`, но не все подписи общие:

- Классическая: вкладки «Общие», «Клиент и Контакты», «Финансы и Документы».
- Компактная: клиент — собственный `InputWrapper` в `CompactEventForm`, услуги — собственная подпись; общий `fields.client` здесь не используется.
- В компактной форме подписи общих контейнеров задач/документов скрыты. Подсказка должна быть у видимого внешнего раздела, иначе `help` у пустого `label` не отобразится.
- Даты: у видимого раздела компактной формы и у контролов начала/окончания классической. Не менять существующую валидацию: неизвестная дата заявки разрешена компактной веб-формой, это не разрешение переписывать классическую.
- Статус: видимый заголовок в компактной форме, подпись общего выбора в классической и отдельный диалог изменения статуса.
- КП/документы/контакты/задаток могут быть скрыты тарифом, состоянием или выбором пользователя. Проверять достижимые состояния, не снимать ограничения ради значка.

## Границы

Только справочный слой и тесты. Не менять API, схемы, авторизацию/tenant, тарифы, суммы, статистические формулы, автоматизацию, outbox, идентификаторы событий, package ID, deep links, зависимости, конфигурацию сборки. Не менять Android-экраны в этом этапе. PartyCRM не затрагивать.

Сохранить актуальные предупреждения, ошибки и обязательные действия на экране; не переносить их в «i». Предупреждение о замене услуг при применении КП, ограничение закрытия и предупреждения о платном импорте остаются видимыми.

Исходные защищённые файлы и снимки: `/home/aleksei/reports/vedelo-podskazki/baseline/manifest.json`, `protected-files.json`, `snapshot/`. В частности уже изменены чужой задачей `docs/ROADMAP.md`, `docs/UI_CONVENTIONS.md`, `layouts/modals/Modal.js`, `layouts/modals/ModalsPortal.js`, `package.json`, `package-lock.json` и два теста блокировки прокрутки. Не откатывать и не коммитить их. Не коммитить/пушить/деплоить самостоятельно. Версия/roadmap в подготовительном этапе не менялись; обновление при закрытии продуктового пункта должно быть отдельным согласованным изменением, не включать чужие правки.

## Дополнительное уточнение статистики из дочерней карточки

Карточка внедрения `t_8b015cfd` отдельно фиксирует утверждённое переименование неверной подписи «Задаток» в «Получено по предстоящим работам». Реальное место — `layouts/content/StatisticsContent.js:903`; `depositPaidEvents` около строк 445–466 собирает все income по предстоящим работам, а не только категорию задатка. Сохранить расчёты и отдельно явно объяснить, что текущий учёт может включать обязательства: переименование не превращает план в подтверждённое поступление. Это отдельная правка подписи/пояснения по карточке, не новая запись и не изменение 94 утверждённых текстов каталога. В Android применять только при наличии именно такого показателя, не переименовывать обычный флажок ожидания задатка.

## Критерии приёмки

1. Все 94 ключа отражены в отчёте: 91 добавление, 3 обновления; нет пропусков служебных страниц.
2. Текст совпадает с каталогом, без сокращений и ручных склонений. Значок справа от видимой подписи; один значок на одно место, без вложенной кнопки в `summary`/кнопке заголовка.
3. Нажатие, Enter/Space, повторное нажатие, Escape, уход фокуса и нажатие снаружи работают. «i» не отправляет форму, не переключает флажок, не раскрывает/сворачивает соседний раздел и не закрывает родительскую модалку.
4. Обе веб-формы проверены отдельно при создании и редактировании, включая условные поля и новую/сохранённую заявку, подтверждённую/закрытую работу.
5. 1365 и 390 px, обе темы, длинные тексты без обрезки и переполнения; доступные имена кнопок и состояние раскрытия сохранены.
6. Нет изменения данных/запросов после открытия/закрытия подсказки. Соседние предупреждения/валидация сохраняются.

## Команды и отчёт

В корне: `node scripts/generateFieldHelp.mjs --check`, `node --test tests/fieldHelpCatalog.test.mjs`, `npx eslint <точные изменённые JS-файлы>`. Отдельно: `node --test tests/components/compactEventForm.test.cjs tests/components/clientContacts.test.cjs tests/components/eventProposalsSection.test.cjs tests/components/documentsEditor.test.cjs`. Реальный исходный результат указан в `REPORT-PREP.md`; пять прежних падений нельзя считать новыми или молча исправлять.

Для реализации выполнить `npm run build` отдельно от тяжёлых мобильных проверок и живой браузерный прогон по `BRIEF-VERIFY.md`. При изменении обёрток подсказок добавить компонентный тест и браузерную регрессию реального `FieldHelp`. Итоговый `REPORT-WEB.md`: реализованные ключи/варианты, полный список файлов, команды и коды завершения, исходные/новые падения, визуальные проверки и ограничения. Отчёт не означает выкладку.
