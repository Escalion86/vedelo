import Link from 'next/link'
import Image from 'next/image'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import CallOutlinedIcon from '@mui/icons-material/CallOutlined'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import FilterAltRoundedIcon from '@mui/icons-material/FilterAltRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded'
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded'
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded'
import PriorityHighRoundedIcon from '@mui/icons-material/PriorityHighRounded'
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded'
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded'
import WalletOutlinedIcon from '@mui/icons-material/WalletOutlined'
import MetrikaLink from '@components/MetrikaLink'
import dbConnect from '@server/dbConnect'
import Tariffs from '@models/Tariffs'
import { getServerSession } from 'next-auth'
import authOptions from './api/auth/[...nextauth]/_options'
import { redirect } from 'next/navigation'
import { BRAND, getCanonicalBaseUrl } from '@helpers/brand.mjs'
import { getVisibleTariffFeatureRows } from '@helpers/publicTariffFeatures.mjs'

const normalizedSiteUrl = getCanonicalBaseUrl(process.env.DOMAIN)
const homeUrl = `${normalizedSiteUrl}/`
const ogImageUrl = `${normalizedSiteUrl}/opengraph-image`
const registerUrl = '/login?mode=register'
const tariffRegisterUrl =
  '/login?mode=register&callbackUrl=%2Fcabinet%2Ftariff-select'

export const metadata = {
  title: 'Ведело — CRM для малого бизнеса и частных специалистов',
  description:
    'Ведело: заявки, заказы, клиенты, финансы, календарь и документы в одном кабинете.',
  keywords: [
    'crm для артистов',
    'crm для ведущих',
    'crm для музыкантов',
    'crm для выездных мастеров',
    'crm для частных специалистов',
    'учет заявок',
    'google календарь для мероприятий',
    'учет клиентов и оплат',
  ],
  alternates: { canonical: homeUrl },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: homeUrl,
    siteName: BRAND.name,
    title: 'Ведело — CRM для малого бизнеса',
    description:
      'Соберите заявки, клиентов, финансы и документы в одном месте. Контроль сроков и синхронизация с Google Календарем.',
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: 'Ведело — CRM для малого бизнеса',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ведело — CRM для частных специалистов',
    description:
      'Управляйте заявками, заказами, оплатами и документами из одного кабинета.',
    images: [ogImageUrl],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
}

export const dynamic = 'force-dynamic'

const formatPrice = (price) => {
  if (!price || Number(price) === 0) return '0 ₽'
  return `${Number(price).toLocaleString('ru-RU')} ₽/мес`
}

const formatEventsLimit = (limit) => {
  if (!Number.isFinite(limit) || Number(limit) === 0) {
    return 'Без ограничений по заказам'
  }
  return `До ${limit} заказов в месяц`
}

const faqItems = [
  {
    question: 'Подойдёт ли Ведело, если заказов немного?',
    answer:
      'Да. На бесплатном тарифе можно вести заявки, клиентов и оплаты без оплаты сервиса. Актуальный лимит заказов указан в таблице тарифов.',
  },
  {
    question: 'Нужно ли устанавливать программу?',
    answer:
      'Не обязательно. Ведело работает в браузере, а при желании его можно установить как PWA-приложение на телефон или компьютер. Данные синхронизируются через облако.',
  },
  {
    question: 'Можно ли начать бесплатно?',
    answer:
      'Да. Создайте кабинет и проверьте основные возможности на реальных заявках без оплаты.',
  },
  {
    question: 'Есть ли синхронизация с Google Календарём?',
    answer:
      'Да. Доступность синхронизации заказов и напоминаний с Google Календарём указана в актуальной таблице тарифов.',
  },
]

const benefits = [
  {
    title: 'Не теряйте заявки',
    text: 'Все обращения собираются в одном рабочем потоке.',
  },
  {
    title: 'Не забывайте клиентов',
    text: 'История общения и задачи помогают держать связь вовремя.',
  },
  {
    title: 'Контролируйте оплаты',
    text: 'Видите статусы оплат и остатки по каждому заказу.',
  },
  {
    title: 'Держите сроки',
    text: 'Планируйте день и получайте напоминания о важном.',
  },
]

const steps = [
  ['Заявка', 'Сохраняете обращение и источник'],
  ['Контакт', 'Планируете звонок или встречу'],
  ['Оплата', 'Отмечаете задаток и остаток'],
  ['Выполненный заказ', 'Проводите работу и закрываете заказ'],
]

