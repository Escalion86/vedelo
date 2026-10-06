// Персонализация публичной страницы отзыва (/review/[id]).
//
// Публично (доступно краулеру по одному ID приглашения) могут быть только
// явно сохранённые поля оформления. Имя клиента, дата работы, оценка, текст
// отзыва, суммы и адреса в публичный слой не попадают никогда.

export const REVIEW_PAGE_LIMITS = Object.freeze({
  publicName: 80,
  specialization: 120,
  greeting: 300,
})

export const REVIEW_ACCENTS = Object.freeze([
  { value: 'sand', name: 'Песочный — фирменный' },
  { value: 'terracotta', name: 'Терракотовый' },
  { value: 'emerald', name: 'Изумрудный' },
  { value: 'sky', name: 'Небесный' },
  { value: 'violet', name: 'Сиреневый' },
])

export const REVIEW_COVERS = Object.freeze([
  { value: 'plain', name: 'Спокойная' },
  { value: 'warm', name: 'Тёплая' },
  { value: 'deep', name: 'Глубокая' },
])

export const DEFAULT_REVIEW_APPEARANCE = Object.freeze({
  publicName: '',
  specialization: '',
  greeting: '',
  accent: 'sand',
  cover: 'plain',
  logoUrl: '',
})

export const REVIEW_PAGE_FALLBACK = Object.freeze({
  title: 'Отзыв о работе — Ведело',
  description: 'Оцените работу исполнителя — это займёт не больше минуты.',
  imageAlt: 'Ведело — CRM для малого бизнеса',
})

export const isReviewAccent = (value) =>
  REVIEW_ACCENTS.some((item) => item.value === value)

export const isReviewCover = (value) =>
  REVIEW_COVERS.some((item) => item.value === value)

// Фото со страницы отзывов загружается только в наше облако под каталог
// tenant. Внешние и чужие URL не принимаются (никакого server-side фетча).
export const isReviewLogoUrl = (value, tenantId) => {
  if (typeof value !== 'string' || value.length > 1024) return false
  try {
    const url = new URL(value)
    const match = url.pathname.match(
      /^\/uploads\/vedelo\/([a-f0-9]{24})\/review-page\/logo\/[a-f0-9-]{36}\/[^/]+\.webp$/i
    )
    return (
      url.origin === 'https://cloud.escalion.ru' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      Boolean(match) &&
      (!tenantId || match[1] === String(tenantId))
    )
  } catch {
    return false
  }
}

const cleanText = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

// Чтение сохранённого оформления: защитная нормализация для любых данных в БД.
export const normalizeReviewAppearance = (value, tenantId) => ({
  publicName: cleanText(value?.publicName, REVIEW_PAGE_LIMITS.publicName),
  specialization: cleanText(
    value?.specialization,
    REVIEW_PAGE_LIMITS.specialization
  ),
  greeting: cleanText(value?.greeting, REVIEW_PAGE_LIMITS.greeting),
  accent: isReviewAccent(value?.accent)
    ? value.accent
    : DEFAULT_REVIEW_APPEARANCE.accent,
  cover: isReviewCover(value?.cover)
    ? value.cover
    : DEFAULT_REVIEW_APPEARANCE.cover,
  logoUrl: isReviewLogoUrl(value?.logoUrl, tenantId) ? value.logoUrl : '',
})

// Персонализация считается заданной только при явно сохранённом публичном
// имени: приватные поля профиля по умолчанию не раскрываем.
export const hasSavedReviewAppearance = (appearance) =>
  Boolean(appearance?.publicName)

const FIELD_LABELS = {
  publicName: 'Публичное имя',
  specialization: 'Специализация',
  greeting: 'Обращение к клиенту',
}

// Валидация формы настроек. Полная замена: отсутствующие поля очищаются.
export const validateReviewPageInput = (value, tenantId) => {
  const result = {}
  for (const [key, max] of Object.entries(REVIEW_PAGE_LIMITS)) {
    const raw = value?.[key]
    if (raw === undefined || raw === null) {
      result[key] = ''
      continue
    }
    if (typeof raw !== 'string')
      return { error: `${FIELD_LABELS[key]} должен быть текстом` }
    const trimmed = raw.trim()
    if (trimmed.length > max)
      return {
        error: `${FIELD_LABELS[key]} не должен превышать ${max} символов`,
      }
    result[key] = trimmed
  }
  const accent = value?.accent ?? ''
  if (accent !== '' && !isReviewAccent(accent))
    return { error: 'Выберите акцентный цвет из списка' }
  result.accent = accent || DEFAULT_REVIEW_APPEARANCE.accent
  const cover = value?.cover ?? ''
  if (cover !== '' && !isReviewCover(cover))
    return { error: 'Выберите обложку из списка' }
  result.cover = cover || DEFAULT_REVIEW_APPEARANCE.cover
  const logoUrl = value?.logoUrl ?? ''
  if (logoUrl !== '' && !isReviewLogoUrl(logoUrl, tenantId))
    return { error: 'Некорректная ссылка на фото или логотип' }
  result.logoUrl = logoUrl
  return { value: result }
}

// Метаданные страницы. Персональные title/description/image отдаются только
// для явно сохранённого публичного оформления; иначе нейтральный fallback.
export const buildReviewPageMetadata = ({
  id,
  appearance,
  origin,
  personalized = true,
}) => {
  const url = `${origin}/review/${id}`
  const fallbackImage = `${origin}/opengraph-image`
  const saved = personalized === true && hasSavedReviewAppearance(appearance)
  if (!saved) {
    return {
      personalized: false,
      title: REVIEW_PAGE_FALLBACK.title,
      description: REVIEW_PAGE_FALLBACK.description,
      image: fallbackImage,
      imageAlt: REVIEW_PAGE_FALLBACK.imageAlt,
      url,
    }
  }
  const description =
    appearance.greeting ||
    `${appearance.specialization ? `${appearance.specialization} · ` : ''}Оцените работу — это займёт не больше минуты.`
  return {
    personalized: true,
    title: `Отзыв о работе · ${appearance.publicName}`,
    description,
    image: appearance.logoUrl || fallbackImage,
    imageAlt: appearance.publicName,
    url,
  }
}
