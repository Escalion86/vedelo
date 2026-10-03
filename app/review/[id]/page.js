import ReviewPublicClient from './ReviewPublicClient'
import { publicReviewAppearance } from '@server/reviewAppearance'
import { reviewOrigin } from '@server/clientReviews'
import { buildReviewPageMetadata } from '@helpers/reviewAppearance.mjs'

// Метаданные строятся по данным БД на каждый запрос: у краулера нет секрета
// из #fragment, поэтому доступно только явно сохранённое публичное оформление.
export const dynamic = 'force-dynamic'

export const generateMetadata = async ({ params }) => {
  const { id } = await params
  const origin = reviewOrigin()
  let appearance = null
  try {
    appearance = await publicReviewAppearance(id)
  } catch {
    appearance = null
  }
  const built = buildReviewPageMetadata({ id, appearance, origin })
  return {
    title: built.title,
    description: built.description,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
    openGraph: {
      type: 'website',
      siteName: 'Ведело',
      url: built.url,
      title: built.title,
      description: built.description,
      images: [{ url: built.image, alt: built.imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: built.title,
      description: built.description,
      images: [built.image],
    },
  }
}

export default async function ReviewPage({ params }) {
  const { id } = await params
  return <ReviewPublicClient id={id} />
}
