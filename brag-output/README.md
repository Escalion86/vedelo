# Пробный ролик «Ведело» для фокусников

Создан с brag и Hyperframes. Отдельный локальный артефакт; приложение и production-данные не менялись.

## Файлы
- `brag.mp4` — ролик 25 секунд, 1080×1920, 30 fps, музыка и титры, без диктора.
- `brag.jpg` — обложка; также заменяет первый кадр ролика.
- `share-copy.txt` — короткий текст для публикации.
- `brag-plan.md` / `composition-brief.md` — сценарий и производственное задание.
- `composition/index.html` — редактируемая анимация.
- `composition/snapshots/` — кадры проверки.
- `CREDITS.md` — источники материалов и условия музыки.

## Повторный экспорт
Из `brag-output/composition`:
```powershell
npx hyperframes check
npx hyperframes preview --background --port 3017
npx hyperframes render --quality looks --fps 30 --workers 2 --output ../work/render.mp4
```

Node.js 22+, FFmpeg и Chrome. При необходимости пересобрать изображения и runtime: из корня репозитория `node brag-output/prepare-assets.mjs`.

Сцены используют укрупнённые иллюстрации существующих функций. Это не скринкаст. Импорт создаёт черновики для проверки; сканы и фотографии записной книжки не поддерживаются. Доступность функций зависит от тарифа, ИИ оплачивается отдельно. Никакие новые скидки, тарифы или предложения ролик не обещает.
