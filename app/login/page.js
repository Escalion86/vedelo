import { getServerSession } from 'next-auth'
import LoginInputs from './loginInputs'
import { redirect } from 'next/navigation'
import authOptions from '../api/auth/[...nextauth]/_options'
// import { signIn } from 'next-auth/react'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Вход в Ведело',
  robots: {
    index: false,
    follow: false,
  },
}

const normalizeCallbackUrl = (value) => {
  if (typeof value !== 'string') return '/cabinet'
  if (!value.startsWith('/')) return '/cabinet'
  if (value.startsWith('//')) return '/cabinet'
  return value
}

const normalizeInitialMode = (value) =>
  value === 'register' ? 'register' : 'login'

const normalizeReferrerId = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return /^[a-f\d]{24}$/i.test(trimmed) ? trimmed : ''
}

export default async function Login({ searchParams }) {
  let session = null
  const params = await searchParams
  const callbackUrl = normalizeCallbackUrl(params?.callbackUrl)
  const initialMode = normalizeInitialMode(params?.mode)
  const initialReferrerId = normalizeReferrerId(params?.ref)

  try {
    session = await getServerSession(authOptions)
  } catch (error) {
    console.error('Ошибка получения сессии в /login', error)
  }

  if (session) return redirect(callbackUrl)

  return (
    <LoginInputs
      callbackUrl={callbackUrl}
      initialMode={initialMode}
      initialReferrerId={initialReferrerId}
    />
  )
}
