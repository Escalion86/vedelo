import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import MetrikaLink from '@components/MetrikaLink'
import dbConnect from '@server/dbConnect'
import Tariffs from '@models/Tariffs'
import { withAiIncludedEstimates } from '@server/aiIncludedEstimate'
import { formatAiIncludedSentence } from '@helpers/aiIncludedEstimate.mjs'
import {
  formatAiIncludedRowLabel,
  formatAiIncludedShort,
  getTariffFeatureHelp,
} from '@helpers/tariffFeatureHelp'
import FieldHelp from '@components/FieldHelp'
import { getServerSession } from 'next-auth'
import authOptions from './api/auth/[...nextauth]/_options'
import { redirect } from 'next/navigation'
import { BRAND, getCanonicalBaseUrl } from '@helpers/brand.mjs'
import {
  getVisibleTariffFeatureRows,
  isPublicTariffFeatureAvailable,
} from '@helpers/publicTariffFeatures.mjs'
import TariffConditions from '@components/TariffConditions'
import HomeLanding from '@components/home/HomeLanding'

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

const tariffFeatureRows = [
  { label: 'Работа с заявками и заказами', included: true },
  { label: 'Клиентская база', included: true },
  { label: 'Учёт оплат и расходов', included: true },
  { label: 'Новых заявок и заказов в месяц', type: 'eventsLimit' },
  { label: 'Синхронизация с Google Календарём', key: 'allowCalendarSync' },
  { label: 'Статистика и аналитика', key: 'allowStatistics' },
  { label: 'Договоры, акты и документы', key: 'allowDocuments' },
  { label: 'Отзывы клиентов', key: 'allowClientReviews' },
  { label: 'Коммерческие предложения', key: 'allowProposals' },
  { label: 'IP-телефония', key: 'allowTelephony' },
  { label: 'ИИ-возможности', key: 'allowAi' },
  { label: 'Интеграция с Avito', key: 'allowAvitoIntegration' },
  { label: 'Интеграция с VK', key: 'allowVkIntegration' },
  { label: 'Telegram Business', key: 'allowTelegramIntegration' },
  { label: 'Подключение сайта по API', key: 'allowPublicLeadApi' },
]

function CheckIcon() {
  return <CheckRoundedIcon aria-hidden="true" />
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
  // Сноска к сумме ИИ: «* ИИ в тарифе на 300 ₽ — это примерно 4 ч 10 мин расшифровки звонков…».
  const aiNoteFor = (tariff) =>
    tariff?.aiIncludedEstimate?.enabled
      ? `* ${formatAiIncludedSentence(tariff.aiIncludedEstimate)}. ${tariff.aiIncludedEstimate.note}`
      : ''
  const aiIncludedNotes = tariffs.map(aiNoteFor).filter(Boolean)
  // Ключ подсказки «i» для строки возможностей (у ИИ и лимита заказов ключа в строке нет).
  const rowHelpKey = (feature) =>
    feature.key || (feature.type === 'eventsLimit' ? 'eventsLimit' : '')
  const rowHelpText = (feature) =>
    getTariffFeatureHelp(
      rowHelpKey(feature),
      feature.key === 'allowAi' ? null : undefined
    )

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
                <th scope="row">
                  {feature.label}
                  {rowHelpKey(feature) ? (
                    <FieldHelp
                      text={rowHelpText(feature)}
                      label={feature.label}
                    />
                  ) : null}
                </th>
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
                  const available = isPublicTariffFeatureAvailable(
                    tariff,
                    feature
                  )
                  return (
                    <td key={String(tariff._id)}>
                      <TariffAvailability available={available} />
                      {feature.key === 'allowAi' &&
                      formatAiIncludedShort(tariff) ? (
                        <div className="text-xs leading-5 opacity-70">
                          {formatAiIncludedShort(tariff)}
                          <span className="font-bold"> *</span>
                        </div>
                      ) : null}
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
        {aiIncludedNotes.length ? (
          <div className="mt-3 text-xs leading-5 opacity-70">
            {aiIncludedNotes.map((note) => (
              <p key={note} className="mt-1">
                {note}
              </p>
            ))}
          </div>
        ) : null}
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
                    const available = isPublicTariffFeatureAvailable(
                      tariff,
                      feature
                    )
                    return (
                      <div key={feature.label}>
                        <dt>
                          {feature.key === 'allowAi'
                            ? formatAiIncludedRowLabel(tariff, feature.label)
                            : feature.label}
                          {rowHelpKey(feature) ? (
                            <FieldHelp
                              text={getTariffFeatureHelp(
                                rowHelpKey(feature),
                                tariff
                              )}
                              label={feature.label}
                            />
                          ) : null}
                        </dt>
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
                {aiNoteFor(tariff) ? (
                  <p className="mt-3 text-xs leading-5 opacity-70">
                    {aiNoteFor(tariff)}
                  </p>
                ) : null}
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
      <TariffConditions tariffs={tariffs} className="mt-4" />
    </>
  )
}

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (session?.user?._id) redirect('/cabinet')

  let tariffs = []
  try {
    await dbConnect()
    tariffs = await withAiIncludedEstimates(
      await Tariffs.find({ hidden: { $ne: true } })
        .sort({ price: 1, title: 1 })
        .lean()
    )
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
    <HomeLanding
      faqItems={faqItems}
      schemas={[
        websiteSchema,
        organizationSchema,
        softwareApplicationSchema,
        faqSchema,
      ]}
    >
      <TariffComparison tariffs={publicTariffs} />
    </HomeLanding>
  )
}
