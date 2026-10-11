# Аудит визуального паритета Android и PWA

Скриншоты изучены родительским агентом. Ниже независимая сверка текущего кода; отсутствие изображений в контексте исполнителя не относится к доступности файлов для родителя.

Самые заметные расхождения подтверждаются текущим кодом: **контакты, шапки страниц, бейдж источника заявки и компоновка карточек**. Во «Важном» различается уже весь способ подачи информации. Нижняя навигация по порядку слотов совпадает.

Прочитал `AGENTS.md`, весь `docs/AI_HANDOFF.md`, `docs/UI_CONVENTIONS.md` и релевантные разделы roadmap. Анализировал текущее дерево, включая незакоммиченные изменения. Ничего не записывал, git не изменял, тесты и сборки не запускал. Отчёт привожу здесь.

Файлы `scaled_22482` и `scaled_22483` в дереве не найдены; сами изображения в сообщении недоступны. Ниже — подтверждённые различия кода, без измерений предполагаемых скриншотов. Веб-размеры указаны в CSS px, Android — в единицах React Native; физические пиксели зависят от плотности экрана и масштаба текста.

**1. Контакты: различается оформление, узнаваемость и доступность прямо на карточке**

Источники: [QuickContacts.tsx:18](/home/aleksei/projects/vedelo/mobile/src/shared/ui/QuickContacts.tsx:18), [QuickContacts.tsx:116](/home/aleksei/projects/vedelo/mobile/src/shared/ui/QuickContacts.tsx:116), [ContactsIconsButtons.js:211](/home/aleksei/projects/vedelo/components/ContactsIconsButtons.js:211), [ContactsIconsButtons.js:323](/home/aleksei/projects/vedelo/components/ContactsIconsButtons.js:323), [globals.css:487](/home/aleksei/projects/vedelo/app/globals.css:487).

- PWA: плитки **32 × 32**, радиус **8**, рамка **1**, расстояние **8**, значки преимущественно **20 × 20**. Фон `#ffffff`, рамка `#dedbd3`, тень `0 1px 3px rgba(23,23,20,0.06)`. В тёмной теме фон `#1c1610`, рамка `rgba(201,168,106,0.32)`.
- Android: прозрачные кнопки **40 × 40**, радиус **8**, без рамки, без заданного промежутка; значки **20**.
- PWA использует брендовые Font Awesome: Viber, Telegram, VK. Android заменяет Viber на `message-outline`, Telegram на `send-outline`, VK на `account-circle-outline`.
- Android красит телефон, Viber, Instagram, VK и почту в `palette.primary`: **`#9a6b27` / `#c9a86a`**. Веб задаёт отдельные цвета.
- У приоритетного канала PWA есть нижняя граница **3 px**, `#9a6b27` / `#c9a86a`. Android добавляет приоритет только в доступную подпись, визуальной отметки нет: [globals.css:666](/home/aleksei/projects/vedelo/app/globals.css:666), [QuickContacts.tsx:82](/home/aleksei/projects/vedelo/mobile/src/shared/ui/QuickContacts.tsx:82).

Точный порядок внешних контактов в обеих реализациях: **телефон → WhatsApp → Viber → Telegram → MAX → Instagram → VK → почта**. Веб дополнительно ставит внутренний чат последним.

Цвета веб-значков определяются текущим Tailwind 4, поэтому старые hex-эквиваленты нельзя считать точными значениями. Определения: [theme.css:14](/home/aleksei/projects/vedelo/node_modules/tailwindcss/theme.css:14).

| Контакт | Точное значение веб-кода |
|---|---|
| Телефон | `green-700`: `oklch(52.7% 0.154 150.069)` |
| WhatsApp | `green-600`: `oklch(62.7% 0.194 149.214)` |
| Viber | `purple-600`: `oklch(55.8% 0.288 302.321)` |
| Telegram, VK | `blue-600`: `oklch(54.6% 0.245 262.881)` |
| Instagram | `yellow-700`: `oklch(55.4% 0.135 66.442)` |
| Почта, пробный WhatsApp/Telegram | `red-400`: `oklch(70.4% 0.191 22.216)` |

MAX в PWA — отдельный залитый значок: высота **20**, радиус **4**, текст **7**, белый; фон подтверждённого `#615cff`, пробного — `red-500`. В Android текст **9**, padding **3**, высота не фиксирована; пробный фон `#f87171`, текст `#1f1b14`: [ContactsIconsButtons.js:138](/home/aleksei/projects/vedelo/components/ContactsIconsButtons.js:138), [QuickContacts.tsx:132](/home/aleksei/projects/vedelo/mobile/src/shared/ui/QuickContacts.tsx:132).

