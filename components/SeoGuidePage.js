import Image from 'next/image'
import Link from 'next/link'
import MetrikaLink from '@components/MetrikaLink'
import { normalizedSiteUrl } from '@helpers/seoLandingPages'

const SeoGuidePage = ({ page }) => {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.title,
    description: page.description,
    inLanguage: 'ru-RU',
    mainEntityOfPage: `${normalizedSiteUrl}/${page.slug}`,
    author: { '@type': 'Organization', name: 'Ведело' },
    publisher: { '@type': 'Organization', name: 'Ведело' },
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex cursor-pointer items-center gap-3">
          <Image src="/brand/vedelo-mark.svg" alt="Ведело" width={40} height={40} />
          <span className="font-semibold">Ведело</span>
        </Link>
        <Link href="/login" className="ui-btn ui-btn-primary cursor-pointer">Войти</Link>
      </header>
      <article className="mx-auto max-w-4xl px-6 py-12">
        <Link href="/crm-dlya-fokusnikov" className="text-general text-sm font-semibold">
          CRM для фокусников →
        </Link>
        <h1 className="font-futuraPT mt-5 text-4xl font-semibold text-black sm:text-5xl">
          {page.title}
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-700">{page.intro}</p>
        <div className="mt-10 grid gap-5">
          {page.sections.map(([title, text], index) => (
            <section key={title} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <span className="bg-general/15 text-general flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold">
                  {index + 1}
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-black">{title}</h2>
                  <p className="mt-3 leading-7 text-gray-700">{text}</p>
                </div>
              </div>
            </section>
          ))}
        </div>
        <aside className="mt-12 rounded-2xl bg-[#101214] p-7 text-white">
          <h2 className="font-futuraPT text-2xl font-semibold">
            Проверьте этот процесс на двух реальных заявках
          </h2>
          <p className="mt-3 text-gray-200">
            Первым десяти коллегам-фокусникам — личная настройка и два месяца тарифа «Бизнес» бесплатно.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <MetrikaLink
              href="/crm-dlya-fokusnikov"
              className="ui-btn ui-btn-primary cursor-pointer"
              goalName="content_cta_click"
              goalParams={{ page: page.slug }}
            >
              Посмотреть Ведело
            </MetrikaLink>
            <Link href="/login?mode=register" className="ui-btn ui-btn-secondary cursor-pointer">
              Создать кабинет
            </Link>
          </div>
        </aside>
      </article>
    </main>
  )
}

export default SeoGuidePage
