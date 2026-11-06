import Link from 'next/link'
import Image from 'next/image'
import MetrikaLink from '@components/MetrikaLink'
import HomeIntroVideo from './HomeIntroVideo'
import HomeFeaturePreview from './HomeFeaturePreview'
import styles from './HomeLanding.module.css'

const cx = (...names) => names.map((name) => styles[name]).join(' ')
const registerUrl = '/login?mode=register'
const audiences = [
  ['Артистам', '/crm-dlya-artistov'],
  ['Фотографам', '/crm-dlya-fotografov'],
  ['Выездным мастерам', '/crm-dlya-vyezdnyh-masterov'],
  ['Частным специалистам', '/crm-dlya-chastnyh-specialistov'],
]
const moreScenarios = [
  ['Фокусникам', '/crm-dlya-fokusnikov'],
  ['Ведущим', '/crm-dlya-vedushchih'],
  ['Музыкантам', '/crm-dlya-muzykantov'],
  ['Декораторам', '/crm-dlya-dekoratorov'],
  ['Заявки с Tilda', '/crm-dlya-tilda-zayavok'],
  ['Google Календарь', '/crm-s-google-calendar'],
]

function Arrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 12h15M13 5l7 7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Brand() {
  return (
    <Link className={styles.brand} href="/" aria-label="Ведело — главная">
      <Image src="/brand/vedelo-mark.svg" alt="" width={36} height={40} />
      Ведело
    </Link>
  )
}

function RegisterLink({
  placement,
  children = 'Начать бесплатно',
  small = false,
}) {
  return (
    <MetrikaLink
      className={cx('button', ...(small ? ['small'] : []))}
      href={registerUrl}
      goalName="landing_cta_click"
      goalParams={{ page: 'home', placement }}
    >
      {children}
      {small ? null : <Arrow />}
    </MetrikaLink>
  )
}