const audiencePages = [
  {
    href: '/crm-dlya-artistov',
    title: 'Артист',
    text: 'Выступления, клиенты, договорённости, документы и оплаты.',
  },
  {
    href: '/crm-dlya-fokusnikov',
    title: 'Фокусник или иллюзионист',
    text: 'Заявки на выступления, свободные даты, задатки и перезвоны.',
  },
  {
    href: '/crm-dlya-vedushchih',
    title: 'Ведущий мероприятий',
    text: 'Свадьбы, корпоративы, программа, площадки и оплаты.',
  },
  {
    href: '/crm-dlya-muzykantov',
    title: 'Музыкант или музыкальный проект',
    text: 'Календарь выступлений, гонорары и организационные задачи.',
  },
  {
    href: '/crm-dlya-fotografov',
    title: 'Фотограф или видеограф',
    text: 'Съёмки, клиенты, этапы оплаты и сроки готовности материалов.',
  },
  {
    href: '/crm-dlya-dekoratorov',
    title: 'Декоратор или оформитель',
    text: 'Проекты, сметы, предоплаты и контроль ключевых дат.',
  },
  {
    href: '/crm-dlya-vyezdnyh-masterov',
    title: 'Мастер по ремонту или выездным услугам',
    text: 'Заявки, адреса, замеры, выезды, материалы и этапы заказов.',
  },
  {
    href: '/crm-dlya-chastnyh-specialistov',
    title: 'Другой частный специалист',
    text: 'Универсальный рабочий контур для услуг и проектной работы.',
  },
]

const tariffFeatureRows = [
  { label: 'Работа с заявками и заказами', included: true },
  { label: 'Клиентская база', included: true },
  { label: 'Учёт оплат и расходов', included: true },
  { label: 'Заказов в месяц', type: 'eventsLimit' },
  { label: 'Синхронизация с Google Календарём', key: 'allowCalendarSync' },
  { label: 'Статистика и аналитика', key: 'allowStatistics' },
  { label: 'Договоры, акты и документы', key: 'allowDocuments' },
  { label: 'Коммерческие предложения', key: 'allowProposals' },
  { label: 'IP-телефония', key: 'allowTelephony' },
  { label: 'ИИ-возможности', key: 'allowAi' },
  { label: 'Интеграция с Avito', key: 'allowAvitoIntegration' },
  { label: 'Интеграция с VK', key: 'allowVkIntegration' },
  { label: 'Подключение сайта по API', key: 'allowPublicLeadApi' },
]

function ArrowIcon() {
  return <ArrowForwardRoundedIcon aria-hidden="true" />
}

function CheckIcon() {
  return <CheckRoundedIcon aria-hidden="true" />
}

const productPreviewOrders = [
  {
    weekday: 'ПН',
    day: '21',
    month: 'сент',
    time: '11:00',
    title: 'Контент-съёмка • Каталог',
    address: 'Студия «Свет»',
    taskDate: 'Сегодня 16:00',
    task: 'Подтвердить детали',
    paid: '25 000',
    total: '50 000',
    client: 'Анна Смирнова',
    tone: 'active',
  },
  {
    weekday: 'СБ',
    day: '26',
    month: 'сент',
    time: '15:30',
    title: 'Семейная съёмка • Фотосессия',
    address: 'Парк Центральный',
    taskDate: 'Завтра 10:00',
    task: 'Получить предоплату',
    paid: '0',
    total: '18 000',
    client: 'Сергей Климов',
    tone: 'draft',
  },
  {
    weekday: 'ВС',
    day: '04',
    month: 'окт',
    time: '18:00',
    title: 'Репортаж • Корпоратив',
    address: 'Отель «Енисей»',
    taskDate: '28 сент',
    task: 'Согласовать тайминг',
    paid: '30 000',
    total: '60 000',
    client: 'Мария Орлова',
    tone: 'active',
  },
]

