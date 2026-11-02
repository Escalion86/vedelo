import { NextResponse } from 'next/server'
import {
  GET as getAvitoMessages,
  POST as postAvitoMessage,
} from '../../../../../../integrations/avito/conversations/[id]/messages/route'
import {
  GET as getVkMessages,
  POST as postVkMessage,
} from '../../../../../../integrations/vk/conversations/[id]/messages/route'
import { mobileError } from '@server/mobile/routeHelpers'
import { sanitizeMobileConversationPayload } from '@server/mobile/conversations'
import { telegramConversations } from '@server/mobile/telegramConversations'

const sanitizeResponse = async (response) => {
  const payload = await response.json()
  return NextResponse.json(sanitizeMobileConversationPayload(payload), {
    status: response.status,
  })
}

const delegate = async (req, params, method) => {
  const routeParams = await params
  if (routeParams.provider === 'telegram') return telegramConversations(req, { id: routeParams.id, action: method === 'GET' ? 'history' : 'send' })
  const context = { params: Promise.resolve({ id: routeParams.id }) }
  if (routeParams.provider === 'avito') {
    const response = method === 'GET'
      ? getAvitoMessages(req, context)
      : postAvitoMessage(req, context)
    return sanitizeResponse(await response)
  }
  if (routeParams.provider === 'vk') {
    const response = method === 'GET'
      ? getVkMessages(req, context)
      : postVkMessage(req, context)
    return sanitizeResponse(await response)
  }
  return mobileError('PROVIDER_INVALID', 'Неизвестный канал переписки', 400)
}

export const GET = (req, { params }) => delegate(req, params, 'GET')
export const POST = (req, { params }) => delegate(req, params, 'POST')
