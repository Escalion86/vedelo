import Link from 'next/link'
import { LEGAL_DOCUMENTS_EFFECTIVE_DATE } from '@helpers/legalDocuments.mjs'

const siteUrl = (process.env.DOMAIN || 'https://vedelo.ru').replace(/\/$/, '')
const pageUrl = `${siteUrl}/personal-data-consent`
const supportEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'vedelo@inbox.ru'

export const metadata = {
  title: 'Согласие на обработку персональных данных — Ведело',
  description:
    'Отдельное согласие пользователя Ведело на обработку персональных данных.',
  alternates: { canonical: pageUrl },
  robots: { index: true, follow: true },
}

export default function PersonalDataConsentPage() {
  return (
    <main className="bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-12 text-sm leading-6 text-gray-700">
        <div className="flex flex-col gap-2">
          <p className="text-general text-xs font-semibold tracking-[0.2em] uppercase">
            Документы Ведело
          </p>
          <h1 className="font-futuraPT text-3xl font-semibold text-black">
            Согласие на обработку персональных данных
          </h1>
          <p className="text-sm text-gray-500">
            Редакция действует с: {LEGAL_DOCUMENTS_EFFECTIVE_DATE}
          </p>
        </div>

        <p>
          Отмечая отдельный флажок согласия при регистрации, я свободно, своей
          волей и в своём интересе даю ИП Белинскому Алексею Алексеевичу (ИНН
          245727560982, ОГРНИП 319246800103511), адрес: РФ, Красноярский край,
          г. Красноярск, ул. 4 Продольная, д. 34 (далее — «Оператор») согласие
          на обработку моих персональных данных в сервисе «Ведело».
        </p>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            1. Перечень данных
          </h2>
          <p>
            Фамилия, имя, отчество; номер телефона; email; изображение профиля;
            указанные мной контакты в мессенджерах и социальных сетях;
            пользовательские реквизиты; сведения об аккаунте, тарифе, платежах,
            настройках и принятых документах; IP-адрес, user-agent, сведения об
            устройстве, версии приложения, сессии, push-токене и технических
            событиях безопасности.
          </p>
          <p>
            Согласие не относится к биометрическим данным, специальным
            категориям данных и рекламным рассылкам. Ведело не просит сообщать
            такие данные при регистрации.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">2. Цели</h2>
          <p>
            Создание и защита аккаунта; вход по телефону или VK ID;
            предоставление и персонализация функций; синхронизация устройств и
            уведомления; исполнение выбранного тарифа; проведение и учёт
            платежей; техническая поддержка; предотвращение злоупотреблений;
            рассмотрение запросов на доступ, исправление и удаление данных.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            3. Действия и способ обработки
          </h2>
          <p>
            Сбор, запись, систематизация, накопление, хранение, уточнение,
            извлечение, использование, передача уполномоченным обработчикам в
            необходимом объёме, блокирование, удаление и уничтожение с
            использованием средств автоматизации и, при обращении в поддержку,
            без использования таких средств.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            4. Получатели и поручение обработки
          </h2>
          <p>
            Оператор вправе поручать обработку провайдерам серверной и файловой
            инфраструктуры, телефонного подтверждения, платежей и доставки
            уведомлений с соблюдением требований локализации, конфиденциальности
            и безопасности. Данные передаются Google, VK, Avito, Telegram,
            Novofon или AI-провайдеру только после моего отдельного подключения
            или запуска соответствующей функции.
          </p>
          <p>
            Согласие на необязательную веб-аналитику запрашивается отдельно и не
            является условием регистрации.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            5. Срок и отзыв согласия
          </h2>
          <p>
            Согласие действует с момента регистрации до его отзыва, удаления
            аккаунта или достижения целей обработки. После отзыва Оператор
            прекращает обработку, основанную именно на согласии, и удаляет
            данные, если для их дальнейшего хранения отсутствует иное законное
            основание.
          </p>
          <p>
            Отозвать согласие можно письмом на{' '}
            <a href={`mailto:${supportEmail}`} className="text-general">
              {supportEmail}
            </a>{' '}
            или запросом через{' '}
            <Link href="/account-deletion" className="text-general">
              форму удаления аккаунта
            </Link>
            . Отказ предоставить обязательные для аккаунта данные или отзыв
            согласия может сделать регистрацию и дальнейшее использование
            Сервиса невозможными.
          </p>
        </section>

        <p>
          Подробный порядок, меры защиты и права субъекта описаны в{' '}
          <Link href="/privacy" className="text-general">
            Политике обработки персональных данных
          </Link>
          . Настоящее согласие отображается и принимается отдельно от{' '}
          <Link href="/terms" className="text-general">
            Пользовательского соглашения
          </Link>
          .
        </p>

        <nav className="flex flex-wrap gap-4 border-t border-gray-200 pt-5">
          <Link href="/privacy" className="text-general">
            Политика обработки данных
          </Link>
          <Link href="/terms" className="text-general">
            Пользовательское соглашение
          </Link>
          <Link href="/" className="text-general">
            На главную
          </Link>
        </nav>
      </div>
    </main>
  )
}
