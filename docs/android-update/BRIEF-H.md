# H — серверные медиа: контейнеры и анимированный GIF
Прочитай /home/aleksei/reports/vedelo/2026-10-11/update/review-server-final-1.json целиком. Закрыть только SEC-03-R1 и LOG-03, плюс очевидную non-blocking опечатку demo secondName вместо lastName только если не требует соседних изменений.

## Владение
server/validatedUploadFiles.js, новый узкий server-модуль парсера при необходимости, tests/android-proposals/*stageH* (собственные реальные binary fixtures/helpers допустимы), существующий upload.stageF.test.cjs только для легитимной адаптации fixtures без снятия assertions; docs/android-update/REPORT-H.md. Условно app/api/proposal-templates/[id]/preview/route.js только demo secondName. Не трогать route uploads/auth/destinations — их final-review подтвердил.

## Исправления и доказательства
- SEC-03-R1: настоящая проверка внутренней структуры bounded MP4/WebM, описанного видеопотока и валидных обязательных master/track/block секций до upstream. Поверхностных ftyp+moov+mdat и DocType+Info/Tracks/Cluster недостаточно. Проверять bounds/бюджеты без неконтролируемой рекурсии/аллокаций. Не декодировать кодеки. Учитывать настоящие MP4 (включая валидный free padding и фрагментированные контейнеры) и WebM с допустимыми unknown-size masters. Не подключать ffprobe как обязательную production dependency и не запрещать видео целиком ради безопасности. Сохранять согласованный web лимит50MiB и native лимиты, safe extensions/names, upstream только после проверки.
- LOG-03: sharp animated:true metadata.height уже суммарная. Убрать повторный pages multiplier, не увеличивать бюджет40M. Положительный настоящий GIF128x128x50frames должен проходить decode/re-encode; GIF выше фактического бюджета — отклоняться.
- Reviewer evidence: /home/aleksei/.hermes/cache/scratch/vedelo-review-server-final-1/{invalid-containers.cjs,results.json}. Закрепить настоящие damaged-moov/Tracks/Cluster/no-video-track examples в regression tests; отсутствие upstream при reject, actual GIF accepted, старые HTML=imagePNG rejected. Положительные fixtures делать настоящим ffmpeg в тестовой среде или переносом уже воспроизводимых fixture bytes, но production helper не должен запускать программы.
- Адресный F/B/C/E Node набор из F/orchestrator-verification.json command orchestrator-node-01, новые H cases, ESLint product. Полные browser/Jest/build не запускать. Повторы отдельно, не суммировать.

## Общие границы и приёмка
Это второй и последний исправляющий цикл, НЕ новый общий аудит и НЕ рефакторинг. База —35f9a64c29c0b8c078a0b54149a1949069a868ed + merged-FG-snapshot.json (182 пути), применённый в этой отдельной копии и проверенный координатором. Исходный JSON отрицательного ревью по этому срезу обязателен к чтению. Самоотчёты старых исполнителей не доказательство.

НЕ делать commit/push/checkout/reset/stash, deploy/EAS, не менять версии/deps/lock/packageID/buildconfig, wire DTO/schema/migrations/offline protocol, чужие scopes/канонический репо/соседние worktree/профили/production. Не читать .env/credentials/токены, node_modules/generated bundle/мегабайтные logs целиком. node_modules symlinks строго read-only. Не допускать runtime зависимости ffprobe/ffmpeg без установленного/согласованного server contract. Никаких реальных аккаунтов/облака/ИИ/Telegram. Сам продуктовый код пишет отдельный Codex CLI gpt-6.1-sol, не управляющий Hermes-субагент.

Загрузить codex, staged-cli-agent-delegation, test-driven-development. CLI отсоединённым user-unit с явными PATH/TMPDIR. workspace-write только repo и свой reports/scratch, exclude_slash_tmp=true. Сверить writable roots/model/start по журналу. При обрыве resume той же сессии. Очередь одна: /home/aleksei/reports/vedelo/2026-10-11/update/test-queue.lock; открывать read-only, start только внутри lock. Существующая общая приёмка базового F/G работает независимо: не прекращать её/не менять объединённый корень, не повторять её дорогой полный набор в своей копии.

Сначала сохранить полный начальный source SHA, затем настоящие regression tests с семантическим RED всех своих IDs на этой базе. Нельзя подменять исправляемую логику/делать искусственно отсутствующие экспорты. Reviewer scratch probes использовать как сценарии, перенести их в постоянные воспроизводимые tests без зависимости от scratch. При очереди заморозить RED и действительно дождаться его до правок. Каждый повтор — уникальные неизменяемые logs/JSON; реальные exit/counts и before/after hashes. Исправление минимальное, затем поведенческий GREEN + адресные соседние проверки/types/ESLint. Не заканчивать с queued/pending или по одному написанному runner.

docs/android-update/REPORT-H.md и reports/H/result.json: resolved/unresolved IDs, полный собственный delta поверх merged-FG (не HEAD), fileCount/unique paths/SHA проверенного финального среза, реальный список commands+exit+counts, независимая повторная приёмка управляющим субагентом, protected hashes, limitations. Сверить множества diff+untracked, baseline отнести отдельно. Прочесть полный собственный diff, удалённые правила тоже. Любой необходимый выход за узкое разрешение — сначала остановить и вернуть конкретный blocker координатору, не расширять самовольно.

## Пути
Рабочая копия: /home/aleksei/projects/vedelo-android-server-fixes2-20261011
Отчёты: /home/aleksei/reports/vedelo/2026-10-11/update/H
Scratch: /home/aleksei/.hermes/cache/scratch/vedelo-android-H