Есть существенная разница видимости:

- карточка работы Android: **1 / 2 / 4** контакта при ширине `<360 / <390 / ≥390`;
- карточка клиента: **1 / 2**;
- остальные спрятаны за многоточием;
- веб такого ограничения не задаёт.

Источники: [MobileEventCard.tsx:94](/home/aleksei/projects/vedelo/mobile/src/features/events/MobileEventCard.tsx:94), [MobileClientCard.tsx:61](/home/aleksei/projects/vedelo/mobile/src/features/clients/MobileClientCard.tsx:61).

**Минимальное исправление Android:** один компактный вариант QuickContacts с веб-рамкой, фоном, брендовыми значками, цветами и нижней отметкой приоритета. Внешний шаг кнопок можно сохранить 40 для нажатия, рисуя внутри плитку 32. Пересмотреть ограничения видимости на карточках.

**Проверка:** клиент со всеми каналами; отдельно только телефон и пробные каналы; приоритет каждого канала; ширины 360/390/420, обе темы. Нажатие контакта не открывает карточку. Подтверждения найденного номера и копирование MAX продолжают работать — **они уже есть в коде**.

**2. Шапки: Android ориентирован на прежний крупный заголовок, текущая PWA устроена иначе**

Источники: [events.tsx:108](/home/aleksei/projects/vedelo/mobile/app/(tabs)/events.tsx:108), [components.tsx:31](/home/aleksei/projects/vedelo/mobile/src/shared/ui/components.tsx:31), [cabinet.js:86](/home/aleksei/projects/vedelo/app/cabinet/[page]/cabinet.js:86), [CabinetHeader.js:19](/home/aleksei/projects/vedelo/layouts/CabinetHeader.js:19).

- Android: **«Мероприятия»**, ниже **«Предстоящие»**; при 390 ширине заголовок **24**, вес **600**, межстрочный интервал **25,2**. Подзаголовок **14/20**, отступ сверху **3**. Счётчик **16**, серый.
- PWA: **«Предстоящие мероприятия»** одной строкой в общей шапке высотой **64**, горизонтальный padding **12**. На телефоне название **16**, вес **600**; счётчик **12**, песочный `var(--ui-primary)`.
- Во «Важном» Android дополнительно показывает «Задачи, оплаты и ближайшие даты»; у текущей веб-страницы такой подписи нет.
- Веб-шапка белая с нижней рамкой `#dedbd3`; тёмная — `#14110d`, рамка `rgba(201,168,106,0.28)`. Android PageHeader самостоятельного фона и рамки не имеет.

**Минимальное исправление Android:** добавить вариант общей шапки для основных разделов; формировать «Предстоящие/Прошедшие + `terms.plural`» через существующий resolver, убрать отдельную строку области списка. Не использовать неактивную `.cabinet-page-heading` как эталон текущей шапки.

**Проверка:** предстоящие, прошедшие, клиенты, важное; терминология мероприятий и заказов; большие счётчики и длинные названия. Один заголовок, без дублирования.

**3. Cigam и общие бейджи: расхождение прямое и локальное**

Источники: [MobileEventCard.tsx:85](/home/aleksei/projects/vedelo/mobile/src/features/events/MobileEventCard.tsx:85), [MobileEventCard.tsx:157](/home/aleksei/projects/vedelo/mobile/src/features/events/MobileEventCard.tsx:157), [EventCard.js:496](/home/aleksei/projects/vedelo/layouts/cards/EventCard.js:496), [globals.css:1943](/home/aleksei/projects/vedelo/app/globals.css:1943).

Android источник заявки рисуется как информационный прямоугольник:

- текст `#0369a1`, фон `#f0f9ff`;
- шрифт **10**, padding **3**, радиус **4**, рамки нет.

PWA использует `StatusChip tone="neutral"`:

- текст **`#374151`**, фон **`#f9fafb`**, рамка **`#d1d5db`**;
- шрифт **12**, вес **600**, line-height **1,1**;
- padding **2 вертикально / 8 горизонтально**, радиус — капсула, рамка **1**.

Тёмный нейтральный бейдж: текст `#cbd5e1`, фон `#1f2937`, рамка `#4b5563`: [globals.css:2186](/home/aleksei/projects/vedelo/app/globals.css:2186).

Название **Cigam не зашито в JSX карточки**: компонент получает рассчитанную подпись источника. Изменять нужно представление любого источника.

Другие подтверждённые отличия:

- «Обязательство»: PWA капсула высотой **20**, текст **11**, padding X **8**; Android прямоугольник с текстом **10**, padding **3**.
- «Заявка» с прошедшей датой: PWA полноценный `StatusChip today`; Android только цветной текст.
- Общий Android StatusChip: padding **5/10**, вес **700**, против веб **2/8**, вес **600**: [components.tsx:199](/home/aleksei/projects/vedelo/mobile/src/shared/ui/components.tsx:199).

