# ArtistCRM: план комиксов и промпты для генерации картинок

> Исторический бриф. Актуальные семь комиксов бренда «Ведело», форматы и исходники:
> [VEDELO_COMICS.md](VEDELO_COMICS.md). Новые промпты: [vedelo_comic_prompts.json](vedelo_comic_prompts.json).

Документ подготовлен как бриф для генерации небольших рекламных комиксов по мотивам сценариев роликов из `artistcrm_video_scenarios.docx`.

## Цель

Сделать короткие комиксы, которые быстро объясняют ценность ArtistCRM:

- заявки из разных каналов не теряются;
- клиенту можно ответить из карточки;
- звонок через IP-телефонию превращается в AI-черновик заявки;
- задатки, встречи и подготовка становятся напоминаниями;
- календарь и документы собираются в понятный рабочий поток.

## Рекомендуемый формат

Основной формат: вертикальная карусель из 6 карточек.

- Размер: `1080x1350` для VK/Telegram/соцсетей или `1080x1920` для Stories/Reels.
- Один кадр = одна мысль.
- Текст лучше добавлять поверх готовой картинки отдельным слоем, а не просить генератор вшивать его в изображение.
- Внутри картинки допустимы только короткие UI-надписи: `Заявки`, `Мероприятия`, `VK`, `Avito`, `Сайт`, `Tilda`, `Просрочен задаток`, `Сегодня`.

## Главное правило для экранов телефона

Если в кадре виден экран телефона, лучше не просить ИИ полностью “придумать CRM”. Надежнее использовать один из двух подходов.

### Подход A: референс или оверлей реального скриншота

Это лучший вариант.

1. Сделать реальные мобильные скриншоты ArtistCRM с демо-данными.
2. Дать эти скриншоты генератору как reference image.
3. В промпте требовать: сохранить структуру экрана, цвета, карточки, шапку и общий вид ArtistCRM.
4. Если генератор плохо перерисовывает UI, сгенерировать персонажа с телефоном и пустым экраном, затем вставить настоящий скриншот в экран телефона отдельным слоем.

Нужные референсы:

- `ref-01-events-list-mobile.png`: мобильный список заявок/мероприятий.
- `ref-02-event-card-mobile.png`: карточка мероприятия с клиентом, деньгами, источником и контактными иконками.
- `ref-03-event-view-additional-events.png`: просмотр мероприятия с доп. событиями.
- `ref-04-calendar-month-mobile.png`: календарный режим на месяц.
- `ref-05-contract-docs-mobile.png`: экран с формированием договора/акта.

### Подход B: детальное описание UI без референса

Использовать, если референсы нельзя передать генератору.

Описание экрана ArtistCRM:

```text
The phone screen must look like the real ArtistCRM mobile web app, not a generic CRM.
Mobile web dashboard in Russian. Black top header, small round logo area, page title like "Мероприятия" or "Заявки".
Light app canvas, almost white / #f7f9fa. White rounded cards with subtle border and soft shadow.
Event cards are compact horizontal blocks about 160px high, with a thin vertical status stripe on the left.
Use beige-gold accent #EBD3A5 for important date text and primary accents.
Use colored status chips: red for overdue, amber for today/deposit, blue for active event, green for paid/done.
Inside cards show: event date, event type, service, client name, place, payment numbers, source chip VK / Avito / Сайт / Tilda.
Show small contact icons in a row: phone, WhatsApp, Telegram, VK, chat.
Do not create a futuristic dashboard, charts, neon UI, glassmorphism, or generic SaaS analytics.
Do not invent English labels. Keep UI labels short and Russian.
```

## Общий негативный промпт

Добавлять к каждому промпту:

```text
Avoid: generic CRM dashboard, English interface, random analytics charts, huge desktop monitor UI, futuristic neon interface, fake unreadable Cyrillic text, distorted phone screen, impossible UI layout, extra fingers, warped hands, brand logos except simple messenger icons, watermark.
```

## Комикс 1: для ведущих мероприятий

Главная мысль: ведущий не теряет заявки, задатки, встречи и договоренности, даже когда клиенты пишут из разных каналов и часть деталей обсуждается по телефону.

Тон: быстрый, практичный, с ощущением контроля.

Главный персонаж: ведущий мероприятий 30-40 лет, современный, после мероприятия или между встречами, телефон в руке.

