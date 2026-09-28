import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import PhoneConfirms from '@models/PhoneConfirms'
import {
  findUserByPhone,
  getExpiresAt,
  isValidNormalizedPhone,
  normalizePhone,
  safeApiError,
  telefonipStartCall,
  validateFlow,
  verifyConfig,
} from '@server/phoneVerification'
import { checkRateLimit, rateLimitResponse } from '@server/rateLimit'
import { getPhoneAuthSettings } from '@server/phoneAuthSettings'
import { POST as sendSmsVerification } from '../sms/send/route'

const isCooldownActive = (date, cooldownSec) =>
  date && Date.now() - new Date(date).getTime() < cooldownSec * 1000

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const flow = body.flow
  const phone = normalizePhone(body.phone)

  if (!validateFlow(flow)) {
    return NextResponse.json(
      safeApiError('INVALID_FLOW', 'Некорректный режим проверки', 'flow'),
      { status: 400 }
    )
  }

  if (!isValidNormalizedPhone(phone)) {
    return NextResponse.json(
      safeApiError('INVALID_PHONE', 'Введите корректный номер телефона', 'phone'),
      { status: 400 }
    )
  }

  const [ipLimit, phoneLimit] = await Promise.all([
    checkRateLimit({
      req,
      scope: 'phone_verify_start_ip',
      limit: 30,
      windowMs: 10 * 60 * 1000,
    }),
    checkRateLimit({
      req,
      scope: 'phone_verify_start_phone',
      limit: 5,
      windowMs: 60 * 60 * 1000,
      keyParts: [flow, phone],
    }),
  ])
  if (!ipLimit.ok) return rateLimitResponse(NextResponse, ipLimit)
  if (!phoneLimit.ok) return rateLimitResponse(NextResponse, phoneLimit)

  await dbConnect()

  const user = await findUserByPhone(phone)
  if (flow === 'register' && user?.password) {
    return NextResponse.json(
      safeApiError('PHONE_ALREADY_USED', 'Пользователь с таким номером уже существует', 'phone'),
      { status: 409 }
    )
  }
  if (flow === 'recovery' && !user) {
    return NextResponse.json(
      safeApiError('PHONE_NOT_FOUND', 'Пользователь с таким номером не найден', 'phone'),
      { status: 404 }
    )
  }

  // Opt in so installed mobile clients still receive the call response they expect.
  if (body.method === 'preferred' && (await getPhoneAuthSettings()).primaryMethod === 'sms') {
    return sendSmsVerification({ headers: req.headers, json: async () => body })
  }

  const existingConfirm = await PhoneConfirms.findOne({ phone, flow })
  if (isCooldownActive(existingConfirm?.updatedAt, verifyConfig.startCooldownSec)) {
    return NextResponse.json(
      safeApiError('START_RATE_LIMIT', 'Слишком частые запросы, попробуйте позже'),
      { status: 429 }
    )
  }

  let telefonipResult
  try {
    telefonipResult = await telefonipStartCall(phone)
  } catch (error) {
    console.error('[phone/verify/start] TELEFONIP unavailable', error)
    return NextResponse.json(
      safeApiError(
        'TELEFONIP_UNAVAILABLE',
        'Сервис подтверждения телефона временно недоступен'
      ),
      { status: 503 }
    )
  }

  if (!telefonipResult.ok) {
    return NextResponse.json(telefonipResult.error, { status: 502 })
  }

  const now = new Date()
  const expiresAt = getExpiresAt()

  await PhoneConfirms.findOneAndUpdate(
    { phone, flow },
    {
      $set: {
        phone,
        flow,
        callId: telefonipResult.data.id,
        confirmed: false,
        code: '',
        tryNum: 0,
        smsSendNum: 0,
        smsSentAt: null,
        lastCheckAt: null,
        expiresAt,
        updatedAt: now,
      },
    },
    { returnDocument: 'after', upsert: true }
  )

  return NextResponse.json(
    {
      success: true,
      data: {
        method: 'call',
        id: telefonipResult.data.id,
        auth_phone: telefonipResult.data.auth_phone,
        url_image: telefonipResult.data.url_image,
        ttlMin: verifyConfig.ttlMin,
      },
    },
    { status: 200 }
  )
}