**Минимальное исправление Android:** компактный общий StatusChip и его использование вместо локальных `source`, `obligation`, `requestLabel`. Для источника брать **`palette.status.neutral`**, а не `palette.notice.neutral`: у них различается тёмное оформление.

**Проверка:** Cigam и другой источник, обязательство, прошедшая заявка, длинная подпись, обе темы; бейджи не вытесняют сумму.

**4. MobileEventCard: общий каркас похож, но пропорции и акценты различаются**

Источники: [MobileEventCard.tsx:133](/home/aleksei/projects/vedelo/mobile/src/features/events/MobileEventCard.tsx:133), [EventCard.js:370](/home/aleksei/projects/vedelo/layouts/cards/EventCard.js:370), [globals.css:2252](/home/aleksei/projects/vedelo/app/globals.css:2252).

Что уже совпадает: порядок **заголовок → дата/адрес/задача/деньги → клиент/контакты**, ширина даты **58**, промежуток колонок **12**, левый маркер **4**, радиус карточки **8**.

Значимые различия:

- На ширине `<420` веб задаёт высоту **184**, для прошедшей заявки **248**, padding карточки **10,4**. Android имеет `minHeight:184`, padding **0**, paddingLeft **4**, без отдельного размера прошедшей заявки.
- Android задаёт заголовку минимальную высоту **40**, футеру **40**; веб футер имеет минимум **44**, padding сверху **8**. Веб-заголовок имеет padding снизу **8**, без отдельного `minHeight:40`.
- Android дата: день недели **12**, число **22**, месяц **14**, время **12**. Веб при 390: день недели **14**, число **15,2** — его `text-2xl` перекрывает мобильная `.card-title`; месяц **16**, время **13,12**. Это особенность **текущего CSS**, не исторического описания.
- Android месяц принудительно прописными буквами, веб — результат русской локали без такого преобразования.
- Цвет месяца Android `#9a6b27 / #c9a86a`, веб `.text-general` **`#7d6435 / #ebd3a5`**: [eventCard.ts:208](/home/aleksei/projects/vedelo/mobile/src/features/events/eventCard.ts:208), [globals.css:1230](/home/aleksei/projects/vedelo/app/globals.css:1230).
- Адрес Android допускает **две строки**, веб — **одну с обрезкой**.
- Вместо веб-логотипа 2ГИС **16 × 16** внутри кнопки **28 × 28**, Android показывает контурный маркер **18** в области шириной **28**, минимум высоты **40**.
- Деньги Android **13/18**, максимум ширины **34%**; веб денежная колонка минимум **92**, текст при 390 **15,2**.
- Итог закрытой работы в PWA — отдельная капсула минимум **92**, padding **6/12**, рамка **1**. Android показывает просто цветную сумму.

Для положительного итога веб: фон `#dcfce7`, рамка `#86efac`, текст `#166534`; отрицательного: `#fee2e2 / #fca5a5 / #b91c1c`; нулевого: `#ffffff / #cbd5e1 / #374151`. Тёмные варианты также заданы: [globals.css:1136](/home/aleksei/projects/vedelo/app/globals.css:1136).

**Минимальное исправление Android:** править только представление MobileEventCard: внутренние отступы, размеры даты/денег, одну строку адреса, существующий логотип 2ГИС, капсулу итога. При увеличенном системном шрифте сохранять рост карточки, а не жёстко обрезать содержимое.

**Проверка:** обычная/прошедшая заявка, длинный адрес и название, частичная оплата, положительный/нулевой/отрицательный итог, задача и `+N`, дополнительные контакты; 390 и увеличенный текст.

**5. Список клиентов: различаются плотность, порядок имени и детали статусов**

Источники: [MobileClientCard.tsx:38](/home/aleksei/projects/vedelo/mobile/src/features/clients/MobileClientCard.tsx:38), [MobileClientCard.tsx:79](/home/aleksei/projects/vedelo/mobile/src/features/clients/MobileClientCard.tsx:79), [ClientCard.js:109](/home/aleksei/projects/vedelo/layouts/cards/ClientCard.js:109), [ClientsContent.js:79](/home/aleksei/projects/vedelo/layouts/content/ClientsContent.js:79).

