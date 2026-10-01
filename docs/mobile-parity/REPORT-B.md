# Этапы B+C: пользовательский ИИ и поддержка

Реализовано 01.10.2026 по `docs/mobile-parity/BRIEF-B.md` и §6.2/§7
`docs/MOBILE_PWA_PARITY.md`. Изменения ограничены `mobile/`; другие этапы
паритета и M1-T7 этим заходом не закрываются, версии не меняются.

- **B:** удалены модели, состояние, интерфейс и запросы административной
  статистики/наценки ИИ, выбор DeepSeek и зависимость от `canUseDeepseek`.
  Сохранены `/ai/usage`, личные баланс, пороги, история списаний, обновление и
  ошибки, ИИ Ведело и собственный AITunnel с моделями, паузой и отключением.
  Неизвестный/legacy provider отображается как несовместимый: нет выбранного
  провайдера и автоматической записи; смена требует явного выбора и подключения.
  Подсказка расходов относится к сохранённому провайдеру, а не черновику выбора.
  Личный биллинг, тарифы и платежи не менялись.
- **C:** удалены операторский список, панель автора, переключатель статуса и
  PATCH статуса. Сообщения `authorRole='developer'` остаются входящими.
  Для пользовательских аккаунтов сохранены список, создание, пагинация,
  переписка, ответ, прочтение и вложения.
- `SupportUserAccess` не монтирует пользовательский экран для `dev` и до
  загрузки аккаунта; прямые `/support`, `/support/new`, `/support/[id]` безопасны.
  `api.ts` дополнительно читает текущую сессию перед каждой из шести операций,
  включая summary, и отклоняет `dev` до HTTP. Меню не запрашивает его счётчик
  и игнорирует запоздавший ответ при смене пользователя. Роль не изменяется.
- Это ограничение пользовательского Android-клиента. Сервер по-прежнему
  считает `dev` оператором; личная поддержка для этой роли потребует отдельного
  user-scoped серверного контракта.

## Проверки

- `cd mobile && npm test`: **38 suites passed, 158 tests passed**, без таймаутов.
  Известное предупреждение Expo Go о remote push сохранилось.
- Точечный набор ИИ/support/menu: **4 suites passed, 37 tests passed**.
- `cd mobile && npm run typecheck`: только исходная **TS2322** в
  `src/shared/notifications/index.ts:8` — отсутствуют `shouldShowBanner` и
  `shouldShowList`. Чужой untracked-файл не изменён.
- `git diff --check`: без ошибок.
- Точечный ESLint всех 13 изменённых/добавленных TS/TSX-файлов: **0 ошибок,
  0 предупреждений**. Штатный корневой конфиг исключает `mobile/**`, поэтому
  проверка выполнена временным конфигом в `/tmp`: TypeScript parser,
  `rules-of-hooks`, `exhaustive-deps`, `no-multi-spaces`, `no-unreachable`.
  Зависимости проекта и lock-файл для этой проверки не менялись.

Изменены: `app/(tabs)/more.tsx`, `app/support/index.tsx`, `app/support/[id].tsx`,
`app/support/new.tsx`, `src/features/integrations/AiUsagePanel.tsx`,
`src/features/integrations/ManagedIntegrationsSection.tsx`,
`src/features/integrations/AiUsagePanel.test.tsx`,
`src/features/more/moreScreen.test.tsx`, `src/features/support/api.ts`.
Добавлены: `src/features/support/userAccess.ts`,
`src/features/support/SupportUserAccess.tsx`, `src/features/support/api.test.ts`,
`src/features/support/screens.test.tsx` и этот отчёт. Файлы не удалялись.

Устройство/эмулятор и `adb` в этой среде недоступны. Физические picker/share,
визуальные проверки узкого экрана и темы, реальные серверные интеграции не
проверялись; Jest не заменяет device QA. Новая dark theme относится к следующим
этапам паритета и здесь не реализуется.
