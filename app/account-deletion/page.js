import Link from 'next/link'
import AccountDeletionForm from './AccountDeletionForm'

const siteUrl = (process.env.DOMAIN || 'https://vedelo.ru').replace(/\/$/, '')
const supportEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'Escalion86@gmail.com'

export const metadata = {
  title: 'Удаление аккаунта Ведело',
  description:
    'Публичная форма запроса удаления аккаунта и пользовательских данных Ведело.',
  alternates: { canonical: `${siteUrl}/account-deletion` },
  robots: { index: true, follow: true },
}

export default function AccountDeletionPage() {
  return (
    <main className="bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-12 text-sm text-gray-700">
        <div className="flex flex-col gap-3">
          <p className="text-general text-xs font-semibold tracking-[0.2em] uppercase">
            Ведело
          </p>
          <h1 className="font-futuraPT text-3xl font-semibold text-black">
            Удаление аккаунта и данных
          </h1>
          <p className="text-base leading-7">
            Запрос можно отправить здесь без доступа к Android-приложению. В
            приложении та же функция находится в разделе «Ещё → Профиль».
          </p>
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            Что будет удалено
          </h2>
          <p>
            Профиль, клиенты, мероприятия, задачи, настройки интеграций,
            мобильные сессии и другие данные рабочего пространства будут удалены
            или обезличены после проверки запроса.
          </p>
          <p>
            Данные, которые необходимо хранить по закону для бухгалтерского
            учёта, разрешения споров или предотвращения злоупотреблений, могут
            сохраняться только в требуемом объёме и на установленный законом
            срок.
          </p>
        </section>
        <AccountDeletionForm />
        <p>
          Если вы можете войти в приложение, используйте удаление из профиля:
          оно сразу завершит активные мобильные сессии. По вопросам обработки
          данных см.{' '}
          <Link href="/privacy" className="text-general underline">
            Политику конфиденциальности
          </Link>{' '}
          или напишите на{' '}
          <a href={`mailto:${supportEmail}`} className="text-general underline">
            {supportEmail}
          </a>
          .
        </p>
      </div>
    </main>
  )
}
