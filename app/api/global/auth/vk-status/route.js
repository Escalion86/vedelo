import { NextResponse } from 'next/server'
import { getSocialAuthSettings } from '@server/socialAuthSettings'

export const GET = async () => {
  const appId = process.env.VK_ID_APP_ID || ''
  const redirectUri = process.env.VK_ID_REDIRECT_URI || ''
  const debug =
    process.env.VK_DEBUG_LOGS === 'true' ||
    process.env.NEXT_PUBLIC_VK_DEBUG_LOGS === 'true'
  const { allowVkAuth, allowYandexAuth } = await getSocialAuthSettings()

  return NextResponse.json(
    {
      success: true,
      data: {
        allowVkAuth,
        allowYandexAuth,
        appId: allowVkAuth ? appId : '',
        redirectUri: allowVkAuth ? redirectUri : '',
        scope: process.env.NEXT_PUBLIC_VK_ID_SCOPE || 'phone email',
        debug,
      },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
