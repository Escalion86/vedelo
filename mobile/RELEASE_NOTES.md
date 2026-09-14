# Ведело Android 1.0.0 — release candidate

## Что нового

- задачи и следующие контакты с быстрыми действиями;
- offline CRUD клиентов, мероприятий, финансов, услуг и групп услуг;
- календарь мероприятий, карточки клиентов и звонков;
- DOCX-шаблоны, договоры, акты, вложения и Android share sheet;
- Expo push, deep links и интерактивные действия из уведомлений;
- обратная связь с разработчиком: тикеты, диалог, изображения, статусы и push с переходом в обращение;
- интеграции Google Calendar, Avito, VK, Novofon, AITunnel и Public Leads API;
- защищённые mobile-сессии, управление устройствами и удаление аккаунта;
- SQLCipher cache, outbox, tombstones, конфликты и фоновая синхронизация.

## Выпускной статус

- версия приложения: `1.0.0`;
- APK-кандидат: `versionCode 14` (`71aa1deb-dc0b-4a12-a9b2-d74c033cabd7`);
- Android package: `ru.escalion.artistcrm`;
- Expo SDK: `55`;
- React Native: `0.83.6`;
- минимальная версия: Android 10 / API 29;
- compile/target SDK: API 36;
- production API: `https://vedelo.ru/api`;
- формат Google Play: Android App Bundle (`.aab`), track `internal`.

## Что проверить на Internal Testing

1. Авторизацию, регистрацию, восстановление, VK ID, onboarding и удаление аккаунта.
2. Offline CRUD, перезапуск с outbox, разрешение конфликтов и отсутствие дублей.
3. Push-разрешение, deep links и действия «Выполнено / На завтра / Через 3 дня».
4. Document Picker, загрузку и открытие DOCX, генерацию договора/акта и share sheet.
5. Голосовой AI-черновик, отказ в доступе к микрофону и очистку временного аудио.
6. Background sync и ограничения энергосбережения на Pixel, Samsung и Xiaomi.
7. Создание тикета с изображениями, ответ разработчика, счётчик непрочитанных и deep link из push.

## Не входит в Android 1.0

- системный Caller ID через `CallScreeningService`;
- home widgets, Share Target, сканирование документов и App Shortcuts;
- биометрическая блокировка приложения.