function ProductPreviewOrder({ order }) {
  return (
    <article className={`landing-order-card is-${order.tone}`}>
      <span className="landing-order-marker" />
      <div className="landing-order-head">
        <strong>{order.title}</strong>
        <MoreHorizRoundedIcon aria-hidden="true" />
      </div>
      <div className="landing-order-body">
        <div className="landing-order-date">
          <span>
            {order.weekday} <strong>{order.day}</strong>
          </span>
          <b>{order.month}</b>
          <small>{order.time}</small>
        </div>
        <div className="landing-order-details">
          <span>{order.address}</span>
          <div className={`landing-order-task is-${order.tone}`}>
            <b>{order.taskDate}</b>
            <span>{order.task}</span>
          </div>
        </div>
        <div className="landing-order-money">
          {order.paid !== '0' ? <b>{order.paid}</b> : null}
          <span>
            {order.paid !== '0' ? ' / ' : ''}
            {order.total} ₽
          </span>
        </div>
      </div>
      <div className="landing-order-client">
        <span>{order.client}</span>
        <div>
          <i>
            <CallOutlinedIcon aria-hidden="true" />
          </i>
          <i className="is-chat" aria-hidden="true" />
        </div>
      </div>
    </article>
  )
}

function ProductPreview() {
  return (
    <div
      className="landing-product-wrap landing-reveal"
      style={{ '--delay': '120ms' }}
      aria-hidden="true"
    >
      <div className="landing-product-outline" />
      <div className="landing-product">
        <header className="landing-product-header">
          <div className="landing-product-burger">
            <MenuRoundedIcon aria-hidden="true" />
          </div>
          <div className="landing-product-brand">
            <Image
              src="/brand/vedelo-mark.svg"
              width={28}
              height={28}
              alt=""
            />
            <strong>Ведело</strong>
          </div>
          <span className="landing-product-header-title">
            Предстоящие заказы <b>3</b>
          </span>
          <div className="landing-product-header-actions">
            <i>
              <NotificationsNoneRoundedIcon aria-hidden="true" />
              <span />
            </i>
            <b>АС</b>
          </div>
        </header>

        <aside className="landing-product-nav">
          <div className="landing-product-nav-row">
            <PriorityHighRoundedIcon aria-hidden="true" />
          </div>
          <div className="landing-product-nav-row is-active">
            <CalendarMonthRoundedIcon aria-hidden="true" />
          </div>
          <div className="landing-product-nav-row">
            <PersonOutlineRoundedIcon aria-hidden="true" />
          </div>
          <div className="landing-product-nav-row">
            <WalletOutlinedIcon aria-hidden="true" />
          </div>
          <div className="landing-product-nav-row">
            <QueryStatsRoundedIcon aria-hidden="true" />
          </div>
        </aside>

        <main className="landing-product-content">
          <div className="landing-product-toolbar">
            <button type="button" tabIndex={-1}>
              <FilterAltRoundedIcon aria-hidden="true" />
              Фильтры
            </button>
            <div>
              <i className="is-selected">
                <ViewListRoundedIcon aria-hidden="true" />
              </i>
              <i>
                <CalendarMonthRoundedIcon aria-hidden="true" />
              </i>
            </div>
          </div>
          <div className="landing-order-list">
            {productPreviewOrders.map((order) => (
              <ProductPreviewOrder key={order.title} order={order} />
            ))}
          </div>
          <div className="landing-product-fab">
            <AddRoundedIcon aria-hidden="true" />
          </div>
        </main>

        <nav className="landing-product-mobile-nav">
          <div>
            <PriorityHighRoundedIcon aria-hidden="true" />
            <span>Важное</span>
          </div>
          <div className="is-active">
            <CalendarMonthRoundedIcon aria-hidden="true" />
            <span>Заказы</span>
          </div>
          <div className="landing-product-mobile-add">
            <i>
              <AddRoundedIcon aria-hidden="true" />
            </i>
          </div>
          <div>
            <PersonOutlineRoundedIcon aria-hidden="true" />
            <span>Клиенты</span>
          </div>
          <div>
            <MenuRoundedIcon aria-hidden="true" />
            <span>Меню</span>
          </div>
        </nav>
      </div>
    </div>
  )
}

function TariffAvailability({ available }) {
  if (!available) {
    return (
      <span
        className="landing-tariff-unavailable"
        role="img"
        aria-label="Недоступно"
      >
        —
      </span>
    )
  }
  return (
    <span className="landing-tariff-available" role="img" aria-label="Доступно">
      <CheckIcon />
    </span>
  )
}

