'use client'

import { buildReviewPageMetadata } from '@helpers/reviewAppearance.mjs'

const hostOf = (origin) => {
  try {
    return new URL(origin).host
  } catch {
    return 'vedelo.ru'
  }
}

// Предпросмотр карточки ссылки: так её увидят в мессенджере (MAX, Telegram,
// VK) до открытия — заголовок, описание, изображение и адрес.
const ReviewLinkCardPreview = ({ appearance = null, origin = '' }) => {
  const built = buildReviewPageMetadata({
    id: '000000000000000000000000',
    appearance,
    origin: origin || 'https://vedelo.ru',
  })
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {appearance?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appearance.logoUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-general text-base font-bold text-white"
            >
              В
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-gray-500">{hostOf(origin)}</div>
          <div className="truncate text-sm font-semibold text-gray-900">
            {built.title}
          </div>
          <div className="line-clamp-2 text-xs text-gray-600">
            {built.description}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReviewLinkCardPreview
