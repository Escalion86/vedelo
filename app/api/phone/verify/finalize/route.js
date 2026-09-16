import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import dbConnect from '@server/dbConnect'
import Users from '@models/Users'
import PhoneConfirms from '@models/PhoneConfirms'
import { buildRegistrationTrialUserFields } from '@server/registrationTrial'
import { notifyDevelopersAboutNewUser } from '@server/registrationNotifications'
import {
  findUserByPhone,
  isValidNormalizedPhone,
  normalizePhone,
  safeApiError,
  validateFlow,
} from '@server/phoneVerification'
import { checkRateLimit, rateLimitResponse } from '@server/rateLimit'
import {
  ACQUISITION_COOKIE,
  REGISTRATION_SOURCE_COOKIE,
  getAcquisitionFromRequest,
  getRegistrationSourceFromRequest,
} from '@helpers/registrationSource.mjs'
import { buildLegalAcceptanceFields } from '@helpers/legalDocuments.mjs'

const isExpired = (expiresAt) =>
  !expiresAt || new Date(expiresAt).getTime() <= Date.now()

const getDuplicateKeyField = (error) => {
  if (!error || error.code !== 11000) return ''
  const keyValueField = Object.keys(error?.keyValue || {})[0]
  if (keyValueField) return keyValueField
  const keyPatternField = Object.keys(error?.keyPattern || {})[0]
  if (keyPatternField) return keyPatternField
  return ''
}

const normalizeReferrerId = (value) => {
  const stringValue = value ? String(value).trim() : ''
  if (!stringValue) return null
  if (!mongoose.Types.ObjectId.isValid(stringValue)) return null
  return stringValue
}

const resolveReferrerId = async (rawReferrerId, currentUserId = null) => {
  const referrerId = normalizeReferrerId(rawReferrerId)
  if (!referrerId) return null
  if (currentUserId && String(currentUserId) === String(referrerId)) return null

  const referrer = await Users.findById(referrerId).select('_id').lean()
  if (!referrer?._id) return null
  return referrer._id
}

const createRegisterUser = async (
  phone,
  hashedPassword,
  {
    consentTerms = false,
    consentPrivacyPolicy = false,
    consentPersonalData = false,
    referrerId = null,
    registrationSource = '',
    acquisition = null,
  } = {}
) => {
  const now = new Date()
  const registrationTrial = await buildRegistrationTrialUserFields(now)

  const user = await Users.create({
    phone,
    password: hashedPassword,
    role: 'user',
    tenantId: null,
    ...registrationTrial,
    referrerId: referrerId ?? null,
    registrationSource,
    registrationSourceCapturedAt: registrationSource ? now : null,
    acquisition: acquisition ? { ...acquisition, capturedAt: now } : null,
    ...(consentTerms && consentPrivacyPolicy && consentPersonalData
      ? buildLegalAcceptanceFields(now)
      : {}),
  })

  if (!user.tenantId) {
    user.tenantId = user._id
    await user.save()
  }

  return user
}

