import mongoose from 'mongoose'
import Users from '@models/Users'
import { buildRegistrationTrialUserFields } from '@server/registrationTrial'
import { notifyDevelopersAboutNewUser } from '@server/registrationNotifications'
import { buildLegalAcceptanceFields } from '@helpers/legalDocuments.mjs'
import {
  findUserByPhone,
  isValidNormalizedPhone,
  normalizePhone,
} from '@server/phoneVerification'

const normalizeEmail = (value) => {
  if (!value) return ''
  return String(value).trim().toLowerCase()
}

const buildPatch = (user, profile) => {
  const patch = {}
  if (profile.vkId && user.vkId !== profile.vkId) patch.vkId = profile.vkId
  if (profile.email && !user.email) patch.email = profile.email
  if (profile.firstName && !user.firstName) patch.firstName = profile.firstName
  // Existing profile names are user-owned, including a single-field full name.
  if (profile.secondName && !user.secondName && !user.firstName)
    patch.secondName = profile.secondName
  if (
    profile.image &&
    (!Array.isArray(user.images) || user.images.length === 0)
  ) {
    patch.images = [profile.image]
  }
  if (!user.registrationType) patch.registrationType = 'vk'
  return patch
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

export const ensureVkUser = async ({
  vkId = '',
  phone = '',
  email = '',
  firstName = '',
  secondName = '',
  image = '',
  referrerId = null,
  registrationSource = '',
  acquisition = null,
  legalAcceptance = false,
}) => {
  const normalizedVkId = String(vkId || '').trim()
  const normalizedPhone = normalizePhone(phone)
  if (!isValidNormalizedPhone(normalizedPhone)) return null
  const normalizedEmail = normalizeEmail(email)

  let user = await findUserByPhone(normalizedPhone)
  let created = false

  if (!user) {
    if (!legalAcceptance) return null

    if (normalizedVkId) {
      await Users.updateMany({ vkId: normalizedVkId }, { $unset: { vkId: 1 } })
    }

    const now = new Date()
    const registrationTrial = await buildRegistrationTrialUserFields(now)

    try {
      const resolvedReferrerId = await resolveReferrerId(referrerId)
      user = await Users.create({
        ...(normalizedVkId ? { vkId: normalizedVkId } : {}),
        email: normalizedEmail,
        phone: normalizedPhone,
        firstName,
        secondName,
        images: image ? [image] : [],
        registrationType: 'vk',
        role: 'user',
        tenantId: null,
        referrerId: resolvedReferrerId,
        registrationSource,
        registrationSourceCapturedAt: registrationSource ? now : null,
        acquisition: acquisition ? { ...acquisition, capturedAt: now } : null,
        ...registrationTrial,
        ...buildLegalAcceptanceFields(now),
      })
      created = true
    } catch (error) {
      if (error?.code === 11000) {
        const conflictByPhone = await findUserByPhone(normalizedPhone)
        if (!conflictByPhone) throw error
        user = conflictByPhone
      } else {
        throw error
      }
    }
  } else {
    if (normalizedVkId) {
      await Users.updateMany(
        { _id: { $ne: user._id }, vkId: normalizedVkId },
        { $unset: { vkId: 1 } }
      )
    }

    const patch = buildPatch(user, {
      vkId: normalizedVkId,
      phone: normalizedPhone,
      email: normalizedEmail,
      firstName,
      secondName,
      image,
    })
    if (!user.referrerId) {
      const resolvedReferrerId = await resolveReferrerId(referrerId, user._id)
      if (resolvedReferrerId) patch.referrerId = resolvedReferrerId
    }
    if (!user.registrationSource && registrationSource) {
      patch.registrationSource = registrationSource
      patch.registrationSourceCapturedAt = new Date()
    }
    if (!user.acquisition && acquisition) {
      patch.acquisition = { ...acquisition, capturedAt: new Date() }
    }
    if (legalAcceptance) {
      Object.assign(patch, buildLegalAcceptanceFields(new Date()))
    }

    if (Object.keys(patch).length > 0) {
      user = await Users.findByIdAndUpdate(
        user._id,
        { $set: patch },
        { returnDocument: 'after' }
      )
    }
  }

  if (!user.tenantId) {
    user = await Users.findByIdAndUpdate(
      user._id,
      { $set: { tenantId: user._id } },
      { returnDocument: 'after' }
    )
  }

  if (created) await notifyDevelopersAboutNewUser(user)

  return user
}