function TariffComparison({ tariffs }) {
  if (tariffs.length === 0) {
    return (
      <div className="landing-pricing-empty">
        <p>Тарифы временно недоступны. Попробуйте открыть страницу позже.</p>
        <MetrikaLink
          href={registerUrl}
          className="landing-button landing-button-primary"
          goalName="landing_cta_click"
          goalParams={{ page: 'home', placement: 'pricing_unavailable' }}
        >
          Перейти в кабинет
        </MetrikaLink>
      </div>
    )
  }

  const visibleFeatureRows = getVisibleTariffFeatureRows(
    tariffFeatureRows,
    tariffs
  )

  return (
    <>
      <div
        className="landing-tariff-scroll"
        tabIndex="0"
        aria-label="Сравнение тарифов"
      >
        <table
          className="landing-tariff-table"
          style={{ minWidth: `${280 + tariffs.length * 210}px` }}
        >
          <thead>
            <tr>
              <th scope="col">Возможности</th>
              {tariffs.map((tariff) => (
                <th scope="col" key={String(tariff._id)}>
                  <span>{tariff.title || 'Тариф'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleFeatureRows.map((feature) => (
              <tr key={feature.label}>
                <th scope="row">{feature.label}</th>
                {tariffs.map((tariff) => {
                  if (feature.type === 'eventsLimit') {
                    return (
                      <td
                        key={String(tariff._id)}
                        className="landing-tariff-limit"
                      >
                        {formatEventsLimit(tariff.eventsPerMonth)}
                      </td>
                    )
                  }
                  const available =
                    feature.included || Boolean(tariff?.[feature.key])
                  return (
                    <td key={String(tariff._id)}>
                      <TariffAvailability available={available} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Стоимость в месяц</th>
              {tariffs.map((tariff) => {
                const isFree = Number(tariff?.price ?? 0) === 0
                return (
                  <td key={String(tariff._id)}>
                    <strong>{formatPrice(tariff.price)}</strong>
                    <MetrikaLink
                      href={tariffRegisterUrl}
                      className={`landing-button ${
                        isFree
                          ? 'landing-button-secondary'
                          : 'landing-button-primary'
                      }`}
                      goalName="landing_cta_click"
                      goalParams={{
                        page: 'home',
                        placement: 'pricing_desktop',
                        tariff: tariff.title || 'unknown',
                      }}
                    >
                      {isFree ? 'Начать бесплатно' : 'Выбрать тариф'}
                    </MetrikaLink>
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="landing-tariff-mobile" aria-label="Тарифы">
        {tariffs.map((tariff, index) => {
          const isFree = Number(tariff?.price ?? 0) === 0
          return (
            <details key={String(tariff._id)} open={index === 0}>
              <summary>
                <span className="landing-tariff-mobile-title">
                  {tariff.title || 'Тариф'}
                </span>
                <span className="landing-tariff-mobile-price">
                  {formatPrice(tariff.price)}
                </span>
                <KeyboardArrowDownRoundedIcon aria-hidden="true" />
              </summary>
              <div className="landing-tariff-mobile-body">
                <dl>
                  {visibleFeatureRows.map((feature) => {
                    const available =
                      feature.included || Boolean(tariff?.[feature.key])
                    return (
                      <div key={feature.label}>
                        <dt>{feature.label}</dt>
                        <dd
                          className={
                            feature.type === 'eventsLimit'
                              ? 'is-limit'
                              : undefined
                          }
                        >
                          {feature.type === 'eventsLimit' ? (
                            formatEventsLimit(tariff.eventsPerMonth)
                          ) : (
                            <TariffAvailability available={available} />
                          )}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
                <MetrikaLink
                  href={tariffRegisterUrl}
                  className={`landing-button ${
                    isFree
                      ? 'landing-button-secondary'
                      : 'landing-button-primary'
                  }`}
                  goalName="landing_cta_click"
                  goalParams={{
                    page: 'home',
                    placement: 'pricing_mobile',
                    tariff: tariff.title || 'unknown',
                  }}
                >
                  {isFree ? 'Начать бесплатно' : 'Выбрать тариф'}
                </MetrikaLink>
              </div>
            </details>
          )
        })}
      </div>
    </>
  )
}

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (session?.user?._id) redirect('/cabinet')

  let tariffs = []
  try {
    await dbConnect()
    tariffs = await Tariffs.find({ hidden: { $ne: true } })
      .sort({ price: 1, title: 1 })
      .lean()
  } catch (error) {
    tariffs = []
  }
  const publicTariffs = tariffs ?? []

  const softwareApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: BRAND.name,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'CRM для самостоятельных специалистов',
    operatingSystem: 'Web',
    inLanguage: 'ru-RU',
    url: homeUrl,
    description:
      'Ведело — CRM для малого бизнеса и частных специалистов: заявки, заказы, клиенты, финансы, календарь и документы.',
    featureList: benefits.map((benefit) => benefit.title),
    image: ogImageUrl,
    offers:
      publicTariffs.length > 0
        ? publicTariffs.map((tariff) => ({
            '@type': 'Offer',
            name: tariff?.title || 'Тариф',
            price: Number(tariff?.price ?? 0),
            priceCurrency: 'RUB',
          }))
        : [
            {
              '@type': 'Offer',
              price: 0,
              priceCurrency: 'RUB',
              name: 'Бесплатный тариф',
            },
          ],
  }
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND.name,
    url: homeUrl,
    logo: `${normalizedSiteUrl}/img/logo-96.webp`,
  }
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND.name,
    url: homeUrl,
    inLanguage: 'ru-RU',
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }

  return (
    <main className="landing-page">
      <a className="landing-skip-link" href="#main-content">
        Перейти к содержанию
      </a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            websiteSchema,
            organizationSchema,
            softwareApplicationSchema,
            faqSchema,
          ]),
        }}
      />

      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link href="/" className="landing-logo" aria-label="Ведело — главная">
            <Image
              src="/brand/vedelo-mark.svg"
              alt=""
              width={34}
              height={34}
              priority
            />
            <span>Ведело</span>
          </Link>
          <nav className="landing-nav" aria-label="Основная навигация">
            <Link href="#features">Возможности</Link>
            <Link href="#workflow">Как работает</Link>
            <Link href="#pricing">Тарифы</Link>
          </nav>
          <div className="landing-header-actions">
            <Link href="/login" className="landing-login-link">
              Войти
            </Link>
            <MetrikaLink
              href={registerUrl}
              className="landing-button landing-button-primary landing-header-cta"
              goalName="landing_cta_click"
              goalParams={{ page: 'home', placement: 'header' }}
            >
              <span className="landing-header-cta-full">
                Попробовать бесплатно
              </span>
              <span className="landing-header-cta-short">Начать бесплатно</span>
            </MetrikaLink>
          </div>
        </div>
      </header>

      <section id="main-content" className="landing-hero">
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <h1 className="landing-reveal">
              Заявки, клиенты и деньги — под контролем
            </h1>
            <p
              className="landing-hero-lead landing-reveal"
              style={{ '--delay': '60ms' }}
            >
              Ведело помогает не терять обращения, вовремя связываться с
              клиентами и видеть оплаты по каждому заказу.
            </p>
            <div
              className="landing-hero-actions landing-reveal"
              style={{ '--delay': '100ms' }}
            >
              <MetrikaLink
                href={registerUrl}
                className="landing-button landing-button-primary"
                goalName="landing_cta_click"
                goalParams={{ page: 'home', placement: 'hero' }}
              >
                Попробовать бесплатно
              </MetrikaLink>
              <Link href="#features" className="landing-arrow-link">
                Посмотреть возможности <ArrowIcon />
              </Link>
            </div>
          </div>
          <ProductPreview />
        </div>
        <div className="landing-hero-rule" aria-hidden="true">
          <span />
        </div>
      </section>

      <section
        id="features"
        className="landing-section landing-features landing-section-below"
      >
        <div className="landing-container">
          <div className="landing-section-head">
            <h2>Всё важное — в одном месте</h2>
          </div>
          <div className="landing-benefits">
            {benefits.map((benefit, index) => (
              <article key={benefit.title} className="landing-benefit">
                <div className="landing-benefit-top">
                  <span>{index + 1}</span>
                </div>
                <h3>{benefit.title}</h3>
                <p>{benefit.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="workflow"
        className="landing-section landing-workflow landing-section-below"
      >
        <div className="landing-container">
          <div className="landing-section-head landing-section-head-wide">
            <h2>От первого сообщения до закрытого заказа</h2>
          </div>
          <div className="landing-steps">
            {steps.map(([title, text], index) => (
              <article key={title} className="landing-step">
                <span className="landing-step-number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="landing-step-visual">
                  <span>
                    {
                      [
                        'Новая заявка',
                        'Звонок · 14:00',
                        'Задаток · 30 000 ₽',
                        'Заказ выполнен',
                      ][index]
                    }
                  </span>
                  <CheckIcon />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="landing-audiences landing-section-below"
        aria-labelledby="audiences-title"
      >
        <div className="landing-container landing-audiences-inner">
          <div className="landing-audience-intro">
            <div className="landing-section-head">
              <p className="landing-section-kicker">Подберите свой сценарий</p>
              <h2 id="audiences-title">Выберите, чем вы занимаетесь</h2>
              <p>
                Покажем, как Ведело работает именно в вашей сфере — с вашими
                заявками, сроками, оплатами и документами.
              </p>
            </div>
            <blockquote>
              Не нашли точное название? Выберите ближайший сценарий — услуги и
              рабочие этапы можно настроить под себя.
            </blockquote>
          </div>
          <div className="landing-audience-grid">
            {audiencePages.map((item, index) => (
              <Link
                key={`${item.title}-${item.href}`}
                href={item.href}
                className="landing-audience-card"
                aria-label={`${item.title}: посмотреть преимущества Ведело`}
              >
                <span className="landing-audience-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </span>
                <i aria-hidden="true">
                  <ArrowIcon />
                </i>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="landing-section landing-pricing landing-section-below"
      >
        <div className="landing-container">
          <div className="landing-section-head landing-section-head-centered">
            <h2>Начните бесплатно. Расширяйтесь, когда понадобится.</h2>
            <p>
              Базовые возможности доступны без оплаты — можно спокойно проверить
              систему на реальной работе.
            </p>
          </div>
          <TariffComparison tariffs={publicTariffs} />
        </div>
      </section>

      <section className="landing-section landing-faq landing-section-below">
        <div className="landing-container landing-faq-inner">
          <div className="landing-section-head">
            <h2>Коротко о главном</h2>
          </div>
          <div className="landing-faq-list">
            {faqItems.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary>
                  <span>{item.question}</span>
                  <KeyboardArrowDownRoundedIcon aria-hidden="true" />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-cta landing-section-below">
        <div className="landing-container landing-cta-inner">
          <h2>Сосредоточьтесь на клиентах — порядок Ведело возьмёт на себя.</h2>
          <div>
            <MetrikaLink
              href={registerUrl}
              className="landing-button landing-button-primary"
              goalName="landing_cta_click"
              goalParams={{ page: 'home', placement: 'final' }}
            >
              Создать кабинет бесплатно
            </MetrikaLink>
            <Link href="/login" className="landing-cta-link">
              Войти в кабинет
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer landing-section-below">
        <div className="landing-container landing-footer-grid">
          <div>
            <Link href="/" className="landing-logo">
              <span>Ведело</span>
            </Link>
            <p>
              CRM для мастеров, event-индустрии и специалистов, работающих на
              себя
            </p>
          </div>
          <nav aria-label="Навигация в подвале">
            <Link href="#features">Возможности</Link>
            <Link href="#pricing">Тарифы</Link>
            <Link href="/crm-dlya-artistov">CRM для артистов</Link>
            <Link href="/crm-dlya-fokusnikov">CRM для фокусников</Link>
            <Link href="/crm-dlya-vedushchih">CRM для ведущих</Link>
            <Link href="/crm-dlya-muzykantov">CRM для музыкантов</Link>
            <Link href="/crm-dlya-vyezdnyh-masterov">
              CRM для выездных мастеров
            </Link>
            <Link href="/crm-dlya-fotografov">CRM для фотографов</Link>
            <Link href="/crm-dlya-dekoratorov">CRM для декораторов</Link>
            <Link href="/crm-dlya-chastnyh-specialistov">
              CRM для частных специалистов
            </Link>
            <Link href="/crm-dlya-tilda-zayavok">Заявки с Tilda</Link>
            <Link href="/crm-s-google-calendar">CRM с Google Календарём</Link>
            <Link href="/privacy">Политика конфиденциальности</Link>
            <Link href="/personal-data-consent">
              Согласие на обработку данных
            </Link>
            <Link href="/terms">Пользовательское соглашение</Link>
            <Link href="/payment">Оплата и возвраты</Link>
          </nav>
        </div>
        <div className="landing-container landing-copyright">
          © {new Date().getFullYear()} Ведело. Все права защищены.
        </div>
      </footer>
    </main>
  )
}