- Android карточки размещаются внутри общего padding **16**, между ними gap **8**; padding карточки **12**, высота по содержимому.
- Веб карточки имеют наружный padding X **8**, Y **4**; виртуальная строка **178** в компактной плотности или **190** в обычной.
- Android выводит **фамилия → имя → отчество**, веб по умолчанию **имя → фамилия → отчество**: [clientList.ts:4](/home/aleksei/projects/vedelo/mobile/src/features/clients/clientList.ts:4), [getPersonFullName.js:12](/home/aleksei/projects/vedelo/helpers/getPersonFullName.js:12). В Android карточках работ при этом уже другой, веб-подобный порядок.
- Последний счётчик Android называется текущим `terms.pluralCapitalized`; веб мобильная подпись — **«События»**. Остальные: **«Заявки → Отмены → Выполн. → События»**.
- Отключённые push: веб серый круг **28 × 28**, значок **14**; Android отдельный контурный значок **18**, без круга.
- Статус последней заявки Android берёт из палитры Notice. Веб использует отдельные сочетания `amber/emerald/red/gray`; например «Закрыта» — `bg-gray-100`, Android — фон нейтрального Notice `#f9fafb`.

**Минимальное исправление Android:** согласовать наружную геометрию списка, порядок имени, подписи счётчиков, значок отключённых push и отдельные цвета статуса последней заявки. Контакты исправляются общим пунктом 1.

**Проверка:** одинаковые данные дают одинаковые имя, подписи и порядок счётчиков; 0 и большие значения; длинные ФИО; отключённые push; увеличенный текст без наложений.

**6. «Важное»: отсутствует визуальная структура веб-обзора**

Источники: [AttentionScreen.tsx:92](/home/aleksei/projects/vedelo/mobile/src/features/attention/AttentionScreen.tsx:92), [AttentionScreen.tsx:183](/home/aleksei/projects/vedelo/mobile/src/features/attention/AttentionScreen.tsx:183), [AttentionContent.js:19](/home/aleksei/projects/vedelo/layouts/content/AttentionContent.js:19), [upcomingEventsOverviewFunc.js:608](/home/aleksei/projects/vedelo/layouts/modals/modalsFunc/upcomingEventsOverviewFunc.js:608).

- Android: padding **16**, gap между блоками **16**; группы задач — заголовок **17/700** и список без общей рамки.
- PWA: наружный padding **12**, промежутки обзора **12**; каждый раздел — рамка **1**, радиус **8**, padding **12**, заголовок **14/600**, справа отдельный счётчик.
- У веб-разделов есть левая полоса **3**: просрочено `#dc2626`, сегодня `#d97706`, завтра `#2563eb`, сообщения `#7c3aed`, ближайшие работы — `var(--ui-primary)`. В Android этих полос нет.
- Веб-сводка — капсулы: gap **6**, padding **5/11**, шрифт **12/700**, цветная точка **7**. Android использует обычные secondary-кнопки минимум **48**, без точки, с подписью «Название · N» вместо «N название».
- Порядок сводки веб: **просрочено → сегодня → завтра → сообщения → не закрыто → прошедшие заявки → даты клиентов**. Android: **просрочено → сегодня → завтра → прошедшие заявки → без шага → не закрыто → даты клиентов**.

Источники оформления: [ModalSection.js:11](/home/aleksei/projects/vedelo/components/ModalSection.js:11), [globals.css:4872](/home/aleksei/projects/vedelo/app/globals.css:4872), [upcomingEventsOverviewFunc.js:513](/home/aleksei/projects/vedelo/layouts/modals/modalsFunc/upcomingEventsOverviewFunc.js:513).

**Минимальное исправление Android:** локальные компоненты секции обзора и капсулы сводки, использующие существующие данные. Поставить синхронизацию перед ближайшими работами и датами, как в веб; сейчас Android ставит её в конец. Для отсутствующих сообщений не рисовать фиктивный нулевой раздел.

**Проверка:** все сочетания пустых/заполненных секций; счётчик учитывает только невыполненные задачи; сводка прокручивает к нужному блоку; цвета полос и геометрия совпадают в обеих темах.

**7. Дочерние карточки «Важного» значительно крупнее и менее компактны**

Источники: [TaskCard.tsx:42](/home/aleksei/projects/vedelo/mobile/src/features/attention/TaskCard.tsx:42), [AdditionalEventCard.js:100](/home/aleksei/projects/vedelo/layouts/modals/modalsFunc/AdditionalEventCard.js:100), [PastRequests.js:59](/home/aleksei/projects/vedelo/components/PastRequests.js:59), [RequestsWithoutNextStep.js:117](/home/aleksei/projects/vedelo/components/RequestsWithoutNextStep.js:117).

