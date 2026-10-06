# Аудит темы — заход T / AJ

Дата: 2026-10-04. Проверены исходники текущей рабочей копии, включая H–S.
Эталон — `app/globals.css`, `docs/UI_CONVENTIONS.md`, дизайн-контракт
`docs/MOBILE_PWA_PARITY.md`. Это аудит кода и токенов, без нативных снимков.

## Охват и достижимость

По всем 37 `.tsx` в `mobile/app` построен консервативный граф локальных
`import`/`export`/`require`/динамических `import` с разрешением относительных
путей. После T он содержит 208 файлов, из них 103 TSX; неразрешённых локальных
путей нет. Граф включает также импорты типов и неиспользуемые импорты:
достижимость файла не означает достижимость каждого его локального компонента.
Тесты и `shared/ui/preview.tsx` не являются пользовательскими маршрутами.
Дополнительно выполнен поиск цветов по всему `mobile/app` и `mobile/src`,
а не только по названиям файлов из графа.

Проверенные маршруты, пути относительно `mobile/app`:

| Область | Маршруты / оболочки | Источник оформления |
| --- | --- | --- |
| Корень и вход | `_layout.tsx`, `index.tsx`, `(auth)/_layout.tsx`, `(auth)/login.tsx`, `onboarding/index.tsx` | Palette, Screen/CompactField/Notice; index перенаправляет. Фоны вложенного Stack и root теперь явно получают canvas. |
| Вкладки | `(tabs)/_layout.tsx`, `(tabs)/index.tsx`, `(tabs)/events.tsx`, `(tabs)/clients.tsx`, `(tabs)/finance.tsx`, `(tabs)/more.tsx`, `(tabs)/tasks.tsx`, `(tabs)/profile.tsx` | Palette, AttentionScreen, карточки, фильтры, меню и MobileBottomBar; tasks — совместимый переход. Фон scene задан через palette. |
| Работы | `events/[id].tsx`, `events/edit/[id].tsx`, `events/[id]/documents.tsx` | Palette, EventGeneral/Contacts/Finance, календарь, VoiceDraft, документы; индикаторы ожидания получили явный theme-цвет. |
| Клиенты | `clients/[id]/index.tsx`, `clients/[id]/documents.tsx`, `clients/[id]/merge.tsx`, `clients/edit/[id].tsx` | Palette, QuickContacts, документы, форма/поиск/merge. |
| Услуги и финансы | `services/edit/[id].tsx`, `service-groups/edit/[id].tsx`, `finance/edit/[id].tsx`, `billing/index.tsx` | Palette, ServiceEditor, FinanceRelationPicker, транзакции и история платежей. |
| Переписки и звонки | `conversations/index.tsx`, `conversations/[provider]/[id].tsx`, `calls/[id].tsx` | ConversationsList/ConversationDetail, CallDetail, Palette. |
| Меню и служебные пользовательские сценарии | `more/[section].tsx`, `more/documents/template/[id].tsx`, `more/import.tsx`, `more/export.tsx`, `more/notifications.tsx`, `history.tsx`, `sync/index.tsx` | Выделенные тематические секции, Notice/Surface/поля/фильтры. Whitelist и неподдержанные разделы сохранены. |
| Поддержка | `support/index.tsx`, `support/new.tsx`, `support/[id].tsx` | Palette, ImagePicker, поля, кнопки и Notice. |

Для каждой группы прослежены её компоненты и общие Screen/Surface/Button,
CompactField/Field, Notice/StatusChip, FilterOverlay, QuickContacts/шторки,
нижняя панель/меню, формы, индикаторы и фоны. Все используемые пользовательским
JSX цветовые стили получают текущую палитру. Локального неизменяемого светлого
фона на достижимом пользовательском экране не обнаружено.

## Фактические остатки

| Остаток | Достижимость и роль | Решение |
| --- | --- | --- |
| `theme.ts`: старый `colors` | Экспорт совместимости; единственный production-импорт находится в `more/[section].tsx`. | Не удалять ради чистки. Не используется достижимым JSX. |
| `more/[section].tsx`: `Integration`, `IntegrationState`, `FilterChip`, `Metric`, локальный `styles`, `#FFFFFF` | Локальные компоненты не экспортируются и не вызываются, JSX с этими именами отсутствует. Default `MoreSectionScreen` использует импортированные новые секции; `Documents` и `Lists` — обёртки без старых стилей. | Файл и прежние изменения сохранены побайтно. Это мёртвый остаток, не светлый пользовательский экран. |
| `rgba(0,0,0,0.35)` в `MobileBottomBar` и `QuickContacts` | Достижимое затемнение прозрачного Modal; не фон содержимого/текста. Панели имеют palette.canvas. | Намеренная постоянная чёрная подложка в обеих темах. |
| `#FF231F7C` в `useExpoPushNotifications.ts` | Цвет LED канала Android, не цвет экрана/статусной строки. | Не менялся; push lifecycle вне T. |
| Цвета splash, adaptive icon и notification icon в `app.json` | Нативная заставка до JS и оформление иконок; пользовательского тематического JSX здесь нет. `userInterfaceStyle` уже имеет значение `automatic`, app.config.js его не заменяет. | Конфигурация только прочитана; сохранена. Светлая нативная заставка остаётся ограничением cold start. |
| `colors: Palette` в EventCalendar, редакторе работы и AiUsagePanel | Параметр фабрики либо `palette: colors` из `useTheme`, не импорт legacy-палитры. | Источник прослежен; не ошибочно мигрировать. |
| `contacts.*` в theme.ts | Брендовые MAX/WhatsApp/Telegram и красный пробный канал, как в текущем web. | Цвета брендов сохранены. Для текста пробного MAX введён отдельный тёмный foreground. |
| `transactionIncomeText` / `transactionExpenseText` | Сохранённые web-токены: в светлой теме белый текст на `#22c55e` / `#ef4444` имеет 2,28 / 3,76. После исправления бейджей в достижимом JSX не используются как текстовые пары; цвета фонов остаются маркерами транзакций. | Не перекрашивать финансовые маркеры и не удалять неиспользуемые токены. |
| Старые `navigationText` light и `fabForeground` dark | Оставлены для точного эталона web и иконок. Мелкие подписи получают отдельный navigationLabel; плюс тёмной FAB получает onPrimary. | Реальные неудачные пары исправлены в потребителях, без замены всех токенов. |

