import Link from 'next/link'

const siteUrl = (process.env.DOMAIN || 'https://vedelo.ru').replace(
  /\/$/,
  ''
)
const pageUrl = `${siteUrl}/terms`
const ogImage = `${siteUrl}/og-image.jpg`

export const metadata = {
  title: 'Пользовательское соглашение — Ведело',
  description: 'Пользовательское соглашение сервиса Ведело.',
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: pageUrl,
    siteName: 'Ведело',
    title: 'Пользовательское соглашение — Ведело',
    description: 'Пользовательское соглашение сервиса Ведело.',
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: 'Ведело — Пользовательское соглашение',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Пользовательское соглашение — Ведело',
    description: 'Пользовательское соглашение сервиса Ведело.',
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
}

const EffectiveDate = '20.01.2026'

export default function TermsPage() {
  return (
    <main className="bg-white">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12 text-sm text-gray-700">
        <div className="flex flex-col gap-2">
          <p className="text-general text-xs font-semibold tracking-[0.2em] uppercase">
            Документы
          </p>
          <h1 className="font-futuraPT text-3xl font-semibold text-black">
            Пользовательское соглашение
          </h1>
          <p className="text-sm text-gray-500">Действует с: {EffectiveDate}</p>
        </div>

        <p>
          Настоящее Пользовательское соглашение (далее — «Соглашение»)
          определяет условия использования сервиса Ведело (далее — «Сервис»)
          и заключено между ИП Белинский Алексей Алексеевич (ИНН 245727560982,
          ОГРНИП 319246800103511), адрес: РФ, Красноярский край, г. Красноярск,
          ул. 4 Продольная 34 (далее — «Исполнитель») и пользователем Сервиса
          (далее — «Пользователь»).
        </p>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">1. Предмет</h2>
          <p>
            1.1. Исполнитель предоставляет Пользователю доступ к CRM и личному
            кабинету для ведения клиентов, заявок и мероприятий.
          </p>
          <p>
            1.2. Сервис может включать интеграцию с Google Calendar по
            инициативе пользователя.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            2. Регистрация и доступ
          </h2>
          <p>
            2.1. Пользователь обязуется предоставлять достоверные данные при
            регистрации.
          </p>
          <p>
            2.2. Пользователь несет ответственность за безопасность своей
            учетной записи.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            3. Тарифы и оплата
          </h2>
          <p>
            3.1. В Сервисе доступны бесплатный тариф и тариф по подписке
            (возможно появление новых тарифов).
          </p>
          <p>
            3.2. Оплата осуществляется через сторонние платежные сервисы
            (планируется подключение ЮKassa).
          </p>
          <p>
            3.3. Возврат возможен пропорционально неиспользованным дням
            подписки.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            4. Использование Сервиса
          </h2>
          <p>
            4.1. Пользователь обязан использовать Сервис законно и
            добросовестно.
          </p>
          <p>
            4.2. Запрещено использовать Сервис для спама и необоснованного
            заполнения базы пустыми данными.
          </p>
          <p>
            4.3. В случае нарушений Исполнитель вправе ограничить доступ или
            заблокировать аккаунт.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            5. Ответственность
          </h2>
          <p>5.1. Сервис предоставляется «как есть».</p>
          <p>
            5.2. Исполнитель не несет ответственности за возможные сбои,
            вызванные внешними сервисами (например, Google Calendar).
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            6. Обработка персональных данных
          </h2>
          <p>
            6.1. Обработка персональных данных осуществляется в соответствии с
            Политикой конфиденциальности, опубликованной на{' '}
            <Link href="/privacy" className="text-general">
              https://vedelo.ru/privacy
            </Link>
            .
          </p>
          <p>
            6.2. Пользователь подтверждает право вносить данные третьих лиц
            (клиентов) в Сервис.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            7. Срок действия и расторжение
          </h2>
          <p>
            7.1. Соглашение действует с момента начала использования Сервиса.
          </p>
          <p>
            7.2. Пользователь может прекратить использование Сервиса в любой
            момент.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            8. Возрастные ограничения
          </h2>
          <p>8.1. Пользователь должен быть старше 18 лет.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">9. Контакты</h2>
          <p>
            9.1. Контакты для вопросов:{' '}
            <a href="mailto:Escalion86@gmail.com" className="text-general">
              Escalion86@gmail.com
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            10. Изменение условий
          </h2>
          <p>
            10.1. Исполнитель вправе изменять Соглашение. Актуальная версия
            публикуется на сайте{' '}
            <Link href="/" className="text-general">
              https://vedelo.ru
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  )
}
