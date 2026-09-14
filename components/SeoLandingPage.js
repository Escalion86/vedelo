import Image from 'next/image'
import Link from 'next/link'
import MetrikaLink from '@components/MetrikaLink'
import {
  seoLandingPages,
  seoLandingSlugs,
  normalizedSiteUrl,
} from '@helpers/seoLandingPages'

const productSignals = [
  'заявки',
  'клиенты',
  'оплаты',
  'договоры',
  'напоминания',
]

const registerUrl = '/login?mode=register'

const SeoLandingPage = ({ page }) => {
  const pageUrl = `${normalizedSiteUrl}/${page.slug}`
  const signals = page.signals || productSignals
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Ведело',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: page.title,
      operatingSystem: 'Web',
      inLanguage: 'ru-RU',
      url: pageUrl,
      description: page.description,
      audience: {
        '@type': 'Audience',
        audienceType: page.audience,
      },
      offers: {
        '@type': 'Offer',
        price: 0,
        priceCurrency: 'RUB',
        availability: 'https://schema.org/InStock',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Ведело',
          item: `${normalizedSiteUrl}/`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: page.title,
          item: pageUrl,
        },
      ],
    },
  ]

  const relatedPages = seoLandingSlugs
    .filter((slug) => slug !== page.slug)
    .map((slug) => seoLandingPages[slug])

  return (
    <main className="home-page min-h-screen bg-[#f7f5ef] text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex cursor-pointer items-center gap-3">
          <Image
            src="/brand/vedelo-mark.svg"
            alt="Ведело"
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
            priority
          />
          <span className="text-sm font-semibold text-black">Ведело</span>
        </Link>
        <Link href="/login" className="ui-btn ui-btn-primary cursor-pointer">
          Войти
        </Link>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-6 pt-10 pb-14 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
        <div>
          <p className="text-general text-sm font-semibold tracking-[0.22em] uppercase">
            {page.title}
          </p>
          <h1 className="font-futuraPT mt-4 max-w-3xl text-4xl font-semibold text-black sm:text-5xl">
            {page.h1}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-gray-700 sm:text-lg">
            {page.lead}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {signals.map((item) => (
              <span
                key={item}
                className="border-general/30 rounded-full border bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm"
              >
                {item}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            {page.demoUrl ? (
              <MetrikaLink
                href={page.demoUrl}
                className="ui-btn ui-btn-primary cursor-pointer"
                goalName="pilot_demo_requested"
                goalParams={{ page: page.slug, placement: 'hero' }}
              >
                Написать «CRM» и получить демонстрацию
              </MetrikaLink>
            ) : null}
            <MetrikaLink
              href={registerUrl}
              className="ui-btn ui-btn-primary cursor-pointer"
              goalName="landing_cta_click"
              goalParams={{ page: page.slug, placement: 'hero' }}
            >
              Начать работу
            </MetrikaLink>
            <Link
              href="/#pricing"
              className="ui-btn ui-btn-secondary cursor-pointer"
            >
              Смотреть тарифы
            </Link>
          </div>
        </div>

        <aside className="rounded-2xl border border-white/80 bg-white p-6 shadow-lg">
          <p className="text-sm font-semibold tracking-[0.2em] text-gray-500 uppercase">
            Рабочий контур
          </p>
          <div className="mt-5 grid gap-3">
            {page.scenarios.map((item, index) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
              >
                <span className="bg-general/15 text-general flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      {page.founderStory ? (
        <section className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="grid gap-8 rounded-2xl bg-[#101214] p-6 text-white shadow-xl lg:grid-cols-2 lg:p-10">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-amber-400 uppercase">
                Сделано артистом для артистов
              </p>
              <h2 className="font-futuraPT mt-3 text-3xl font-semibold">
                Опыт из реальных выступлений
              </h2>
              <p className="mt-4 leading-7 text-gray-200">
                {page.founderStory}
              </p>
              <div className="mt-6 rounded-xl border border-amber-400/30 bg-white/5 p-5">
                <p className="font-semibold text-amber-300">Пилот для коллег</p>
                <p className="mt-2 text-sm leading-6 text-gray-200">
                  {page.pilotOffer}
                </p>
              </div>
            </div>
            <Image
              src={page.poster}
              alt="Как Ведело помогает фокуснику вести заявки"
              width={1024}
              height={1536}
              className="mx-auto h-auto w-full max-w-sm rounded-xl"
              sizes="(max-width: 1024px) 90vw, 384px"
            />
          </div>
        </section>
      ) : null}

      {page.gallery ? (
        <section className="mx-auto w-full max-w-6xl px-6 py-12">
          <h2 className="font-futuraPT text-3xl font-semibold text-black">
            Весь путь заявки — на реальных экранах
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-gray-700">
            Листайте: от первого обращения до календаря, задач и закрытой
            оплаты.
          </p>
          <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-4">
            {page.gallery.map((src, index) => (
              <Image
                key={src}
                src={src}
                alt={`Сценарий Ведело для фокусника, шаг ${index + 1}`}
                width={348}
                height={735}
                className="h-auto w-[78vw] max-w-[348px] shrink-0 snap-center rounded-xl shadow-lg"
                sizes="(max-width: 640px) 78vw, 348px"
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="font-futuraPT text-3xl font-semibold text-black">
              Почему это лучше таблиц и чатов
            </h2>
            <p className="mt-4 leading-7 text-gray-700">{page.searchIntent}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {page.features.map((item) => (
              <article
                key={item}
                className="rounded-lg border border-gray-200 bg-white px-4 py-4 shadow-sm"
              >
                <div className="bg-general mb-3 h-1.5 w-10 rounded-full" />
                <h3 className="text-base font-semibold text-gray-900">
                  {item}
                </h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h2 className="font-futuraPT text-3xl font-semibold text-black">
          Частые вопросы
        </h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {page.faq.map((item) => (
            <article
              key={item.question}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-black">
                {item.question}
              </h3>
              <p className="mt-3 text-sm leading-6 text-gray-700">
                {item.answer}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="border-general/25 rounded-2xl border bg-white p-6 shadow-lg">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-futuraPT text-2xl font-semibold text-black">
                Попробуйте Ведело на реальных заявках
              </h2>
              <p className="mt-2 text-sm text-gray-700">
                Начните с клиентов, ближайших заказов и контроля оплат.
              </p>
            </div>
            <MetrikaLink
              href={page.demoUrl || registerUrl}
              className="ui-btn ui-btn-primary cursor-pointer"
              goalName={
                page.demoUrl ? 'pilot_demo_requested' : 'landing_cta_click'
              }
              goalParams={{ page: page.slug, placement: 'final' }}
            >
              {page.demoUrl
                ? 'Написать «CRM» и получить демонстрацию'
                : 'Создать кабинет бесплатно'}
            </MetrikaLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-gray-600 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="text-general font-semibold">
            Ведело
          </Link>
          <nav className="flex flex-wrap gap-4">
            {relatedPages.map((item) => (
              <Link
                key={item.slug}
                href={`/${item.slug}`}
                className="hover:text-general text-gray-700"
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  )
}

export default SeoLandingPage