### Кадр 1. Хаос заявок после мероприятия

Задача кадра: показать боль до ArtistCRM.

Текст поверх картинки:

```text
Заявки везде. А задаток опять держать в голове?
```

Промпт:

```text
Create a vertical advertising comic panel for ArtistCRM.
Scene: a Russian event host after a busy evening event, sitting in a car or backstage corridor, holding a smartphone and looking slightly overwhelmed.
Around the phone show subtle floating notification bubbles from different channels: WhatsApp, VK, Avito, website form, phone call. Keep bubbles readable as simple icons or short labels, not full chat text.
Mood: realistic everyday pressure, not panic. Warm indoor/event lighting, modern but grounded.
Style: polished semi-realistic editorial comic, clean linework, soft colors, professional advertising quality.
Composition: vertical 9:16 or 4:5, character in the lower half, phone visible, empty space at top for headline text.
Phone screen: do not show detailed CRM yet; show messy notification stack only.
Text inside image: no long text, no watermark.
```

### Кадр 2. Все заявки попадают в CRM

Задача кадра: показать список заявок с источниками.

Текст поверх картинки:

```text
Все заявки собираются в одном кабинете
```

Промпт:

```text
Create a vertical advertising comic panel for ArtistCRM.
Scene: close-up of a smartphone in the event host's hand. The screen shows the ArtistCRM mobile web app with a list of incoming requests and events.
Use reference image ref-01-events-list-mobile.png if available and preserve its UI structure.
Phone screen must look like ArtistCRM: black top header, title "Заявки" or "Мероприятия", light #f7f9fa background, compact white rounded event cards, thin colored status stripe on the left of each card, beige-gold #EBD3A5 date accents, small status chips.
Show 3-4 cards with source chips: "VK", "Avito", "Сайт", "Tilda". Example short labels: "Корпоратив", "Свадьба", "Юбилей".
Keep UI readable and realistic, like a real mobile screenshot, not a fantasy dashboard.
Style outside phone: semi-realistic editorial comic, hand and phone natural, shallow depth of field.
Text inside image: only short Russian UI labels listed above.
```

### Кадр 3. Ответ клиенту в один тап

Задача кадра: показать карточку и быстрые контакты.

Текст поверх картинки:

```text
Открыл карточку - сразу написал клиенту
```

Промпт:

```text
Create a vertical advertising comic panel for ArtistCRM.
Scene: close-up of a smartphone screen with an ArtistCRM event/client card opened or highlighted.
Use reference image ref-02-event-card-mobile.png if available. Preserve the real UI feel.
Phone screen details: white rounded event card on light background, black top header, event title "Свадьба • Ведущий", date in beige-gold accent, client line "Клиент: Анна", place line, payment numbers on the right, small source chip "VK".
Show a row of contact icons inside the card: phone, WhatsApp, Telegram, VK, chat. One finger is about to tap the Telegram or WhatsApp icon.
The UI should resemble a real mobile web app screen, with compact cards, status chips, and calm spacing.
Style: polished comic realism, natural hand, phone in focus.
Avoid: oversized fake buttons, English UI, random charts.
```

### Кадр 4. Звонок превратился в черновик заявки

Задача кадра: показать вау-момент IP-телефонии и AI.

Текст поверх картинки:

```text
Поговорили по телефону - ИИ собрал заявку
```

Промпт:

```text
Create a vertical advertising comic panel for ArtistCRM.
Scene: split comic composition. Left side: the event host talking on a smartphone or headset, calm and focused. Right side: the same smartphone shows ArtistCRM creating an AI draft after a call.
Phone screen must look like ArtistCRM, not generic AI software: black top header, light app canvas, white rounded card titled "Черновик заявки" or "AI-черновик", short fields in Russian: "Дата", "Формат", "Город", "Сумма", "Следующее действие".
Use small beige-gold accent for the date and blue/green/amber status chips. Keep the UI compact like the real mobile CRM.
Visual metaphor: a subtle arrow from call bubble to CRM card, but no complex infographic.
Style: semi-realistic editorial comic, clean professional advertising art.
Text inside image: short Russian UI labels only.
```

### Кадр 5. Задатки и встречи больше не в голове

Задача кадра: показать доп. события и контроль сроков.

Текст поверх картинки:

```text
CRM держит фокус на важных действиях
```