- Задача Android: название **16/700**, дата **13**, комментарий **14**, несколько крупных кнопок выполнения/редактирования/удаления.
- Веб: круг выполнения **24**, название **14/600**, дата и пояснения **12**, меню **32** справа; редактирование и удаление находятся в меню.
- Выполненная задача Android зачёркнута серым; веб показывает **✓**, зелёное название и зелёный фон карточки, без зачёркивания.
- Прошедшие заявки и заявки без шага Android начинают с типа события, затем имя клиента; PWA — **имя клиента → тип → дата**.
- В Android блок прошедших заявок использует вертикальные кнопки **48**; веб — переносимую горизонтальную группу кнопок **40**, текст **12**, «Открыть заявку» слабее остальных.
- Первичная выдача заявок в веб — **5**, затем ещё **10**; Android — **12**, затем все.
- Значимые даты Android — вертикальная карточка с отдельной кнопкой; веб — целиком нажимаемая строка: сведения слева, дата и срок справа, padding **8/12**.

**Минимальное исправление Android:** компактное представление TaskCard с круглым выполнением и меню; отдельные компактные карточки заявок и дат. Существующие обработчики действий оставить.

**Проверка:** выполнение/отмена выполнения, перенос, редактирование, удаление, loading/error; длинный комментарий; списки больше 12; отсутствие потери доступных действий при уплотнении.

**8. Просмотр клиента: веб имеет собственное оформление, Android использует общие белые карточки**

Источники: [clients/[id]/index.tsx:72](/home/aleksei/projects/vedelo/mobile/app/clients/[id]/index.tsx:72), [clientViewFunc.js:200](/home/aleksei/projects/vedelo/layouts/modals/modalsFunc/clientViewFunc.js:200), [globals.css:2600](/home/aleksei/projects/vedelo/app/globals.css:2600).

- Веб-шапка клиента: радиус **12**, padding **16**, граница `#bfdbfe`, градиент **135° `#eff6ff → #eef2ff`**. Android — обычный Surface, радиус **8**, белый фон, рамка `#dedbd3`.
- Аватар уже одинакового размера **48**. Но веб — рамка `#bfdbfe`, текст `#1d4ed8`; Android — нейтральная рамка и основной текст.
- Тёмный веб-заголовок: **`#1b160f → #221a11`**, рамка `#2b2418`; аватар `#14110d`, рамка `#3b2f1d`, текст `#ebd3a5`.
- Заголовки секций PWA — **12/600, прописные**; Android — **17/700**, обычный регистр.
- Кнопки «Посмотреть/Показать» веб синие: `#2563eb`, фон `#eff6ff`, текст **12**. Android использует нейтральную песочную рамку и текст **14**.
- KPI дохода веб: фон `#f0fdf4`, рамка `#86efac`; Android: `#ecfdf5`, рамка `#a7f3d0`.
- Веб показывает документы непосредственно в секции, Android — кнопку перехода с количеством.

**Минимальное исправление Android:** отдельные стили шапки клиента, заголовков секций, малых действий и KPI. Для документов можно добавить компактное представление существующего списка; управление файлами уже реализовано отдельным экраном.

**Проверка:** обе темы, пустой телефон, длинное имя, реквизиты, документы и значимые даты; кнопки связей продолжают открывать правильные записи.

**9. Нижняя навигация: порядок совпадает, расхождения локальные**

Источники: [MobileBottomBar.tsx:21](/home/aleksei/projects/vedelo/mobile/src/features/navigation/MobileBottomBar.tsx:21), [MobileBottomBar.tsx:105](/home/aleksei/projects/vedelo/mobile/src/features/navigation/MobileBottomBar.tsx:105), [MobileBottomNav.js:119](/home/aleksei/projects/vedelo/components/MobileBottomNav.js:119), [globals.css:4698](/home/aleksei/projects/vedelo/app/globals.css:4698).

Уже совпадают: **Важное → работы → [+] → Клиенты → Меню**, минимум панели **60**, значки **30**, подписи **10**, FAB **50**, подъём **16**.

Различия:

- Android: контурные значки внимания/календаря/группы людей. Веб: заполненные `faExclamationCircle`, `faCalendarCheck`, **один пользователь `faUser`**.
- Бейдж Android минимум **18**, текст **10**, позиция `top:-3/right:-10`; веб **16**, текст **9,5**, `top:-5/left:calc(50% + 2px)`.
- В тёмной теме плюс Android фактически получает **`#1f1b14`** через `palette.onPrimary`; веб плюс **белый** на `#c9a86a`.
- Android не задаёт тени панели/FAB; веб — `0 -6px 18px rgba(0,0,0,.18)` и `0 8px 20px rgba(0,0,0,.3)`.
- Подменю работ Android занимает почти всю ширину, как общее меню; веб — **224** шириной, позиция слева **56**, радиус **12**: [MobileBottomNav.js:95](/home/aleksei/projects/vedelo/components/MobileBottomNav.js:95).

