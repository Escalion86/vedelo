import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import CabinetPage from './cabinet'
import fetchProps from '@server/fetchProps'
import authOptions from '../../api/auth/[...nextauth]/_options'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Кабинет Ведело',
  robots: {
    index: false,
    follow: false,
  },
}

const normalizeCabinetProps = (input, sessionUser, page) => {
  const source = input && typeof input === 'object' ? input : {}
  return {
    loggedUser:
      source.loggedUser || sessionUser
        ? {
            ...(source.loggedUser ?? sessionUser),
            impersonation: sessionUser?.impersonation ?? null,
          }
        : null,
    clients: Array.isArray(source.clients) ? source.clients : [],
    events: Array.isArray(source.events) ? source.events : [],
    eventsPaging:
      source.eventsPaging && typeof source.eventsPaging === 'object'
        ? source.eventsPaging
        : {
            scope: page === 'eventsPast' ? 'past' : 'all',
            hasMore: false,
            nextBefore: null,
            limit: 0,
            totalCount: 0,
          },
    siteSettings:
      source.siteSettings && typeof source.siteSettings === 'object'
        ? source.siteSettings
        : {},
    transactions: Array.isArray(source.transactions) ? source.transactions : [],
    news: Array.isArray(source.news) ? source.news : [],
    services: Array.isArray(source.services) ? source.services : [],
    tariffs: Array.isArray(source.tariffs) ? source.tariffs : [],
    users: Array.isArray(source.users) ? source.users : [],
    serverSettings:
      source.serverSettings && typeof source.serverSettings === 'object'
        ? source.serverSettings
        : { dateTime: new Date() },
    error: source.error ?? null,
  }
}

export default async function Cabinet({ params }) {
  let session = null

  try {
    session = await getServerSession(authOptions)
  } catch (error) {
    console.error('Ошибка получения сессии в /cabinet/[page]', error)
  }

  const resolvedParams = await params

  const page =
    typeof resolvedParams?.page === 'string'
      ? resolvedParams.page
      : 'eventsUpcoming'
  if (page === 'requests') return redirect('/cabinet/eventsUpcoming')
  // «События клиентов» переехали в раздел «Важное»
  if (page === 'clientEvents') return redirect('/cabinet/attention')

  if (!session) return redirect('/login')
  if (page === 'export') return redirect('/cabinet/import?tab=export')

  let fetchedProps = null
  try {
    fetchedProps = await fetchProps(session?.user, page)
  } catch (error) {
    console.error('Ошибка загрузки данных в /cabinet/[page]', {
      page,
      userId: session?.user?._id ?? null,
      tenantId: session?.user?.tenantId ?? null,
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
      },
    })
    fetchedProps = { error: { message: 'fetchProps failed' } }
  }

  if (fetchedProps?.error) {
    console.error('Cabinet props degraded', {
      page,
      userId: session?.user?._id ?? null,
      tenantId: session?.user?.tenantId ?? null,
      error: fetchedProps.error,
    })
  }

  const safeProps = normalizeCabinetProps(fetchedProps, session?.user, page)

  return <CabinetPage {...safeProps} page={page} />
}