Промпт:

```text
Create a vertical advertising comic panel for ArtistCRM.
Scene: phone close-up, ArtistCRM event view with additional events / reminders.
Use reference image ref-03-event-view-additional-events.png if available.
Phone screen must show an ArtistCRM-style event details page: black header, light background, white rounded surface cards, compact sections.
Show a section of reminders with short Russian labels: "Получить задаток", "Созвониться", "Уточнить площадку", "Встреча". Add status chips like "Сегодня", "Завтра", "Просрочено" in amber/red/green.
Show quick action chips/buttons: "+1 день", "+3 дня", "Сегодня".
Outside the phone, the host looks relieved and in control.
Style: polished semi-realistic comic, mobile-first product ad.
Avoid: generic todo app, long unreadable text, random calendar app.
```

### Кадр 6. Календарь и договор готовы

Задача кадра: финальный результат: порядок вместо хаоса.

Текст поверх картинки:

```text
Заявки. Задатки. Договоры. Напоминания.
```

Промпт:

```text
Create a vertical final comic panel for ArtistCRM.
Scene: confident event host standing before the next event or near a stage, phone in hand, relaxed posture.
Phone screen shows ArtistCRM in an organized state. Prefer a composite of two small UI moments: calendar month view and document action.
Use reference images ref-04-calendar-month-mobile.png and ref-05-contract-docs-mobile.png if available.
Phone screen details: black header, light background, compact calendar month grid with blue event chips and amber reminder chips; nearby or below, a white rounded card with a button/action "Сформировать договор".
Overall feeling: order, control, professional workflow.
Composition: leave clean space for final CTA text.
Style: polished semi-realistic editorial comic, warm but businesslike.
Avoid: fantasy UI, English labels, unreadable tiny text.
```

## Комикс 2: для артистов

Главная мысль: артист держит под контролем заявки, выступления, гонорары, подготовку и документы, не собирая все вручную из переписок и звонков.

Тон: спокойный контроль перед выступлением, меньше рутины, больше порядка.

Главный персонаж: артист/музыкант перед репетицией или выступлением, телефон в руке.

### Кадр 1. Перед выступлением приходят заявки

Текст поверх картинки:

```text
Клиенты пишут везде. А даты и оплаты - в голове?
```

Промпт:

```text
Create a vertical advertising comic panel for ArtistCRM.
Scene: a Russian solo artist or musician backstage before a performance, holding a smartphone, instruments or stage lights in the background.
Show subtle notification bubbles around the phone from VK, Avito, website, phone call, messenger. The artist looks focused but slightly overloaded.
Style: polished semi-realistic editorial comic, clean professional advertising quality, warm backstage lighting.
Composition: vertical, character and phone visible, empty space for headline.
Phone screen: notification chaos only, no detailed CRM yet.
Avoid long text inside the image.
```

### Кадр 2. Все заявки в одном списке

Текст поверх картинки:

```text
Все заявки и выступления - в одном кабинете
```

Промпт:

```text
Create a vertical advertising comic panel for ArtistCRM.
Scene: close-up of artist's smartphone showing ArtistCRM mobile web app.
Use reference image ref-01-events-list-mobile.png if available and preserve the real UI structure.
Phone screen: black top header with page title "Мероприятия", light #f7f9fa background, white rounded cards with subtle shadow, thin vertical status stripe on left, beige-gold date accents, small colored status chips.
Cards should show artist-relevant events: "Корпоратив • Выступление", "Свадьба • Концерт", "День рождения • DJ set". Add source chips "VK", "Avito", "Сайт", "Tilda".
The UI must look like a real ArtistCRM mobile screenshot, not a generic CRM or analytics dashboard.
Style outside phone: semi-realistic comic, phone in focus, stage/rehearsal background softly blurred.
```

### Кадр 3. Быстрый контакт с клиентом

Текст поверх картинки:

```text
Связаться с клиентом можно сразу из карточки
```

Промпт:

```text
Create a vertical advertising comic panel for ArtistCRM.
Scene: smartphone close-up in the artist's hand. A finger taps a contact icon in an ArtistCRM card.
Use reference image ref-02-event-card-mobile.png if available.
Phone screen details: compact white event card, black header, light background, title "Корпоратив • Выступление", date in beige-gold, client line "Клиент: Максим", place line, payment numbers, source chip "Сайт".
Show contact icons row: phone, WhatsApp, Telegram, VK, chat. The tapped icon can glow subtly.
Keep the UI realistic and mobile-first with the same visual language as ArtistCRM.
Style: clean editorial comic, natural hand anatomy, no exaggerated UI.
```