**Минимальное исправление Android:** заменить силуэты, поправить бейдж и цвет плюса, добавить тени; отдельная геометрия короткого подменю работ.

**Проверка:** активные состояния, обе темы, 1/99/100 задач, системные отступы, закрытие по Android Back и нажатию снаружи. Порядок вкладок менять не требуется.

**10. Общие примитивы: основные цвета близки, но форма и типографика ещё расходятся**

Источники: [components.tsx:173](/home/aleksei/projects/vedelo/mobile/src/shared/ui/components.tsx:173), [CompactField.tsx:41](/home/aleksei/projects/vedelo/mobile/src/shared/ui/CompactField.tsx:41), [AppButton.js:4](/home/aleksei/projects/vedelo/components/AppButton.js:4), [InputWrapper.js:84](/home/aleksei/projects/vedelo/components/InputWrapper.js:84).

| Примитив | Android | Текущая PWA |
|---|---|---|
| Текстовая кнопка | минимум 48, радиус 12, текст 15/700 | капсула; `sm` 12, `md` 14; вес 600 |
| Удаление | светлая красная плашка: `#fef2f2`, текст `#b91c1c` | залитая `#AA0000`, белый текст |
| Обычное поле `Field` | минимум 48, рамка 1, радиус 12 | `InputWrapper`: минимум 40, рамка 2, радиус 4 |
| Подпись поля | основной цвет `#1c1d1f / #e2e8f0` | `#8a6d3b / #d4b886` |
| Notice | иконка 20 всегда, стандартный тон `info` | автоматической иконки нет, стандартный тон `neutral` |
| Общая секционная карточка | радиус 8, padding 16 | `SurfaceCard`: радиус 12, padding 12 |

Семантические цвета Notice уже в основном совпадают; нет основания заново перекрашивать всю тему.

В тёмной теме Surface Android берёт только первый цвет `rgba(24,19,13,.96)`, хотя палитра хранит оба цвета; веб действительно рисует градиент **145°** до `rgba(30,23,14,.94)`: [theme.ts:112](/home/aleksei/projects/vedelo/mobile/src/shared/ui/theme.ts:112), [globals.css:153](/home/aleksei/projects/vedelo/app/globals.css:153).

Ещё одно общее отличие: веб задаёт **Inter Tight**, Android не загружает этот шрифт и не задаёт `fontFamily`, используя системный. Источники: [globals.css:69](/home/aleksei/projects/vedelo/app/globals.css:69), [_layout.tsx:110](/home/aleksei/projects/vedelo/mobile/app/_layout.tsx:110). TTF Inter Tight уже находятся в репозитории; создавать новые бинарные ассеты не нужно.

**Минимальное исправление Android:** варианты размеров кнопок и карточек, согласованные подписи полей, необязательная иконка Notice, отдельный вариант удаления, подключение существующего Inter Tight. Изменять только применяемые примитивы и проверенные экраны.

**Проверка:** поля с фокусом/ошибкой, кнопки disabled/loading, длинные подписи, обе темы и увеличенный текст. Изменение общего компонента не должно обрезать остальные Android-формы.

**Функциональные пробелы — отдельно от оформления**

Для них размеры и цвета не решают проблему; ниже указан минимальный путь и критерий результата.

1. **Непрочитанные сообщения во «Важном», быстрый внутренний чат и Telegram Business.**  
   Веб имеет блок сообщений и чат с бейджем на карточках: [upcomingEventsOverviewFunc.js:820](/home/aleksei/projects/vedelo/layouts/modals/modalsFunc/upcomingEventsOverviewFunc.js:820), [ClientChatButton.js:30](/home/aleksei/projects/vedelo/components/ClientChatButton.js:30). В AttentionScreen и QuickContacts этого **нет в коде**. Android-переписки Avito/VK уже есть; Telegram Business прямо обозначен недоступным: [ConversationsList.tsx:14](/home/aleksei/projects/vedelo/mobile/src/features/conversations/ConversationsList.tsx:14), [ConversationsList.tsx:59](/home/aleksei/projects/vedelo/mobile/src/features/conversations/ConversationsList.tsx:59).  
   Минимум: Android-сводка сообщений и переход в существующие Avito/VK-диалоги; Telegram — отдельный функциональный блок. Проверка: реальный unread, открытие нужного клиента, обновление после прочтения, ошибка загрузки. Возможность полного исправления только Android без расширения API этой сверкой не подтверждена.

