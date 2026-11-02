import { NextResponse } from 'next/server'
import { GET as getAvitoConversations } from '../../../../integrations/avito/conversations/route'
import { GET as getVkConversations } from '../../../../integrations/vk/conversations/route'
import { mobileError } from '@server/mobile/routeHelpers'
import { sanitizeMobileConversationPayload } from '@server/mobile/conversations'
import { telegramConversations } from '@server/mobile/telegramConversations'

const sanitizeResponse = async (response) => {
  const payload = await response.json()
  return NextResponse.json(sanitizeMobileConversationPayload(payload), {
    status: response.status,
  })
}

export const GET = async (req, { params }) => {
  const { provider } = await params
  if (provider === 'telegram') return telegramConversations(req)
  if (provider === 'avito') {
    return sanitizeResponse(await getAvitoConversations(req))
  }
  if (provider === 'vk') {
    return sanitizeResponse(await getVkConversations(req))
  }
  return mobileError('PROVIDER_INVALID', 'Неизвестный канал переписки', 400)
}
