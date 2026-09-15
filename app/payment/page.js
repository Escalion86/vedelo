import Link from 'next/link'

export const metadata = {
  title: 'Оплата и возвраты — Ведело',
  description:
    'Условия оплаты тарифов Ведело, пополнения баланса и возврата денежных средств.',
}

const legalName = process.env.NEXT_PUBLIC_LEGAL_NAME || 'Ведело'
const legalInn = process.env.NEXT_PUBLIC_LEGAL_INN || ''
const legalEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'vedelo@inbox.ru'

const PaymentPage = () => (
  <main className="min-h-screen bg-[#f5f6f8] px-6 py-10 text-gray-800">
    <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-general text-xs font-semibold tracking-[0.2em] uppercase">
        Ведело
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-gray-900">
        Оплата и возвраты
      </h1>

      <section className="mt-6 grid gap-3 text-sm leading-6">
        <h2 className="text-lg font-semibold text-gray-900">Продавец</h2>
        <p>{legalName}</p>
        {legalInn ? <p>ИНН: {legalInn}</p> : null}
        <p>
          Email для обращений:{' '}
          <a href={`mailto:${legalEmail}`} className="text-general">
            {legalEmail}
          </a>
        </p>
      </section>

      <section className="mt-6 grid gap-3 text-sm leading-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Что оплачивается
        </h2>
        <p>
          Пользователь оплачивает доступ к онлайн-сервису Ведело по выбранному
          тарифу или пополняет внутренний баланс для последующей оплаты тарифа.
          Стоимость тарифов указана на странице выбора тарифа в личном кабинете.
        </p>
      </section>

      <section className="mt-6 grid gap-3 text-sm leading-6">
        <h2 className="text-lg font-semibold text-gray-900">Способ оплаты</h2>
        <p>
          Оплата производится банковской картой и другими способами, доступными
          на странице подключенного платёжного партнёра — ЮKassa или Точки.
          После успешной оплаты баланс пользователя пополняется автоматически.
          При оплате тарифа система пополняет баланс и списывает стоимость
          выбранного тарифа.
        </p>
      </section>

      <section className="mt-6 grid gap-3 text-sm leading-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Продление тарифа
        </h2>
        <p>
          Платный тариф продлевается на следующий период за счёт внутреннего
          баланса, если на дату продления средств достаточно. Автоматического
          списания с банковской карты без отдельного подтверждения или отдельно
          подключенного согласия на рекуррентные платежи нет. При недостатке
          средств аккаунт может быть переведён на бесплатный тариф.
        </p>
      </section>

      <section className="mt-6 grid gap-3 text-sm leading-6">
        <h2 className="text-lg font-semibold text-gray-900">Возврат</h2>
        <p>
          Возврат денежных средств возможен по обращению пользователя на email
          поддержки. Срок рассмотрения обращения - до 10 рабочих дней. Возврат
          производится тем же способом, которым была совершена оплата, если это
          технически возможно.
        </p>
      </section>

      <section className="mt-6 grid gap-3 text-sm leading-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Доступ к сервису
        </h2>
        <p>
          Доступ к оплаченным функциям предоставляется в электронном виде сразу
          после подтверждения платежа. Физическая доставка товаров не
          осуществляется.
        </p>
      </section>

      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/terms" className="text-general">
          Пользовательское соглашение
        </Link>
        <Link href="/privacy" className="text-general">
          Политика конфиденциальности
        </Link>
        <Link href="/personal-data-consent" className="text-general">
          Согласие на обработку данных
        </Link>
        <Link href="/" className="text-general">
          На главную
        </Link>
      </div>
    </div>
  </main>
)

export default PaymentPage