### Кадр 4. AI-черновик после звонка

Текст поверх картинки:

```text
Звонок разобран. Черновик готов.
```

Промпт:

```text
Create a vertical advertising comic panel for ArtistCRM.
Scene: artist speaking on the phone near a rehearsal room, then a small visual transition to the phone screen with ArtistCRM AI draft.
Phone screen must look like ArtistCRM: black top header, light canvas, white rounded card titled "AI-черновик", short fields "Дата", "Город", "Гонорар", "Формат", "Комментарий".
Include a small status chip "Новая заявка" and a calm confirmation state, not a sci-fi AI interface.
Style: semi-realistic editorial comic, practical and trustworthy.
Avoid: robot characters, neon AI brain graphics, English text.
```

### Кадр 5. Подготовка к выступлению под контролем

Текст поверх картинки:

```text
Предоплата, трек-лист и райдер не теряются
```

Промпт:

```text
Create a vertical advertising comic panel for ArtistCRM.
Scene: phone close-up with ArtistCRM event details and preparation reminders for an artist.
Use reference image ref-03-event-view-additional-events.png if available.
Phone screen: black header, light background, white rounded sections, additional events list with short labels: "Получить предоплату", "Согласовать трек-лист", "Отправить райдер", "Напомнить о времени приезда".
Show colored chips: "Сегодня", "Завтра", "Готово", one amber reminder chip.
Outside phone: artist packing microphone, laptop, costume or instrument case, calm and organized.
Style: polished semi-realistic comic, realistic mobile interface.
Avoid generic checklist app and unreadable text.
```

### Кадр 6. Расписание, документы и порядок

Текст поверх картинки:

```text
Больше порядка. Меньше забытых клиентов.
```

Промпт:

```text
Create a vertical final comic panel for ArtistCRM.
Scene: artist confidently heading to the stage or rehearsal, phone in hand, relaxed expression.
Phone screen shows ArtistCRM calendar month view and document action.
Use references ref-04-calendar-month-mobile.png and ref-05-contract-docs-mobile.png if available.
Phone screen details: black header, light canvas, compact calendar grid with event chips, then a white rounded card/action "Сформировать акт" or "Сформировать договор".
Overall mood: control, less routine, more focus on performance.
Composition: leave top or bottom space for CTA.
Style: polished semi-realistic editorial comic for social media advertising.
Avoid: English UI, fantasy dashboards, random graphs, distorted phone screen.
```

## Универсальный мастер-промпт для серии

Этот текст можно давать генератору перед отдельными кадрами, чтобы сохранить единый стиль:

```text
We are creating a short advertising comic series for ArtistCRM, a Russian mobile-first CRM for solo artists and event hosts.
Visual style: polished semi-realistic editorial comic, professional social media ad, clean linework, soft realistic lighting, grounded Russian event industry context.
Characters must look like real working professionals, not stock models.
Every panel should be vertical and leave clean space for headline text added later.
When a phone screen is visible, it must look like the real ArtistCRM mobile web app:
black top header, light #f7f9fa app background, white rounded cards, subtle borders and shadows, compact mobile layout, thin colored status stripe on event cards, beige-gold #EBD3A5 accents, colored status chips, Russian short labels.
Use reference screenshots of ArtistCRM if available. Preserve UI structure from references.
Do not generate long Russian text inside the image. Use short labels only.
```

## Рекомендации по сборке финального комикса

1. Сначала сгенерировать все кадры без больших надписей.
2. Проверить руки, телефон, читаемость UI и отсутствие выдуманного интерфейса.
3. Если экран телефона важен, заменить экран на реальный скриншот ArtistCRM через оверлей.
4. Добавить заголовки и реплики отдельным слоем: Canva, Figma, Photoshop или HTML-шаблон.
5. Сохранять единую цветовую логику: черный/белый интерфейс, бежево-золотой акцент ArtistCRM, красный/янтарный/синий/зеленый для статусов.
6. Для первой публикации сделать один комикс для ведущих и один для артистов, затем сравнить реакцию аудитории.
