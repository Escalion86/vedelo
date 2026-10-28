const { HTML_LIMITED_BOT_UA_RE } = require('next/dist/shared/lib/router/utils/html-bots')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Next's defaults and send complete head metadata to MAX/Telegram previews.
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE.source}|\\bMAX\\b|MaxBot|OneMe|TelegramBot`, 'i'),
  // Изолированная сборка/HTTP-стенд могут работать рядом с dev и другими сборками.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    unoptimized: false,
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cloud.escalion.ru',
        pathname: '/uploads/**',
      },
      {
        protocol: 'https',
        hostname: '**.vkuserphoto.ru',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      { source: '/proposal/:path*', headers: [
        { key: 'Cache-Control', value: 'private, no-store' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ] },
      { source: '/review/:path*', headers: [
        { key: 'Cache-Control', value: 'private, no-store' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ] },
      {
        source: '/img/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
  productionBrowserSourceMaps:
    process.env.NEXT_PUBLIC_ENABLE_SOURCE_MAPS === 'true',
  turbopack: {},
}

module.exports = nextConfig
