import {
  SEO_LAST_MODIFIED,
  normalizedSiteUrl,
  seoLandingSlugs,
} from '@helpers/seoLandingPages'
import { seoGuideSlugs } from '@helpers/seoGuidePages'

export default function sitemap() {
  return [
    {
      url: `${normalizedSiteUrl}/`,
      lastModified: SEO_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...seoLandingSlugs.map((slug) => ({
      url: `${normalizedSiteUrl}/${slug}`,
      lastModified: SEO_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.85,
    })),
    ...seoGuideSlugs.map((slug) => ({
      url: `${normalizedSiteUrl}/${slug}`,
      lastModified: SEO_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.75,
    })),
    {
      url: `${normalizedSiteUrl}/privacy`,
      lastModified: SEO_LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${normalizedSiteUrl}/terms`,
      lastModified: SEO_LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${normalizedSiteUrl}/personal-data-consent`,
      lastModified: SEO_LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${normalizedSiteUrl}/payment`,
      lastModified: SEO_LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${normalizedSiteUrl}/account-deletion`,
      lastModified: SEO_LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
  ]
}
