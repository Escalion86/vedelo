import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_REVIEW_APPEARANCE,
  buildReviewPageMetadata,
  hasSavedReviewAppearance,
  isReviewLogoUrl,
  normalizeReviewAppearance,
  validateReviewPageInput,
} from './reviewAppearance.mjs'

const tenantId = '0123456789abcdef01234567'
const uuid = '11111111-2222-3333-4444-555555555555'
const logo = `https://cloud.escalion.ru/uploads/vedelo/${tenantId}/review-page/logo/${uuid}/logo.webp`

test('Умолчания: без сохранённого оформления персонализация пустая и нейтральная', () => {
  assert.deepEqual(DEFAULT_REVIEW_APPEARANCE, {
    publicName: '',
    specialization: '',
    greeting: '',
    accent: 'sand',
    cover: 'plain',
    logoUrl: '',
  })
  const empty = normalizeReviewAppearance(undefined, tenantId)
  assert.deepEqual(empty, DEFAULT_REVIEW_APPEARANCE)
  assert.equal(hasSavedReviewAppearance(empty), false)
  const metadata = buildReviewPageMetadata({
    id: 'a'.repeat(24),
    appearance: empty,
    origin: 'https://vedelo.ru',
  })
  assert.equal(metadata.personalized, false)
  assert.equal(metadata.title, 'Отзыв о работе — Ведело')
  assert.match(metadata.description, /Оцените работу/)
  assert.equal(
    metadata.image,
    'https://vedelo.ru/opengraph-image'
  )
  assert.equal(metadata.url, `https://vedelo.ru/review/${'a'.repeat(24)}`)
  assert.equal(JSON.stringify(metadata).includes('performerName'), false)
})

test('Нормализация чтения: нераспознанные акценты и внешние ссылки отбрасываются, длины обрезаются', () => {
  const normalized = normalizeReviewAppearance(
    {
      publicName: '  Мария Иванова  ',
      specialization: 'фотограф',
      greeting: 'Спасибо, что выбрали нас!',
      accent: 'rainbow',
      cover: 'neon',
      logoUrl: 'https://evil.example.com/logo.webp',
    },
    tenantId
  )
  assert.deepEqual(normalized, {
    publicName: 'Мария Иванова',
    specialization: 'фотограф',
    greeting: 'Спасибо, что выбрали нас!',
    accent: 'sand',
    cover: 'plain',
    logoUrl: '',
  })
  const long = normalizeReviewAppearance(
    { publicName: 'я'.repeat(200) },
    tenantId
  )
  assert.equal(long.publicName.length, 80)
  assert.equal(hasSavedReviewAppearance(long), true)
})

test('Ссылка на фото: только своё облако и свой tenant, без userinfo/query/hash', () => {
  assert.equal(isReviewLogoUrl(logo, tenantId), true)
  assert.equal(isReviewLogoUrl(logo), true)
  assert.equal(
    isReviewLogoUrl(logo, 'abcdefabcdefabcdefabcdef'),
    false
  )
  for (const bad of [
    'https://evil.example.com/uploads/vedelo/' + tenantId + '/review-page/logo/' + uuid + '/logo.webp',
    'http://cloud.escalion.ru/uploads/vedelo/' + tenantId + '/review-page/logo/' + uuid + '/logo.webp',
    'https://cloud.escalion.ru/uploads/vedelo/' + tenantId + '/proposals/' + tenantId + '/logos/' + uuid + '/logo.webp',
    logo + '?x=1',
    logo + '#frag',
    'https://user:pass@cloud.escalion.ru/uploads/vedelo/' + tenantId + '/review-page/logo/' + uuid + '/logo.webp',
    'javascript:alert(1)',
    '',
    null,
    123,
  ])
    assert.equal(isReviewLogoUrl(bad, tenantId), false, String(bad))
})

test('Валидация формы: длины, палитры и файл; отсутствующие поля очищаются', () => {
  const ok = validateReviewPageInput(
    {
      publicName: '  Студия «Полёт» ',
      specialization: ' декоратор ',
      greeting: ' Спасибо за ваш отзыв ',
      accent: 'emerald',
      cover: 'warm',
      logoUrl: logo,
    },
    tenantId
  )
  assert.deepEqual(ok.value, {
    publicName: 'Студия «Полёт»',
    specialization: 'декоратор',
    greeting: 'Спасибо за ваш отзыв',
    accent: 'emerald',
    cover: 'warm',
    logoUrl: logo,
  })
  const cleared = validateReviewPageInput({}, tenantId)
  assert.deepEqual(cleared.value, DEFAULT_REVIEW_APPEARANCE)
  assert.ok(
    validateReviewPageInput({ publicName: 'x'.repeat(81) }, tenantId).error
  )
  assert.ok(
    validateReviewPageInput({ specialization: 'x'.repeat(121) }, tenantId)
      .error
  )
  assert.ok(
    validateReviewPageInput({ greeting: 'x'.repeat(301) }, tenantId).error
  )
  assert.ok(validateReviewPageInput({ publicName: 5 }, tenantId).error)
  assert.ok(validateReviewPageInput({ accent: 'gold' }, tenantId).error)
  assert.ok(validateReviewPageInput({ cover: 'stars' }, tenantId).error)
  assert.ok(
    validateReviewPageInput({ logoUrl: 'https://example.com/a.webp' }, tenantId)
      .error
  )
  assert.ok(
    validateReviewPageInput(
      {
        logoUrl:
          'https://cloud.escalion.ru/uploads/vedelo/abcdefabcdefabcdefabcdef/review-page/logo/' +
          uuid +
          '/logo.webp',
      },
      tenantId
    ).error
  )
})

test('Метаданные с персонализацией: имя, обращение, абсолютный логотип, twitter-поля', () => {
  const appearance = normalizeReviewAppearance(
    {
      publicName: 'Студия «Полёт»',
      specialization: 'декоратор',
      greeting: 'Спасибо, что выбрали нас',
      accent: 'violet',
      cover: 'deep',
      logoUrl: logo,
    },
    tenantId
  )
  const metadata = buildReviewPageMetadata({
    id: 'b'.repeat(24),
    appearance,
    origin: 'https://vedelo.ru',
  })
  assert.equal(metadata.personalized, true)
  assert.equal(metadata.title, 'Отзыв о работе · Студия «Полёт»')
  assert.equal(metadata.description, 'Спасибо, что выбрали нас')
  assert.equal(metadata.image, logo)
  assert.ok(metadata.image.startsWith('https://'))
  assert.equal(metadata.url, `https://vedelo.ru/review/${'b'.repeat(24)}`)
  const withoutGreeting = buildReviewPageMetadata({
    id: 'b'.repeat(24),
    appearance: normalizeReviewAppearance(
      { publicName: 'Мария', specialization: 'фотограф' },
      tenantId
    ),
    origin: 'https://vedelo.ru',
  })
  assert.equal(
    withoutGreeting.description,
    'фотограф · Оцените работу — это займёт не больше минуты.'
  )
  const revoked = buildReviewPageMetadata({
    id: 'b'.repeat(24),
    appearance,
    origin: 'https://vedelo.ru',
    personalized: false,
  })
  assert.equal(revoked.personalized, false)
  assert.equal(revoked.title, 'Отзыв о работе — Ведело')
})
