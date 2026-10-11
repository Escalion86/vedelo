import Login from '../login/page'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Регистрация в Ведело',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function Register({ searchParams }) {
  const params = await searchParams

  // Та же форма, сессия и реферальная атрибуция, но без mode в публичном URL.
  return Login({ searchParams: { ...params, mode: 'register' } })
}