export default function HomeLanding({ faqItems, schemas, children }) {
  return (
    <div className={`landing-page ${styles.page}`}>
      <link
        rel="preload"
        href="/fonts/FuturaPT-Bold.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      <link
        rel="preload"
        href="/fonts/InterTight-Regular.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      <a className={styles.skip} href="#main-content">
        Перейти к содержимому
      </a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schemas).replace(/</g, '\\u003c'),
        }}
      />
      <header className={styles['site-header']}>
        <div className={cx('wrap', 'header-row')}>
          <Brand />
          <nav aria-label="Разделы страницы">
            <Link href="#features">Возможности</Link>
            <Link href="#audiences">Для кого</Link>
            <Link href="#pricing">Тарифы</Link>
          </nav>
          <div className={styles['header-actions']}>
            <Link href="/login">Войти</Link>
            <RegisterLink placement="header" small />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section className={cx('hero', 'wrap')} aria-labelledby="hero-title">
          <div className={styles['hero-layout']}>
            <div>
              <h1 id="hero-title">
                Веди свое дело
                <br />
                вместе с <span>Ведело</span>
              </h1>
              <p className={styles['hero-lead']}>
                Заказы, клиенты и оплаты — в&nbsp;одном месте.
              </p>
              <div className={styles['hero-action']}>
                <RegisterLink placement="hero" />
              </div>
              <p className={styles['free-note']}>
                Базовые возможности бесплатны
              </p>
            </div>
            <HomeIntroVideo />
          </div>
          <div className={styles['hero-bottom']}>
            <p>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect
                  x="2"
                  y="4"
                  width="14"
                  height="11"
                  rx="1.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M9 15v4M5 19h8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <rect
                  x="17"
                  y="10"
                  width="5"
                  height="10"
                  rx="1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              В браузере телефона и компьютера
            </p>
            <Link className={styles['text-link']} href="#features">
              Что внутри
              <Arrow />
            </Link>
          </div>
        </section>
        <section
          id="features"
          className={cx('features', 'section')}
          aria-labelledby="features-title"
        >
          <div className={styles.wrap}>
            <h2 id="features-title">Всё важное по заказу — рядом</h2>
            <p className={styles['section-lead']}>
              От первого обращения до оплаты. Без поиска договорённостей по
              разным заметкам.
            </p>
            <HomeFeaturePreview />
          </div>
        </section>
        <section
          id="audiences"
          className={cx('audiences', 'section')}
          aria-labelledby="audiences-title"
        >
          <div className={cx('wrap', 'audience-layout')}>
            <div>
              <h2 id="audiences-title">
                Создано специалистом.
                <br />
                Подходит вашему делу.
              </h2>
              <p className={styles['section-lead']}>
                Ведело выросло из моей работы иллюзионистом. Затем я адаптировал
                приложение для других специалистов, которые работают с клиентами
                и заказами.
              </p>
            </div>
            <div className={styles['audience-links']}>
              {audiences.map(([title, href]) => (
                <Link key={href} href={href}>
                  {title}
                  <Arrow />
                </Link>
              ))}
            </div>
          </div>
        </section>
        <section
          id="pricing"
          className={cx('section', 'wrap')}
          aria-labelledby="pricing-title"
        >
          <div className={styles['free-section']}>
            <div>
              <h2 id="pricing-title">
                Начните бесплатно.
                <br />С одного реального заказа.
              </h2>
              <p className={styles['section-lead']}>
                Сохраните клиента, добавьте заказ и&nbsp;отметьте оплату.
                Попробуйте Ведело в&nbsp;своей повседневной работе.
              </p>
              <div className={styles['free-actions']}>
                <RegisterLink placement="free_start">
                  Создать аккаунт
                </RegisterLink>
                <Link className={styles['text-link']} href="#tariff-comparison">
                  Сравнить тарифы
                  <Arrow />
                </Link>
              </div>
            </div>
            <div>
              <ul className={styles.included}>
                {[
                  'Клиенты и история заказов',
                  'Договорённости и следующие контакты',
                  'Учёт оплат по каждому заказу',
                ].map((text) => (
                  <li key={text}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="m5 12 4 4L19 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {text}
                  </li>
                ))}
              </ul>
              <p className={styles['limit-note']}>
                Базовые возможности бесплатны. Лимиты и дополнительные функции —
                в&nbsp;сравнении тарифов.
              </p>
            </div>
          </div>
          <div id="tariff-comparison" className={styles['tariff-comparison']}>
            <h3>Выберите подходящие возможности</h3>
            {children}
          </div>
        </section>
        <section className={cx('faq', 'section')} aria-labelledby="faq-title">
          <div className={cx('wrap', 'faq-layout')}>
            <h2 id="faq-title">Перед первым заказом</h2>
            <div>
              {faqItems.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
        <section
          className={cx('wrap', 'final-section')}
          aria-labelledby="start-title"
        >
          <div className={styles['final-cta']}>
            <div>
              <h2 id="start-title">Ваше дело. Порядок в деталях.</h2>
              <p>Начните с одного заказа — и освободите голову для работы.</p>
            </div>
            <RegisterLink placement="final" />
          </div>
        </section>
      </main>
      <footer>
        <div className={styles.wrap}>
          <div className={styles['footer-main']}>
            <Brand />
            <div className={styles['legal-links']}>
              <Link href="/terms">Условия использования</Link>
              <Link href="/privacy">Конфиденциальность</Link>
              <Link href="/personal-data-consent">
                Согласие на обработку данных
              </Link>
              <Link href="/payment">Оплата и возврат</Link>
            </div>
          </div>
          <nav
            className={styles['footer-scenarios']}
            aria-label="Другие сценарии Ведело"
          >
            {moreScenarios.map(([title, href]) => (
              <Link key={href} href={href}>
                {title}
              </Link>
            ))}
          </nav>
          <p className={styles['music-credit']}>
            Музыка в видео: «Life of Riley» — Kevin MacLeod (
            <a href="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400054">
              incompetech.com
            </a>
            ),{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
            . Фрагмент обработан и сведён с речью.
          </p>
          <p className={styles.copyright}>
            © {new Date().getFullYear()} Ведело
          </p>
        </div>
      </footer>
    </div>
  )
}
