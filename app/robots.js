const rawDomain = process.env.DOMAIN || 'https://vedelo.ru'
const siteUrl = rawDomain.startsWith('http')
  ? rawDomain
  : `https://${rawDomain}`
const normalizedSiteUrl = siteUrl.replace(/\/$/, '')

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${normalizedSiteUrl}/sitemap.xml`,
    host: normalizedSiteUrl,
  }
}
