import { getServerSession } from 'next-auth'
import authOptions from '../../../api/auth/[...nextauth]/_options'
import YandexComplete from './yandexComplete'
import { normalizePhone } from '@server/yandexAuth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Подключение Яндекс ID — Ведело', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function Page({ searchParams }) {
  const session = await getServerSession(authOptions)
  const params = await searchParams
  const initialError = params?.error === 'phone_required'
    ? 'Яндекс не передал номер телефона российского формата. Добавьте номер в Яндекс ID и разрешите доступ к нему, затем повторите вход.'
    : params?.error ? 'Не удалось завершить авторизацию Яндекса. Начните вход заново.' : ''
  return <YandexComplete signedIn={Boolean(session?.user?._id)} phone={normalizePhone(session?.user?.phone)} initialError={initialError} />
}