2. **Отзывы и коммерческие предложения на карточках.**  
   Веб справа показывает **КП → отзыв → обязательство → источник → сумма**: [EventCard.js:496](/home/aleksei/projects/vedelo/layouts/cards/EventCard.js:496). Android начинает с обязательства; компонентов/запросов статусов КП и отзывов **нет в коде**. В просмотре клиента веб имеет отзывы: [clientViewFunc.js:357](/home/aleksei/projects/vedelo/layouts/modals/modalsFunc/clientViewFunc.js:357). Android-пункт отзывов — заглушка: [menu.ts:13](/home/aleksei/projects/vedelo/mobile/src/features/navigation/menu.ts:13), [[section].tsx:34](/home/aleksei/projects/vedelo/mobile/app/more/[section].tsx:34).  
   Минимум: отдельный перенос данных и нативных сценариев, затем бейджи. Проверка: отправлено/принято КП, рейтинг/непрочитанный отзыв, тарифные ограничения. Подмена декоративными бейджами паритета не даст.

3. **Обучение, учебный пример и новости в шапке.**  
   Веб «Важное» добавляет FirstRequestPrompt, непрочитанные отзывы и LearningTip: [AttentionContent.js:21](/home/aleksei/projects/vedelo/layouts/content/AttentionContent.js:21). Android-приглашение создать первую заявку уже есть, но учебного примера и совета **нет в коде**, обучение — заглушка: [AttentionScreen.tsx:106](/home/aleksei/projects/vedelo/mobile/src/features/attention/AttentionScreen.tsx:106), [menu.ts:32](/home/aleksei/projects/vedelo/mobile/src/features/navigation/menu.ts:32). Нативного колокольчика/архива новостей **нет в коде**; веб-реализация: [CabinetHeader.js:57](/home/aleksei/projects/vedelo/layouts/CabinetHeader.js:57).  
   Минимум: отдельные Android-сценарии с персональным прогрессом и отметками прочтения. Проверка: новый/существующий аккаунт, сохранность прогресса и прочтения. Не включать фиктивные кнопки в косметическую шапку.

4. **Меню и свайпы карточки работы неполны.**  
   Веб карточка имеет свайпы редактирования/удаления и пункты задач, истории, копирования, статуса, удаления, финансов: [EventCard.js:327](/home/aleksei/projects/vedelo/layouts/cards/EventCard.js:327), [CardButtons.js:398](/home/aleksei/projects/vedelo/components/CardButtons.js:398). У MobileEventCard свайпов **нет в коде**, меню содержит открыть/редактировать/документы/оплату/клиента/синхронизацию: [MobileEventCard.tsx:107](/home/aleksei/projects/vedelo/mobile/src/features/events/MobileEventCard.tsx:107). История и копирование уже доступны из просмотра работы: [EventDetailActions.tsx:27](/home/aleksei/projects/vedelo/mobile/src/features/events/EventDetailActions.tsx:27).  
   Минимум: добавить недостающие входы в уже существующие Android-маршруты; удаление — через существующую локальную мутацию с подтверждением. Проверка: одинаковые доступные действия по статусам, свайп не мешает прокрутке и контактам. Это пробел входов с карточки, а не отсутствие всей истории/копирования.

5. **В дополнительных контактах карточки теряется переданный коллега.**  
   Веб добавляет `colleagueId` первым с подписью «Передано: …», затем уникальные дополнительные контакты, исключая основного клиента: [eventTransferDisplay.js:34](/home/aleksei/projects/vedelo/helpers/eventTransferDisplay.js:34). Android берёт только `otherContacts`, без такого объединения: [MobileEventCard.tsx:33](/home/aleksei/projects/vedelo/mobile/src/features/events/MobileEventCard.tsx:33).  
   Минимум только Android: аналогичная функция представления. Проверка: коллега отсутствует/совпадает с клиентом/повторяется в контактах; правильные количество и порядок.

6. **«Назначить контакт» открывает общий раздел, а не подготовленную задачу.**  
   Веб сразу предлагает «Связаться с клиентом», завтра в **11:00**, требует назначенного срока: [RequestsWithoutNextStep.js:45](/home/aleksei/projects/vedelo/components/RequestsWithoutNextStep.js:45). Android открывает `section:contacts`; новая задача добавляется отдельно с пустыми названием и датой: [AttentionScreen.tsx:140](/home/aleksei/projects/vedelo/mobile/src/features/attention/AttentionScreen.tsx:140), [EventContactsSection.tsx:197](/home/aleksei/projects/vedelo/mobile/src/features/events/EventContactsSection.tsx:197).  
   Минимум только Android: специальный вход в редактор подготовленной задачи, сохранение через текущий outbox. Проверка: один контакт, обязательные название/срок, отмена без записи, возврат в обновлённый обзор.

