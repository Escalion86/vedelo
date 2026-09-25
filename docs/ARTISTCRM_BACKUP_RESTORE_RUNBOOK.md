# ArtistCRM Backup/Restore Runbook

Дата: 2026-06-07.

Для проверки инструментария без рабочей базы добавлен `tests/server/backupRestore.integration.test.mjs`: временная MongoDB, синтетический архив и восстановление с проверкой данных и индексов. Команды и результат: [локальный отчёт](RELEASE_CHECK_2026-09-10.md). Этот тест не подтверждает наличие и исправность резервной копии production.

Повторный локальный прогон 25.09.2026 прошёл без пропуска: восстановлены шесть синтетических коллекций, совпали документы, BSON-типы, связи и индексы; проверены SHA-256 копии архива и неизменность источника. Архив рабочей базы, внешнее хранилище и расписание копирования не проверены; у владельца запрошен путь к production-архиву и checksum. [Общий статус проверки](ARTISTCRM_RELEASE_SMOKE_RUNBOOK.md#проверка-25092026-1261).

Доступная в окружении `ARTISTCRM_MONGODB_URI` указывает на локальный endpoint базы `artistcrm`; read-only подключение 25.09.2026 завершилось `MongooseServerSelectionError`. Доступ к рабочей базе через эту переменную не подтверждён. Содержимое `.env.local` не читалось.

Цель: иметь понятную процедуру резервного копирования MongoDB и обязательной проверки восстановления перед официальным анонсом ArtistCRM.

## Что нужно настроить до запуска

- Отдельный MongoDB-пользователь для backup с минимально нужными правами на базу `artistcrm`.
- Директория для локальных архивов на сервере, например `/var/backups/artistcrm/mongodb`.
- Внешнее хранилище для копий: S3-compatible bucket, облачный диск или отдельный backup-сервер.
- Retention: минимум 7 ежедневных копий, 4 еженедельные копии, 3 ежемесячные копии.
- Еженедельный restore-check на отдельной тестовой базе, не на production.

## Ручной backup

Выполнять на production-сервере от пользователя, которому разрешен доступ к backup-директории.

```bash
set -euo pipefail

APP_NAME="artistcrm"
DB_NAME="artistcrm"
BACKUP_ROOT="/var/backups/artistcrm/mongodb"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="${BACKUP_ROOT}/${APP_NAME}-${DB_NAME}-${STAMP}.archive.gz"

mkdir -p "${BACKUP_ROOT}"

mongodump \
  --uri="${MONGODB_URI}" \
  --db="${DB_NAME}" \
  --archive="${ARCHIVE}" \
  --gzip

sha256sum "${ARCHIVE}" > "${ARCHIVE}.sha256"
ls -lh "${ARCHIVE}" "${ARCHIVE}.sha256"
```

Важно: `MONGODB_URI` должен быть задан в shell-сессии или подставлен из защищенного env-файла на сервере. Не вставлять секреты в историю команд.

## Проверка архива

```bash
sha256sum -c /var/backups/artistcrm/mongodb/artistcrm-artistcrm-YYYYMMDDTHHMMSSZ.archive.gz.sha256
```

Если checksum не сходится, архив считать непригодным.

## Restore-check на тестовой базе

Восстановление проверять только в отдельную базу, например `artistcrm_restore_check`.

```bash
set -euo pipefail

RESTORE_DB="artistcrm_restore_check"
ARCHIVE="/var/backups/artistcrm/mongodb/artistcrm-artistcrm-YYYYMMDDTHHMMSSZ.archive.gz"

mongosh "${MONGODB_URI}" --eval "db.getSiblingDB('${RESTORE_DB}').dropDatabase()"

mongorestore \
  --uri="${MONGODB_URI}" \
  --nsFrom="artistcrm.*" \
  --nsTo="${RESTORE_DB}.*" \
  --archive="${ARCHIVE}" \
  --gzip
```

## Минимальная проверка восстановленной базы

```bash
mongosh "${MONGODB_URI}" --quiet --eval '
const db = db.getSiblingDB("artistcrm_restore_check");
const collections = ["users", "events", "clients", "transactions", "payments"];
for (const name of collections) {
  print(`${name}: ${db.getCollection(name).countDocuments()}`);
}
printjson(db.events.findOne({}, { projection: { tenantId: 1, eventDate: 1, status: 1 } }));
'
```

Успешный restore-check:

- восстановление завершилось без ошибок;
- ключевые коллекции существуют;
- счетчики не равны нулю для реально используемых коллекций;
- пример документа читается;
- тестовая база после проверки удалена.

Удаление тестовой базы:

```bash
mongosh "${MONGODB_URI}" --eval 'db.getSiblingDB("artistcrm_restore_check").dropDatabase()'
```

## Автоматизация через cron

Пример ежедневного запуска в `02:30` по времени сервера:

```cron
30 2 * * * /opt/artistcrm/scripts/backup-mongodb.sh >> /var/log/artistcrm-backup.log 2>&1
```

Скрипт должен:

- создавать архив через `mongodump --archive --gzip`;
- считать `sha256sum`;
- загружать архив и checksum во внешнее хранилище;
- удалять локальные архивы старше retention-политики;
- писать результат в лог;
- отправлять алерт при ошибке.

## Что логировать

Можно логировать:

- время старта и завершения;
- имя файла архива;
- размер архива;
- checksum;
- статус загрузки во внешнее хранилище;
- статус удаления старых архивов.

Нельзя логировать:

- `MONGODB_URI`;
- пароль MongoDB;
- содержимое документов;
- персональные данные клиентов;
- токены интеграций и платежей.

## Перед официальным анонсом

- [ ] Выполнить ручной backup на production.
- [ ] Проверить checksum.
- [ ] Восстановить архив в `artistcrm_restore_check`.
- [ ] Сверить ключевые коллекции и пример документа.
- [ ] Удалить тестовую базу.
- [ ] Включить ежедневный cron backup.
- [ ] Проверить, что архив реально попал во внешнее хранилище.
- [ ] Назначить ответственного за ежедневную проверку backup-логов в первые 7 дней после анонса.