export const POST = async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const phone = normalizePhone(body.phone)
    const password = body.password ?? ''
    const flow = body.flow
    const legacyTermsAccepted =
      body?.registerTermsAccepted === true || body?.termsAccepted === true
    const consentPrivacyPolicy =
      body?.consentPrivacyPolicy === true || legacyTermsAccepted
    const consentPersonalData =
      body?.consentPersonalData === true || legacyTermsAccepted
    const consentTerms = body?.consentTerms === true || legacyTermsAccepted
    const rawReferrerId = body?.referrerId ?? body?.ref ?? null
    const registrationSource = getRegistrationSourceFromRequest(req)
    const acquisition = getAcquisitionFromRequest(req)

    if (!validateFlow(flow)) {
      return NextResponse.json(
        safeApiError('INVALID_FLOW', 'Некорректный режим проверки', 'flow'),
        { status: 400 }
      )
    }

    if (!isValidNormalizedPhone(phone)) {
      return NextResponse.json(
        safeApiError(
          'INVALID_PHONE',
          'Введите корректный номер телефона',
          'phone'
        ),
        { status: 400 }
      )
    }

    if (!password || String(password).length < 8) {
      return NextResponse.json(
        safeApiError(
          'INVALID_PASSWORD',
          'Пароль должен быть не менее 8 символов',
          'password'
        ),
        { status: 400 }
      )
    }

    const limit = await checkRateLimit({
      req,
      scope: 'phone_verify_finalize',
      limit: 10,
      windowMs: 10 * 60 * 1000,
      keyParts: [flow, phone],
    })
    if (!limit.ok) return rateLimitResponse(NextResponse, limit)

    await dbConnect()

    const confirm = await PhoneConfirms.findOne({ phone, flow })
    if (!confirm || isExpired(confirm.expiresAt) || !confirm.confirmed) {
      return NextResponse.json(
        safeApiError(
          'PHONE_NOT_CONFIRMED',
          'Сначала подтвердите номер телефона'
        ),
        { status: 403 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await findUserByPhone(phone)

    if (flow === 'register') {
      if (!consentTerms || !consentPrivacyPolicy || !consentPersonalData) {
        return NextResponse.json(
          safeApiError(
            'CONSENT_REQUIRED',
            'Для регистрации требуется принять Пользовательское соглашение, ознакомиться с Политикой конфиденциальности и дать согласие на обработку персональных данных'
          ),
          { status: 400 }
        )
      }

      if (user?.password) {
        return NextResponse.json(
          safeApiError(
            'PHONE_ALREADY_USED',
            'Пользователь с таким номером уже существует',
            'phone'
          ),
          { status: 409 }
        )
      }

      if (user && !user.password) {
        const now = new Date()
        const registrationTrial = user.trialUsed
          ? {}
          : await buildRegistrationTrialUserFields(now)
        const referrerId = await resolveReferrerId(rawReferrerId, user._id)
        user.password = hashedPassword
        if (!user.tenantId) user.tenantId = user._id
        // A VK account without a password is already registered, not a placeholder.
        if (
          !user.referrerId &&
          referrerId &&
          !user.vkId &&
          user.registrationType !== 'vk' &&
          !user.consentTermsAccepted &&
          !user.termsAcceptedAt
        )
          user.referrerId = referrerId
        if (!user.registrationSource && registrationSource) {
          user.registrationSource = registrationSource
          user.registrationSourceCapturedAt = now
        }
        if (!user.acquisition && acquisition) {
          user.acquisition = { ...acquisition, capturedAt: now }
        }
        Object.assign(user, buildLegalAcceptanceFields(now))
        Object.assign(user, registrationTrial)
        await user.save()
      } else {
        const referrerId = await resolveReferrerId(rawReferrerId)
        const registeredUser = await createRegisterUser(phone, hashedPassword, {
          consentTerms,
          consentPrivacyPolicy,
          consentPersonalData,
          referrerId,
          registrationSource,
          acquisition,
        })
        await notifyDevelopersAboutNewUser(registeredUser)
      }
    }

    if (flow === 'recovery') {
      if (!user) {
        return NextResponse.json(
          safeApiError('PHONE_NOT_FOUND', 'Пользователь не найден', 'phone'),
          { status: 404 }
        )
      }

      user.password = hashedPassword
      await user.save()
    }

    await PhoneConfirms.deleteMany({ phone })

    const response = NextResponse.json({ success: true }, { status: 200 })
    if (flow === 'register' && registrationSource) {
      response.cookies.delete(REGISTRATION_SOURCE_COOKIE)
    }
    if (flow === 'register' && acquisition)
      response.cookies.delete(ACQUISITION_COOKIE)
    return response
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField = getDuplicateKeyField(error)
      if (duplicateField === 'phone') {
        return NextResponse.json(
          safeApiError(
            'PHONE_ALREADY_USED',
            'Пользователь с таким номером уже существует',
            'phone'
          ),
          { status: 409 }
        )
      }

      if (duplicateField === 'vkId') {
        return NextResponse.json(
          safeApiError(
            'VK_ID_ALREADY_USED',
            'Конфликт уникальности VK ID при создании аккаунта. Обратитесь в поддержку.',
            'vkId'
          ),
          { status: 409 }
        )
      }

      return NextResponse.json(
        safeApiError(
          'DUPLICATE_CONSTRAINT',
          'Обнаружен конфликт уникальности данных при регистрации'
        ),
        { status: 409 }
      )
    }

    console.error('[phone/verify/finalize] unexpected error', error)
    return NextResponse.json(
      safeApiError(
        'FINALIZE_FAILED',
        'Не удалось завершить подтверждение телефона. Попробуйте еще раз.'
      ),
      { status: 500 }
    )
  }
}
