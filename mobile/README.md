# Ведело Android

Полноценный пользовательский Android-клиент Ведело на Expo SDK 55 и React Native. Приложение показывает текущий тариф, баланс и прогноз оплаченного периода, поддерживает пополнение через СБП Точки, нативную смену тарифа и аватар профиля с хранением в cloud.escalion.ru; управление ролями, публичным сайтом и dev-инструменты не переносятся.

## Возможности версии 1.0

- авторизация по телефону, регистрация, восстановление пароля и VK ID PKCE;
- отдельные сессии устройств, отзыв сессий, выход и удаление аккаунта;
- главная, мероприятия, клиенты, финансы и личные разделы;
- услуги, группы, документы DOCX, звонки, статистика, списки, интеграции, уведомления, рефералы и профиль;
- зашифрованная SQLCipher-база, offline CRUD, outbox, tombstones, конфликты и очередь файлов;
- Expo push с быстрыми действиями и deep links;
- серверный API `/api/mobile/v1` с bearer access/refresh-сессиями и tenant isolation.

Caller ID через Android `CallScreeningService`, виджеты и Share Target относятся к версии 1.1+.

## Разработка на физическом Android-устройстве

Для ежедневной разработки используется отдельное приложение `Ведело Dev` с package ID `ru.escalion.vedelo.dev`. Оно устанавливается рядом с обычным `Ведело`, поэтому production-версия и её данные не затрагиваются.

Однократная подготовка после подключения телефона по USB с включённой отладкой:

```bash
cd mobile
npm ci
npm run prebuild:dev
npm run android:dev
```

После установки нативного dev-клиента для обычной работы достаточно одной команды:

```bash
cd mobile
npm run dev:android
```

Команда настраивает USB-подключение к Metro, открывает `Ведело Dev` и включает Fast Refresh. Изменения TypeScript, экранов и стилей появляются на телефоне без APK/EAS-сборки. Повторять `prebuild:dev` и `android:dev` нужно только после изменения нативных модулей, Android-конфигурации, иконки или splash screen.

Android Studio для ежедневных правок не требуется. Она нужна только для работы с Kotlin-модулями, системными разрешениями и нативной отладки Android 1.1.

## Остальные варианты локального запуска

```bash
cd mobile
npm ci
copy .env.example .env
npm run start
```

Expo Go не поддерживает SQLCipher и другие нативные возможности проекта, поэтому для Android используется development build.

Переменные `.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000/api
EXPO_PUBLIC_APP_SCHEME=vedelo
EXPO_PUBLIC_VK_ID_APP_ID=...
```

Production-сборка обязана использовать HTTPS API. Валидатор запрещает localhost, HTTP, резервное копирование Android и опасные разрешения call log/overlay.

## Проверки

```bash
npm run typecheck
npm test
npm run doctor
npm run release:validate
```

`release:validate` читает `.env`, если файл существует. Для локальной проверки production-конфига можно временно передать публичные переменные окружения процесса.

## Нативный проект и сборка

Каталоги `android/` и `ios/` являются генерируемыми и не коммитятся. Конфигурация хранится в `app.json`; это исключает расхождение native-проекта и EAS Build. Мобильный клиент привязан к EAS-проекту `@escalion/vedelo` (`e7d84863-fe06-4058-a9c7-c381e5d3b98a`) с пакетом `ru.escalion.vedelo`; проект `@escalion/artistcrm` (`7772a8bd-…`) обслуживает ранее опубликованное приложение с пакетом `ru.escalion.artistcrm`.

Корневой `.easignore` исключает локальные native/build-каталоги и зависимости из архива монорепозитория; `mobile/.easignore` сохраняет те же правила для автономного checkout приложения. Перед отправкой новой сборки размер архива можно проверить через `eas build:inspect --platform android --stage archive`.

```bash
npm run release:prebuild
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform android --profile production-apk
```

Профиль `production` собирает AAB для Google Play, а `production-apk` — подписанный APK для прямой установки. Оба профиля собирают приложение с пакетом `ru.escalion.vedelo` — это новое приложение с отдельной карточкой в Google Play. Пользовательское имя приложения — «Ведело», основной deep-link scheme — `vedelo://`, а `artistcrm://` принимается для совместимости. Публичные production-переменные задаются в `eas.json`/EAS environment, секреты провайдеров остаются только на сервере.

## Структура

- `app/` — маршруты Expo Router;
- `src/features/` — пользовательские сценарии;
- `src/shared/api/` — API-клиент с единым refresh;
- `src/shared/auth/` — сессия и SecureStore;
- `src/shared/storage/` — SQLCipher и зашифрованные файлы;
- `src/shared/sync/` — pull/push, outbox, конфликты и background sync;
- `src/shared/notifications/` — push, token lifecycle и быстрые действия;
- `maestro/` — device E2E-сценарии;
- `scripts/validate-release.mjs` — release gate конфигурации.

Подробности: `../docs/MOBILE_APP_ARCHITECTURE.md`, `../docs/ANDROID_RELEASE_CHECKLIST.md` и `../docs/ROADMAP.md`.
