import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import authOptions from '../api/auth/[...nextauth]/_options'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Кабинет Ведело',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function Cabinet() {
  let session = null
  try {
    session = await getServerSession(authOptions)
  } catch (error) {
    console.error('Ошибка получения сессии в /cabinet', error)
  }

  if (!session) return redirect('/login')

  return redirect('/cabinet/eventsUpcoming')
}