7. **Выполненная задача показывает прежний срок вместо времени выполнения.**  
   Android всегда выводит `task.date`: [TaskCard.tsx:44](/home/aleksei/projects/vedelo/mobile/src/features/attention/TaskCard.tsx:44). Веб — «Выполнено: `doneAt ?? date`»: [upcomingEventsOverviewFunc.js:699](/home/aleksei/projects/vedelo/layouts/modals/modalsFunc/upcomingEventsOverviewFunc.js:699).  
   Минимум только Android: исправить проекцию даты. Проверка: задача со вчерашним сроком, выполненная сегодня; отображается время выполнения, отмена возвращает срок.

8. **Выборка «на 3 дня» отличается по смыслу.**  
   Android включает продолжающиеся многодневные работы, начавшиеся раньше, и исключает закрытые: [selectors.ts:85](/home/aleksei/projects/vedelo/mobile/src/features/attention/selectors.ts:85). Веб-функция отбирает начало в трёхдневном интервале и явно исключает только отменённые: [additionalEvents.js:153](/home/aleksei/projects/vedelo/helpers/additionalEvents.js:153).  
   Минимум только Android для строгого паритета: повторить правило веб-функции. Проверка: начало вчера/сегодня/на третий/четвёртый день, закрытые и отменённые. Это изменение бизнес-представления; не смешивать с CSS-подобными правками.

9. **Транзакция из draft в Android требует ручной смены статуса.**  
   Android разрешает действие только для `active`: [eventDetail.ts:26](/home/aleksei/projects/vedelo/mobile/src/features/events/eventDetail.ts:26). Веб предлагает подтверждение перевода заявки в «Подтверждено», валидирует и сохраняет перед транзакцией: [eventFunc.js:1571](/home/aleksei/projects/vedelo/layouts/modals/modalsFunc/eventFunc.js:1571).  
   Минимум: отдельный Android-процесс подтверждения, валидации, сохранения и перехода. Проверка: отказ, неполные обязательные поля, успешный переход и отсутствие повторной записи. В двух визуальных этапах это не требуется.

10. **Звонок через Novofon из контакта отсутствует.**  
    Веб при доступном тарифе и включённой телефонии предлагает обычный звонок/Novofon, включая Android intent на `ru.novofon.mobile`: [NovofonCallButton.js:25](/home/aleksei/projects/vedelo/components/NovofonCallButton.js:25), [NovofonCallButton.js:59](/home/aleksei/projects/vedelo/components/NovofonCallButton.js:59). QuickContacts открывает только `tel:`; такого выбора **нет в коде**.  
    Минимум: Android-меню способа звонка с проверкой доступности. Проверка: телефония включена/выключена, тариф, установленный/отсутствующий Novofon, обычный звонок.

Дополнительно обнаружено расхождение финансовой сводки клиента: Android исключает `paymentMethod === 'obligation'`, веб суммирует доходы/расходы без такого исключения — [clients/[id]/index.tsx:58](/home/aleksei/projects/vedelo/mobile/app/clients/[id]/index.tsx:58), [clientViewFunc.js:123](/home/aleksei/projects/vedelo/layouts/modals/modalsFunc/clientViewFunc.js:123). Это **различие расчёта**, не визуальный дефект; исправлять его попутно ради одинаковых цифр не следует.

**Предлагаемые два ограниченных этапа**

| Этап | Объём | Граница |
|---|---|---|
| **1. Контакты + карточки + шапки + бейджи** | Пункты 1–5: общий компактный QuickContacts, одноуровневые заголовки, нейтральный источник, компактные бейджи, геометрия MobileEventCard/MobileClientCard, порядок имени. Inter Tight — в затронутых примитивах. | Только Android-представление существующих данных. Без переноса сообщений, отзывов, КП, новостей и изменения финансовых расчётов. |
| **2. «Важное» + очевидные общие различия** | Пункты 6–10: секции/сводка обзора, компактные задачи/заявки/даты, просмотр клиента, локальные отличия нижней панели, размеры кнопок/полей/Surface/Notice. | Без полного переноса всех Android-разделов. Из функциональных исправлений ограничиться локальными проекциями: коллега в контактах и дата выполнения задачи. Остальные пробелы — отдельные задачи. |

Критерий приёмки обоих этапов: одинаковые данные и состояние, PWA и Android рядом на **390** и контрольных **360/420**, обе темы, обычный и увеличенный текст. Для каждого затронутого элемента — реальное нажатие, возврат, loading/error и сохранение; для Android также Back, офлайн и очередь синхронизации. Скриншотами подтверждать вид, действиями — сохранность сценариев. Сейчас это анализ исходников; проверка установленного APK не выполнена.