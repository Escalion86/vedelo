const publicPaths = [
  '/',
  '/crm-dlya-fokusnikov',
  '/crm-dlya-artistov',
  '/crm-dlya-vedushchih',
  '/crm-dlya-muzykantov',
  '/crm-dlya-vyezdnyh-masterov',
  '/crm-dlya-fotografov',
  '/crm-dlya-dekoratorov',
  '/crm-dlya-chastnyh-specialistov',
  '/crm-dlya-tilda-zayavok',
  '/crm-s-google-calendar',
  '/kak-artistu-ne-teryat-zayavki-iz-messendzherov',
  '/kak-kontrolirovat-zadatki-za-vystupleniya',
  '/crm-ili-google-kalendar-dlya-artista',
  '/kak-vesti-zayavki-fokusniku',
  '/kak-ponyat-svobodna-li-data-meropriyatiya',
]

const normalizeSiteUrl = (value) => {
  const url = new URL(value.startsWith('http') ? value : `https://${value}`)
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url
}

const rawFetchUrl =
  process.argv[2] || process.env.DOMAIN || 'https://vedelo.ru'
const rawCanonicalUrl = process.argv[3] || rawFetchUrl
const fetchSiteUrl = normalizeSiteUrl(rawFetchUrl)
const canonicalSiteUrl = normalizeSiteUrl(rawCanonicalUrl)

const fetchUrl = (path) => new URL(path, fetchSiteUrl).toString()
const canonicalUrl = (path) => new URL(path, canonicalSiteUrl).toString()
const comparableUrl = (value) => {
  try {
    return new URL(value).toString()
  } catch {
    return value
  }
}

const readAttribute = (tag, name) => {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))
  return match?.[1] || ''
}

const getCanonical = (html) => {
  const canonicalTag = (html.match(/<link\b[^>]*>/gi) || []).find(
    (tag) => readAttribute(tag, 'rel').toLowerCase() === 'canonical'
  )
  return canonicalTag ? readAttribute(canonicalTag, 'href') : ''
}

const hasNoindex = (html) =>
  (html.match(/<meta\b[^>]*>/gi) || []).some((tag) => {
    const name = readAttribute(tag, 'name').toLowerCase()
    const content = readAttribute(tag, 'content').toLowerCase()
    return (
      ['robots', 'googlebot', 'yandex'].includes(name) &&
      content.includes('noindex')
    )
  })

const pageResults = await Promise.all(
  publicPaths.map(async (path) => {
    const pageUrl = fetchUrl(path)
    const expectedCanonical = canonicalUrl(path)
    try {
      const response = await fetch(pageUrl, { redirect: 'follow' })
      const html = await response.text()
      const canonical = getCanonical(html)
      const checks = {
        status: response.status === 200,
        canonical:
          comparableUrl(canonical) === comparableUrl(expectedCanonical),
        indexable: !hasNoindex(html),
        title: /<title>[^<]+<\/title>/i.test(html),
        h1: /<h1\b/i.test(html),
      }
      return {
        url: pageUrl,
        ok: Object.values(checks).every(Boolean),
        details: Object.entries(checks)
          .filter(([, value]) => !value)
          .map(([name]) => name)
          .join(', '),
      }
    } catch (error) {
      return { url: pageUrl, ok: false, details: error.message }
    }
  })
)

const robotsUrl = fetchUrl('/robots.txt')
const sitemapUrl = fetchUrl('/sitemap.xml')
const expectedSitemapUrl = canonicalUrl('/sitemap.xml')
const [robotsResponse, sitemapResponse] = await Promise.all([
  fetch(robotsUrl),
  fetch(sitemapUrl),
])
const [robotsText, sitemapText] = await Promise.all([
  robotsResponse.text(),
  sitemapResponse.text(),
])

const infrastructureResults = [
  {
    url: robotsUrl,
    ok:
      robotsResponse.ok &&
      robotsText.includes(`Sitemap: ${expectedSitemapUrl}`),
    details: 'robots.txt должен ссылаться на sitemap.xml',
  },
  {
    url: sitemapUrl,
    ok:
      sitemapResponse.ok &&
      publicPaths.every((path) => sitemapText.includes(canonicalUrl(path))),
    details: 'sitemap.xml должен содержать все публичные SEO-страницы',
  },
]

const results = [...pageResults, ...infrastructureResults]
console.table(
  results.map((result) => ({
    URL: result.url,
    Результат: result.ok ? 'OK' : 'ОШИБКА',
    Детали: result.ok ? '' : result.details,
  }))
)

if (results.some((result) => !result.ok)) {
  process.exitCode = 1
} else {
  console.log('SEO post-deploy проверка пройдена.')
}
