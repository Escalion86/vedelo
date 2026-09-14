import './globals.css'
import './burger.css'
import '../fonts/InterTight.css'
import '../fonts/FuturaPT.css'

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter'
import ClientErrorLogger from '@components/ClientErrorLogger'
import DevelopmentServiceWorkerCleanup from '@components/DevelopmentServiceWorkerCleanup'
import ServiceWorkerRegistration from '@components/ServiceWorkerRegistration'
import AppSnackbarProvider from '@components/AppSnackbarProvider'
import AppQueryProvider from '@components/AppQueryProvider'
import Script from 'next/script'
import AcquisitionTracker from '@components/AcquisitionTracker'
import { BRAND, getCanonicalBaseUrl } from '@helpers/brand.mjs'

const normalizedSiteUrl = getCanonicalBaseUrl(process.env.DOMAIN)

export const metadata = {
  metadataBase: new URL(normalizedSiteUrl),
  title: 'Ведело — CRM для малого бизнеса',
  description: `${BRAND.description}: заявки, заказы, финансы, документы и напоминания.`,
  applicationName: BRAND.name,
  manifest: '/manifest.json',
  verification: {
    yandex: 'f559d6455245a7c5',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: BRAND.name,
  },
  icons: {
    icon: [
      {
        url: '/icons/AppImages/android/android-launchericon-192-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icons/AppImages/android/android-launchericon-512-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/icons/AppImages/ios/180.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
}

export const viewport = {
  themeColor: '#a56f2a',
}

const YANDEX_METRIKA_ID = '108801563'

export default function RootLayout({ children }) {
  const isProduction = process.env.NODE_ENV !== 'development'
  return (
    <html lang="ru" className="scroll-smooth" data-scroll-behavior="smooth">
      <body>
        <AcquisitionTracker />
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ClientErrorLogger enabled={isProduction} />
          {!isProduction && <DevelopmentServiceWorkerCleanup />}
          {isProduction && <ServiceWorkerRegistration />}
          {isProduction && (
            <>
              <Script id="yandex-metrika" strategy="lazyOnload">
                {`
        (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
        })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}', 'ym');

        ym(${YANDEX_METRIKA_ID}, 'init', {
          ssr:true,
          webvisor:true,
          clickmap:true,
          ecommerce:"dataLayer",
          referrer: document.referrer,
          url: location.href,
          accurateTrackBounce:true,
          trackLinks:true
        });

        var queuedGoals = window.__artistcrmMetrikaGoalQueue || [];
        window.__artistcrmMetrikaGoalQueue = [];
        queuedGoals.forEach(function(goal) {
          if (goal && goal.goalName) {
            ym(${YANDEX_METRIKA_ID}, 'reachGoal', goal.goalName, goal.params);
          }
        });
      `}
              </Script>
              <noscript>
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://mc.yandex.ru/watch/${YANDEX_METRIKA_ID}`}
                    style={{ position: 'absolute', left: '-9999px' }}
                    alt=""
                  />
                </div>
              </noscript>
            </>
          )}
          <AppQueryProvider>
            <AppSnackbarProvider>{children}</AppSnackbarProvider>
          </AppQueryProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
