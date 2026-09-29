import ReviewPublicClient from './ReviewPublicClient'

export const metadata = {
  title: 'Отзыв о работе — Ведело',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function ReviewPage({ params }) {
  const { id } = await params
  return <ReviewPublicClient id={id} />
}
