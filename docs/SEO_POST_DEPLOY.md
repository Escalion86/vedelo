# Ведело: SEO и аналитика после публикации

Актуально на 2026-09-15.

## 1. Автоматическая проверка

```bash
npm run seo:check -- https://vedelo.ru
```

Локальную production-сборку с canonical нового домена проверять так:

```bash
npm run seo:check -- http://127.0.0.1:3000 https://vedelo.ru
```

## 2. Индексация

После публикации изменённых страниц:

```bash
npm run seo:indexnow
```

- в Google Search Console отправить `https://vedelo.ru/sitemap.xml` и проверить
  главную, обновлённые юридические страницы и новые посадочные;
- в Яндекс Вебмастере повторно обработать sitemap, включить обход по счётчику
  Метрики 112668604 и отправить изменённые URL на переобход;
- после запуска миграционной кампании проверить `301` старых публичных URL на
  соответствующие URL `vedelo.ru` и применить инструменты переезда сайта в
  панелях старого домена.

## 3. Яндекс Метрика

Текущий счётчик: `112668604`. Код загружается приложением после согласия
посетителя; вручную вставлять выданный `<script>` и `noscript` в страницы не
нужно. Вебвизор не включён.

В новом счётчике создать цели типа **JavaScript-событие**:

| Этап | Идентификатор | Параметры |
| --- | --- | --- |
| Клик по CTA | `landing_cta_click` | `page`, `placement`, `tariff` |
| Открытие регистрации | `registration_page_open` | `entry` |
| Начало подтверждения | `registration_start` | `method` |
| Телефон подтверждён | `registration_phone_verified` | `method` |
| Регистрация завершена | `registration_success` | `method` |
| Создана первая заявка/работа | `first_crm_item_created` | `itemType` |

Также перенести или создать цели `first_request_created`,
`first_event_created`, `calendar_connected`, `tariff_page_open`,
`payment_intent`, `transaction_created`, `activation_complete` и цели пилота,
если они всё ещё используются. Старый счётчик 108801563 автоматически не
передаёт цели новому.

Production-проверка в чистом профиле:

1. До выбора в banner запросов к `mc.yandex.ru` нет.
2. «Только обязательные» закрывает banner и не загружает счётчик.
3. «Разрешить аналитику» загружает URL с `id=112668604`.
4. CTA → регистрация → создание первой работы формируют ожидаемые цели.
5. На `/privacy#analytics` выбор можно изменить; отключение перезагружает
   страницу и прекращает новые обращения к счётчику.

## 4. URL для переобхода

```text
https://vedelo.ru/
https://vedelo.ru/privacy
https://vedelo.ru/terms
https://vedelo.ru/personal-data-consent
https://vedelo.ru/payment
https://vedelo.ru/account-deletion
https://vedelo.ru/crm-dlya-fokusnikov
https://vedelo.ru/crm-dlya-artistov
https://vedelo.ru/crm-dlya-vedushchih
https://vedelo.ru/crm-dlya-vyezdnyh-masterov
https://vedelo.ru/crm-dlya-fotografov
https://vedelo.ru/crm-dlya-dekoratorov
https://vedelo.ru/crm-dlya-chastnyh-specialistov
https://vedelo.ru/crm-dlya-muzykantov
https://vedelo.ru/crm-dlya-tilda-zayavok
https://vedelo.ru/crm-s-google-calendar
```

Практические материалы брать из актуального `sitemap.xml`, чтобы список не
расходился с кодом.