Итого: нет известного достижимого светлого legacy-экрана, который блокировал бы
снятие forcedMode. Это разрешает включить выбор темы на уровне кода;
полный нативный тёмный паритет и соответствие доступности не объявляются.

## Контраст и точечные миграции

Расчёт: sRGB, линеаризация каналов, относительная яркость,
`(Lmax + 0,05) / (Lmin + 0,05)`. Альфа цвета текста/фона композитируется
последовательно над canvas и/или scalar surface. Основной текст проверяется
на 4,5:1; плюс FAB как значок — на 3:1. В `themeContrast.test.ts` проверяется
91 текстовая пара на тему, дополнительно две проверки FAB и регрессия прежних
неудачных пар. Градиенты, антиалиасинг и общий opacity контейнеров не являются
доказанными пиксельными измерениями.

| Реальная роль | До T, светлая / тёмная | После T, светлая / тёмная | Потребители |
| --- | --- | --- | --- |
| Акцентный текст на rowSelected | 3,91 / 6,44 | 4,70 / 9,98 | Выбранные суммы тарифа, статус реквизитов, тип обращения, итог merge; галочка FilterOverlay. selectionText использует уже существующие значения secondaryPressedText. |
| Метаданные на rowSelected | 4,06 / 5,74 | 8,65 / 9,88 | Выбранный пресет onboarding, календарь Google, строки интеграций, выбранный кандидат merge, баланс, исходящий bubble, подписи финансовых итогов. Используется cardMeta вместо cardMuted в этих ролях. |
| Сегодня/счётчик календаря на emptyIconBackground | 4,00 / 6,18 | 4,82 / 9,58 | EventCalendar; выбранный день сохраняет onPrimary, счётчик выбранного дня на surface сохраняет primary. |
| Мелкая неактивная подпись нижней панели | 4,22 / 5,43 | 4,66 / 5,43 | MobileBottomBar: navigationLabel. Иконки сохранили navigationText. |
| Числа красных бейджей | 3,76 / 6,18 | 4,83 / 4,83 | MenuRow/MobileBottomBar. Отдельная пара `#ffffff/#dc2626` повторяет актуальные `.mobile-bottomnav-badge` и `.mobile-bottomnav-row-badge`, а не роль транзакции. |
| Текст пробного MAX | 2,77 / 2,77 | 6,20 / 6,20 | QuickContacts: onTrialBadge `#1f1b14`; подтверждённый брендовый MAX остаётся белым, 4,68 / 4,68. |
| Плюс FAB | 4,66 / 2,26 | 4,66 / 7,59 | MobileBottomBar: dark onPrimary; фон FAB сохранён. |

Дополнительные группы: основной текст/cardTitle/cardMeta/cardMuted на
canvas/surface/toolbar/KPI — минимум 4,63 в светлой и 7,27 в тёмной;
Notice — минимум 5,21 / 10,35; временные статусы — 4,84 / 9,89;
статусы работы — 4,79 / 9,89. Primary — 4,66 / 7,59,
pressed primary — 6,49 / 11,75; secondary и pressed secondary — выше 4,5.
Пары Notice/статусов дополнительно проверяются над canvas и surface.

## Границы доказательства

- Это не HTML- и не screenshot-гейт. Компонентные проверки исполняют реальные
  React Native компоненты в Jest с моками platform-зависимостей; сгенерированное
  дерево и вычисление цветов не доказывают нативный рендер.
- Брендовые и пробные контактные значки могут иметь иной контраст к фону,
  чем текст. В том числе красная пробная иконка на светлой поверхности остаётся
  ниже 3:1; её цвет сохранён по web-контракту, присутствуют доступная подпись
  действия и пояснение пробного канала. Общая доступность требует device QA.
- Общие состояния disabled/pressed с opacity, наложение Modal, градиенты,
  elevation, системные native Alert/picker/share/OAuth и клавиатура требуют
  проверки на устройстве. Ввод через собственные TextInput получает
  keyboardAppearance; Android IME может выбирать оформление самостоятельно.
- Пока SecureStore читается, действует прежний fallback light. После чтения
  валидная тема применяется; выбор во время чтения имеет приоритет. Это не
  обещание отсутствия короткого светлого кадра при холодном старте с dark.
- Тема шага onboarding остаётся прежним серверным payload. Локальная тема
  устройства выбирается отдельно в Настройках; порядок finish/HTTP/auth не
  менялся и этот прежний серверный выбор не синхронизирует локальный store.
- Android, возврат из фона, реальные системные значки/edge-to-edge/insets,
  TalkBack, крупный шрифт и узкие 320/390 dp ещё не приняты. AJ реализован
  программно; M1-T10, AK, M1-T7 и production этим аудитом не закрываются.
